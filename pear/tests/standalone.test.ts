import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import { freshReport } from "../src/shared/reports.ts";
const item = (text = "Original standalone version", extra: any = {}) => ({
  title: "Pinned standalone",
  summary: "Original fixture",
  language: "vi",
  provider: "Pear Originals",
  license: "self-authored",
  aiProcessingAllowed: false,
  kind: "text",
  text,
  ...extra,
});
function publish(
  f: ReturnType<typeof fixture>,
  id = "standalone",
  content = item(),
) {
  data(
    f.call("editor", "learning_create_content_item", {
      itemId: id,
      item: content,
    }),
  );
  data(f.call("editor", "learning_publish_content_item", { itemId: id }));
}
const enroll = (
  f: ReturnType<typeof fixture>,
  user = "learner-a",
  itemId = "standalone",
  version = 1,
) =>
  data(f.call(user, "learning_enroll_item", { itemId, version }))
    .itemEnrollmentId;
const get = (
  f: ReturnType<typeof fixture>,
  id: string,
  user = "learner-a",
  source: "bridge" | "human" = "human",
) =>
  data(
    f.call(
      user,
      "learning_get_item_enrollment",
      { itemEnrollmentId: id },
      source,
    ),
  );
test("standalone reading pins immutable version, remains private and cannot create course/award scores or certificates", () => {
  const f = fixture();
  try {
    publish(f);
    const id = enroll(f);
    assert.equal(enroll(f), id);
    assert.equal(get(f, id).status, "in_progress");
    assert.equal(get(f, id).item.text, "Original standalone version");
    const bridge = get(f, id, "learner-a", "bridge");
    assert.equal(bridge.item.contentWithheld, true);
    assert.equal(bridge.item.text, undefined);
    assert.equal(bridge.item.assetId, undefined);
    for (const user of [
      "learner-b",
      "manager",
      "admin",
      "editor",
      "assessor",
      "outsider",
    ])
      assert.equal(
        f.call(user, "learning_get_item_enrollment", { itemEnrollmentId: id })
          .error?.code,
        "FORBIDDEN",
      );
    assert.equal(
      f.call("learner-a", "human_complete_item", {
        itemEnrollmentId: id,
        confirmed: true,
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_complete_item",
        { itemEnrollmentId: id, confirmed: false },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    data(
      f.call(
        "learner-a",
        "human_complete_item",
        { itemEnrollmentId: id, confirmed: true },
        "human",
      ),
    );
    const timestamp = get(f, id).completedAt;
    assert.ok(timestamp);
    data(
      f.call(
        "learner-a",
        "human_complete_item",
        { itemEnrollmentId: id, confirmed: true },
        "human",
      ),
    );
    assert.equal(get(f, id).completedAt, timestamp);
    for (const table of [
      "enrollments",
      "attempts",
      "certificates",
      "award_enrollments",
    ])
      assert.equal(
        f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n,
        0,
      );
    assert.equal(get(f, id).certificateAvailable, false);
    data(
      f.call("editor", "learning_update_content_item", {
        itemId: "standalone",
        item: item("New version replaces discovery", {
          aiProcessingAllowed: true,
        }),
      }),
    );
    data(
      f.call("editor", "learning_publish_content_item", {
        itemId: "standalone",
      }),
    );
    assert.equal(get(f, id).version, 1);
    assert.equal(get(f, id).item.text, "Original standalone version");
    const next = enroll(f, "learner-a", "standalone", 2);
    assert.notEqual(next, id);
    assert.equal(get(f, next).status, "in_progress");
    assert.equal(
      get(f, next, "learner-a", "bridge").item.text,
      "New version replaces discovery",
    );
    data(
      f.call("editor", "learning_retire_content_item", {
        itemId: "standalone",
      }),
    );
    assert.equal(
      f.call("learner-b", "learning_enroll_item", { itemId: "standalone" })
        .error?.code,
      "FORBIDDEN",
    );
    assert.equal(get(f, id).status, "completed");
    assert.equal(get(f, next).item.text, "New version replaces discovery");
    assert.equal(data(f.call("learner-a", "learning_get_my_items")).total, 2);
  } finally {
    f.db.close();
  }
});
test("tracked PDF access survives source retirement but guesses, cross-learner scope and wrong file cannot read it", () => {
  const f = fixture();
  try {
    const pdf = Buffer.from("%PDF-original-standalone");
    const asset = f.service.media.upload(
      f.service.principal("editor"),
      {
        filename: "guide.pdf",
        mime: "application/pdf",
        key: "standalone-pdf",
        confirmed: "true",
        revision: String(f.service.context("editor", "library:demo").revision),
      },
      pdf,
    );
    publish(
      f,
      "pdf-item",
      item("Personal original document", {
        kind: "document",
        assetId: asset.id,
      }),
    );
    const id = enroll(f, "learner-a", "pdf-item");
    data(
      f.call("editor", "learning_retire_content_item", { itemId: "pdf-item" }),
    );
    assert.ok(
      Buffer.from(
        f.service.media.read(f.service.principal("learner-a"), asset.id, {
          itemEnrollmentId: id,
        }).bytes,
      ).equals(pdf),
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("learner-b"), asset.id, {
          itemEnrollmentId: id,
        }),
      { code: "FORBIDDEN" },
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("learner-a"), asset.id, {
          itemId: "pdf-item",
          version: 1,
        }),
      { code: "FORBIDDEN" },
    );
    publish(f, "text-item");
    const other = enroll(f, "learner-a", "text-item");
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("learner-a"), asset.id, {
          itemEnrollmentId: other,
        }),
      { code: "FORBIDDEN" },
    );
    assert.equal(get(f, id).item.assetId, asset.id);
    assert.equal(get(f, id, "learner-a", "bridge").item.assetId, undefined);
    f.db
      .prepare(
        "UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'",
      )
      .run();
    const principal = f.service.principal("learner-a");
    f.db.prepare("UPDATE accounts SET active=0 WHERE id='learner-a'").run();
    assert.throws(
      () => f.service.media.read(principal, asset.id, { itemEnrollmentId: id }),
      /Active account/,
    );
  } finally {
    f.db.close();
  }
});
test("standalone transcript/report exports retain pinned self-attestation with live tenant and direct-report scope", () => {
  const f = fixture();
  try {
    publish(f);
    const a = enroll(f),
      b = enroll(f, "learner-b");
    data(
      f.call(
        "learner-a",
        "human_complete_item",
        { itemEnrollmentId: a, confirmed: true },
        "human",
      ),
    );
    const own = data(f.call("learner-a", "learning_get_transcript")).items;
    assert.equal(own.length, 1);
    assert.equal(own[0].kind, "item");
    assert.equal(own[0].status, "completed");
    assert.equal(own[0].score, null);
    assert.equal(own[0].cycleId, null);
    const spec = {
      ...freshReport(),
      kind: "item",
      columns: ["learnerId", "title", "kind", "version", "status", "score"],
    };
    const manager = data(
      f.call("manager", "learning_report_preview", { spec }),
    );
    assert.equal(manager.items.length, 1);
    assert.equal(manager.items[0].learnerId, "learner-a");
    const admin = data(f.call("admin", "learning_report_preview", { spec }));
    assert.equal(admin.items.length, 2);
    const csv = data(
      f.call("manager", "learning_export_report", {
        spec,
        rows: "all",
        columns: "all",
      }),
    ).csv;
    assert.ok(csv.includes("learner-a"));
    assert.equal(csv.includes("learner-b"), false);
    f.db
      .prepare("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'")
      .run();
    assert.equal(
      data(f.call("manager", "learning_report_preview", { spec })).items.length,
      0,
    );
    assert.equal(
      f.call("manager", "learning_report_preview", {
        spec: { ...spec, learnerId: "learner-a" },
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      data(f.call("learner-b", "learning_get_transcript")).items[0].id,
      b,
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
  }
});
test("standalone mutations preserve exact CAS/retry, atomic audit rollback and durable completion on reopen", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-standalone-"));
  let f = fixture(join(dir, "items.sqlite"));
  try {
    publish(f);
    const revision = f.service.context(
        "learner-a",
        "learning:demo:learner-a",
      ).revision,
      overrides = {
        expectedRevision: revision,
        idempotencyKey: "track-version",
      };
    const saved = f.call(
        "learner-a",
        "learning_enroll_item",
        { itemId: "standalone", version: 1 },
        "bridge",
        overrides,
      ),
      id = data(saved).itemEnrollmentId;
    assert.deepEqual(
      f.call(
        "learner-a",
        "learning_enroll_item",
        { itemId: "standalone", version: 1 },
        "bridge",
        overrides,
      ),
      saved,
    );
    f.db.exec(
      "CREATE TRIGGER fail_item_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;",
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_complete_item",
        { itemEnrollmentId: id, confirmed: true },
        "human",
      ).ok,
      false,
    );
    assert.equal(get(f, id).status, "in_progress");
    f.db.exec("DROP TRIGGER fail_item_audit");
    data(
      f.call(
        "learner-a",
        "human_complete_item",
        { itemEnrollmentId: id, confirmed: true },
        "human",
      ),
    );
    data(
      f.call("editor", "learning_retire_content_item", {
        itemId: "standalone",
      }),
    );
    assert.deepEqual(
      f.call(
        "learner-a",
        "learning_enroll_item",
        { itemId: "standalone", version: 1 },
        "bridge",
        overrides,
      ),
      saved,
    );
    const before = get(f, id);
    f.db.close();
    f = fixture(join(dir, "items.sqlite"));
    assert.deepEqual(get(f, id), before);
    assert.equal(
      f.call(
        "learner-a",
        "learning_enroll_item",
        { itemId: "standalone", version: 1 },
        "bridge",
        { expectedRevision: revision, idempotencyKey: "new-stale" },
      ).error?.code,
      "STALE_CONTEXT",
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
