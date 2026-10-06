import type {OIDCConfig} from "./identity.ts";
import { openDatabase } from "./database.ts";
import { createApp } from "./app.ts";
const dev = process.argv.includes("--dev"),
  port = Number(process.env.PORT ?? 4314),
  origin = process.env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
const developmentAuth = dev || process.env.PEAR_DEVELOPMENT_AUTH === "true";
if (
  developmentAuth &&
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)
)
  throw new Error("Synthetic development accounts require a loopback origin");
const host = process.env.HOST ?? "127.0.0.1";
if (developmentAuth && !["127.0.0.1", "localhost", "::1"].includes(host))
  throw new Error("Synthetic development accounts must bind loopback");
const db = openDatabase(
  process.env.DATABASE_PATH ?? ".data/pear.sqlite",
  developmentAuth,
);
const oidc:OIDCConfig|undefined=process.env.PEAR_OIDC_CONFIG?JSON.parse(process.env.PEAR_OIDC_CONFIG):undefined;
const { app, service, outbox } = await createApp({
  db,
  origin,
  dev,
  developmentAuth,
  oidc,
  webhookEndpoints: process.env.PEAR_WEBHOOK_ENDPOINTS?JSON.parse(process.env.PEAR_WEBHOOK_ENDPOINTS):undefined,
  xapiEnabled: process.env.PEAR_XAPI_ENABLED === "true",
  scimEnabled: process.env.PEAR_SCIM_ENABLED === "true",
  secureCookies: process.env.COOKIE_SECURE === "true",
});
await app.listen({ port, host });
const assignmentTimer = setInterval(() => {
  try {
    service.assignments.runBackground();
  } catch {
    console.error(
      "Assignment scheduler failed; durable state retained for retry",
    );
  }
}, 30000);
assignmentTimer.unref();
let delivering=false,delivery:Promise<any>|null=null;
const outboxTimer=setInterval(()=>{if(delivering)return;delivering=true;delivery=outbox.run().catch(()=>console.error("Outbox delivery failed; durable state retained")).finally(()=>{delivering=false;});},1000);
outboxTimer.unref();
console.log(
  `Pear: ${origin}${developmentAuth ? " · SYNTHETIC DEVELOPMENT ACCOUNTS" : ""}`,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    clearInterval(assignmentTimer);
    clearInterval(outboxTimer);
    outbox.stop();
    await delivery;
    await app.close();
    db.close();
    process.exit(0);
  });
