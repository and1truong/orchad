import { openDatabase } from "./database.ts";
import { createApp } from "./app.ts";
const port = Number(process.env.PORT ?? 4310),
  dev = process.argv.includes("--dev");
const origin = process.env.APP_ORIGIN ?? `http://127.0.0.1:${port}`;
const db = openDatabase(process.env.DATABASE_PATH ?? ".data/guava.sqlite");
const { app } = await createApp({
  db,
  origin,
  dev,
  secureCookies: process.env.COOKIE_SECURE === "true",
});
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
console.log(`Guava ${dev ? "development" : "production"} app: ${origin}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
