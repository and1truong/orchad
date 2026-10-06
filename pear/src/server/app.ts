import Fastify from "fastify";
import cookie from "@fastify/cookie";
import serveStatic from "@fastify/static";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { failure, Bounds } from "@orchard/bridge-contract";
import { LearningService } from "./service.ts";
import { object } from "../shared/catalog.ts";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function createApp(opts: {
  db: DatabaseSync;
  origin: string;
  dev?: boolean;
  staticRoot?: string;
  secureCookies?: boolean;
  developmentAuth?: boolean;
}) {
  const parsed = new URL(opts.origin);
  if (parsed.origin !== opts.origin || parsed.username || parsed.password)
    throw new Error("APP_ORIGIN must be an exact origin");
  if (opts.secureCookies && parsed.protocol !== "https:")
    throw new Error("Secure cookies require HTTPS");
  const app = Fastify({
    bodyLimit: Bounds.message,
    logger: false,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
      },
    },
  });
  await app.register(cookie);
  const service = new LearningService(opts.db),
    name = opts.secureCookies ? "__Host-pear-session" : "pear-session";
  const loginBudget = new Map<string, { count: number; until: number }>();
  app.addHook("onSend", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' https:; connect-src 'self'" +
          (opts.dev ? " ws:" : "") +
          "; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
  });
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    if (req.headers.host !== parsed.host)
      return reply.code(403).send(failure("FORBIDDEN", "Host mismatch"));
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.headers.origin !== opts.origin
    )
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Same-origin request required"));
    if (req.url.split("?")[0] === "/api/login") return;
    const token = req.cookies[name],
      s = token
        ? (opts.db
            .prepare(
              "SELECT s.*,a.active,a.auth_version AS current_version FROM sessions s JOIN accounts a ON a.id=s.principal WHERE token_hash=? AND expires>?",
            )
            .get(hash(token), Date.now()) as any)
        : null;
    if (!s?.active || s.auth_version !== s.current_version)
      return reply.code(401).send(failure("UNAUTHORIZED", "Sign in required"));
    (req as any).session = s;
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.headers["x-csrf-token"] !== s.csrf
    )
      return reply.code(403).send(failure("FORBIDDEN", "CSRF check failed"));
    // Bind every domain operation to the session instance the caller consented
    // under. In-flight old-tab requests cannot acquire a newly logged-in user.
    if (
      req.url.split("?")[0] !== "/api/session" &&
      req.headers["x-pear-epoch"] !==
        hash("binding:" + s.token_hash + ":" + s.auth_version)
    )
      return reply
        .code(409)
        .send(
          failure(
            "STALE_CONTEXT",
            "Session changed; refresh and consent again",
          ),
        );
  });
  app.post(
    "/api/login",
    {
      schema: {
        body: object({
          username: { type: "string", minLength: 1, maxLength: 80 },
          password: { type: "string", minLength: 1, maxLength: 200 },
        }),
      },
    },
    async (req, reply) => {
      if (!opts.developmentAuth)
        return reply
          .code(403)
          .send(
            failure(
              "FORBIDDEN",
              "Development login disabled; production identity adapter is not configured",
            ),
          );
      const now = Date.now(),
        key = req.ip;
      let b = loginBudget.get(key);
      if (!b || b.until < now) {
        if (loginBudget.size >= 1024) loginBudget.clear();
        b = { count: 0, until: now + 60_000 };
        loginBudget.set(key, b);
      }
      if (++b.count > 30)
        return reply.code(429).send(failure("FORBIDDEN", "Login rate limit"));
      const { username, password } = req.body as any,
        a = opts.db
          .prepare("SELECT * FROM accounts WHERE id=?")
          .get(username) as any;
      const candidate = scryptSync(password, a?.salt ?? "invalid", 64);
      if (
        !a?.active ||
        !timingSafeEqual(candidate, Buffer.from(a.password_hash, "hex"))
      )
        return reply
          .code(401)
          .send(
            failure("UNAUTHORIZED", "Invalid synthetic account credentials"),
          );
      if (req.cookies[name])
        opts.db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .run(hash(req.cookies[name]!));
      const token = randomBytes(32).toString("hex"),
        csrf = randomBytes(32).toString("hex");
      opts.db
        .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
        .run(hash(token), a.id, csrf, now + 8 * 3600_000, a.auth_version);
      reply.setCookie(name, token, {
        httpOnly: true,
        secure: !!opts.secureCookies,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      });
      return {
        principal: service.principal(a.id),
        csrf,
        sessionEpoch: hash("binding:" + hash(token) + ":" + a.auth_version),
      };
    },
  );
  app.get("/api/session", async (req) => {
    const s = (req as any).session;
    return {
      principal: service.principal(s.principal),
      csrf: s.csrf,
      sessionEpoch: hash("binding:" + s.token_hash + ":" + s.auth_version),
    };
  });
  app.post("/api/logout", async (req, reply) => {
    opts.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run((req as any).session.token_hash);
    reply.clearCookie(name, { path: "/" });
    return { ok: true };
  });
  app.get("/api/audience", async (req, reply) => {
    const p = service.principal((req as any).session.principal);
    if (!["admin", "manager"].includes(p.role))
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Audience access denied"));
    return {
      users: opts.db
        .prepare(
          "SELECT id,name FROM accounts WHERE tenant=? AND active=1 AND (?='admin' OR manager_id=?) ORDER BY id LIMIT 50",
        )
        .all(p.tenant, p.role, p.id),
    };
  });
  app.get("/api/describe", async (req) =>
    service.description((req as any).session.principal),
  );
  app.get("/api/context", async (req, reply) => {
    const s = (req as any).session;
    try {
      return {
        ...service.context(s.principal, (req.query as any).documentId),
        sessionEpoch: hash("binding:" + s.token_hash + ":" + s.auth_version),
      };
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Workspace access denied"));
    }
  });
  const status = (r: any) =>
    r.ok
      ? 200
      : ((
          {
            UNAUTHORIZED: 401,
            FORBIDDEN: 403,
            NOT_FOUND: 404,
            STALE_CONTEXT: 409,
            IDEMPOTENCY_CONFLICT: 409,
            INVALID_ARGUMENT: 400,
            UNSUPPORTED: 400,
          } as any
        )[r.error.code] ?? 500);
  for (const source of ["bridge", "human"] as const)
    app.post("/api/" + source + "/invoke", async (req, reply) => {
      const result = service.invoke(
        (req as any).session.principal,
        req.body,
        source,
      );
      return reply.code(status(result)).send(result);
    });
  app.get("/api/certificates/:id", async (req, reply) => {
    try {
      return service.certificate(
        (req as any).session.principal,
        (req.params as any).id,
      );
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Certificate access denied"));
    }
  });
  app.get("/api/award-certificates/:id", async (req, reply) => {
    try {
      return service.programs.certificate(
        service.principal((req as any).session.principal),
        (req.params as any).id,
      );
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Award certificate access denied"));
    }
  });
  app.get("/health", async () => ({ ok: true }));
  app.setErrorHandler((e: any, _req, reply) =>
    reply
      .code(e.statusCode === 413 ? 413 : e.validation ? 400 : 500)
      .send(
        failure(
          e.statusCode === 413 || e.validation
            ? "INVALID_ARGUMENT"
            : "INTERNAL",
          e.validation || e.statusCode === 413
            ? "Invalid or oversized request"
            : "Internal application error",
        ),
      ),
  );
  if (opts.dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply.code(404).send(failure("NOT_FOUND", "Endpoint not found"));
      reply.hijack();
      vite.middlewares(req.raw, reply.raw);
    });
    app.addHook("onClose", async () => {
      await vite.close();
    });
  } else {
    const root = opts.staticRoot ?? resolve("dist");
    if (existsSync(root)) {
      await app.register(serveStatic, { root });
      app.setNotFoundHandler((req, reply) =>
        req.url.startsWith("/api/")
          ? reply.code(404).send(failure("NOT_FOUND", "Endpoint not found"))
          : reply.sendFile("index.html"),
      );
    }
  }
  return { app, service };
}
