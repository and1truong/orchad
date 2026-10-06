import type { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { validateArgs } from "@orchard/bridge-contract";
import type { Principal } from "../shared/model.ts";
import {
  userSchema,
  groupSchema,
  type Group,
  type UserInput,
  type Rule,
} from "../shared/people.ts";
import { encodeCsv, parseCsv } from "../shared/csv.ts";
import { reject, boundedPage } from "./errors.ts";
const identifier = /^[A-Za-z0-9_-]{1,64}$/;
const headers = [
  "id",
  "name",
  "role",
  "active",
  "managerId",
  "preferredLanguage",
  "interests",
  "customFields",
];
export class PeopleService {
  constructor(readonly db: DatabaseSync) {}
  private users(tenant: string) {
    return (
      this.db
        .prepare(
          "SELECT a.id,a.name,a.role,a.active,a.manager_id,a.auth_version,p.created_at,p.preferred_language,p.interests,p.custom_fields FROM accounts a LEFT JOIN user_profiles p ON p.user_id=a.id WHERE a.tenant=? ORDER BY a.id",
        )
        .all(tenant) as any[]
    ).map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      active: !!r.active,
      managerId: r.manager_id,
      authVersion: r.auth_version,
      createdAt: r.created_at ?? "2026-10-05T00:00:00.000Z",
      preferredLanguage: r.preferred_language ?? "en",
      interests: JSON.parse(r.interests ?? "[]"),
      customFields: JSON.parse(r.custom_fields ?? "[]"),
    }));
  }
  private audience(p: Principal) {
    return this.users(p.tenant).filter(
      (r) => p.role === "admin" || r.managerId === p.id,
    );
  }
  private userInput(p: Principal, u: UserInput) {
    if (
      !validateArgs(userSchema, u) ||
      !identifier.test(u.id) ||
      new Set(u.customFields.map((f) => f.name)).size !==
        u.customFields.length ||
      u.customFields.some((f) => !identifier.test(f.name)) ||
      new Set(u.interests).size !== u.interests.length
    )
      reject(
        "INVALID_ARGUMENT",
        "Invalid identity/profile or duplicate fields",
      );
    const existing = this.db
      .prepare("SELECT tenant FROM accounts WHERE id=?")
      .get(u.id) as any;
    if (existing && existing.tenant !== p.tenant)
      reject("FORBIDDEN", "Identity belongs to another organization");
  }
  private graph(p: Principal, updates: UserInput[]) {
    const users = new Map<string, any>(
      this.users(p.tenant).map((u) => [u.id, u]),
    );
    for (const u of updates) {
      this.userInput(p, u);
      users.set(u.id, { ...users.get(u.id), ...u });
    }
    if (![...users.values()].some((u) => u.active && u.role === "admin"))
      reject(
        "FORBIDDEN",
        "Organization requires at least one active administrator",
      );
    for (const u of users.values()) {
      if (!u.managerId) continue;
      const manager = users.get(u.managerId);
      if (
        !manager ||
        !manager.active ||
        !["manager", "admin"].includes(manager.role)
      )
        reject(
          "INVALID_ARGUMENT",
          "Manager must be active, same-tenant and authorized for reports",
        );
      let current: any = u;
      const visited = new Set<string>();
      while (current?.managerId) {
        if (visited.has(current.id))
          reject("INVALID_ARGUMENT", "Manager relationship cycle");
        visited.add(current.id);
        current = users.get(current.managerId);
      }
    }
  }
  private save(p: Principal, u: UserInput) {
    const old = this.db
      .prepare("SELECT * FROM accounts WHERE id=? AND tenant=?")
      .get(u.id, p.tenant) as any;
    if (old) {
      const security =
        old.role !== u.role ||
        !!old.active !== u.active ||
        old.manager_id !== u.managerId;
      this.db
        .prepare(
          "UPDATE accounts SET name=?,role=?,active=?,manager_id=?,auth_version=auth_version+? WHERE id=?",
        )
        .run(
          u.name,
          u.role,
          u.active ? 1 : 0,
          u.managerId,
          security ? 1 : 0,
          u.id,
        );
      if (security)
        this.db.prepare("DELETE FROM sessions WHERE principal=?").run(u.id);
    } else {
      const salt = randomBytes(16).toString("hex");
      this.db
        .prepare(
          "INSERT INTO accounts(id,tenant,name,role,active,manager_id,password_hash,salt) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          u.id,
          p.tenant,
          u.name,
          u.role,
          u.active ? 1 : 0,
          u.managerId,
          scryptSync(u.id + "-dev", salt, 64).toString("hex"),
          salt,
        );
      this.db
        .prepare("INSERT INTO workspaces(id,tenant,owner) VALUES(?,?,?)")
        .run(`learning:${p.tenant}:${u.id}`, p.tenant, u.id);
    }
    this.db
      .prepare(
        "INSERT INTO user_profiles(user_id,created_at,preferred_language,interests,custom_fields) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET preferred_language=excluded.preferred_language,interests=excluded.interests,custom_fields=excluded.custom_fields",
      )
      .run(
        u.id,
        new Date().toISOString(),
        u.preferredLanguage,
        JSON.stringify(u.interests),
        JSON.stringify(u.customFields),
      );
    this.db
      .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
      .run(`learning:${p.tenant}:${u.id}`);
    return { userId: u.id, created: !old, active: u.active };
  }
  private importPreview(p: Principal, csv: string) {
    let rows: string[][];
    try {
      rows = parseCsv(csv);
    } catch (e) {
      return {
        valid: false,
        errors: [{ row: 1, message: (e as Error).message }],
        users: [],
        previewHash: null,
      };
    }
    const errors: { row: number; message: string }[] = [],
      users: UserInput[] = [];
    if (JSON.stringify(rows[0]) !== JSON.stringify(headers))
      errors.push({ row: 1, message: "Expected header: " + headers.join(",") });
    if (rows.length < 2 || rows.length > 101)
      errors.push({ row: 1, message: "Supply 1 to 100 user rows" });
    const seen = new Set<string>();
    for (let i = 1; i < rows.length; i++) {
      try {
        const row = rows[i];
        if (row.length !== headers.length) throw Error("Column count mismatch");
        if (row[3] !== "true" && row[3] !== "false")
          throw Error("active must be true or false");
        const u: UserInput = {
          id: row[0],
          name: row[1],
          role: row[2] as any,
          active: row[3] === "true",
          managerId: row[4] || null,
          preferredLanguage: row[5] as any,
          interests: JSON.parse(row[6] || "[]"),
          customFields: JSON.parse(row[7] || "[]"),
        };
        this.userInput(p, u);
        if (seen.has(u.id)) throw Error("Duplicate identity in CSV");
        seen.add(u.id);
        users.push(u);
      } catch (e) {
        errors.push({ row: i + 1, message: (e as Error).message });
      }
    }
    if (!errors.length)
      try {
        this.graph(p, users);
      } catch (e) {
        errors.push({ row: 0, message: (e as Error).message });
      }
    const previewHash = errors.length
      ? null
      : createHash("sha256")
          .update(
            JSON.stringify({
              tenant: p.tenant,
              csv,
              live: this.users(p.tenant),
            }),
          )
          .digest("hex");
    return { valid: errors.length === 0, errors, users, previewHash };
  }
  private validateGroup(p: Principal, g: Group) {
    if (
      !validateArgs(groupSchema, g) ||
      new Set(g.memberIds).size !== g.memberIds.length
    )
      reject("INVALID_ARGUMENT", "Invalid group definition");
    if (g.kind === "static") {
      if (g.rules.length)
        reject("INVALID_ARGUMENT", "Static groups cannot have dynamic rules");
      const valid = new Set(this.users(p.tenant).map((u) => u.id));
      if (g.memberIds.some((id) => !valid.has(id)))
        reject("FORBIDDEN", "Group member outside organization");
    } else {
      if (g.memberIds.length || g.rules.length === 0)
        reject(
          "INVALID_ARGUMENT",
          "Dynamic group requires rules and no fixed members",
        );
      for (const r of g.rules) {
        if (r.field === "customField" && !identifier.test(r.customField))
          reject("INVALID_ARGUMENT", "Custom field rule requires a field name");
        if (r.field !== "customField" && r.customField !== "")
          reject(
            "INVALID_ARGUMENT",
            "Field selector only allowed for customField rules",
          );
        if (
          ["before", "after"].includes(r.operator) ||
          r.field === "createdAt"
        ) {
          if (
            r.field !== "createdAt" ||
            r.operator === "contains" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(r.value) ||
            !Number.isFinite(Date.parse(r.value + "T00:00:00Z")) ||
            new Date(r.value + "T00:00:00Z").toISOString().slice(0, 10) !==
              r.value
          )
            reject(
              "INVALID_ARGUMENT",
              "Date rules require a valid UTC calendar date on createdAt",
            );
        }
        if (
          r.field === "active" &&
          (!["true", "false"].includes(r.value) ||
            !["equals", "notEquals"].includes(r.operator))
        )
          reject("INVALID_ARGUMENT", "Active rules compare true/false");
      }
    }
    return g;
  }
  private matches(u: any, r: Rule) {
    const actual =
      r.field === "customField"
        ? u.customFields.find((f: any) => f.name === r.customField)?.value
        : r.field === "createdAt"
          ? u.createdAt.slice(0, 10)
          : String(u[r.field] ?? "");
    if (actual === undefined) return false;
    switch (r.operator) {
      case "equals":
        return actual === r.value;
      case "notEquals":
        return actual !== r.value;
      case "contains":
        return actual.toLowerCase().includes(r.value.toLowerCase());
      case "before":
        return actual < r.value;
      case "after":
        return actual > r.value;
    }
  }
  members(p: Principal, g: Group) {
    this.validateGroup(p, g);
    return this.audience(p).filter(
      (u) =>
        u.active &&
        (g.kind === "static"
          ? g.memberIds.includes(u.id)
          : g.mode === "ALL"
            ? g.rules.every((r) => this.matches(u, r))
            : g.rules.some((r) => this.matches(u, r))),
    );
  }
  group(p: Principal, id: string) {
    const row = this.db
      .prepare("SELECT * FROM learning_groups WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    if (!row) reject("NOT_FOUND", "Group unavailable");
    const definition = JSON.parse(row.definition) as Group;
    if (p.role === "manager" && definition.kind === "static") {
      const allowed = new Set(this.audience(p).map((u) => u.id));
      definition.memberIds = definition.memberIds.filter((id) =>
        allowed.has(id),
      );
    }
    return { ...row, definition };
  }
  authorize(p: Principal, name: string, a: any) {
    if (name === "learning_get_group") this.group(p, a.groupId);
    if (name === "learning_save_group") {
      const old = this.db
        .prepare("SELECT tenant FROM learning_groups WHERE id=?")
        .get(a.groupId) as any;
      if (old && old.tenant !== p.tenant)
        reject("FORBIDDEN", "Group belongs to another organization");
    }
    if (name === "learning_save_user") this.userInput(p, a.user);
  }
  read(p: Principal, name: string, a: any): any {
    switch (name) {
      case "learning_get_profile": {
        const u = this.users(p.tenant).find((u) => u.id === p.id)!;
        return {
          name: u.name,
          preferredLanguage: u.preferredLanguage,
          interests: u.interests,
        };
      }
      case "learning_list_users":
        return boundedPage(
          this.audience(p).map(({ authVersion, ...u }) => u),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_list_groups":
        return boundedPage(
          this.db
            .prepare(
              "SELECT id,name,kind,version FROM learning_groups WHERE tenant=? ORDER BY id",
            )
            .all(p.tenant),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_get_group": {
        const { definition, ...row } = this.group(p, a.groupId);
        delete row.tenant;
        delete row.owner;
        return { ...row, group: definition };
      }
      case "learning_preview_group":
        return boundedPage(
          this.members(p, a.group).map(({ authVersion, ...u }) => u),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_preview_user_import": {
        const r = this.importPreview(p, a.csv);
        return {
          valid: r.valid,
          errors: r.errors,
          previewHash: r.previewHash,
          total: r.users.length,
          changes: r.users.map((u) => ({
            id: u.id,
            name: u.name,
            role: u.role,
            active: u.active,
            managerId: u.managerId,
          })),
        };
      }
      case "learning_export_users": {
        const page = boundedPage(
          this.audience(p),
          a.offset ?? 0,
          a.limit ?? 20,
        );
        return {
          ...page,
          items: undefined,
          csv: encodeCsv([
            headers,
            ...page.items.map((u) => [
              u.id,
              u.name,
              u.role,
              String(u.active),
              u.managerId,
              u.preferredLanguage,
              JSON.stringify(u.interests),
              JSON.stringify(u.customFields),
            ]),
          ]),
        };
      }
      default:
        reject("UNSUPPORTED", "Unknown people read");
    }
  }
  write(p: Principal, name: string, a: any): any {
    switch (name) {
      case "learning_save_profile": {
        if (new Set(a.interests).size !== a.interests.length)
          reject("INVALID_ARGUMENT", "Duplicate interests");
        this.db
          .prepare(
            "INSERT INTO user_profiles(user_id,created_at,preferred_language,interests) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET preferred_language=excluded.preferred_language,interests=excluded.interests",
          )
          .run(
            p.id,
            new Date().toISOString(),
            a.preferredLanguage,
            JSON.stringify(a.interests),
          );
        return { profileSaved: true };
      }
      case "learning_save_user":
        this.graph(p, [a.user]);
        return this.save(p, a.user);
      case "learning_import_users": {
        const r = this.importPreview(p, a.csv);
        if (!r.valid)
          reject("INVALID_ARGUMENT", "CSV invalid; review dry-run row errors");
        if (r.previewHash !== a.previewHash)
          reject("STALE_CONTEXT", "Import review is stale; rerun dry-run");
        for (const u of r.users.filter(
          (u) =>
            !this.db.prepare("SELECT 1 FROM accounts WHERE id=?").get(u.id),
        ))
          this.save(p, { ...u, managerId: null });
        for (const u of r.users) this.save(p, u);
        return { imported: r.users.length };
      }
      case "learning_save_group": {
        if (!identifier.test(a.groupId))
          reject("INVALID_ARGUMENT", "Invalid group ID");
        const g = this.validateGroup(p, a.group);
        this.db
          .prepare(
            "INSERT INTO learning_groups VALUES(?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,definition=excluded.definition,version=learning_groups.version+1",
          )
          .run(a.groupId, p.tenant, p.id, g.name, g.kind, JSON.stringify(g));
        return {
          groupId: a.groupId,
          version: this.group(p, a.groupId).version,
          memberCount: this.members(p, g).length,
        };
      }
      default:
        reject("UNSUPPORTED", "Unknown people write");
    }
  }
}
