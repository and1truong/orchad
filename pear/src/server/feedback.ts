import type { DatabaseSync } from "node:sqlite";
import type { Principal } from "../shared/model.ts";
import { reject, boundedPage } from "./errors.ts";
export class FeedbackService {
  constructor(readonly db: DatabaseSync) {}
  private enrollment(p: Principal, id: string) {
    const e = this.db
      .prepare(
        "SELECT * FROM enrollments WHERE id=? AND tenant=? AND learner=? AND status='completed'",
      )
      .get(id, p.tenant, p.id) as any;
    if (!e)
      reject("FORBIDDEN", "Own completed enrollment required for feedback");
    return e;
  }
  private version(p: Principal, a: any) {
    const c = this.db
      .prepare("SELECT * FROM courses WHERE id=? AND tenant=?")
      .get(a.courseId, p.tenant) as any;
    if (!c) reject("FORBIDDEN", "Rating scope denied");
    const version = a.version ?? c.latest_version;
    if (
      !this.db
        .prepare(
          "SELECT 1 FROM course_versions WHERE course_id=? AND version=?",
        )
        .get(c.id, version)
    )
      reject("FORBIDDEN", "Rating version unavailable");
    if (
      c.state !== "published" &&
      !["admin", "content_admin"].includes(p.role) &&
      !this.db
        .prepare(
          "SELECT 1 FROM enrollments WHERE course_id=? AND version=? AND learner=? AND tenant=? AND status='completed'",
        )
        .get(c.id, version, p.id, p.tenant)
    )
      reject("FORBIDDEN", "Rating scope denied");
    return version;
  }
  authorize(p: Principal, name: string, a: any) {
    if (
      ["human_get_course_feedback", "human_save_course_feedback"].includes(name)
    )
      this.enrollment(p, a.enrollmentId);
    if (name === "learning_get_course_ratings") this.version(p, a);
    if (name === "human_list_course_feedback") {
      if (p.role !== "admin")
        reject("FORBIDDEN", "Tenant feedback administrator required");
      this.version(p, a);
    }
  }
  read(p: Principal, name: string, a: any) {
    if (name === "human_get_course_feedback") {
      const e = this.enrollment(p, a.enrollmentId);
      const row = this.db
        .prepare(
          "SELECT rating,comment,updated_at FROM course_feedback WHERE tenant=? AND learner=? AND course_id=? AND version=?",
        )
        .get(p.tenant, p.id, e.course_id, e.version);
      return { feedback: row ?? null };
    }
    const version = this.version(p, a);
    if (name === "human_list_course_feedback")
      return boundedPage(
        this.db
          .prepare(
            "SELECT learner,rating,comment,created_at,updated_at FROM course_feedback WHERE tenant=? AND course_id=? AND version=? ORDER BY updated_at,learner",
          )
          .all(p.tenant, a.courseId, version),
        a.offset ?? 0,
        a.limit ?? 20,
      );
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count,AVG(rating) AS average FROM course_feedback WHERE tenant=? AND course_id=? AND version=?",
      )
      .get(p.tenant, a.courseId, version) as any;
    return {
      courseId: a.courseId,
      version,
      count: row.count,
      average:
        row.average === null ? null : Math.round(row.average * 100) / 100,
      meaning: "Voluntary learner opinion; not an assessment score",
    };
  }
  write(p: Principal, a: any) {
    const e = this.enrollment(p, a.enrollmentId),
      now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO course_feedback VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(learner,course_id,version) DO UPDATE SET enrollment_id=excluded.enrollment_id,rating=excluded.rating,comment=excluded.comment,updated_at=excluded.updated_at",
      )
      .run(
        p.tenant,
        p.id,
        e.course_id,
        e.version,
        e.id,
        a.rating,
        a.comment.trim(),
        now,
        now,
      );
    return {
      courseId: e.course_id,
      version: e.version,
      rating: a.rating,
      updatedAt: now,
    };
  }
}
