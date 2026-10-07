import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import type { Award } from "../src/shared/programs.ts";
const external = (id = "evidence", required = true, credits = 2) => ({
  id,
  title: id,
  required,
  credits,
  alternatives: [{ kind: "external" as const, id: "practice" }],
});
const award = (changes: Partial<Award> = {}): Award => ({
  title: "Practice award",
  summary: "Original program",
  access: "tenant",
  unit: "hours",
  target: 2,
  ongoing: false,
  moderatedExternal: true,
  requirements: [external()],
  ...changes,
});
function publish(f: ReturnType<typeof fixture>, id: string, value: Award) {
  data(
    f.call("editor", "learning_save_award", { collectionId: id, award: value }),
  );
  return data(
    f.call("editor", "learning_publish_collection", { collectionId: id }),
  );
}
function enroll(f: ReturnType<typeof fixture>, id: string, user = "learner-a") {
  return data(f.call(user, "learning_enroll_award", { collectionId: id }))
    .awardEnrollmentId;
}
function submit(
  f: ReturnType<typeof fixture>,
  id: string,
  path: string,
  amount = 2,
  evidence = "Original practice evidence",
) {
  return data(
    f.call(
      "learner-a",
      "human_submit_external_record",
      {
        awardEnrollmentId: id,
        criterionPath: path,
        amount,
        evidence,
        confirmed: true,
      },
      "human",
    ),
  );
}
function own(f: ReturnType<typeof fixture>) {
  return data(f.call("learner-a", "learning_get_my_awards")).items;
}
test("playlists remain discovery only, role/tenant/private scope enforced before side effects", () => {
  const f = fixture();
  try {
    data(
      f.call("editor", "learning_save_playlist", {
        collectionId: "reading",
        playlist: {
          title: "Reading",
          summary: "A playlist",
          access: "tenant",
          items: [{ kind: "course", id: "systems-basics" }],
        },
      }),
    );
    data(
      f.call("editor", "learning_publish_collection", {
        collectionId: "reading",
      }),
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_collection", {
          collectionId: "reading",
        }),
      ).references.items[0].version,
      1,
    );
    assert.equal(
      f.call("manager", "learning_assign_award", {
        collectionId: "reading",
        learnerId: "learner-a",
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.call("learner-a", "learning_enroll_award", { collectionId: "reading" })
        .error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) n FROM award_enrollments").get() as any).n,
      0,
    );
    assert.equal(
      f.call("outsider", "learning_get_collection", { collectionId: "reading" })
        .error?.code,
      "NOT_FOUND",
    );
    publish(f, "private", award({ access: "author" }));
    assert.equal(
      data(f.call("learner-a", "learning_search_collections")).items.some(
        (r: any) => r.id === "private",
      ),
      false,
    );
    assert.equal(
      f.call("admin", "learning_assign_award", {
        collectionId: "private",
        learnerId: "learner-a",
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("admin", "learning_save_award", {
        collectionId: "launder",
        award: award({
          requirements: [
            { ...external(), alternatives: [{ kind: "award", id: "private" }] },
          ],
        }),
      }).error?.code,
      "FORBIDDEN",
    );
    for (const user of ["learner-a", "manager", "assessor"])
      assert.equal(
        f.call(user, "learning_save_award", {
          collectionId: "illegal",
          award: award(),
        }).error?.code,
        "FORBIDDEN",
      );
  } finally {
    f.db.close();
  }
});
test("pending/rejected evidence earns nothing; scoped moderation, partial credits and required-plus-target completion are authoritative", () => {
  const f = fixture();
  try {
    publish(
      f,
      "program",
      award({
        target: 2,
        requirements: [
          external("required", true, 2),
          external("elective", false, 2),
        ],
      }),
    );
    const id = enroll(f, "program");
    const elective = submit(f, id, "elective");
    assert.equal(own(f)[0].earned, 0);
    assert.equal(
      f.call("assessor", "learning_assess_external_record", {
        recordId: elective.recordId,
        accepted: true,
        reason: "Verified",
      }).error?.code,
      "FORBIDDEN",
    );
    data(
      f.call("admin", "learning_set_award_assessor", {
        collectionId: "program",
        assessorId: "assessor",
        enabled: true,
      }),
    );
    const bridge = data(
      f.call("assessor", "learning_get_external_records", {
        collectionId: "program",
      }),
    );
    assert.equal(
      JSON.stringify(bridge).includes("Original practice evidence"),
      false,
    );
    assert.equal(
      data(
        f.call(
          "assessor",
          "learning_get_external_records",
          { collectionId: "program" },
          "human",
        ),
      ).items[0].evidence,
      "Original practice evidence",
    );
    data(
      f.call("assessor", "learning_assess_external_record", {
        recordId: elective.recordId,
        accepted: true,
        reason: "Verified learning",
      }),
    );
    assert.equal(own(f)[0].earned, 2);
    assert.equal(own(f)[0].completed, false);
    const rejected = submit(f, id, "required", 1, "Unsupported evidence");
    data(
      f.call("assessor", "learning_assess_external_record", {
        recordId: rejected.recordId,
        accepted: false,
        reason: "Insufficient evidence",
      }),
    );
    assert.equal(own(f)[0].earned, 2);
    const partial = submit(f, id, "required", 1, "First hour");
    data(
      f.call("assessor", "learning_assess_external_record", {
        recordId: partial.recordId,
        accepted: true,
        reason: "Verified hour",
      }),
    );
    assert.equal(own(f)[0].requiredComplete, false);
    const remainder = submit(f, id, "required", 2, "Remaining practice");
    data(
      f.call("assessor", "learning_assess_external_record", {
        recordId: remainder.recordId,
        accepted: true,
        reason: "Verified practice",
      }),
    );
    const progress = own(f)[0];
    assert.equal(progress.earned, 4);
    assert.equal(progress.completed, true);
    assert.ok(progress.completed_at);
    assert.equal(
      f.service.programs.certificate(
        f.service.principal("learner-a"),
        progress.certificate_id,
      ).accredited,
      false,
    );
    assert.throws(() =>
      f.service.programs.certificate(
        f.service.principal("learner-b"),
        progress.certificate_id,
      ),
    );
    assert.equal(
      f.call("assessor", "learning_assess_external_record", {
        recordId: remainder.recordId,
        accepted: false,
        reason: "Change",
      }).error?.code,
      "FORBIDDEN",
    );
    data(
      f.call("admin", "learning_set_award_assessor", {
        collectionId: "program",
        assessorId: "assessor",
        enabled: false,
      }),
    );
    assert.equal(
      f.call("assessor", "learning_get_external_records", {
        collectionId: "program",
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("assessor", "learning_report_query").error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      JSON.stringify(
        f.db
          .prepare(
            "SELECT arguments FROM audit WHERE tool='human_submit_external_record'",
          )
          .all(),
      ).includes("Remaining practice"),
      false,
    );
  } finally {
    f.db.close();
  }
});
test("ongoing awards do not complete and required criteria alone do not satisfy higher target", () => {
  const f = fixture();
  try {
    publish(f, "ongoing", award({ ongoing: true, moderatedExternal: false }));
    const ongoing = enroll(f, "ongoing");
    submit(f, ongoing, "evidence", 2);
    assert.equal(own(f)[0].earned, 2);
    assert.equal(own(f)[0].completed, false);
    assert.equal(own(f)[0].certificate_id, null);
    publish(
      f,
      "target",
      award({
        moderatedExternal: false,
        target: 4,
        requirements: [
          external("required", true, 2),
          external("elective", false, 2),
        ],
      }),
    );
    const id = enroll(f, "target");
    submit(f, id, "required");
    const p = own(f).find((p: any) => p.award_id === "target");
    assert.equal(p.requiredComplete, true);
    assert.equal(p.completed, false);
    submit(f, id, "elective");
    assert.equal(
      own(f).find((p: any) => p.award_id === "target").completed,
      true,
    );
    assert.equal(
      f.service
        .description("learner-a")
        .tools.some((t) => t.name === "human_submit_external_record"),
      false,
    );
    assert.equal(
      f.call("learner-a", "human_submit_external_record", {
        awardEnrollmentId: id,
        criterionPath: "elective",
        amount: 2,
        evidence: "Agent forged",
        confirmed: true,
      }).error?.code,
      "FORBIDDEN",
    );
  } finally {
    f.db.close();
  }
});
test("nested immutable snapshots, alternatives and retirement retain enrolled rules without double credit", () => {
  const f = fixture();
  try {
    publish(f, "child", award({ moderatedExternal: false }));
    publish(
      f,
      "root",
      award({
        moderatedExternal: false,
        requirements: [
          {
            ...external("choice"),
            alternatives: [
              { kind: "award", id: "child" },
              { kind: "external", id: "practice" },
            ],
          },
        ],
      }),
    );
    const id = enroll(f, "root");
    publish(
      f,
      "child",
      award({
        ongoing: true,
        moderatedExternal: false,
        title: "Changed child",
      }),
    );
    submit(f, id, "choice/child@1/evidence", 2, "Nested practice");
    let progress = own(f)[0];
    assert.equal(progress.completed, true);
    assert.equal(
      progress.requirements[0].alternatives[0].title,
      "Practice award",
    );
    submit(f, id, "choice", 2, "Another alternative");
    assert.equal(own(f)[0].earned, 2);
    data(
      f.call("editor", "learning_retire_collection", { collectionId: "child" }),
    );
    data(
      f.call("editor", "learning_retire_collection", { collectionId: "root" }),
    );
    assert.equal(
      f.call("learner-b", "learning_enroll_award", { collectionId: "root" })
        .error?.code,
      "NOT_FOUND",
    );
    assert.equal(own(f)[0].completed, true);
    assert.equal(
      data(f.call("learner-a", "learning_get_my_awards")).items[0].version,
      1,
    );
  } finally {
    f.db.close();
  }
});
test("graph validation rejects cycles/depth/duplicates/unreachable target before mutation", () => {
  const f = fixture();
  try {
    publish(f, "one", award());
    publish(
      f,
      "two",
      award({
        requirements: [
          { ...external(), alternatives: [{ kind: "award", id: "one" }] },
        ],
      }),
    );
    assert.equal(
      f.call("editor", "learning_save_award", {
        collectionId: "one",
        award: award({
          requirements: [
            { ...external(), alternatives: [{ kind: "award", id: "two" }] },
          ],
        }),
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    for (const invalid of [
      award({ target: 3 }),
      award({ requirements: [external(), external()] }),
      award({
        requirements: [
          {
            ...external(),
            alternatives: [
              { kind: "external", id: "same" },
              { kind: "external", id: "same" },
            ],
          },
        ],
      }),
    ])
      assert.equal(
        f.call("editor", "learning_save_award", {
          collectionId: "bad",
          award: invalid,
        }).error?.code,
        "INVALID_ARGUMENT",
      );
    for (let i = 3; i <= 4; i++)
      publish(
        f,
        `depth-${i}`,
        award({
          requirements: [
            {
              ...external(),
              alternatives: [
                { kind: "award", id: i === 3 ? "two" : `depth-${i - 1}` },
              ],
            },
          ],
        }),
      );
    assert.equal(
      f.call("editor", "learning_save_award", {
        collectionId: "depth-5",
        award: award({
          requirements: [
            { ...external(), alternatives: [{ kind: "award", id: "depth-4" }] },
          ],
        }),
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.db.prepare("SELECT 1 FROM collections WHERE id='bad'").get(),
      undefined,
    );
  } finally {
    f.db.close();
  }
});
test("assignment retries retain original version; CAS, direct reports, evidence duplication and audit rollback stay atomic", () => {
  const f = fixture();
  try {
    publish(f, "program", award());
    const revision = f.service.context("manager", "library:demo").revision;
    const args = { collectionId: "program", learnerId: "learner-a" },
      opts = { expectedRevision: revision, idempotencyKey: "assignment-key" };
    const first = f.call(
      "manager",
      "learning_assign_award",
      args,
      "bridge",
      opts,
    );
    data(first);
    assert.deepEqual(
      f.call("manager", "learning_assign_award", args, "bridge", opts),
      first,
    );
    assert.equal(f.service.context("learner-a").revision, 1);
    assert.equal(
      f.call("manager", "learning_assign_award", {
        ...args,
        learnerId: "learner-b",
      }).error?.code,
      "FORBIDDEN",
    );
    publish(f, "program", award({ title: "Second version" }));
    assert.equal(
      data(f.call("admin", "learning_assign_award", args)).version,
      1,
    );
    const id = own(f)[0].id;
    submit(f, id, "evidence", 2, "Same evidence");
    assert.equal(
      f.call(
        "learner-a",
        "human_submit_external_record",
        {
          awardEnrollmentId: id,
          criterionPath: "evidence",
          amount: 2,
          evidence: " Same evidence ",
          confirmed: true,
        },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    const personal = f.service.context("learner-a").revision;
    f.db.exec(
      "CREATE TRIGGER fail_program_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
    );
    assert.equal(
      f.call("admin", "learning_assess_external_record", {
        recordId: (f.db.prepare("SELECT id FROM external_records").get() as any)
          .id,
        accepted: true,
        reason: "Verified",
      }).error?.code,
      "INTERNAL",
    );
    assert.equal(own(f)[0].earned, 0);
    assert.equal(own(f)[0].certificate_id, null);
    assert.equal(f.service.context("learner-a").revision, personal);
  } finally {
    f.db.close();
  }
});

test("award enrollment, moderated evidence and certificate survive database reopen with idempotent migration", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { openDatabase } = await import("../src/server/database.ts");
  const { LearningService } = await import("../src/server/service.ts");
  const dir = mkdtempSync(join(tmpdir(), "pear-program-")),
    path = join(dir, "learning.sqlite");
  try {
    let db = openDatabase(path, true);
    const f = fixture();
    publish(f, "persisted", award({ moderatedExternal: false }));
    const id = enroll(f, "persisted");
    submit(f, id, "evidence");
    for (const table of [
      "collections",
      "collection_versions",
      "award_enrollments",
      "external_records",
    ]) {
      const rows = f.db.prepare(`SELECT * FROM ${table}`).all() as any[];
      for (const row of rows)
        db.prepare(
          `INSERT INTO ${table}(${Object.keys(row).join(",")}) VALUES(${Object.keys(
            row,
          )
            .map(() => "?")
            .join(",")})`,
        ).run(...(Object.values(row) as any[]));
    }
    const before = JSON.stringify(
      f.db.prepare("SELECT * FROM award_enrollments").all(),
    );
    f.db.close();
    db.close();
    db = openDatabase(path, true);
    const service = new LearningService(db);
    assert.equal(
      JSON.stringify(db.prepare("SELECT * FROM award_enrollments").all()),
      before,
    );
    const progress = data(
      service.invoke("learner-a", {
        requestId: "read",
        documentId: "learning:demo:learner-a::programs",
        toolName: "learning_get_my_awards",
        arguments: {},
        expectedRevision: null,
        idempotencyKey: null,
      }),
    ).items[0];
    assert.equal(progress.earned, 2);
    assert.ok(
      service.programs.certificate(
        service.principal("learner-a"),
        progress.certificate_id,
      ),
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("award evidence PDFs stay scoped, withheld from bridge, digest-deduplicated and human-confirmed", () => {
  const f = fixture(),
    pdf = Buffer.from("%PDF-1.4\nOriginal personal evidence\n%%EOF");
  try {
    publish(f, "files", award());
    const id = enroll(f, "files"),
      p = f.service.principal("learner-a");
    const upload = (
      key: string,
      path = "evidence",
      enrollmentId = id,
      bytes = pdf,
    ) =>
      f.service.media.upload(
        p,
        {
          filename: "practice.pdf",
          mime: "application/pdf",
          confirmed: "true",
          purpose: "award_evidence",
          awardEnrollmentId: enrollmentId,
          criterionPath: path,
          key,
          revision: String(
            f.service.context("learner-a", "learning:demo:learner-a").revision,
          ),
        },
        bytes,
      );
    const asset = upload("proof-file");
    assert.equal(upload("proof-file").id, asset.id);
    assert.equal(own(f)[0].earned, 0);
    assert.throws(() => upload("outside", "missing"), /criterion outside/);
    assert.throws(
      () => upload("outside-user", "evidence", enroll(f, "files", "learner-b")),
      /enrollment access/,
    );
    assert.throws(
      () =>
        f.service.media.validate(
          f.service.principal("editor"),
          asset.id,
          "document",
        ),
      /Asset unavailable/,
    );
    const args = {
      awardEnrollmentId: id,
      criterionPath: "evidence",
      amount: 2,
      evidence: "My own original evidence",
      assetId: asset.id,
      confirmed: true,
    };
    assert.equal(
      f.call("learner-a", "human_submit_external_record", args).error?.code,
      "FORBIDDEN",
    );
    const record = data(
      f.call("learner-a", "human_submit_external_record", args, "human"),
    );
    assert.equal(record.state, "pending");
    assert.equal(own(f)[0].earned, 0);
    const renamed = upload("renamed-proof");
    assert.equal(
      f.call(
        "learner-a",
        "human_submit_external_record",
        { ...args, evidence: "Different description", assetId: renamed.id },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    for (const user of [
      "editor",
      "manager",
      "assessor",
      "learner-b",
      "outsider",
    ])
      assert.throws(
        () =>
          f.service.media.read(f.service.principal(user), asset.id, {
            recordId: record.recordId,
          }),
        /denied/,
      );
    data(
      f.call("admin", "learning_set_award_assessor", {
        collectionId: "files",
        assessorId: "assessor",
        enabled: true,
      }),
    );
    const human = data(
      f.call(
        "assessor",
        "learning_get_external_records",
        { collectionId: "files" },
        "human",
      ),
    ).items[0];
    assert.equal(human.assetId, asset.id);
    const bridge = data(
      f.call("assessor", "learning_get_external_records", {
        collectionId: "files",
      }),
    ).items[0];
    assert.equal(bridge.evidenceAttached, true);
    assert.equal(bridge.assetId, undefined);
    assert.equal(bridge.asset_id, undefined);
    assert.equal(bridge.evidence, undefined);
    assert.equal(bridge.evidence_hash, undefined);
    assert.ok(
      Buffer.from(
        f.service.media.read(f.service.principal("assessor"), asset.id, {
          recordId: record.recordId,
        }).bytes,
      ).equals(pdf),
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("assessor"), asset.id, {
          recordId: "wrong",
        }),
      /scope denied/,
    );
    data(
      f.call(
        "assessor",
        "learning_assess_external_record",
        {
          recordId: record.recordId,
          accepted: true,
          reason: "Read original PDF",
        },
        "human",
      ),
    );
    assert.equal(own(f)[0].completed, true);
    assert.throws(() => upload("after-completion"), /Open own award/);
    data(
      f.call("admin", "learning_set_award_assessor", {
        collectionId: "files",
        assessorId: "assessor",
        enabled: false,
      }),
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("assessor"), asset.id, {
          recordId: record.recordId,
        }),
      /scope denied/,
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
  }
});

test("nested and ongoing evidence uses the root enrollment and exact pinned criterion", () => {
  const f = fixture();
  try {
    publish(f, "child-files", award({ moderatedExternal: false }));
    publish(
      f,
      "root-files",
      award({
        ongoing: true,
        requirements: [
          {
            id: "nested",
            title: "Nested",
            required: true,
            credits: 2,
            alternatives: [{ kind: "award", id: "child-files" }],
          },
        ],
      }),
    );
    const id = enroll(f, "root-files"),
      path = "nested/child-files@1/evidence",
      p = f.service.principal("learner-a");
    const asset = f.service.media.upload(
      p,
      {
        filename: "proof.pdf",
        mime: "application/pdf",
        confirmed: "true",
        purpose: "award_evidence",
        awardEnrollmentId: id,
        criterionPath: path,
        key: "nested-file",
        revision: String(
          f.service.context(p.id, "learning:demo:learner-a").revision,
        ),
      },
      Buffer.from("%PDF-nested"),
    );
    assert.equal(
      f.call(
        p.id,
        "human_submit_external_record",
        {
          awardEnrollmentId: id,
          criterionPath: "evidence",
          amount: 2,
          evidence: "Wrong nested path",
          assetId: asset.id,
          confirmed: true,
        },
        "human",
      ).error?.code,
      "INVALID_ARGUMENT",
    );
    const record = data(
      f.call(
        p.id,
        "human_submit_external_record",
        {
          awardEnrollmentId: id,
          criterionPath: path,
          amount: 2,
          evidence: "Original nested practice",
          assetId: asset.id,
          confirmed: true,
        },
        "human",
      ),
    );
    assert.equal(record.state, "accepted");
    assert.equal(own(f)[0].earned, 2);
    assert.equal(own(f)[0].completed, false);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM award_enrollments").get()!.n,
      1,
    );
  } finally {
    f.db.close();
  }
});

test("award file mutation rollback, live session revocation and disk reopen preserve exact evidence", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "pear-proof-")),
    path = join(dir, "proof.sqlite");
  let f = fixture(path);
  try {
    publish(f, "durable-files", award());
    const id = enroll(f, "durable-files"),
      p = f.service.principal("learner-a");
    const bytes = Buffer.from("%PDF-durable-personal-proof");
    const input = {
      filename: "proof.pdf",
      mime: "application/pdf",
      purpose: "award_evidence",
      awardEnrollmentId: id,
      criterionPath: "evidence",
      confirmed: "true",
      key: "durable-file",
      revision: String(
        f.service.context(p.id, "learning:demo:learner-a").revision,
      ),
    };
    f.db.exec(
      "CREATE TRIGGER fail_proof_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;",
    );
    assert.throws(
      () => f.service.media.upload(p, input, bytes),
      /audit unavailable/,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM assets").get()!.n, 0);
    assert.equal(
      String(f.service.context(p.id, "learning:demo:learner-a").revision),
      input.revision,
    );
    f.db.exec("DROP TRIGGER fail_proof_audit");
    const asset = f.service.media.upload(p, input, bytes);
    const record = data(
      f.call(
        p.id,
        "human_submit_external_record",
        {
          awardEnrollmentId: id,
          criterionPath: "evidence",
          amount: 2,
          evidence: "Durable proof",
          assetId: asset.id,
          confirmed: true,
        },
        "human",
      ),
    );
    f.db.close();
    f = fixture(path);
    assert.equal(
      f.service.media.upload(f.service.principal(p.id), input, bytes).id,
      asset.id,
    );
    assert.ok(
      Buffer.from(
        f.service.media.read(f.service.principal("admin"), asset.id, {
          recordId: record.recordId,
        }).bytes,
      ).equals(bytes),
    );
    assert.equal(
      f.db
        .prepare("SELECT asset_id FROM external_records WHERE id=?")
        .get(record.recordId)!.asset_id,
      asset.id,
    );
    f.db
      .prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id=?")
      .run(p.id);
    assert.throws(
      () => f.service.media.upload(p, input, bytes),
      /Active account/,
    );
    assert.throws(
      () => f.service.media.read(p, asset.id, {}),
      /Active account/,
    );
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    f.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
