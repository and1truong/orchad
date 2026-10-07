import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import { encodeCsv, parseCsv } from "../src/shared/csv.ts";
import type { UserInput, Group } from "../src/shared/people.ts";
const user = (id: string, extra: Partial<UserInput> = {}): UserInput => ({
  id,
  name: id,
  role: "learner",
  active: true,
  managerId: null,
  preferredLanguage: "en",
  interests: [],
  customFields: [],
  ...extra,
});
const group = (extra: Partial<Group> = {}): Group => ({
  name: "Learners",
  kind: "dynamic",
  mode: "ALL",
  memberIds: [],
  rules: [
    { field: "role", customField: "", operator: "equals", value: "learner" },
  ],
  ...extra,
});
const header = [
  "id",
  "name",
  "role",
  "active",
  "managerId",
  "preferredLanguage",
  "interests",
  "customFields",
];
const csv = (users: UserInput[]) =>
  encodeCsv([
    header,
    ...users.map((u) => [
      u.id,
      u.name,
      u.role,
      String(u.active),
      u.managerId ?? "",
      u.preferredLanguage,
      JSON.stringify(u.interests),
      JSON.stringify(u.customFields),
    ]),
  ]);
test("user lifecycle preserves records, revokes sessions and rejects tenant/role/relationship escalation", () => {
  const f = fixture();
  try {
    data(
      f.call("admin", "learning_save_user", {
        user: user("new-learner", {
          managerId: "manager",
          interests: ["Systems", "Security"],
          customFields: [{ name: "team", value: "blue" }],
        }),
      }),
    );
    const row = data(f.call("manager", "learning_list_users")).items.find(
      (u: any) => u.id === "new-learner",
    );
    assert.equal(row.customFields[0].value, "blue");
    assert.equal(
      JSON.stringify(data(f.call("admin", "learning_list_users"))).includes(
        "password",
      ),
      false,
    );
    data(
      f.call("new-learner", "learning_enroll", { courseId: "systems-basics" }),
    );
    f.db
      .prepare(
        "INSERT INTO sessions VALUES('token','new-learner','csrf',9999999999999,0)",
      )
      .run();
    data(
      f.call("admin", "learning_save_user", {
        user: user("new-learner", { active: false, managerId: "manager" }),
      }),
    );
    assert.equal(
      f.db
        .prepare("SELECT 1 FROM sessions WHERE principal='new-learner'")
        .get(),
      undefined,
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT auth_version FROM accounts WHERE id='new-learner'")
          .get() as any
      ).auth_version,
      1,
    );
    assert.ok(
      f.db
        .prepare("SELECT 1 FROM enrollments WHERE learner='new-learner'")
        .get(),
    );
    assert.throws(() => f.service.principal("new-learner"));
    for (const actor of ["manager", "learner-a", "editor", "assessor"])
      assert.equal(
        f.call(actor, "learning_save_user", { user: user("illegal") }).error
          ?.code,
        "FORBIDDEN",
      );
    assert.equal(
      f.call("admin", "learning_save_user", { user: user("outsider") }).error
        ?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("admin", "learning_save_user", {
        user: user("admin", { active: false, role: "admin" }),
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("admin", "learning_save_user", {
        user: user("learner-a", { managerId: "learner-a" }),
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.call("admin", "learning_save_user", {
        user: user("manager", { role: "manager", managerId: "admin" }),
      }).ok,
      true,
    );
    assert.equal(
      f.call("admin", "learning_save_user", {
        user: user("admin", { role: "admin", managerId: "manager" }),
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.call("admin", "learning_save_user", {
        user: user("bad", {
          customFields: [
            { name: "team", value: "a" },
            { name: "team", value: "b" },
          ],
        }),
      }).error?.code,
      "INVALID_ARGUMENT",
    );
  } finally {
    f.db.close();
  }
});
test("own preferences do not change privileged fields and CAS/dedup/audit failure are atomic", () => {
  const f = fixture();
  try {
    const args = {
        preferredLanguage: "vi",
        interests: ["Systems", "Security"],
      },
      key = { expectedRevision: 0, idempotencyKey: "profile" };
    const first = f.call(
      "learner-a",
      "learning_save_profile",
      args,
      "bridge",
      key,
    );
    data(first);
    assert.deepEqual(
      f.call("learner-a", "learning_save_profile", args, "bridge", key),
      first,
    );
    assert.deepEqual(
      data(f.call("learner-a", "learning_get_profile")).interests,
      args.interests,
    );
    assert.equal(
      f.call("learner-a", "learning_save_profile", { ...args, role: "admin" })
        .error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.call("learner-a", "learning_save_profile", {
        ...args,
        interests: ["x", "x"],
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    f.db.exec(
      "CREATE TRIGGER fail_people_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
    );
    assert.equal(
      f.call("admin", "learning_save_user", { user: user("rollback") }).error
        ?.code,
      "INTERNAL",
    );
    assert.equal(
      f.db.prepare("SELECT 1 FROM accounts WHERE id='rollback'").get(),
      undefined,
    );
    assert.equal(
      f.db
        .prepare("SELECT 1 FROM user_profiles WHERE user_id='rollback'")
        .get(),
      undefined,
    );
  } finally {
    f.db.close();
  }
});
test("CSV parses quoted lines, dry-runs all rows, requires fresh review and imports forward manager references atomically", () => {
  const f = fixture();
  try {
    const text = csv([
      user("imported", {
        name: 'Name, with "quotes"\nand newline',
        managerId: "new-manager",
      }),
      user("new-manager", { role: "manager" }),
    ]);
    assert.equal(parseCsv(text)[1][1], 'Name, with "quotes"\nand newline');
    const review = data(
      f.call("admin", "learning_preview_user_import", { csv: text }),
    );
    assert.equal(review.valid, true);
    assert.equal(
      f.db.prepare("SELECT 1 FROM accounts WHERE id='imported'").get(),
      undefined,
    );
    assert.equal(
      data(
        f.call("admin", "learning_import_users", {
          csv: text,
          previewHash: review.previewHash,
        }),
      ).imported,
      2,
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT manager_id FROM accounts WHERE id='imported'")
          .get() as any
      ).manager_id,
      "new-manager",
    );
    const second = data(
      f.call("admin", "learning_preview_user_import", {
        csv: csv([user("another")]),
      }),
    );
    data(f.call("admin", "learning_save_user", { user: user("changed") }));
    assert.equal(
      f.call("admin", "learning_import_users", {
        csv: csv([user("another")]),
        previewHash: second.previewHash,
      }).error?.code,
      "STALE_CONTEXT",
    );
    const invalid = csv([
      user("duplicate"),
      user("duplicate"),
      user("foreign", { managerId: "outsider" }),
    ]);
    const errors = data(
      f.call("admin", "learning_preview_user_import", { csv: invalid }),
    );
    assert.equal(errors.valid, false);
    assert.equal(
      f.call("admin", "learning_import_users", {
        csv: invalid,
        previewHash: "x".repeat(64),
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.db.prepare("SELECT 1 FROM accounts WHERE id='duplicate'").get(),
      undefined,
    );
    assert.equal(
      data(
        f.call("admin", "learning_preview_user_import", { csv: '"unclosed' }),
      ).valid,
      false,
    );
    assert.equal(
      data(
        f.call("admin", "learning_preview_user_import", {
          csv: csv([user("outsider")]),
        }),
      ).valid,
      false,
    );
    data(
      f.call("admin", "learning_save_user", {
        user: user("formula", { name: '  =HYPERLINK("bad")' }),
      }),
    );
    const exported = data(f.call("admin", "learning_export_users"));
    assert.equal(
      parseCsv(exported.csv).find((r) => r[0] === "formula")![1],
      '\'  =HYPERLINK("bad")',
    );
    assert.equal(exported.csv.includes("password_hash"), false);
  } finally {
    f.db.close();
  }
});
test("dynamic ALL/ANY/custom/date rules and static preview respect active membership and manager scope", () => {
  const f = fixture();
  try {
    data(
      f.call("admin", "learning_save_user", {
        user: user("learner-a", {
          managerId: "manager",
          customFields: [{ name: "department", value: "engineering" }],
        }),
      }),
    );
    let g = group({
      rules: [
        {
          field: "role",
          customField: "",
          operator: "equals",
          value: "learner",
        },
        {
          field: "customField",
          customField: "department",
          operator: "equals",
          value: "engineering",
        },
      ],
    });
    assert.deepEqual(
      data(f.call("admin", "learning_preview_group", { group: g })).items.map(
        (u: any) => u.id,
      ),
      ["learner-a"],
    );
    g = { ...g, mode: "ANY" };
    assert.deepEqual(
      data(f.call("admin", "learning_preview_group", { group: g })).items.map(
        (u: any) => u.id,
      ),
      ["learner-a", "learner-b"],
    );
    assert.deepEqual(
      data(f.call("manager", "learning_preview_group", { group: g })).items.map(
        (u: any) => u.id,
      ),
      ["learner-a"],
    );
    const date = group({
      rules: [
        {
          field: "createdAt",
          customField: "",
          operator: "before",
          value: "2026-10-06",
        },
      ],
    });
    assert.ok(
      data(f.call("admin", "learning_preview_group", { group: date })).items
        .length > 0,
    );
    assert.equal(
      f.call("admin", "learning_preview_group", {
        group: group({
          rules: [
            {
              field: "createdAt",
              customField: "",
              operator: "before",
              value: "2026-99-01",
            },
          ],
        }),
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    const staticGroup = group({
      kind: "static",
      memberIds: ["learner-a", "learner-b"],
      rules: [],
    });
    data(
      f.call("admin", "learning_save_group", {
        groupId: "cohort",
        group: staticGroup,
      }),
    );
    assert.deepEqual(
      data(f.call("manager", "learning_get_group", { groupId: "cohort" })).group
        .memberIds,
      ["learner-a"],
    );
    assert.equal(
      f.call("outsider", "learning_get_group", { groupId: "cohort" }).error
        ?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("admin", "learning_preview_group", {
        group: group({ kind: "static", memberIds: ["outsider"], rules: [] }),
      }).error?.code,
      "FORBIDDEN",
    );
    data(
      f.call("admin", "learning_save_group", { groupId: "dynamic", group: g }),
    );
    data(
      f.call("admin", "learning_save_user", {
        user: user("learner-b", { active: false }),
      }),
    );
    assert.deepEqual(
      f.service.people
        .members(f.service.principal("admin"), g)
        .map((u) => u.id),
      ["learner-a"],
    );
    assert.equal(
      f.call("manager", "learning_save_group", { groupId: "illegal", group: g })
        .error?.code,
      "FORBIDDEN",
    );
  } finally {
    f.db.close();
  }
});

test("user profiles, custom fields and group versions survive reopen without credential or creation-date reset", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-people-")),
    path = join(dir, "learning.sqlite");
  let f = fixture(path);
  try {
    data(
      f.call("admin", "learning_save_user", {
        user: user("persistent", {
          customFields: [{ name: "team", value: "blue" }],
        }),
      }),
    );
    data(
      f.call("persistent", "learning_save_profile", {
        preferredLanguage: "vi",
        interests: ["Systems"],
      }),
    );
    data(
      f.call("admin", "learning_save_group", {
        groupId: "persisted-group",
        group: group({ kind: "static", memberIds: ["persistent"], rules: [] }),
      }),
    );
    const profile = JSON.stringify(
        f.db
          .prepare("SELECT * FROM user_profiles WHERE user_id='persistent'")
          .get(),
      ),
      hash = (
        f.db
          .prepare("SELECT password_hash FROM accounts WHERE id='persistent'")
          .get() as any
      ).password_hash;
    f.db.close();
    f = fixture(path);
    assert.equal(
      JSON.stringify(
        f.db
          .prepare("SELECT * FROM user_profiles WHERE user_id='persistent'")
          .get(),
      ),
      profile,
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT password_hash FROM accounts WHERE id='persistent'")
          .get() as any
      ).password_hash,
      hash,
    );
    assert.equal(
      data(f.call("persistent", "learning_get_profile")).preferredLanguage,
      "vi",
    );
    assert.equal(
      data(
        f.call("admin", "learning_get_group", { groupId: "persisted-group" }),
      ).version,
      1,
    );
    assert.deepEqual(
      f.service.people
        .members(
          f.service.principal("admin"),
          data(
            f.call("admin", "learning_get_group", {
              groupId: "persisted-group",
            }),
          ).group,
        )
        .map((u) => u.id),
      ["persistent"],
    );
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
