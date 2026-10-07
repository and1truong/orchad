import {reportPDF} from "./report-pdf.ts";
import {reportSchema} from "../shared/reports.ts";
import {transcriptPDF} from "./transcript-pdf.ts";
import {readFileSync} from "node:fs";
import {CertificateFont,certificatePDF,certificatePDFSupported} from "./certificate-pdf.ts";
import {ProviderCatalogService,type ProviderAdapter} from "./provider-catalog.ts";
import {registerProviderCatalog} from "./provider-catalog-routes.ts";
import {registerSCORM} from "./scorm-routes.ts";
import {registerXAPI} from "./xapi-routes.ts";
import {registerTranslations} from "./translations-routes.ts";
import {OutboxService,type WebhookEndpoint} from "./outbox.ts";
import {registerOutbox} from "./outbox-routes.ts";
import {registerSCIM} from "./scim-routes.ts";
import {IdentityService,type OIDCConfig} from "./identity.ts";
import { TelemetryService } from "./telemetry.ts";
import { uploadLimit, type MediaContext } from "./media.ts";
import { DomainError } from "./errors.ts";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import serveStatic from "@fastify/static";
import {
  createHash,
  createHmac,
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
  oidc?: OIDCConfig;
  identityFixture?: boolean;
  scimEnabled?: boolean;
  webhookEndpoints?: WebhookEndpoint[];
  xapiEnabled?: boolean;
  catalogAdapters?: ProviderAdapter[];
  catalogFixture?: boolean;
  certificateFont?:Buffer;
}) {
  let certificateFontBytes=opts.certificateFont;
  if(!certificateFontBytes&&opts.developmentAuth){try{certificateFontBytes=readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");}catch{}}
  const certificateFont=certificateFontBytes?new CertificateFont(certificateFontBytes):undefined;
  const parsed = new URL(opts.origin);
  if (parsed.origin !== opts.origin || parsed.username || parsed.password)
    throw new Error("APP_ORIGIN must be an exact origin");
  if (opts.secureCookies && parsed.protocol !== "https:")
    throw new Error("Secure cookies require HTTPS");
  if(opts.oidc&&!opts.identityFixture&&!opts.secureCookies)throw Error("OIDC requires secure session cookies");
  if(opts.identityFixture&&!["127.0.0.1","localhost","[::1]"].includes(parsed.hostname))throw Error("Identity fixtures require loopback");
  if(opts.scimEnabled&&!opts.identityFixture&&!opts.secureCookies)throw Error("SCIM requires HTTPS and secure session cookies");
  if(opts.webhookEndpoints?.length&&!opts.identityFixture&&!opts.secureCookies)throw Error("Webhook configuration requires HTTPS and secure session cookies");
  if(opts.xapiEnabled&&(!opts.scimEnabled||!opts.identityFixture&&!opts.secureCookies))throw Error("xAPI requires reviewed SCIM actors and secure configuration");
  if(opts.catalogFixture&&(!opts.developmentAuth||!["127.0.0.1","localhost","[::1]"].includes(parsed.hostname)))throw Error("Provider fixtures require loopback development authentication");
  if(opts.catalogAdapters?.length&&!opts.catalogFixture&&!opts.secureCookies)throw Error("Provider catalog requires HTTPS and secure session cookies");
  const providerCatalog=new ProviderCatalogService(opts.db,opts.catalogAdapters);
  const outbox=new OutboxService(opts.db,opts.webhookEndpoints,!!opts.identityFixture);
  const identity=new IdentityService(opts.db,opts.oidc,opts.origin,!!opts.identityFixture);
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
  const service = new LearningService(opts.db,opts.origin,opts.catalogAdapters),
    name = opts.secureCookies ? "__Host-pear-session" : "pear-session";
  const launchSecret = randomBytes(32);
  const loginBudget = new Map<
    string,
    { requests: number; failures: number; until: number }
  >();
  app.addHook("onSend", async (req, reply) => {
    if ((req.url.split("?")[0].startsWith("/api/interactive/")||req.url.split("?")[0].startsWith("/api/scorm/launch/"))) {
      reply
        .header(
          "Content-Security-Policy",
          "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; media-src 'none'; frame-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        )
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header("Cache-Control", "no-store")
        .header(
          "Permissions-Policy",
          "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        );
      return;
    }
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' https: blob:; connect-src 'self'" +
          (opts.dev ? " ws:" : "") +
          "; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    if (req.url.startsWith("/api/")||(req.url.startsWith("/scim/")||req.url.startsWith("/integrations/"))) reply.header("Cache-Control", reply.getHeader("Cache-Control")==="private, no-store"?"private, no-store":"no-store");
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
    if (["/api/login","/api/auth/config","/api/auth/start","/api/auth/callback"].includes(req.url.split("?")[0])) return;
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
      !(
        req.method === "GET" &&
        (req.url.split("?")[0].startsWith("/api/interactive/")||req.url.split("?")[0].startsWith("/api/scorm/launch/")||req.url.split("?")[0].startsWith("/api/provider-launch/"))
      ) &&
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
        b = { requests: 0, failures: 0, until: now + 60_000 };
        loginBudget.set(key, b);
      }
      if (++b.requests > 120 || b.failures >= 30)
        return reply
          .header(
            "Retry-After",
            String(Math.max(1, Math.ceil((b.until - now) / 1000))),
          )
          .code(429)
          .send(failure("FORBIDDEN", "Login rate limit"));
      const { username, password } = req.body as any,
        a = opts.db
          .prepare("SELECT * FROM accounts WHERE id=?")
          .get(username) as any;
      const candidate = scryptSync(password, a?.salt ?? "invalid", 64);
      if (
        !a?.active ||
        !timingSafeEqual(candidate, Buffer.from(a.password_hash, "hex"))
      ) {
        b.failures++;
        return reply
          .code(401)
          .send(
            failure("UNAUTHORIZED", "Invalid synthetic account credentials"),
          );
      }
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
  const identityCookie=opts.secureCookies?"__Host-pear-oidc":"pear-oidc";
  app.get("/api/auth/config",async()=>({oidcEnabled:!!opts.oidc,developmentEnabled:!!opts.developmentAuth}));
  app.post("/api/auth/start",async(req,reply)=>{
    try{
      const now=Date.now(),key="oidc:"+req.ip;
      let budget=loginBudget.get(key);if(!budget||budget.until<now){if(loginBudget.size>=1024)loginBudget.clear();budget={requests:0,failures:0,until:now+60000};loginBudget.set(key,budget);}
      if(++budget.requests>120)return reply.header("Retry-After","60").code(429).send(failure("FORBIDDEN","Identity login rate limit"));
      const result=identity.start(req.cookies[name]);
      reply.setCookie(identityCookie,result.binding,{httpOnly:true,secure:!!opts.secureCookies,sameSite:"lax",path:"/",maxAge:300});
      return {url:result.url};
    }catch{return reply.code(403).send(failure("FORBIDDEN","Organization sign-in unavailable"));}
  });
  app.get("/api/auth/callback",async(req,reply)=>{
    try{
      const result=await identity.callback(req.query,req.cookies[identityCookie]);
      reply.clearCookie(identityCookie,{path:"/",secure:!!opts.secureCookies,httpOnly:true,sameSite:"lax"});
      reply.setCookie(name,result!.token,{httpOnly:true,secure:!!opts.secureCookies,sameSite:"strict",path:"/",maxAge:8*3600});
      return reply.redirect("/");
    }catch{
      reply.clearCookie(identityCookie,{path:"/",secure:!!opts.secureCookies,httpOnly:true,sameSite:"lax"});return reply.code(401).send(failure("UNAUTHORIZED","Organization sign-in failed; restart sign-in"));
    }
  });
  app.get("/api/identity-links",async(req,reply)=>{
    try{
      const q=req.query as any,offset=q.offset===undefined?0:Number(q.offset);
      if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return reply.code(400).send(failure("INVALID_ARGUMENT","Invalid identity page"));
      return identity.list(service.principal((req as any).session.principal),{offset,limit:20});
    }catch{return reply.code(403).send(failure("FORBIDDEN","Identity settings require tenant administrator"));}
  });
  app.post("/api/identity-links",async(req,reply)=>{
    try{return identity.link(service.principal((req as any).session.principal),req.body);}
    catch(e){if(e instanceof DomainError)return reply.code(({UNAUTHORIZED:401,FORBIDDEN:403,STALE_CONTEXT:409,IDEMPOTENCY_CONFLICT:409,INVALID_ARGUMENT:400} as any)[e.code]??400).send(failure(e.code,e.message));throw e;}
  });
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
    reply.clearCookie(name, { path: "/", secure: !!opts.secureCookies, httpOnly: true, sameSite: "strict" });
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
  app.get("/api/describe", async (req, reply) => {
    try {
      return service.description(
        (req as any).session.principal,
        (req.query as any).documentId,
      );
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Workspace access denied"));
    }
  });
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
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer", bodyLimit: Bounds.message },
    (_req, body, done) => done(null, body),
  );
  const mediaFailure = (e: unknown, reply: any) => {
    if (e instanceof DomainError)
      return reply
        .code(status(failure(e.code, e.message)))
        .send(failure(e.code, e.message));
    throw e;
  };
  const telemetry = new TelemetryService(opts.db);
  app.get("/api/study-timer", async (req, reply) => {
    try {
      const q=req.query as any;
      return telemetry.get(service.principal((req as any).session.principal),q.kind,q.targetId);
    } catch(e) { return mediaFailure(e,reply); }
  });
  app.post("/api/study-timer", {schema:{body:object({
    action:{type:"string",enum:["start","pulse","stop"]},
    kind:{type:"string",enum:["course","item"]},
    targetId:{type:"string",minLength:1,maxLength:64},
    token:{type:"string",minLength:1,maxLength:64},
  },["action","kind","targetId"])}}, async (req, reply) => {
    try {
      const s=(req as any).session;
      return telemetry.act(service.principal(s.principal),s.token_hash,req.body as any);
    } catch(e) { return mediaFailure(e,reply); }
  });
  app.post("/api/uploads", { bodyLimit: uploadLimit }, async (req, reply) => {
    try {
      if (!opts.developmentAuth)
        return reply
          .code(403)
          .send(
            failure(
              "FORBIDDEN",
              "Production upload scanning/storage gate is not configured",
            ),
          );
      if (!Buffer.isBuffer(req.body))
        return reply
          .code(400)
          .send(failure("INVALID_ARGUMENT", "Binary upload required"));
      return service.media.upload(
        service.principal((req as any).session.principal),
        req.query,
        req.body,
      );
    } catch (e) {
      return mediaFailure(e, reply);
    }
  });
  app.get("/api/assets/:id", async (req, reply) => {
    try {
      const row = service.media.read(
        service.principal((req as any).session.principal),
        (req.params as any).id,
        {
          ...(req.query as MediaContext),
          ...((req.query as any).version
            ? { version: Number((req.query as any).version) }
            : {}),
        },
      );
      return reply
        .header(
          "Content-Disposition",
          "attachment; filename*=UTF-8''" + encodeURIComponent(row.filename),
        )
        .type(row.mime)
        .send(Buffer.from(row.bytes));
    } catch (e) {
      return mediaFailure(e, reply);
    }
  });
  app.post(
    "/api/launch",
    {
      schema: {
        body: object({
          assetId: { type: "string", minLength: 1, maxLength: 64 },
          context: object(
            {
              itemId: { type: "string", maxLength: 64 },
              version: { type: "integer", minimum: 1 },
              enrollmentId: { type: "string", maxLength: 64 },
              lessonId: { type: "string", maxLength: 64 },
              itemEnrollmentId: { type: "string", minLength: 1, maxLength: 64 },
            },
            [],
          ),
        }),
      },
    },
    async (req, reply) => {
      try {
        const b = req.body as any,
          session = (req as any).session;
        const row = service.media.read(
          service.principal(session.principal),
          b.assetId,
          b.context,
        );
        if (row.mime !== "text/html")
          return reply
            .code(400)
            .send(failure("INVALID_ARGUMENT", "Interactive HTML required"));
        const value = Buffer.from(
          JSON.stringify({
            id: row.id,
            context: b.context,
            binding: session.token_hash,
            expires: Date.now() + 60_000,
          }),
        ).toString("base64url");
        const signature = createHmac("sha256", launchSecret)
          .update(value)
          .digest("hex");
        return {
          url:
            "/api/interactive/" + row.id + "?ticket=" + value + "." + signature,
        };
      } catch (e) {
        return mediaFailure(e, reply);
      }
    },
  );
  app.get("/api/interactive/:id", async (req, reply) => {
    try {
      const ticket = (req.query as any).ticket;
      if (typeof ticket !== "string" || ticket.length > 2048)
        throw new Error("Invalid ticket");
      const [value, signature, extra] = ticket.split(".");
      const expected = createHmac("sha256", launchSecret)
        .update(value)
        .digest("hex");
      if (
        extra ||
        !signature ||
        !/^[a-f0-9]{64}$/.test(signature) ||
        !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
      )
        throw new Error("Invalid ticket");
      const payload = JSON.parse(Buffer.from(value, "base64url").toString()),
        session = (req as any).session;
      if (
        payload.binding !== session.token_hash ||
        payload.expires < Date.now() ||
        payload.id !== (req.params as any).id
      )
        throw new Error("Expired or stale ticket");
      const row = service.media.read(
        service.principal(session.principal),
        payload.id,
        payload.context,
      );
      if (row.mime !== "text/html") throw new Error("Invalid format");
      return reply
        .type("text/html; charset=utf-8")
        .send(Buffer.from(row.bytes));
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Interactive launch denied"));
    }
  });
  app.get("/api/bookings/:id/calendar", async (req, reply) => {
    try {
      const text = service.blended.calendar(
        service.principal((req as any).session.principal),
        (req.params as any).id,
      );
      return reply
        .header(
          "Content-Disposition",
          'attachment; filename="pear-session.ics"',
        )
        .type("text/calendar; charset=utf-8")
        .send(text);
    } catch (e) {
      return mediaFailure(e, reply);
    }
  });
  app.post("/api/reports/pdf",{schema:{body:object({
    spec:reportSchema,rows:{type:"string",enum:["filtered","all"]},columns:{type:"string",enum:["visible","all"]},snapshotHash:{type:"string",pattern:"^[a-f0-9]{64}$"}
  })}},async(req,reply)=>{
   try{
    const p=service.principal((req as any).session.principal);
    if(!certificateFont)throw new DomainError("FORBIDDEN","Server PDF font is not configured; original text and browser print remain available");
    const bytes=reportPDF(p,service.reports,req.body,certificateFont);
    return reply.header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff").header("Content-Disposition",'attachment; filename="pear-report.pdf"').type("application/pdf").send(bytes);
   }catch(e){return mediaFailure(e,reply);}
  });
  app.get("/api/transcript/pdf",async(req,reply)=>{
   try{
    const p=service.principal((req as any).session.principal);
    if(!certificateFont)throw new DomainError("FORBIDDEN","Server PDF font is not configured; original text and browser print remain available");
    const snapshotHash=String((req.query as any).snapshotHash??"");
    const bytes=transcriptPDF(p,service.reports,snapshotHash,certificateFont);
    return reply.header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff").header("Content-Disposition",'attachment; filename="pear-transcript.pdf"').type("application/pdf").send(bytes);
   }catch(e){return mediaFailure(e,reply);}
  });
  app.get("/api/certificates/:id", async (req, reply) => {
    try {
      const value=service.certificate((req as any).session.principal,(req.params as any).id);return {...value,pdfAvailable:certificatePDFSupported(value,false,certificateFont)};
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Certificate access denied"));
    }
  });
  app.get("/api/award-certificates/:id", async (req, reply) => {
    try {
      const value=service.programs.certificate(service.principal((req as any).session.principal),(req.params as any).id);return {...value,pdfAvailable:certificatePDFSupported(value,true,certificateFont)};
    } catch {
      return reply
        .code(403)
        .send(failure("FORBIDDEN", "Award certificate access denied"));
    }
  });
  
  for(const award of [false,true])app.get(award?"/api/award-certificates/:id/pdf":"/api/certificates/:id/pdf",async(req,reply)=>{
   try{
    const id=(req.params as any).id,principal=(req as any).session.principal;
    const certificate=award?service.programs.certificate(service.principal(principal),id):service.certificate(principal,id);
    if(!certificateFont)throw new DomainError("FORBIDDEN","Server PDF font is not configured; original text and browser print remain available");
    const bytes=certificatePDF(certificate,award,certificateFont);
    return reply.header("Cache-Control","private, no-store").header("X-Content-Type-Options","nosniff").header("Content-Disposition",'attachment; filename="pear-'+(award?"award":"certificate")+'-'+certificate.id+'.pdf"').type("application/pdf").send(bytes);
   }catch(e){return mediaFailure(e,reply);}
  });

  app.get("/api/provider-launch/:id",async(req,reply)=>{
    try{return reply.header("Cache-Control","no-store").header("Referrer-Policy","no-referrer").redirect(service.providerCatalog.launch(service.principal((req as any).session.principal),(req.params as any).id));}catch(e){return mediaFailure(e,reply);}
  });
  await registerProviderCatalog(app,providerCatalog,opts.origin,!!opts.catalogAdapters?.length);
  await registerSCORM(app,service.scorm,opts.origin,!!opts.developmentAuth||!!opts.identityFixture,req=>service.principal(req.session.principal));
  await registerXAPI(app,service.xapi,opts.origin,!!opts.xapiEnabled,req=>service.principal(req.session.principal));
  registerTranslations(app,service.translations,req=>service.principal(req.session.principal));
  registerOutbox(app,outbox,opts.origin,req=>service.principal(req.session.principal));
  registerSCIM(app,opts.db,opts.origin,!!opts.scimEnabled,req=>service.principal(req.session.principal),!!opts.catalogAdapters?.length);
  app.get("/health", async () => ({ ok: true }));
  app.setErrorHandler((e:any,req,reply)=>{
    if(req.url.startsWith("/scim/"))return reply.code(e.statusCode===413?413:e.statusCode===400?400:500).type("application/scim+json").send({schemas:["urn:ietf:params:scim:api:messages:2.0:Error"],status:String(e.statusCode===413?413:e.statusCode===400?400:500),detail:"Invalid or unavailable provisioning request"});
    return reply.code(e.statusCode===413?413:e.validation?400:500).send(failure(e.statusCode===413||e.validation?"INVALID_ARGUMENT":"INTERNAL",e.validation||e.statusCode===413?"Invalid or oversized request":"Internal application error"));
  });
  if (opts.dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.setNotFoundHandler((req, reply) => {
      if ((req.url.startsWith("/api/")||(req.url.startsWith("/scim/")||req.url.startsWith("/integrations/"))))
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
        (req.url.startsWith("/api/")||(req.url.startsWith("/scim/")||req.url.startsWith("/integrations/")))
          ? reply.code(404).send(failure("NOT_FOUND", "Endpoint not found"))
          : reply.sendFile("index.html"),
      );
    }
  }
  return { app, service, outbox, providerCatalog };
}
