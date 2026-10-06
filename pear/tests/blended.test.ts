import { releaseInactiveBookings } from "../src/server/blended.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, data } from "./helpers.ts";
import { courses } from "../src/server/seed.ts";
import type { Course } from "../src/shared/model.ts";
const session = {
  id: "workshop",
  startsAt: "2026-11-01T01:30:00-04:00",
  endsAt: "2026-11-01T01:30:00-05:00",
  cutoffAt: "2026-10-31T22:00:00-04:00",
  timezone: "America/New_York",
  capacity: 1,
  location: "Room 1",
  joinUrl: "https://meet.example.test/room",
};
function course(eventOnly = false): Course {
  const c = structuredClone(courses["systems-basics"]);
  c.lessons = eventOnly
    ? [
        {
          id: "event",
          title: "Workshop",
          text: "Join the human workshop",
          kind: "event",
          prerequisiteIds: [],
          sessions: [structuredClone(session)],
        },
      ]
    : [
        {
          id: "submission",
          title: "Assignment",
          text: "Explain your own reasoning",
          kind: "submission",
          prerequisiteIds: [],
          submission: {
            rubric: "Explain bounded retries",
            maxAttempts: 2,
            passScore: 70,
          },
        },
        {
          id: "event",
          title: "Workshop",
          text: "Join the human workshop",
          kind: "event",
          prerequisiteIds: ["submission"],
          sessions: [structuredClone(session)],
        },
      ];
  return c;
}
function setup(f: ReturnType<typeof fixture>, eventOnly = false) {
  data(
    f.call("editor", "learning_create_course", {
      courseId: "blended",
      course: course(eventOnly),
    }),
  );
  data(f.call("editor", "learning_publish_course", { courseId: "blended" }));
  data(
    f.call("editor", "learning_set_course_assessor", {
      courseId: "blended",
      assessorId: "assessor",
      enabled: true,
    }),
  );
  return data(f.call("learner-a", "learning_enroll", { courseId: "blended" }))
    .enrollmentId;
}
function upload(
  f: ReturnType<typeof fixture>,
  eid: string,
  user = "learner-a",
  key: string = crypto.randomUUID(),
) {
  const p = f.service.principal(user);
  return f.service.media.upload(
    p,
    {
      purpose: "submission",
      enrollmentId: eid,
      lessonId: "submission",
      filename: "assignment.pdf",
      mime: "application/pdf",
      confirmed: "true",
      key,
      revision: String(f.service.context(user).revision),
    },
    Buffer.from("%PDF-1.4\nOriginal assignment\n%%EOF"),
  );
}
test("submission confirmation, delegated grading and attendance cannot be replaced by upload or self-attestation", () => {
  const f = fixture();
  const now = Date.now;
  Date.now = () => Date.parse("2026-10-30T12:00:00Z");
  try {
    const eid = setup(f),
      scope = { enrollmentId: eid, lessonId: "submission" },
      file = upload(f, eid);
    assert.equal(
      f.call("learner-a", "human_complete_lesson", scope, "human").ok,
      false,
    );
    assert.equal(
      f.call("learner-a", "learning_start_attempt", { enrollmentId: eid }).ok,
      false,
    );
    assert.equal(
      f.call("learner-a", "learning_book_session", {
        enrollmentId: eid,
        lessonId: "event",
        sessionId: session.id,
      }).ok,
      false,
    );
    assert.equal(
      f.call("learner-a", "human_submit_submission", {
        ...scope,
        assetId: file.id,
        confirmed: true,
      }).ok,
      false,
    );
    const sub = data(
      f.call(
        "learner-a",
        "human_submit_submission",
        { ...scope, assetId: file.id, confirmed: true },
        "human",
      ),
    );
    assert.equal(sub.state, "pending");
    const queue = data(f.call("assessor", "learning_get_blended_queue"));
    assert.equal(queue.items[0].id, sub.submissionId);
    assert.equal(
      JSON.stringify(queue).includes("Explain bounded retries"),
      false,
    );
    assert.equal(JSON.stringify(queue).includes(file.id), false);
    assert.equal(f.call("editor", "learning_get_blended_queue").ok, false);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,
      0,
    );
    assert.equal(
      f.call(
        "editor",
        "human_get_submission",
        { submissionId: sub.submissionId },
        "human",
      ).ok,
      false,
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("editor"), file.id, {
          submissionId: sub.submissionId,
        }),
      /review scope/,
    );
    const review = data(
      f.call(
        "assessor",
        "human_get_submission",
        { submissionId: sub.submissionId },
        "human",
      ),
    );
    assert.equal(review.rubric, "Explain bounded retries");
    assert.equal(
      f.service.media.read(f.service.principal("assessor"), file.id, {
        submissionId: sub.submissionId,
      }).id,
      file.id,
    );
    assert.equal(
      f.call("assessor", "human_assess_submission", {
        submissionId: sub.submissionId,
        points: 100,
        reason: "scoped human review",
      }).ok,
      false,
    );
    const grade = data(
      f.call(
        "assessor",
        "human_assess_submission",
        {
          submissionId: sub.submissionId,
          points: 80,
          reason: "Original reasoning meets rubric",
        },
        "human",
      ),
    );
    assert.equal(grade.state, "passed");
    assert.equal(
      data(
        f.call("learner-a", "learning_get_progress", { enrollmentId: eid }),
      ).completed_lessons.includes("submission"),
      true,
    );
    const booking = data(
      f.call("learner-a", "learning_book_session", {
        enrollmentId: eid,
        lessonId: "event",
        sessionId: session.id,
      }),
    );
    assert.equal(booking.state, "booked");
    assert.equal(
      f.call(
        "learner-a",
        "human_complete_lesson",
        { enrollmentId: eid, lessonId: "event" },
        "human",
      ).ok,
      false,
    );
    assert.equal(
      f.call(
        "assessor",
        "human_mark_attendance",
        { bookingId: booking.bookingId, present: true, reason: "too early" },
        "human",
      ).ok,
      false,
    );
    Date.now = () => Date.parse("2026-11-01T05:31:00Z");
    const attendance = data(
      f.call(
        "assessor",
        "human_mark_attendance",
        {
          bookingId: booking.bookingId,
          present: true,
          reason: "Instructor observed actual participation",
        },
        "human",
      ),
    );
    assert.equal(attendance.state, "present");
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,
      0,
    );
    const attempt = data(
      f.call("learner-a", "learning_start_attempt", { enrollmentId: eid }),
    );
    for (const q of course().quiz.questions)
      data(
        f.call(
          "learner-a",
          "human_save_answer",
          { attemptId: attempt.attemptId, questionId: q.id, answer: q.correct },
          "human",
        ),
      );
    data(
      f.call(
        "learner-a",
        "human_submit_attempt",
        { attemptId: attempt.attemptId, confirmed: true },
        "human",
      ),
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,
      1,
    );
  } finally {
    Date.now = now;
    f.db.close();
  }
});
test("booking capacity, exact retries, cancellation, pinned shared sessions, cutoff and DST calendar remain deterministic", () => {
  const f = fixture();
  const now = Date.now;
  Date.now = () => Date.parse("2026-10-30T12:00:00Z");
  try {
    const a = setup(f, true),
      b = data(
        f.call("learner-b", "learning_enroll", { courseId: "blended" }),
      ).enrollmentId;
    const args = { enrollmentId: a, lessonId: "event", sessionId: session.id },
      revision = f.service.context("learner-a").revision,
      overrides = { expectedRevision: revision, idempotencyKey: "book-1" };
    const first = data(
      f.call("learner-a", "learning_book_session", args, "bridge", overrides),
    );
    assert.deepEqual(
      data(
        f.call("learner-a", "learning_book_session", args, "bridge", overrides),
      ),
      first,
    );
    assert.equal(
      f.call("learner-b", "learning_book_session", { ...args, enrollmentId: b })
        .ok,
      false,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM bookings").get()!.n,
      1,
    );
    assert.equal(
      f.call("learner-b", "learning_cancel_booking", {
        bookingId: first.bookingId,
      }).ok,
      false,
    );
    const ics = f.service.blended.calendar(
      f.service.principal("learner-a"),
      first.bookingId,
    );
    assert.match(ics, /DTSTART:20261101T053000Z/);
    assert.match(ics, /DTEND:20261101T063000Z/);
    assert.match(ics, /America\/New_York/);
    assert.throws(
      () =>
        f.service.blended.calendar(
          f.service.principal("learner-b"),
          first.bookingId,
        ),
      /scope denied/,
    );
    data(
      f.call("learner-a", "learning_cancel_booking", {
        bookingId: first.bookingId,
      }),
    );
    data(
      f.call("learner-b", "learning_book_session", {
        ...args,
        enrollmentId: b,
      }),
    );
    const changed = course(true);
    changed.lessons[0].sessions![0].capacity = 2;
    data(
      f.call("editor", "learning_update_course", {
        courseId: "blended",
        course: changed,
      }),
    );
    assert.equal(
      f.call("editor", "learning_publish_course", { courseId: "blended" }).ok,
      false,
    );
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) AS n FROM course_versions WHERE course_id='blended'",
        )
        .get()!.n,
      1,
    );
    Date.now = () => Date.parse(session.cutoffAt);
    assert.equal(f.call("learner-a", "learning_book_session", args).ok, false);
    assert.equal(
      f.call(
        "assessor",
        "human_mark_attendance",
        { bookingId: first.bookingId, present: true, reason: "cancelled" },
        "human",
      ).ok,
      false,
    );
  } finally {
    Date.now = now;
    f.db.close();
  }
});
test("failed submission retries preserve evidence; revocation, tenant guesses, private file laundering and audit rollback deny safely", () => {
  const f = fixture();
  const now = Date.now;
  Date.now = () => Date.parse("2026-10-30T12:00:00Z");
  try {
    const eid = setup(f),
      file = upload(f, eid),
      args = {
        enrollmentId: eid,
        lessonId: "submission",
        assetId: file.id,
        confirmed: true,
      },
      sub = data(f.call("learner-a", "human_submit_submission", args, "human"));
    assert.throws(() => upload(f, eid, "learner-b"), /own assignment/);
    assert.equal(
      f.call(
        "outsider",
        "human_get_submission",
        { submissionId: sub.submissionId },
        "human",
      ).ok,
      false,
    );
    assert.throws(
      () =>
        f.service.media.validate(
          f.service.principal("editor"),
          file.id,
          "document",
        ),
      /unavailable/,
    );
    const grade = {
        submissionId: sub.submissionId,
        points: 40,
        reason: "Needs actual original reasoning",
      },
      revision = f.service.context("assessor", "library:demo").revision,
      overrides = { expectedRevision: revision, idempotencyKey: "review" };
    f.db.exec(
      "CREATE TRIGGER fail_blended_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
    );
    assert.equal(
      f.call("assessor", "human_assess_submission", grade, "human", overrides)
        .ok,
      false,
    );
    assert.equal(
      f.db
        .prepare("SELECT state FROM submissions WHERE id=?")
        .get(sub.submissionId)!.state,
      "pending",
    );
    f.db.exec("DROP TRIGGER fail_blended_audit");
    const failed = data(
      f.call("assessor", "human_assess_submission", grade, "human", overrides),
    );
    assert.equal(failed.state, "failed");
    assert.deepEqual(
      data(
        f.call(
          "assessor",
          "human_assess_submission",
          grade,
          "human",
          overrides,
        ),
      ),
      failed,
    );
    data(
      f.call("editor", "learning_set_course_assessor", {
        courseId: "blended",
        assessorId: "assessor",
        enabled: false,
      }),
    );
    assert.equal(
      f.call("assessor", "human_assess_submission", grade, "human", overrides)
        .ok,
      false,
    );
    assert.throws(
      () =>
        f.service.media.read(f.service.principal("assessor"), file.id, {
          submissionId: sub.submissionId,
        }),
      /review scope/,
    );
    const next = upload(f, eid);
    const retry = data(
      f.call(
        "learner-a",
        "human_submit_submission",
        { ...args, assetId: next.id },
        "human",
      ),
    );
    assert.equal(retry.number, 2);
    assert.equal(
      data(f.call("assessor", "learning_get_blended_queue")).total,
      0,
    );
    assert.equal(data(f.call("admin", "learning_get_blended_queue")).total, 1);
    assert.equal(
      f.call(
        "learner-a",
        "human_submit_submission",
        { ...args, assetId: next.id },
        "human",
      ).ok,
      false,
    );
    const audit = f.db
      .prepare(
        "SELECT arguments FROM audit WHERE tool='human_assess_submission'",
      )
      .all();
    assert.equal(JSON.stringify(audit).includes(grade.reason), false);
  } finally {
    Date.now = now;
    f.db.close();
  }
});
test("event dates, IANA zones, join URL injection and lesson configuration are validated before mutation", () => {
  const f = fixture();
  try {
    for (const patch of [
      { startsAt: "2026-02-30T00:00:00Z" },
      { startsAt: "2026-11-01T01:30:00" },
      { timezone: "Imaginary/Zone" },
      { cutoffAt: "2027-01-01T00:00:00Z" },
      { joinUrl: "https://meet.example/\r\nATTENDEE:other" },
    ]) {
      const c = course(true);
      Object.assign(c.lessons[0].sessions![0], patch);
      assert.equal(
        f.call("editor", "learning_create_course", {
          courseId: "invalid",
          course: c,
        }).ok,
        false,
      );
    }
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM event_sessions").get()!.n,
      0,
    );
  } finally {
    f.db.close();
  }
});

test("concurrent HTTP booking cannot exceed capacity; human PDF uploads/reviews and calendar retain live ACL", async () => {
  const { createApp } = await import("../src/server/app.ts"),
    f = fixture(),
    origin = "http://127.0.0.1:4314",
    now = Date.now;
  Date.now = () => Date.parse("2026-10-30T12:00:00Z");
  const { app } = await createApp({ db: f.db, origin, developmentAuth: true });
  const login = async (id: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/api/login",
      headers: { host: "127.0.0.1:4314", origin },
      payload: { username: id, password: id + "-dev" },
    });
    const b = r.json();
    return {
      host: "127.0.0.1:4314",
      origin,
      cookie: (r.headers["set-cookie"] as string).split(";")[0],
      "x-csrf-token": b.csrf,
      "x-pear-epoch": b.sessionEpoch,
    };
  };
  try {
    const eid = setup(f, true),
      other = data(
        f.call("learner-b", "learning_enroll", { courseId: "blended" }),
      ).enrollmentId,
      users = ["learner-a", "learner-b"],
      headers = await Promise.all(users.map(login));
    const calls = users.map((id, i) => ({
      requestId: "http-" + i,
      documentId: `learning:demo:${id}::operations`,
      toolName: "learning_book_session",
      arguments: {
        enrollmentId: i === 0 ? eid : other,
        lessonId: "event",
        sessionId: session.id,
      },
      expectedRevision: f.service.context(id).revision,
      idempotencyKey: "concurrent-book",
    }));
    const r = await Promise.all(
      calls.map((payload, i) =>
        app.inject({
          method: "POST",
          url: "/api/bridge/invoke",
          headers: headers[i],
          payload,
        }),
      ),
    );
    assert.deepEqual(r.map((x) => x.statusCode).sort(), [200, 403]);
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) AS n FROM bookings WHERE state='booked'")
        .get()!.n,
      1,
    );
    const winner = r.findIndex((x) => x.statusCode === 200),
      booking = r[winner].json().data.bookingId;
    const retry = await app.inject({
      method: "POST",
      url: "/api/bridge/invoke",
      headers: headers[winner],
      payload: calls[winner],
    });
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.json().data.bookingId, booking);
    assert.equal(
      (
        await app.inject({
          url: `/api/bookings/${booking}/calendar`,
          headers: headers[winner],
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await app.inject({
          url: `/api/bookings/${booking}/calendar`,
          headers: headers[1 - winner],
        })
      ).statusCode,
      403,
    );
    f.db
      .prepare(
        "UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id=?",
      )
      .run(users[winner]);
    assert.equal(
      (
        await app.inject({
          url: `/api/bookings/${booking}/calendar`,
          headers: headers[winner],
        })
      ).statusCode,
      401,
    );
  } finally {
    Date.now = now;
    await app.close();
    f.db.close();
  }
});

test("submission/session snapshots, private assets and review state survive restart; UTF-8 ICS folds without content-line injection", () => {
  const path = "/tmp/orchad-blended-" + crypto.randomUUID() + ".sqlite";
  let f = fixture(path);
  const now = Date.now;
  Date.now = () => Date.parse("2026-10-30T12:00:00Z");
  try {
    const eid = setup(f),
      file = upload(f, eid),
      sub = data(
        f.call(
          "learner-a",
          "human_submit_submission",
          {
            enrollmentId: eid,
            lessonId: "submission",
            assetId: file.id,
            confirmed: true,
          },
          "human",
        ),
      );
    data(
      f.call(
        "assessor",
        "human_assess_submission",
        {
          submissionId: sub.submissionId,
          points: 75,
          reason: "Pinned rubric accepted",
        },
        "human",
      ),
    );
    const b = data(
      f.call("learner-a", "learning_book_session", {
        enrollmentId: eid,
        lessonId: "event",
        sessionId: session.id,
      }),
    );
    f.db.close();
    f = fixture(path);
    assert.equal(
      data(
        f.call(
          "learner-a",
          "human_get_submission",
          { submissionId: sub.submissionId },
          "human",
        ),
      ).state,
      "passed",
    );
    assert.equal(
      f.service.media.read(f.service.principal("assessor"), file.id, {
        submissionId: sub.submissionId,
      }).id,
      file.id,
    );
    const ics = f.service.blended.calendar(
      f.service.principal("learner-a"),
      b.bookingId,
    );
    assert.match(ics, /DTSTART:20261101T053000Z/);
    assert.equal(f.db.prepare("PRAGMA foreign_key_check").all().length, 0);
    for (const line of ics.split("\r\n"))
      assert.ok(Buffer.byteLength(line) <= 75);
    const record = f.db
        .prepare(
          "SELECT content FROM course_versions WHERE course_id='blended' AND version=1",
        )
        .get() as any,
      parsed = JSON.parse(record.content);
    parsed.lessons[1].title = "Học tập,".repeat(20) + "\nATTENDEE:outsider";
    f.db
      .prepare(
        "UPDATE course_versions SET content=? WHERE course_id='blended' AND version=1",
      )
      .run(JSON.stringify(parsed));
    const unicode = f.service.blended.calendar(
      f.service.principal("learner-a"),
      b.bookingId,
    );
    for (const line of unicode.split("\r\n"))
      assert.ok(Buffer.byteLength(line) <= 75);
    const unfolded = unicode.replace(/\r\n /g, "");
    assert.match(unfolded, /\\nATTENDEE:outsider/);
    assert.doesNotMatch(unfolded, /\r\nATTENDEE:/);
  } finally {
    Date.now = now;
    f.db.close();
  }
});

test("deactivation or withdrawn obligations release unassessed seats without rewriting attendance or deleting booking history", () => {
  const f = fixture(),
    now = Date.now;
  Date.now = () => Date.parse("2026-10-30T12:00:00Z");
  try {
    const eid = setup(f, true),
      other = data(
        f.call("learner-b", "learning_enroll", { courseId: "blended" }),
      ).enrollmentId,
      first = data(
        f.call("learner-a", "learning_book_session", {
          enrollmentId: eid,
          lessonId: "event",
          sessionId: session.id,
        }),
      );
    data(
      f.call("admin", "learning_save_user", {
        user: {
          id: "learner-a",
          name: "learner-a",
          role: "learner",
          active: false,
          managerId: "manager",
          preferredLanguage: "en",
          interests: [],
          customFields: [],
        },
      }),
    );
    assert.equal(
      f.db
        .prepare("SELECT state FROM bookings WHERE id=?")
        .get(first.bookingId)!.state,
      "cancelled",
    );
    const second = data(
      f.call("learner-b", "learning_book_session", {
        enrollmentId: other,
        lessonId: "event",
        sessionId: session.id,
      }),
    );
    assert.equal(second.state, "booked");
    assert.equal(
      f.db.prepare("SELECT COUNT(*) AS n FROM bookings").get()!.n,
      2,
    );
    f.db
      .prepare("UPDATE enrollments SET assignment_state='withdrawn' WHERE id=?")
      .run(other);
    assert.equal(releaseInactiveBookings(f.db, "demo"), 1);
    assert.throws(
      () =>
        f.service.blended.calendar(
          f.service.principal("learner-b"),
          second.bookingId,
        ),
      /no longer active/,
    );
  } finally {
    Date.now = now;
    f.db.close();
  }
});
