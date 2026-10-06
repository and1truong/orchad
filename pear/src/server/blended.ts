import {ContentAccess} from "./content-access.ts";
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
      "UPDATE bookings SET state='cancelled',reason='Obligation withdrawn/cancelled or learner inactive',cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),cancellation_session_revision=session_revision+1 WHERE id=?",
    ).run(row.id);
  return rows.length;
}
export class BlendedService {
  constructor(readonly db: DatabaseSync) {}

  private manageCourse(p:Principal,id:string){
    const course=this.db.prepare("SELECT * FROM courses WHERE id=? AND tenant=?").get(id,p.tenant) as any;
    if(!course)reject("NOT_FOUND","Session course unavailable");
    if(["admin","content_admin"].includes(p.role))new ContentAccess(this.db).author(p,"course",id,JSON.parse(course.draft));
    else if(p.role!=="assessor"||!this.db.prepare("SELECT 1 FROM course_assessors WHERE course_id=? AND assessor_id=?").get(id,p.id))reject("FORBIDDEN","Session instructor scope denied");
    return course;
  }
  private managedSession(p:Principal,id:string){
    const row=this.db.prepare("SELECT * FROM event_sessions WHERE id=? AND tenant=?").get(id,p.tenant) as any;
    if(!row)reject("NOT_FOUND","Scoped session unavailable");
    this.manageCourse(p,row.course_id);return row;
  }
  private effective(s:EventSession,revision?:number){
    const row=revision===0?null:revision===undefined?this.db.prepare("SELECT * FROM event_session_changes WHERE session_id=? ORDER BY revision DESC LIMIT 1").get(s.id) as any:this.db.prepare("SELECT * FROM event_session_changes WHERE session_id=? AND revision=?").get(s.id,revision) as any;
    if(revision&& !row)reject("NOT_FOUND","Session booking history unavailable");
    return {session:row?JSON.parse(row.definition) as EventSession:s,revision:row?.revision??0,state:row?.kind==="cancel"?"cancelled":"scheduled",reason:row?.reason??null,changedAt:row?.changed_at??null};
  }
  private changeSession(p:Principal,a:any){
    const row=this.managedSession(p,a.sessionId),current=this.effective(JSON.parse(row.definition));
    if(!a.reason.trim())reject("INVALID_ARGUMENT","Explain the session change");
    if(Date.now()>=instant(current.session.startsAt))reject("FORBIDDEN","Past or started sessions cannot be changed");
    if(current.revision>=100)reject("INVALID_ARGUMENT","Session change history limit reached");
    if(a.action==="cancel"&&(a.session!==undefined||current.state==="cancelled"))reject("INVALID_ARGUMENT","Cancel a scheduled session without a replacement definition");
    const next=a.action==="reschedule"?a.session:current.session;
    if(!next||next.id!==row.id)reject("INVALID_ARGUMENT","Reschedule requires the same explicit session identity");
    this.validate({id:row.lesson_id,title:"Operational session",text:"",kind:"event",prerequisiteIds:[],sessions:[next]});
    if(a.action==="reschedule"&&(instant(next.startsAt)<=Date.now()||instant(next.cutoffAt)<=Date.now()))reject("INVALID_ARGUMENT","New session and rebooking cutoff must be in the future");
    const revision=current.revision+1,now=new Date(Date.now()).toISOString();
    this.db.prepare("INSERT INTO event_session_changes VALUES(?,?,?,?,?,?,?)").run(row.id,revision,a.action,JSON.stringify(next),a.reason.trim(),p.id,now);
    const bookings=this.db.prepare("SELECT b.*,e.tenant,e.version,e.course_id FROM bookings b JOIN enrollments e ON e.id=b.enrollment_id WHERE b.session_id=? AND b.state='booked' ORDER BY b.id").all(row.id) as any[];
    if(bookings.length>500)reject("INVALID_ARGUMENT","Session booking population exceeds capacity bounds");
    const affected=new Set<string>();
    for(const b of bookings){
      this.db.prepare("UPDATE bookings SET state='cancelled',reason=?,cancelled_at=?,cancellation_session_revision=? WHERE id=? AND state='booked'").run("Session "+a.action+": "+a.reason.trim(),now,revision,b.id);
      const course=JSON.parse((this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(b.course_id,b.version) as any).content),lesson=course.lessons.find((v:any)=>v.id===row.lesson_id);
      this.db.prepare("INSERT INTO session_notices VALUES(?,?,?,?,?,?,?,?,?,NULL)").run(randomUUID(),b.tenant,b.learner,b.enrollment_id,row.id,revision,a.action,JSON.stringify({courseId:b.course_id,lessonId:row.lesson_id,title:lesson?.title??"Session",sessionId:row.id,sessionRevision:revision,kind:a.action,previousBookingId:b.id,...(a.action==="reschedule"?{startsAt:next.startsAt,timezone:next.timezone}:{}),automaticRebooking:false,officialLearningChanged:false}),now);
      affected.add(b.learner);
    }
    for(const id of affected)this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("learning:"+p.tenant+":"+id);
    return {sessionId:row.id,sessionRevision:revision,state:a.action==="cancel"?"cancelled":"scheduled",cancelledBookings:bookings.length,automaticRebooking:false,officialLearningChanged:false};
  }

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
    return { row, s: this.effective(s!,row.session_revision).session, ...result };
  }
  authorize(p: Principal, name: string, a: any) {
    if(name==="learning_change_session")this.managedSession(p,a.sessionId);
    if(name==="learning_get_session_changes")this.manageCourse(p,a.courseId);
    if(name==="learning_read_session_notice"&&!this.db.prepare("SELECT 1 FROM session_notices WHERE id=? AND tenant=? AND learner=?").get(a.noticeId,p.tenant,p.id))reject("FORBIDDEN","Own session notice required");
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
    if(name==="learning_get_session_notices")return boundedPage((this.db.prepare("SELECT id,enrollment_id AS enrollmentId,session_id AS sessionId,session_revision AS sessionRevision,kind,data,created_at AS createdAt,read_at AS readAt FROM session_notices WHERE tenant=? AND learner=? ORDER BY created_at DESC,id").all(p.tenant,p.id) as any[]).map(({data,...r})=>({...r,data:JSON.parse(data)})),a.offset??0,a.limit??20);
    if(name==="learning_get_session_changes"){
      this.manageCourse(p,a.courseId);
      const rows=(this.db.prepare("SELECT * FROM event_sessions WHERE tenant=? AND course_id=? ORDER BY lesson_id,id").all(p.tenant,a.courseId) as any[]).map(row=>{
        const effective=this.effective(JSON.parse(row.definition)),definition=effective.session;
        const booked=Number((this.db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE session_id=? AND state='booked'").get(row.id) as any).n);
        return {courseId:row.course_id,lessonId:row.lesson_id,...effective,session:source==="human"?definition:{id:definition.id,startsAt:definition.startsAt,endsAt:definition.endsAt,cutoffAt:definition.cutoffAt,timezone:definition.timezone,capacity:definition.capacity},booked};
      });
      return boundedPage(rows,a.offset??0,a.limit??8);
    }
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
      const sessions = l.sessions!.map((original) => {
        const effective=this.effective(original),s=effective.session;
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
          sessionRevision:effective.revision,state:effective.state,changeReason:effective.reason,changedAt:effective.changedAt,
          bookingOpen: effective.state==="scheduled" && Date.now() < instant(s.cutoffAt),
        };
      });
      return {
        kind: l.kind,
        sessions,
        bookings: this.db
          .prepare(
            "SELECT id,session_id AS sessionId,state,booked_at AS bookedAt,session_revision AS sessionRevision,reason,cancelled_at AS cancelledAt,cancellation_session_revision AS cancellationSessionRevision FROM bookings WHERE enrollment_id=? AND lesson_id=? ORDER BY booked_at",
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
    if(name==="learning_change_session")return this.changeSession(p,a);
    if(name==="learning_read_session_notice"){
      const notice=this.db.prepare("SELECT * FROM session_notices WHERE id=? AND tenant=? AND learner=?").get(a.noticeId,p.tenant,p.id) as any;
      if(!notice)reject("FORBIDDEN","Own session notice required");
      if(!notice.read_at)this.db.prepare("UPDATE session_notices SET read_at=? WHERE id=?").run(new Date(Date.now()).toISOString(),notice.id);
      return {noticeId:notice.id,read:true};
    }
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
      const original = l.sessions?.find((s) => s.id === a.sessionId);
      if (!original) reject("INVALID_ARGUMENT", "Unknown pinned session");
      const effective=this.effective(original!),s=effective.session;
      if(effective.state!=="scheduled")reject("FORBIDDEN","Session cancelled; choose an available session explicitly");
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
          "INSERT INTO bookings(id,enrollment_id,lesson_id,session_id,learner,state,booked_at,session_revision) VALUES(?,?,?,?,?,'booked',?,?)",
        )
        .run(id, e.id, l.id, s!.id, p.id, new Date().toISOString(),effective.revision);
      return { bookingId: id, sessionId: s!.id, sessionRevision:effective.revision, state: "booked" };
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
        .prepare("UPDATE bookings SET state='cancelled',cancelled_at=?,cancellation_session_revision=? WHERE id=?")
        .run(new Date(Date.now()).toISOString(),row.session_revision+1,row.id);
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
    const cancellation=row.state==="cancelled"&&!!row.cancelled_at;
    if (e.assignment_state !== "active" && e.status !== "completed" && !cancellation)
      reject("FORBIDDEN", "Calendar obligation is no longer active");
    if (row.state !== "booked" && row.state !== "present" && !cancellation)
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
      "DTSTAMP:" + date(cancellation?row.cancelled_at:row.booked_at),
      "SEQUENCE:"+String(cancellation?row.cancellation_session_revision??row.session_revision+1:row.session_revision),
      "STATUS:"+(cancellation?"CANCELLED":"CONFIRMED"),
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
