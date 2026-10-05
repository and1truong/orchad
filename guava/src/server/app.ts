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
import { CanvasService, type Principal } from "./service.ts";
import { failure } from "../shared/contract.ts";
import { object } from "../shared/catalog.ts";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export interface AppOptions {
  db: DatabaseSync;
  origin: string;
  secureCookies?: boolean;
  dev?: boolean;
  staticRoot?: string;
}
export async function createApp(opts: AppOptions) {
  if (opts.secureCookies && !opts.origin.startsWith("https://"))
    throw new Error("Secure deployment requires HTTPS APP_ORIGIN");
  const app = Fastify({
    bodyLimit: 256 * 1024,
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
  const service = new CanvasService(opts.db);
  const sessionName = opts.secureCookies
    ? "__Host-guava-session"
    : "guava-session";
  app.addHook("onSend", async (_req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" +
          (opts.dev ? " ws:" : "") +
          "; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
      );
    if (_req.url.startsWith("/api")) reply.header("Cache-Control", "no-store");
  });
  app.addHook("preHandler", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.headers.origin !== opts.origin
    )
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Same-origin request required"));
    if (req.url === "/api/login") return;
    const token = req.cookies[sessionName];
    const session = token
      ? (opts.db
          .prepare(
            "SELECT s.*,a.role FROM sessions s JOIN accounts a ON a.id=s.principal WHERE s.token_hash=? AND expires>?",
          )
          .get(hash(token), Date.now()) as any)
      : null;
    if (!session)
      return reply.code(401).send(failure("UNAUTHORIZED", "Sign in required"));
    (req as any).principal = { id: session.principal, role: session.role };
    (req as any).session = session;
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.headers["x-csrf-token"] !== session.csrf
    )
      return reply.code(403).send(failure("FORBIDDEN", "CSRF check failed"));
  });
  app.post(
    "/api/login",
    {
      schema: {
        body: object({
          username: { type: "string", maxLength: 80 },
          password: { type: "string", maxLength: 200 },
        }),
      },
    },
    async (req, reply) => {
      const { username, password } = req.body as any;
      const a = opts.db
        .prepare("SELECT * FROM accounts WHERE id=?")
        .get(username) as any;
      const candidate = scryptSync(password, a?.salt ?? "invalid-account", 64);
      if (
        !a ||
        !timingSafeEqual(candidate, Buffer.from(a.password_hash, "hex"))
      )
        return reply
          .code(401)
          .send(failure("UNAUTHORIZED", "Invalid development credentials"));
      // Rotate the prior session on login; roles come only from accounts.
      const prior = req.cookies[sessionName];
      if (prior)
        opts.db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .run(hash(prior));
      const token = randomBytes(32).toString("hex"),
        csrf = randomBytes(32).toString("hex");
      opts.db
        .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
        .run(hash(token), a.id, csrf, Date.now() + 8 * 3600_000);
      reply.setCookie(sessionName, token, {
        httpOnly: true,
        secure: !!opts.secureCookies,
        sameSite: "strict",
        path: "/",
        maxAge: 8 * 3600,
      });
      return { principal: { id: a.id, role: a.role }, csrf };
    },
  );
  app.get("/api/session", async (req) => ({
    principal: (req as any).principal,
    csrf: (req as any).session.csrf,
    sessionInstanceId: hash("binding:" + (req as any).session.token_hash),
  }));
  app.post("/api/logout", async (req, reply) => {
    opts.db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .run((req as any).session.token_hash);
    reply.clearCookie(sessionName, { path: "/" });
    return { ok: true };
  });
  const principal = (req: any): Principal => req.principal;
  app.get("/api/documents", async (req) => ({
    documents: service.list(principal(req)),
  }));
  app.get("/api/documents/:id", async (req, reply) => {
    try {
      return service.document(principal(req), (req.params as any).id);
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Document access denied"));
    }
  });
  const status = (r: any) =>
    r.ok
      ? 200
      : ((
          {
            FORBIDDEN: 403,
            UNAUTHORIZED: 401,
            NOT_FOUND: 404,
            STALE_CONTEXT: 409,
            IDEMPOTENCY_CONFLICT: 409,
            INVALID_ARGUMENT: 400,
            UNSUPPORTED: 400,
          } as any
        )[r.error.code] ?? 500);
  app.post("/api/invoke", async (req, reply) => {
    const result = service.invoke(principal(req), req.body);
    return reply.code(status(result)).send(result);
  });
  // Separate human operation, absent from the bridge catalog. It is an explicit acknowledgement, not proof of truth.
  app.post("/api/human/accept-conclusion", async (req, reply) => {
    const result = service.invoke(principal(req), req.body, true);
    return reply.code(status(result)).send(result);
  });
  app.get("/api/documents/:id/audit", async (req, reply) => {
    const id = (req.params as any).id;
    try {
      service.authorize(principal(req), id);
      return {
        entries: opts.db
          .prepare(
            "SELECT * FROM audit WHERE document_id=? ORDER BY id DESC LIMIT 100",
          )
          .all(id),
      };
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Document access denied"));
    }
  });
  app.get("/health", async () => ({ ok: true }));
  app.setErrorHandler((error, req, reply) => {
    const e = error as any;
    reply
      .code(e.validation ? 400 : 500)
      .send(
        failure(
          e.validation ? "INVALID_ARGUMENT" : "INTERNAL",
          e.validation
            ? "Invalid request schema"
            : "Internal application error",
        ),
      );
  });
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
      app.get("/harness/*", async (_req, reply) =>
        reply
          .code(404)
          .send(
            failure("NOT_FOUND", "Dev harness is excluded from production"),
          ),
      );
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
