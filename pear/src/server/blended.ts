import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Principal, Course, Lesson } from "../shared/model.ts";
import type { EventSession } from "../shared/blended.ts";
import { requiredLessonIds } from "../shared/progression.ts";
import { reject, boundedPage } from "./errors.ts";
const instant = (v: string) => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      v,
    ) ||
    !Number.isFinite(Date.parse(v))
  )
    reject(
      "INVALID_ARGUMENT",
      "Use an explicit offset or Z for event instants",
    );
  const [year, month, day] = v.slice(0, 10).split("-").map(Number),
    calendar = new Date(Date.UTC(year!, month! - 1, day!));
  if (calendar.toISOString().slice(0, 10) !== v.slice(0, 10))
    reject("INVALID_ARGUMENT", "Invalid event calendar date");
  return Date.parse(v);
};
export function releaseInactiveBookings(db: DatabaseSync, tenant: string) {
  const rows = db
    .prepare(
      "SELECT b.id,b.learner FROM bookings b JOIN enrollments e ON e.id=b.enrollment_id JOIN accounts a ON a.id=e.learner WHERE e.tenant=? AND b.state='booked' AND (e.assignment_state<>'active' OR a.active=0)",
    )
    .all(tenant) as any[];
  for (const row of rows)
    db.prepare(
      "UPDATE bookings SET state='cancelled',reason='Obligation withdrawn/cancelled or learner inactive' WHERE id=?",
    ).run(row.id);
  return rows.length;
}
export class BlendedService {
  constructor(readonly db: DatabaseSync) {}
  validate(lesson: Lesson) {
    if (lesson.kind === "submission") {
      if (
        !lesson.submission ||
        !lesson.submission.rubric.trim() ||
        lesson.sessions ||
        lesson.assetId ||
        lesson.url ||
        lesson.contentRef
      )
        reject(
          "INVALID_ARGUMENT",
          "Submission requires rubric, attempt and pass policy",
        );
    } else if (lesson.kind === "event") {
      if (
        !lesson.sessions ||
        lesson.submission ||
        lesson.assetId ||
        lesson.url ||
        lesson.contentRef ||
        new Set(lesson.sessions.map((s) => s.id)).size !==
          lesson.sessions.length
      )
        reject(
          "INVALID_ARGUMENT",
          "Event requires distinct session definitions",
        );
      for (const s of lesson.sessions) {
        const start = instant(s.startsAt),
          end = instant(s.endsAt),
          cutoff = instant(s.cutoffAt);
        if (end <= start || cutoff > start)
          reject("INVALID_ARGUMENT", "Session end/cutoff order invalid");
        try {
          new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format(start);
        } catch {
          reject("INVALID_ARGUMENT", "Unknown IANA timezone");
        }
        if (s.joinUrl) {
          let u: URL;
          try {
            u = new URL(s.joinUrl);
          } catch {
            reject("INVALID_ARGUMENT", "Invalid event join URL");
          }
          if (
            u!.protocol !== "https:" ||
            u!.username ||
            u!.password ||
            /[\x00-\x20]/.test(s.joinUrl)
          )
            reject(
              "INVALID_ARGUMENT",
              "Event join URL must use HTTPS without credentials",
            );
        }
      }
    } else if (lesson.submission || lesson.sessions)
      reject("INVALID_ARGUMENT", "Unexpected submission/event settings");
  }
  pin(p: Principal, courseId: string, c: Course) {
    for (const l of c.lessons)
      for (const s of l.sessions ?? []) {
        const definition = JSON.stringify(s),
          old = this.db
            .prepare("SELECT * FROM event_sessions WHERE id=?")
            .get(s.id) as any;
        if (
          old &&
          (old.tenant !== p.tenant ||
            old.course_id !== courseId ||
            old.lesson_id !== l.id ||
            old.definition !== definition)
        )
          reject(
            "INVALID_ARGUMENT",
            "Published session identity is immutable; use a new ID to reschedule",
          );
        if (!old)
          this.db
            .prepare("INSERT INTO event_sessions VALUES(?,?,?,?,?)")
            .run(s.id, p.tenant, courseId, l.id, definition);
      }
  }
  private enrollment(p: Principal, id: string, review = false) {
    const e = this.db
      .prepare(
        "SELECT e.*,v.content FROM enrollments e JOIN course_versions v ON v.course_id=e.course_id AND v.version=e.version WHERE e.id=? AND e.tenant=?",
      )
      .get(id, p.tenant) as any;
    if (
      !e ||
      (review
        ? !(
            p.role === "admin" ||
            (p.role === "assessor" &&
              this.db
                .prepare(
                  "SELECT 1 FROM course_assessors WHERE course_id=? AND assessor_id=?",
                )
                .get(e.course_id, p.id))
          )
        : e.learner !== p.id)
    )
      reject("FORBIDDEN", "Course operation scope denied");
    return { e, c: JSON.parse(e.content) as Course };
  }
  private lesson(p: Principal, a: any, review = false, unlock = true) {
    const { e, c } = this.enrollment(p, a.enrollmentId, review),
      l = c.lessons.find((x) => x.id === a.lessonId);
    if (!l || !["submission", "event"].includes(l.kind))
      reject("FORBIDDEN", "Blended lesson unavailable");
    if (
      unlock &&
      requiredLessonIds(c, l!).some(
        (id) => !JSON.parse(e.completed_lessons).includes(id),
      )
    )
      reject("FORBIDDEN", "Complete prerequisite lessons first");
    return { e, c, l: l! };
  }
  private submission(p: Principal, id: string, review = false) {
    const row = this.db
      .prepare("SELECT * FROM submissions WHERE id=?")
      .get(id) as any;
    if (!row) reject("FORBIDDEN", "Submission unavailable");
    return {
      row,
      ...this.lesson(
        p,
        { enrollmentId: row.enrollment_id, lessonId: row.lesson_id },
        review,
        false,
      ),
    };
  }
  private booking(p: Principal, id: string, review = false) {
    const row = this.db
      .prepare("SELECT * FROM bookings WHERE id=?")
      .get(id) as any;
    if (!row) reject("FORBIDDEN", "Booking unavailable");
    const result = this.lesson(
        p,
        { enrollmentId: row.enrollment_id, lessonId: row.lesson_id },
        review,
        false,
      ),
      s = result.l.sessions?.find((x) => x.id === row.session_id);
    if (!s) reject("FORBIDDEN", "Pinned session unavailable");
    return { row, s: s!, ...result };
  }
  authorize(p: Principal, name: string, a: any) {
    if (
      [
        "learning_get_blended_lesson",
        "learning_book_session",
        "human_submit_submission",
      ].includes(name)
    )
      this.lesson(p, a);
    if (name === "learning_cancel_booking") this.booking(p, a.bookingId);
    if (name === "human_mark_attendance") this.booking(p, a.bookingId, true);
    if (name === "human_assess_submission")
      this.submission(p, a.submissionId, true);
    if (name === "human_get_submission") {
      const row = this.db
        .prepare(
          "SELECT e.learner FROM submissions s JOIN enrollments e ON e.id=s.enrollment_id WHERE s.id=?",
        )
        .get(a.submissionId) as any;
      this.submission(p, a.submissionId, row?.learner !== p.id);
    }
  }
  private active(e: any) {
    if (e.assignment_state !== "active" || e.status === "completed")
      reject("FORBIDDEN", "Learning obligation is no longer open");
  }
  private complete(e: any, lessonId: string) {
    const done = JSON.parse(e.completed_lessons);
    if (!done.includes(lessonId)) done.push(lessonId);
    this.db
      .prepare("UPDATE enrollments SET completed_lessons=? WHERE id=?")
      .run(JSON.stringify(done), e.id);
    this.db
      .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
      .run(`learning:${e.tenant}:${e.learner}`);
  }
  read(p: Principal, name: string, a: any, source: string) {
    if (name === "human_get_submission") {
      const row = this.db
        .prepare(
          "SELECT e.learner FROM submissions s JOIN enrollments e ON e.id=s.enrollment_id WHERE s.id=?",
        )
        .get(a.submissionId) as any;
      const v = this.submission(p, a.submissionId, row?.learner !== p.id);
      return {
        id: v.row.id,
        enrollmentId: v.e.id,
        lessonId: v.l.id,
        learnerId: v.e.learner,
        assetId: v.row.asset_id,
        state: v.row.state,
        number: v.row.number,
        points: v.row.points,
        reason: v.row.reason,
        rubric: v.l.submission!.rubric,
        passScore: v.l.submission!.passScore,
      };
    }
    if (name === "learning_get_blended_lesson") {
      const { e, l } = this.lesson(p, a);
      if (l.kind === "submission")
        return {
          kind: l.kind,
          maxAttempts: l.submission!.maxAttempts,
          submissions: this.db
            .prepare(
              "SELECT id,number,state,points,submitted_at AS submittedAt FROM submissions WHERE enrollment_id=? AND lesson_id=? ORDER BY number",
            )
            .all(e.id, l.id),
        };
      const sessions = l.sessions!.map((s) => {
        const n = this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM bookings WHERE session_id=? AND state IN ('booked','present')",
          )
          .get(s.id) as any;
        return {
          ...(source === "human"
            ? s
            : {
                id: s.id,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                cutoffAt: s.cutoffAt,
                timezone: s.timezone,
                capacity: s.capacity,
              }),
          available: Math.max(0, s.capacity - n.n),
          bookingOpen: Date.now() < instant(s.cutoffAt),
        };
      });
      return {
        kind: l.kind,
        sessions,
        bookings: this.db
          .prepare(
            "SELECT id,session_id AS sessionId,state,booked_at AS bookedAt FROM bookings WHERE enrollment_id=? AND lesson_id=? ORDER BY booked_at",
          )
          .all(e.id, l.id),
      };
    }
    if (name === "learning_get_blended_queue") {
      if (!["admin", "assessor"].includes(p.role))
        reject("FORBIDDEN", "Reviewer required");
      const scoped = (e: any) =>
        p.role === "admin" ||
        !!this.db
          .prepare(
            "SELECT 1 FROM course_assessors WHERE course_id=? AND assessor_id=?",
          )
          .get(e.course_id, p.id);
      const rows = (
        this.db
          .prepare(
            "SELECT s.id,e.id AS enrollmentId,e.course_id,e.learner AS learnerId,s.lesson_id AS lessonId,'submission' AS kind,s.submitted_at AS createdAt FROM submissions s JOIN enrollments e ON e.id=s.enrollment_id WHERE e.tenant=? AND e.assignment_state='active' AND s.state='pending' UNION ALL SELECT b.id,e.id,e.course_id,e.learner,b.lesson_id,'event',b.booked_at FROM bookings b JOIN enrollments e ON e.id=b.enrollment_id WHERE e.tenant=? AND e.assignment_state='active' AND b.state='booked' ORDER BY 7,1",
          )
          .all(p.tenant, p.tenant) as any[]
      )
        .filter(scoped)
        .map(({ course_id, ...r }) => r);
      return boundedPage(rows, a.offset ?? 0, a.limit ?? 20);
    }
    reject("UNSUPPORTED", "Unknown learning operation");
  }
  write(p: Principal, name: string, a: any) {
    if (name === "human_submit_submission") {
      const { e, l } = this.lesson(p, a);
      this.active(e);
      if (l.kind !== "submission" || !a.confirmed)
        reject("INVALID_ARGUMENT", "Confirmed submission required");
      const previous = this.db
        .prepare(
          "SELECT * FROM submissions WHERE enrollment_id=? AND lesson_id=? ORDER BY number DESC LIMIT 1",
        )
        .get(e.id, l.id) as any;
      if (previous && previous.state !== "failed")
        reject("FORBIDDEN", "Submission is pending review or already passed");
      const number = (previous?.number ?? 0) + 1;
      if (number > l.submission!.maxAttempts)
        reject("FORBIDDEN", "Submission attempt limit reached");
      const file = this.db
        .prepare(
          "SELECT * FROM assets WHERE id=? AND tenant=? AND owner=? AND purpose='submission'",
        )
        .get(a.assetId, p.tenant, p.id) as any;
      if (
        !file ||
        file.context_json !==
          JSON.stringify({ enrollmentId: e.id, lessonId: l.id })
      )
        reject("FORBIDDEN", "Upload belongs to another assignment");
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO submissions(id,enrollment_id,lesson_id,asset_id,number,submitted_at) VALUES(?,?,?,?,?,?)",
        )
        .run(id, e.id, l.id, file.id, number, new Date().toISOString());
      return { submissionId: id, number, state: "pending" };
    }
    if (name === "human_assess_submission") {
      const { row, e, l } = this.submission(p, a.submissionId, true);
      this.active(e);
      if (row.state !== "pending")
        reject("FORBIDDEN", "Submission already reviewed");
      if (!a.reason.trim())
        reject("INVALID_ARGUMENT", "Assessment reason required");
      const passed = a.points >= l.submission!.passScore,
        state = passed ? "passed" : "failed";
      this.db
        .prepare(
          "UPDATE submissions SET state=?,assessor=?,points=?,reason=?,reviewed_at=? WHERE id=?",
        )
        .run(state, p.id, a.points, a.reason, new Date().toISOString(), row.id);
      if (passed) this.complete(e, l.id);
      else
        this.db
          .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
          .run(`learning:${e.tenant}:${e.learner}`);
      return {
        submissionId: row.id,
        state,
        points: a.points,
        learnerId: e.learner,
        enrollmentId: e.id,
      };
    }
    if (name === "learning_book_session") {
      const { e, l } = this.lesson(p, a);
      this.active(e);
      const s = l.sessions?.find((s) => s.id === a.sessionId);
      if (!s) reject("INVALID_ARGUMENT", "Unknown pinned session");
      if (Date.now() >= instant(s!.cutoffAt))
        reject("FORBIDDEN", "Booking cutoff has passed");
      const previous = this.db
        .prepare(
          "SELECT 1 FROM bookings WHERE enrollment_id=? AND lesson_id=? AND state IN ('booked','present')",
        )
        .get(e.id, l.id);
      if (
        previous ||
        this.db
          .prepare(
            "SELECT 1 FROM bookings WHERE session_id=? AND learner=? AND state IN ('booked','present')",
          )
          .get(s!.id, p.id)
      )
        reject("FORBIDDEN", "Already booked or attended");
      const n = this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM bookings WHERE session_id=? AND state IN ('booked','present')",
        )
        .get(s!.id) as any;
      if (n.n >= s!.capacity) reject("FORBIDDEN", "Session is full");
      const history = this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM bookings WHERE enrollment_id=? AND lesson_id=?",
        )
        .get(e.id, l.id) as any;
      if (history.n >= 40)
        reject("INVALID_ARGUMENT", "Booking history limit reached");
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO bookings(id,enrollment_id,lesson_id,session_id,learner,state,booked_at) VALUES(?,?,?,?,?,'booked',?)",
        )
        .run(id, e.id, l.id, s!.id, p.id, new Date().toISOString());
      return { bookingId: id, sessionId: s!.id, state: "booked" };
    }
    if (name === "learning_cancel_booking") {
      const { row, e, s } = this.booking(p, a.bookingId);
      this.active(e);
      if (row.state !== "booked" || Date.now() >= instant(s.startsAt))
        reject(
          "FORBIDDEN",
          "Only upcoming unassessed booking can be cancelled",
        );
      this.db
        .prepare("UPDATE bookings SET state='cancelled' WHERE id=?")
        .run(row.id);
      return { bookingId: row.id, state: "cancelled" };
    }
    if (name === "human_mark_attendance") {
      const { row, e, l, s } = this.booking(p, a.bookingId, true);
      this.active(e);
      if (row.state !== "booked" || Date.now() < instant(s.startsAt))
        reject(
          "FORBIDDEN",
          "Attendance requires an unassessed session that has started",
        );
      if (!a.reason.trim())
        reject("INVALID_ARGUMENT", "Attendance reason required");
      const state = a.present ? "present" : "absent";
      this.db
        .prepare(
          "UPDATE bookings SET state=?,assessor=?,reason=?,reviewed_at=? WHERE id=?",
        )
        .run(state, p.id, a.reason, new Date().toISOString(), row.id);
      if (a.present) this.complete(e, l.id);
      else
        this.db
          .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
          .run(`learning:${e.tenant}:${e.learner}`);
      return {
        bookingId: row.id,
        state,
        learnerId: e.learner,
        enrollmentId: e.id,
      };
    }
    reject("UNSUPPORTED", "Unknown learning operation");
  }
  submissionFile(p: Principal, id: string) {
    const v = this.submission(p, id, true);
    return this.db
      .prepare("SELECT * FROM assets WHERE id=? AND tenant=?")
      .get(v.row.asset_id, p.tenant) as any;
  }
  calendar(p: Principal, id: string) {
    const { row, s, l, e } = this.booking(p, id);
    if (e.assignment_state !== "active" && e.status !== "completed")
      reject("FORBIDDEN", "Calendar obligation is no longer active");
    if (row.state !== "booked" && row.state !== "present")
      reject("FORBIDDEN", "Active booking required");
    const esc = (x: string) =>
      x
        .replaceAll("\\", "\\\\")
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "")
        .replaceAll(",", "\\,")
        .replaceAll(";", "\\;");
    const date = (x: string) =>
      new Date(x)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    const fold = (line: string) => {
      let out = "",
        bytes = 0;
      for (const char of line) {
        const size = Buffer.byteLength(char);
        if (bytes + size > 75) {
          out += "\r\n ";
          bytes = 1;
        }
        out += char;
        bytes += size;
      }
      return out;
    };
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Orchard//Pear//EN",
      "BEGIN:VEVENT",
      "UID:" + row.id + "@pear",
      "DTSTAMP:" + date(row.booked_at),
      "DTSTART:" + date(s.startsAt),
      "DTEND:" + date(s.endsAt),
      "SUMMARY:" + esc(l.title),
      "LOCATION:" + esc(s.location),
      "DESCRIPTION:" + esc("Session timezone: " + s.timezone),
      ...(s.joinUrl ? ["URL:" + s.joinUrl] : []),
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]
      .map(fold)
      .join("\r\n");
  }
}
