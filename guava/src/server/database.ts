import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { scryptSync, randomBytes } from "node:crypto";
import { documents, evidence } from "./seed.ts";
export function openDatabase(path: string, seed = true) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(
    readFileSync(new URL("../../migrations/001.sql", import.meta.url), "utf8"),
  );
  if (seed) {
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const role of ["reader", "investigator"]) {
        const salt = randomBytes(16).toString("hex");
        db.prepare("INSERT OR IGNORE INTO accounts VALUES(?,?,?,?)").run(
          role,
          scryptSync(role + "-dev", salt, 64).toString("hex"),
          salt,
          role,
        );
      }
      for (const d of documents) {
        db.prepare("INSERT OR IGNORE INTO documents VALUES(?,?,?,?,?)").run(
          d.id,
          d.title,
          d.summary,
          d.revision,
          JSON.stringify(d.graph),
        );
        for (const p of ["reader", "investigator"])
          db.prepare("INSERT OR IGNORE INTO access VALUES(?,?)").run(p, d.id);
      }
      for (const e of evidence)
        db.prepare("INSERT OR IGNORE INTO evidence VALUES(?,?,?)").run(
          e.id,
          e.documentId,
          JSON.stringify(e),
        );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}
