import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { courses } from "./seed.ts";
export function openDatabase(path: string, seed = false) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;",
  );
  db.exec(
    readFileSync(new URL("../../migrations/001.sql", import.meta.url), "utf8"),
  );
  db.exec(
    readFileSync(new URL("../../migrations/002.sql", import.meta.url), "utf8"),
  );
  db.exec(
    readFileSync(new URL("../../migrations/003.sql", import.meta.url), "utf8"),
  );
  db.exec(
    readFileSync(new URL("../../migrations/004.sql", import.meta.url), "utf8"),
  );
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=5").get()) {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/005.sql", import.meta.url),
          "utf8",
        ),
      );
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Assignment migration violates foreign keys");
      db.exec("COMMIT; PRAGMA foreign_keys=ON");
    } catch (e) {
      db.exec("ROLLBACK; PRAGMA foreign_keys=ON");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=6").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/006.sql", import.meta.url),
          "utf8",
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=7").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/007.sql", import.meta.url),
          "utf8",
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=8").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/008.sql", import.meta.url),
          "utf8",
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=9").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/009.sql", import.meta.url),
          "utf8",
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=10").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/010.sql", import.meta.url),
          "utf8",
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=11").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/011.sql", import.meta.url),
          "utf8",
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=12").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(
        readFileSync(
          new URL("../../migrations/012.sql", import.meta.url),
          "utf8",
        ),
      );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=13").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(new URL("../../migrations/013.sql", import.meta.url), "utf8"));
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); db.close(); throw e; }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=14").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/014.sql", import.meta.url), "utf8")); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); db.close(); throw e; }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=15").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/015.sql", import.meta.url), "utf8")); db.exec("COMMIT"); }
    catch(e) { db.exec("ROLLBACK"); db.close(); throw e; }
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=16").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/016.sql",import.meta.url),"utf8")); db.exec("COMMIT"); }
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=17").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/017.sql",import.meta.url),"utf8")); db.exec("COMMIT"); }
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=18").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/018.sql",import.meta.url),"utf8")); db.exec("COMMIT"); }
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=19").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/019.sql",import.meta.url),"utf8")); db.exec("COMMIT"); }
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=20").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/020.sql",import.meta.url),"utf8")); db.exec("COMMIT"); }
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=21").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/021.sql",import.meta.url),"utf8")); db.exec("COMMIT"); }
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=22").get()) {
    db.exec("BEGIN IMMEDIATE");
    try { db.exec(readFileSync(new URL("../../migrations/022.sql",import.meta.url),"utf8")); db.exec("COMMIT"); }
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=23").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/023.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=24").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/024.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=25").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/025.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=26").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/026.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=27").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/027.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=28").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/028.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=29").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/029.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=30").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/030.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=31").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/031.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (!db.prepare("SELECT 1 FROM schema_version WHERE version=32").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {db.exec(readFileSync(new URL("../../migrations/032.sql",import.meta.url),"utf8"));db.exec("COMMIT");}
    catch(e){db.exec("ROLLBACK");db.close();throw e;}
  }
  if (seed) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const accounts = [
        ["admin", "admin", null],
        ["manager", "manager", null],
        ["learner-a", "learner", "manager"],
        ["learner-b", "learner", null],
        ["editor", "content_admin", null],
        ["assessor", "assessor", null],
        ["outsider", "learner", null],
      ];
      for (const [id, role, manager] of accounts) {
        const tenant = id === "outsider" ? "other" : "demo",
          salt = randomBytes(16).toString("hex");
        db.prepare(
          "INSERT OR IGNORE INTO accounts(id,tenant,name,role,manager_id,password_hash,salt) VALUES(?,?,?,?,?,?,?)",
        ).run(
          id!,
          tenant,
          id!,
          role!,
          manager,
          scryptSync(id + "-dev", salt, 64).toString("hex"),
          salt,
        );
        db.prepare(
          "INSERT OR IGNORE INTO workspaces(id,tenant,owner) VALUES(?,?,?)",
        ).run(`learning:${tenant}:${id}`, tenant, id!);
        db.prepare(
          "INSERT OR IGNORE INTO workspaces(id,tenant) VALUES(?,?)",
        ).run(`library:${tenant}`, tenant);
      }
      for (const [id, c] of Object.entries(courses)) {
        const fresh = db
          .prepare("INSERT OR IGNORE INTO courses VALUES(?,?,'published',?,1)")
          .run(id, "demo", JSON.stringify(c));
        if (fresh.changes)
          db.prepare("INSERT INTO course_versions VALUES(?,?,?)").run(
            id,
            1,
            JSON.stringify(c),
          );
      }
      db.prepare("INSERT OR IGNORE INTO content_authors SELECT tenant,'course',id,'admin' FROM courses WHERE tenant='demo'").run();
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}
