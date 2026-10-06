import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, data } from "./helpers.ts";
import { courses } from "../src/server/seed.ts";
import { openDatabase } from "../src/server/database.ts";
import { LearningService } from "../src/server/service.ts";
import type { ContentItem, Course } from "../src/shared/model.ts";
const item: ContentItem = {
  title: "Reusable source",
  summary: "Self-authored fixture",
  language: "en",
  provider: "Pear Originals",
  license: "self-authored",
  aiProcessingAllowed: true,
  kind: "text",
  text: "Original content version one.",
};
const moduleCourse = (): Course => {
  const c = structuredClone(courses["systems-basics"]);
  c.lessons[1].prerequisiteIds = [];
  c.modules = [
    {
      id: "foundations",
      title: "Foundations",
      lessonIds: ["retry"],
      prerequisiteIds: [],
    },
    {
      id: "application",
      title: "Application",
      lessonIds: ["capacity"],
      prerequisiteIds: ["foundations"],
    },
  ];
  return c;
};
function publishedItem(
  f: ReturnType<typeof fixture>,
  id = "reusable",
  value = item,
) {
  data(
    f.call("editor", "learning_create_content_item", {
      itemId: id,
      item: value,
    }),
  );
  data(f.call("editor", "learning_publish_content_item", { itemId: id }));
}
test("standalone items publish immutable versions, respect roles/tenants and do not create learning completion", () => {
  const f = fixture();
  try {
    publishedItem(f);
    const count = data(f.call("learner-a", "learning_search_items")).total;
    assert.equal(count, 1);
    assert.equal(
      data(
        f.call("learner-a", "learning_get_content_item", {
          itemId: "reusable",
        }),
      ).text,
      item.text,
    );
    data(
      f.call("editor", "learning_update_content_item", {
        itemId: "reusable",
        item: { ...item, text: "Draft version two" },
      }),
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_content_item", {
          itemId: "reusable",
        }),
      ).text,
      item.text,
    );
    data(
      f.call("editor", "learning_publish_content_item", { itemId: "reusable" }),
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_content_item", {
          itemId: "reusable",
        }),
      ).version,
      2,
    );
    assert.equal(
      JSON.parse(
        (
          f.db
            .prepare(
              "SELECT content FROM content_item_versions WHERE item_id='reusable' AND version=1",
            )
            .get() as any
        ).content,
      ).text,
      item.text,
    );
    for (const user of ["learner-a", "manager", "assessor"])
      assert.equal(
        f.call(user, "learning_update_content_item", {
          itemId: "reusable",
          item,
        }).error?.code,
        "FORBIDDEN",
      );
    assert.equal(
      f.call("learner-a", "learning_get_content_drafts").error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call("outsider", "learning_get_content_item", { itemId: "reusable" })
        .error?.code,
      "NOT_FOUND",
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) AS n FROM enrollments").get() as any).n,
      0,
    );
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get() as any).n,
      0,
    );
    assert.equal(
      JSON.stringify(
        f.db
          .prepare(
            "SELECT arguments FROM audit WHERE tool LIKE '%content_item'",
          )
          .all(),
      ).includes(item.text),
      false,
    );
  } finally {
    f.db.close();
  }
});
test("module prerequisites prevent both human acknowledgement and agent lesson reads until all required module lessons complete", () => {
  const f = fixture();
  try {
    data(
      f.call("admin", "learning_create_course", {
        courseId: "modular",
        course: moduleCourse(),
      }),
    );
    data(f.call("admin", "learning_publish_course", { courseId: "modular" }));
    const enrollmentId = data(
      f.call("learner-a", "learning_enroll", { courseId: "modular" }),
    ).enrollmentId;
    assert.equal(
      f.call("learner-a", "learning_get_lesson", {
        enrollmentId,
        lessonId: "capacity",
      }).error?.code,
      "FORBIDDEN",
    );
    assert.equal(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId, lessonId: "capacity" },
        "human",
      ).error?.code,
      "FORBIDDEN",
    );
    const preview = data(
      f.call("learner-a", "learning_get_item", { courseId: "modular" }),
    );
    assert.deepEqual(preview.lessons[1].prerequisiteIds, ["retry"]);
    data(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId, lessonId: "retry" },
        "human",
      ),
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_lesson", {
          enrollmentId,
          lessonId: "capacity",
        }),
      ).text,
      courses["systems-basics"].lessons[1].text,
    );
    data(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId, lessonId: "capacity" },
        "human",
      ),
    );
    assert.ok(
      data(f.call("learner-a", "learning_start_attempt", { enrollmentId }))
        .attemptId,
    );
  } finally {
    f.db.close();
  }
});
test("reject duplicate, missing, reordered, cyclic, forward and repeated module memberships/prerequisites with no side effects", () => {
  const f = fixture();
  try {
    const invalid: Course[] = [];
    for (const change of [
      (c: Course) => {
        c.modules![1].id = "foundations";
      },
      (c: Course) => {
        c.modules![1].lessonIds = ["retry"];
      },
      (c: Course) => {
        c.modules![1].lessonIds = ["unknown"];
      },
      (c: Course) => {
        c.modules![0].prerequisiteIds = ["application"];
      },
      (c: Course) => {
        c.modules![1].prerequisiteIds = ["application"];
      },
      (c: Course) => {
        c.modules![1].prerequisiteIds = ["foundations", "foundations"];
      },
      (c: Course) => {
        c.modules!.reverse();
      },
    ]) {
      const c = moduleCourse();
      change(c);
      invalid.push(c);
    }
    for (const course of invalid)
      assert.equal(
        f.call("admin", "learning_create_course", {
          courseId: "invalid",
          course,
        }).error?.code,
        "INVALID_ARGUMENT",
      );
    assert.equal(f.service.context("admin", "library:demo").revision, 0);
    assert.equal(
      (f.db.prepare("SELECT COUNT(*) AS n FROM audit").get() as any).n,
      0,
    );
  } finally {
    f.db.close();
  }
});
test("server snapshots pinned references; source updates/retirement preserve course and enrollment versions; no caller content override", () => {
  const f = fixture();
  try {
    publishedItem(f);
    const c = moduleCourse();
    c.lessons[0].contentRef = { itemId: "reusable", version: 1 };
    c.lessons[0].text = "Forged inline override";
    data(
      f.call("admin", "learning_create_course", {
        courseId: "snapshot",
        course: c,
      }),
    );
    data(f.call("admin", "learning_publish_course", { courseId: "snapshot" }));
    const enrolled = data(
      f.call("learner-a", "learning_enroll", { courseId: "snapshot" }),
    );
    data(
      f.call("editor", "learning_update_content_item", {
        itemId: "reusable",
        item: { ...item, text: "Version two" },
      }),
    );
    data(
      f.call("editor", "learning_publish_content_item", { itemId: "reusable" }),
    );
    data(f.call("admin", "learning_publish_course", { courseId: "snapshot" }));
    assert.equal(
      data(
        f.call("learner-a", "learning_get_lesson", {
          enrollmentId: enrolled.enrollmentId,
          lessonId: "retry",
        }),
      ).text,
      item.text,
    );
    const currentCourse = JSON.parse(
      (
        f.db
          .prepare(
            "SELECT content FROM course_versions WHERE course_id='snapshot' AND version=2",
          )
          .get() as any
      ).content,
    );
    assert.equal(currentCourse.lessons[0].text, item.text);
    c.lessons[0].contentRef.version = 2;
    data(
      f.call("admin", "learning_update_course", {
        courseId: "snapshot",
        course: c,
      }),
    );
    data(f.call("admin", "learning_publish_course", { courseId: "snapshot" }));
    const second = data(
      f.call("learner-b", "learning_enroll", { courseId: "snapshot" }),
    );
    assert.equal(
      data(
        f.call("learner-b", "learning_get_lesson", {
          enrollmentId: second.enrollmentId,
          lessonId: "retry",
        }),
      ).text,
      "Version two",
    );
    data(
      f.call("editor", "learning_retire_content_item", { itemId: "reusable" }),
    );
    assert.equal(
      f.call("learner-a", "learning_get_content_item", { itemId: "reusable" })
        .error?.code,
      "NOT_FOUND",
    );
    assert.equal(
      f.call("admin", "learning_publish_course", { courseId: "snapshot" }).error
        ?.code,
      "FORBIDDEN",
    );
    assert.equal(
      data(
        f.call("learner-a", "learning_get_lesson", {
          enrollmentId: enrolled.enrollmentId,
          lessonId: "retry",
        }),
      ).text,
      item.text,
    );
    // Already-published course snapshots remain independently available under explicit policy.
    assert.equal(
      data(f.call("learner-a", "learning_get_item", { courseId: "snapshot" }))
        .version,
      3,
    );
  } finally {
    f.db.close();
  }
});
test("restricted item cannot be laundered into model-readable course draft, lesson or standalone result; tenant/version guesses fail", () => {
  const f = fixture();
  try {
    publishedItem(f, "private", {
      ...item,
      aiProcessingAllowed: false,
      text: "Private self-authored material",
    });
    const c = moduleCourse();
    c.lessons[0].contentRef = { itemId: "private", version: 1 };
    data(
      f.call("admin", "learning_create_course", {
        courseId: "restricted",
        course: c,
      }),
    );
    data(
      f.call("admin", "learning_publish_course", { courseId: "restricted" }),
    );
    const enrollmentId = data(
      f.call("learner-a", "learning_enroll", { courseId: "restricted" }),
    ).enrollmentId;
    for (const r of [
      f.call("admin", "learning_get_drafts"),
      f.call("editor", "learning_get_content_drafts"),
      f.call("learner-a", "learning_get_lesson", {
        enrollmentId,
        lessonId: "retry",
      }),
      f.call("learner-a", "learning_get_content_item", { itemId: "private" }),
    ]) {
      assert.equal(r.ok, true);
      assert.equal(
        JSON.stringify(r).includes("Private self-authored material"),
        false,
      );
    }
    assert.equal(
      data(
        f.call(
          "learner-a",
          "learning_get_content_item",
          { itemId: "private" },
          "human",
        ),
      ).text,
      "Private self-authored material",
    );
    const stored = data(
      f.call("admin", "learning_get_drafts", {}, "human"),
    ).items.find((row: any) => row.id === "restricted");
    assert.equal(stored.draft.aiProcessingAllowed, false);
    for (const ref of [
      { itemId: "private", version: 99 },
      { itemId: "unknown", version: 1 },
    ]) {
      c.lessons[0].contentRef = ref;
      assert.equal(
        f.call("admin", "learning_update_course", {
          courseId: "restricted",
          course: c,
        }).error?.code,
        "NOT_FOUND",
      );
    }
    f.db
      .prepare("UPDATE content_items SET tenant='other' WHERE id='private'")
      .run();
    c.lessons[0].contentRef = { itemId: "private", version: 1 };
    assert.equal(
      f.call("admin", "learning_update_course", {
        courseId: "restricted",
        course: c,
      }).error?.code,
      "NOT_FOUND",
    );
  } finally {
    f.db.close();
  }
});
test("content writes use library CAS, atomic retry-before-revision, conflict checks and rollback on audit failure", () => {
  const f = fixture();
  try {
    const call = { expectedRevision: 0, idempotencyKey: "item-key" },
      args = { itemId: "dedup", item };
    const first = f.call(
      "editor",
      "learning_create_content_item",
      args,
      "bridge",
      call,
    );
    data(first);
    assert.deepEqual(
      f.call("editor", "learning_create_content_item", args, "bridge", call),
      first,
    );
    assert.equal(
      f.call(
        "editor",
        "learning_create_content_item",
        { ...args, item: { ...item, title: "different" } },
        "bridge",
        call,
      ).error?.code,
      "IDEMPOTENCY_CONFLICT",
    );
    assert.equal(
      f.call(
        "admin",
        "learning_publish_content_item",
        { itemId: "dedup" },
        "bridge",
        { expectedRevision: 0 },
      ).error?.code,
      "STALE_CONTEXT",
    );
    assert.equal(
      f.call(
        "editor",
        "learning_publish_content_item",
        { itemId: "dedup" },
        "bridge",
        { documentId: "learning:demo:editor::content" },
      ).error?.code,
      "STALE_CONTEXT",
    );
    f.db.exec(
      "CREATE TRIGGER fail_item_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
    );
    assert.equal(
      f.call("admin", "learning_publish_content_item", { itemId: "dedup" })
        .error?.code,
      "INTERNAL",
    );
    assert.equal(
      (
        f.db
          .prepare("SELECT latest_version FROM content_items WHERE id='dedup'")
          .get() as any
      ).latest_version,
      0,
    );
    assert.equal(f.service.context("admin", "library:demo").revision, 1);
    assert.equal(f.service.context("learner-a").revision, 0);
  } finally {
    f.db.close();
  }
});
test("media and content bounds apply before publication, including UTF-8 bytes after resolving repeated refs", () => {
  const f = fixture();
  try {
    for (const bad of [
      { ...item, kind: "video", url: "https://example.test/video" },
      { ...item, kind: "link", url: "javascript:alert(1)" },
      { ...item, kind: "link", url: "https://user:secret@example.test/" },
      { ...item, text: "x".repeat(2501) },
    ])
      assert.equal(
        f.call("editor", "learning_create_content_item", {
          itemId: "bad",
          item: bad,
        }).error?.code,
        "INVALID_ARGUMENT",
      );
    publishedItem(f, "utf8", { ...item, text: "猫".repeat(2500) });
    const c = moduleCourse();
    delete c.modules;
    c.lessons = Array.from({ length: 8 }, (_, i) => ({
      id: `lesson-${i}`,
      title: "placeholder",
      text: "placeholder",
      kind: "text" as const,
      prerequisiteIds: [],
      contentRef: { itemId: "utf8", version: 1 },
    }));
    assert.equal(
      f.call("admin", "learning_create_course", {
        courseId: "oversize",
        course: c,
      }).error?.code,
      "INVALID_ARGUMENT",
    );
    assert.equal(
      f.db.prepare("SELECT 1 FROM courses WHERE id='oversize'").get(),
      undefined,
    );
  } finally {
    f.db.close();
  }
});
test("additive migration preserves v1 course/enrollment records, standalone versions survive restart and migrations are idempotent", () => {
  const dir = mkdtempSync(join(tmpdir(), "pear-authoring-")),
    path = join(dir, "learning.sqlite");
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(
      readFileSync(new URL("../migrations/001.sql", import.meta.url), "utf8"),
    );
    legacy
      .prepare(
        "INSERT INTO accounts(id,tenant,name,role,password_hash,salt) VALUES('learner-a','demo','learner-a','learner','existing-hash','existing-salt')",
      )
      .run();
    legacy
      .prepare(
        "INSERT INTO workspaces(id,tenant,owner,revision) VALUES('learning:demo:learner-a','demo','learner-a',3)",
      )
      .run();
    legacy
      .prepare(
        "INSERT INTO courses VALUES('systems-basics','demo','published',?,1)",
      )
      .run(JSON.stringify(courses["systems-basics"]));
    legacy
      .prepare("INSERT INTO course_versions VALUES('systems-basics',1,?)")
      .run(JSON.stringify(courses["systems-basics"]));
    legacy
      .prepare(
        "INSERT INTO enrollments(id,tenant,learner,course_id,version,completed_lessons) VALUES('legacy-enrollment','demo','learner-a','systems-basics',1,'[\"retry\"]')",
      )
      .run();
    const legacyEnrollment = JSON.stringify(
      legacy.prepare("SELECT * FROM enrollments").all(),
    );
    legacy.close();
    let db = openDatabase(path, true),
      service = new LearningService(db);
    assert.equal(
      JSON.stringify(
        db
          .prepare("SELECT * FROM enrollments")
          .all()
          .map(({ assignment_cycle_id, assignment_state, ...row }: any) => row),
      ),
      legacyEnrollment,
    );
    assert.equal(service.context("learner-a").revision, 3);
    assert.equal(
      (
        db
          .prepare("SELECT password_hash FROM accounts WHERE id='learner-a'")
          .get() as any
      ).password_hash,
      "existing-hash",
    );
    db.prepare(
      "INSERT INTO content_items VALUES('persist','demo','published',?,1)",
    ).run(JSON.stringify(item));
    db.prepare("INSERT INTO content_item_versions VALUES('persist',1,?)").run(
      JSON.stringify(item),
    );
    const before = JSON.stringify(
      db.prepare("SELECT * FROM course_versions").all(),
    );
    db.close();
    db = openDatabase(path, true);
    service = new LearningService(db);
    assert.equal(
      JSON.stringify(db.prepare("SELECT * FROM course_versions").all()),
      before,
    );
    assert.equal(
      (db.prepare("SELECT MAX(version) AS n FROM schema_version").get() as any)
        .n,
      11,
    );
    const r = service.invoke("learner-a", {
      requestId: "persist",
      documentId: "learning:demo:learner-a",
      toolName: "learning_get_content_item",
      arguments: { itemId: "persist" },
      expectedRevision: null,
      idempotencyKey: null,
    });
    assert.equal(data(r).text, item.text);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
