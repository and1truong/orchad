import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import serveStatic from "@fastify/static";
import type { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { failure, success, type Invoke } from "../shared/contract.ts";
import { LearningService } from "./service.ts";
import type { Principal } from "../shared/domain.ts";

const here = dirname(fileURLToPath(import.meta.url));

export type AppOpts = {
  db: DatabaseSync;
  origin: string;
  secureCookies?: boolean;
  dev?: boolean;
  staticRoot?: string;
};

type SessionRow = {
  token_hash: string;
  principal: string;
  csrf: string;
  expires: number;
};

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const cookieName = (secure: boolean) => (secure ? "__Host-pear" : "pear");

export async function createApp(
  opts: AppOpts,
): Promise<{ app: FastifyInstance; service: LearningService }> {
  const { db, origin } = opts;
  const secure = opts.secureCookies === true;
  const service = new LearningService(db);
  const app = Fastify({ bodyLimit: 256 * 1024 });
  await app.register(cookie);

  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    );
  });

  app.addHook("preHandler", async (req, reply) => {
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.url.startsWith("/api/")
    ) {
      const o = req.headers.origin;
      if (o !== origin) {
        reply.code(403).send(failure("FORBIDDEN", "Origin không khớp.", false, 0));
        return reply;
      }
    }
  });

  const sessionOf = (req: {
    cookies: Record<string, string | undefined>;
    headers: Record<string, unknown>;
  }): { p: Principal; row: SessionRow } | null => {
    const token = req.cookies[cookieName(secure)];
    if (!token) return null;
    const row = db
      .prepare("SELECT * FROM sessions WHERE token_hash=?")
      .get(sha256(token)) as SessionRow | undefined;
    if (!row || row.expires < Date.now()) return null;
    const p = service.principalOf(row.principal);
    if (!p) return null;
    return { p, row };
  };

  const requireAuth = (
    req: Parameters<typeof sessionOf>[0],
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  ): { p: Principal; row: SessionRow } | null => {
    const s = sessionOf(req);
    if (!s) {
      reply
        .code(401)
        .send(failure("UNAUTHORIZED", "Chưa đăng nhập.", false, 0));
      return null;
    }
    return s;
  };

  app.post("/api/login", async (req, reply) => {
    const body = req.body as { username?: string; password?: string };
    const username = String(body?.username ?? "");
    const password = String(body?.password ?? "");
    const acc = db
      .prepare(
        "SELECT id,password_hash,salt,active FROM accounts WHERE id=?",
      )
      .get(username) as
      | { id: string; password_hash: string; salt: string; active: number }
      | undefined;
    const hash = acc
      ? scryptSync(password, acc.salt, 64)
      : scryptSync(password, "pad", 64);
    if (
      !acc ||
      !acc.active ||
      !timingSafeEqual(hash, Buffer.from(acc.password_hash, "hex"))
    ) {
      return reply
        .code(401)
        .send(failure("UNAUTHORIZED", "Sai tài khoản hoặc mật khẩu.", false, 0));
    }
    db.prepare("DELETE FROM sessions WHERE principal=?").run(acc.id);
    const token = randomBytes(32).toString("hex");
    const csrf = randomBytes(16).toString("hex");
    db.prepare(
      "INSERT INTO sessions(token_hash,principal,csrf,expires) VALUES(?,?,?,?)",
    ).run(sha256(token), acc.id, csrf, Date.now() + 8 * 3600 * 1000);
    reply
      .setCookie(cookieName(secure), token, {
        httpOnly: true,
        sameSite: "strict",
        secure,
        path: "/",
        maxAge: 8 * 3600,
      })
      .send(success({ principal: acc.id, csrf }, 0));
  });

  app.post("/api/logout", async (req, reply) => {
    const s = requireAuth(req, reply);
    if (!s) return reply;
    reply.clearCookie(cookieName(secure), { path: "/" });
    return success({ loggedOut: true }, 0);
  });

  app.get("/api/session", async (req, reply) => {
    const s = requireAuth(req, reply);
    if (!s) return reply;
    return success(
      {
        principal: s.p.id,
        role: s.p.role,
        orgId: s.p.orgId,
        csrf: s.row.csrf,
        sessionEpoch: sha256(`binding:${s.row.token_hash}`),
      },
      0,
    );
  });

  app.addHook("preHandler", async (req, reply) => {
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.url.startsWith("/api/") &&
      !req.url.startsWith("/api/login")
    ) {
      const s = sessionOf(req);
      if (!s) return; // requireAuth inside handler reports 401
      const csrf = req.headers["x-csrf-token"];
      if (csrf !== s.row.csrf) {
        reply
          .code(403)
          .send(failure("FORBIDDEN", "CSRF token không khớp.", false, 0));
        return reply;
      }
    }
  });

  const statusOf = (code: string) =>
    code === "FORBIDDEN"
      ? 403
      : code === "UNAUTHORIZED"
        ? 401
        : code === "NOT_FOUND"
          ? 404
          : code === "STALE_CONTEXT" || code === "IDEMPOTENCY_CONFLICT"
            ? 409
            : code === "INVALID_ARGUMENT" || code === "UNSUPPORTED"
              ? 400
              : 500;

  app.post("/api/invoke", async (req, reply) => {
    const s = requireAuth(req, reply);
    if (!s) return reply;
    const result = service.invoke(s.p, req.body);
    if (!result.ok && result.error)
      return reply.code(statusOf(result.error.code)).send(result);
    return result;
  });

  // Human-only progress endpoint: intentionally not a bridge tool so an agent
  // cannot mark lessons complete on a learner's behalf (ADR 0002).
  app.post(
    "/api/enrollments/:enrollmentId/lessons/:lessonId/complete",
    async (req, reply) => {
      const s = requireAuth(req, reply);
      if (!s) return reply;
      const params = req.params as {
        enrollmentId: string;
        lessonId: string;
      };
      const result = service.markLessonComplete(
        s.p,
        params.enrollmentId,
        params.lessonId,
      );
      if (!result.ok && result.error)
        return reply.code(statusOf(result.error.code)).send(result);
      return result;
    },
  );

  app.setErrorHandler(async (err: Error, _req, reply) => {
    reply
      .code(500)
      .send(
        failure("INTERNAL", err.message ?? "Lỗi server.", true, 0),
      );
  });

  const staticRoot =
    opts.staticRoot ?? join(here, "..", "..", "dist");
  if (opts.dev) {
    const { createServer: createVite } = await import("vite");
    const vite = await createVite({
      root: join(here, "..", ".."),
      server: { middlewareMode: true },
      appType: "spa",
      configFile: join(here, "..", "..", "vite.config.ts"),
    });
    app.addHook("onRequest", async (req, reply) => {
      if (req.url.startsWith("/api/")) return;
      await new Promise<void>((resolve, reject) => {
        vite.middlewares(req.raw, reply.raw, (e?: unknown) =>
          e ? reject(e) : resolve(),
        );
      });
      reply.hijack();
    });
  } else if (existsSync(staticRoot)) {
    await app.register(serveStatic, { root: staticRoot });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/"))
        return reply
          .code(404)
          .send(failure("NOT_FOUND", "Endpoint không tồn tại.", false, 0));
      return reply.sendFile("index.html");
    });
  }
  return { app, service };
}
