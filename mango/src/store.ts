import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import type { Usage } from "./providers/types.js";
export type Principal = {
  id: string;
  models: string[];
  rpm: number;
  concurrency: number;
  quota: number;
};
export type LedgerEntry = {
  id: string;
  principal: string;
  provider: string;
  model: string;
  status: string;
  latencyMs: number;
  usage: Usage;
  reserved: number;
};
export interface Storage {
  authenticate(token: string): Principal | undefined;
  reserve(id: string, principal: Principal, amount: number): boolean;
  record(entry: LedgerEntry): void;
  close(): void;
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class SqliteStore implements Storage {
  readonly db: DatabaseSync;
  constructor(path = "mango.sqlite", recover = false) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS principals(id TEXT PRIMARY KEY, models TEXT NOT NULL, rpm INTEGER NOT NULL, concurrency INTEGER NOT NULL, quota INTEGER NOT NULL, spent INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS tokens(hash TEXT PRIMARY KEY, principal TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS reservations(id TEXT PRIMARY KEY, principal TEXT NOT NULL, amount INTEGER NOT NULL, created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY, principal TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, latency_ms INTEGER NOT NULL, input_tokens INTEGER, output_tokens INTEGER, usage_status TEXT NOT NULL, reserved INTEGER NOT NULL, created INTEGER NOT NULL);`);
    // Crashed requests are conservatively charged at reservation, with usage unknown.
    if (recover)
      this.db.exec(`BEGIN IMMEDIATE;
   UPDATE principals SET spent=spent+COALESCE((SELECT SUM(amount) FROM reservations WHERE principal=principals.id),0);
   INSERT OR IGNORE INTO usage SELECT id,principal,'unknown','unknown','interrupted',0,NULL,NULL,'unknown',amount,created FROM reservations;
   DELETE FROM reservations; COMMIT;`);
  }
  provision(p: Principal, token = randomBytes(32).toString("base64url")) {
    if (
      !p.id ||
      !p.models.length ||
      ![p.rpm, p.concurrency, p.quota].every(
        (v) => Number.isSafeInteger(v) && v > 0,
      ) ||
      token.length < 24
    )
      throw new Error("Invalid principal or token");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO principals(id,models,rpm,concurrency,quota) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET models=excluded.models,rpm=excluded.rpm,concurrency=excluded.concurrency,quota=excluded.quota",
        )
        .run(p.id, JSON.stringify(p.models), p.rpm, p.concurrency, p.quota);
      this.db
        .prepare("INSERT INTO tokens(hash,principal) VALUES(?,?)")
        .run(tokenHash(token), p.id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return token;
  }
  getPrincipal(id: string) {
    const row = this.db
      .prepare("SELECT * FROM principals WHERE id=?")
      .get(id) as any;
    if (!row) return;
    return {
      id: row.id,
      models: JSON.parse(row.models),
      rpm: row.rpm,
      concurrency: row.concurrency,
      quota: row.quota,
    } as Principal;
  }
  revoke(token: string) {
    this.db
      .prepare("UPDATE tokens SET revoked=1 WHERE hash=?")
      .run(tokenHash(token));
  }
  authenticate(token: string) {
    const row = this.db
      .prepare(
        "SELECT p.* FROM principals p JOIN tokens t ON t.principal=p.id WHERE t.hash=? AND t.revoked=0",
      )
      .get(tokenHash(token)) as any;
    if (!row) return;
    return {
      id: row.id,
      models: JSON.parse(row.models),
      rpm: row.rpm,
      concurrency: row.concurrency,
      quota: row.quota,
    } as Principal;
  }
  reserve(id: string, p: Principal, amount: number) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = this.db
        .prepare(
          "SELECT spent+COALESCE((SELECT SUM(amount) FROM reservations WHERE principal=?),0) AS used FROM principals WHERE id=?",
        )
        .get(p.id, p.id) as any;
      if (!r || r.used + amount > p.quota) {
        this.db.exec("ROLLBACK");
        return false;
      }
      this.db
        .prepare("INSERT INTO reservations VALUES(?,?,?,?)")
        .run(id, p.id, amount, Date.now());
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  record(e: LedgerEntry) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const known = e.usage.input !== null && e.usage.output !== null;
      const charge = known ? e.usage.input! + e.usage.output! : e.reserved;
      this.db
        .prepare("UPDATE principals SET spent=spent+? WHERE id=?")
        .run(charge, e.principal);
      this.db.prepare("DELETE FROM reservations WHERE id=?").run(e.id);
      this.db
        .prepare("INSERT INTO usage VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          e.id,
          e.principal,
          e.provider,
          e.model,
          e.status,
          e.latencyMs,
          e.usage.input,
          e.usage.output,
          known
            ? "final"
            : e.usage.input === null && e.usage.output === null
              ? "unknown"
              : "provisional",
          e.reserved,
          Date.now(),
        );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
