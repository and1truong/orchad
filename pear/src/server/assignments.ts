import {AwardCourses} from "./award-courses.ts";
import {ContentAccess} from "./content-access.ts";
import { releaseInactiveBookings } from "./blended.ts";
import { calendarMonth, nextCalendarRun, calendarRunIndex, calendarPreview } from "../shared/calendar.ts";
import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { validateArgs } from "@orchard/bridge-contract";
import type { Principal } from "../shared/model.ts";
import { planSchema, type AssignmentPlan } from "../shared/assignments.ts";
import { PeopleService } from "./people.ts";
import { ProgramService } from "./programs.ts";
import { DomainError, reject, boundedPage } from "./errors.ts";
const day = 86400000,
  idPattern = /^[A-Za-z0-9_-]{1,64}$/;
const date = (value: string) => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    reject("INVALID_ARGUMENT", "Use a valid UTC ISO timestamp");
  return Date.parse(value);
};
export class AssignmentService {
  readonly people: PeopleService;
  readonly programs: ProgramService;
  constructor(readonly db: DatabaseSync) {
    this.people = new PeopleService(db);
    this.programs = new ProgramService(db);
  }
  private plan(p: Principal, id: string) {
    const row = this.db
      .prepare("SELECT * FROM assignment_plans WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    if (!row || (p.role !== "admin" && row.owner !== p.id))
      reject("FORBIDDEN", "Assignment plan scope denied");
    return row;
  }
  private principal(id: string): Principal {
    const p = this.db
      .prepare("SELECT id,tenant,name,role,active FROM accounts WHERE id=?")
      .get(id) as any;
    if (!p?.active || !["admin", "manager"].includes(p.role))
      reject("FORBIDDEN", "Plan owner no longer has assignment authority");
    return p;
  }
  private recipients(p: Principal, s: AssignmentPlan) {
    if (s.audienceKind === "group") {
      const g = this.people.group(p, s.groupId).definition;
      return this.people.members(p, g).map((u) => u.id);
    }
    return s.learnerIds.map((id) => {
      const u = this.db
        .prepare(
          "SELECT id,manager_id FROM accounts WHERE id=? AND tenant=? AND active=1",
        )
        .get(id, p.tenant) as any;
      if (!u || (p.role !== "admin" && u.manager_id !== p.id))
        reject(
          "FORBIDDEN",
          "Assignment recipient outside active audience scope",
        );
      return id;
    });
  }
  private target(p: Principal, s: AssignmentPlan, version?: number) {
    if (!idPattern.test(s.targetId))
      reject("INVALID_ARGUMENT", "Invalid assignment target");
    const table = s.targetKind === "course" ? "courses" : "collections";
    const row = this.db
      .prepare(`SELECT * FROM ${table} WHERE id=? AND tenant=?`)
      .get(s.targetId, p.tenant) as any;
    if (
      !row ||
      row.state !== "published" ||
      (s.targetKind === "award" && row.kind !== "award")
    )
      reject("FORBIDDEN", "Assignment target unavailable");
    const selected = version ?? row.latest_version;
    const v = this.db
      .prepare(
        s.targetKind === "course"
          ? "SELECT content FROM course_versions WHERE course_id=? AND version=?"
          : "SELECT content FROM collection_versions WHERE collection_id=? AND version=?",
      )
      .get(row.id, selected) as any;
    if (!v) reject("NOT_FOUND", "Target version unavailable");
    const content = JSON.parse(v.content);
    if(s.targetKind==="course"){new ContentAccess(this.db).current(p,"course",row.id);new ContentAccess(this.db).requireVisible(p,"course",row.id,content);}
    if (s.targetKind === "award" && content.access === "author")
      reject("FORBIDDEN", "Scheduled awards require organization access");
    if(s.targetKind==="award")new ProgramService(this.db).requireRecipient(p,row.id,selected);
    return { version: selected, title: content.title };
  }
  private validate(p: Principal, s: AssignmentPlan) {
    if (
      !validateArgs(planSchema, s) ||
      new Set(s.learnerIds).size !== s.learnerIds.length
    )
      reject("INVALID_ARGUMENT", "Invalid assignment plan");
    const start = date(s.startsAt);
    if (s.repeatMonths !== undefined) {
      if (s.repeatDays !== 0 || !s.timeZone || !s.dstChoice)
        reject("INVALID_ARGUMENT", "Monthly recurrence requires a timezone, DST choice and no UTC-day cadence");
      try { calendarPreview(s); } catch (e) { reject("INVALID_ARGUMENT", (e as Error).message); }
    } else if (s.timeZone !== undefined || s.dstChoice !== undefined)
      reject("INVALID_ARGUMENT", "Calendar settings require monthly recurrence");
    if (s.endAt && date(s.endAt) < start)
      reject("INVALID_ARGUMENT", "End must not precede start");
    if (s.dueKind === "fixed") {
      if (!s.fixedDueAt || date(s.fixedDueAt) < start || s.rollingDays !== 0)
        reject(
          "INVALID_ARGUMENT",
          "Fixed deadline must follow start and have no rolling offset",
        );
    } else if (
      s.fixedDueAt !== null ||
      (s.dueKind === "none" && s.rollingDays !== 0) ||
      (s.dueKind === "rolling" && s.rollingDays < 1)
    )
      reject("INVALID_ARGUMENT", "Invalid due date policy");
    if (s.repeatMonths && s.dueKind === "fixed") {
      try {
        for (let index = 0; index <= Math.ceil(12 / s.repeatMonths); index++) {
          const runAt = calendarMonth(s.startsAt, index * s.repeatMonths, s.timeZone!, s.dstChoice!);
          this.due(s, runAt, runAt);
        }
      } catch (e) { reject("INVALID_ARGUMENT", (e as Error).message); }
    }
    if (s.audienceKind === "individuals") {
      if (!s.learnerIds.length || s.groupId || s.membership !== "fixed")
        reject(
          "INVALID_ARGUMENT",
          "Individual audience requires fixed member IDs",
        );
    } else if (!idPattern.test(s.groupId) || s.learnerIds.length)
      reject(
        "INVALID_ARGUMENT",
        "Group audience requires group ID and no explicit IDs",
      );
    const recipients = this.recipients(p, s),
      target = this.target(p, s);
    if(s.targetKind==="course"){
      const value=JSON.parse((this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(s.targetId,target.version) as any).content);
      for(const id of recipients){const recipient=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(id,p.tenant) as unknown as Principal;new ContentAccess(this.db).requireVisible(recipient,"course",s.targetId,value);new ContentAccess(this.db).current(recipient,"course",s.targetId);}
    }
    if(s.targetKind==="award")for(const id of recipients){const recipient=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(id,p.tenant) as unknown as Principal;new ProgramService(this.db).requireRecipient(recipient,s.targetId,target.version);}
    return { ...target, recipients };
  }
  authorize(p: Principal, name: string, a: any) {
    if (name === "learning_enroll_award_course")
      this.enrollAwardCourse(p, a, true);
    if (["learning_set_assignment_plan_state"].includes(name))
      this.plan(p, a.planId);
    if (name === "learning_save_assignment_plan") {
      const row = this.db
        .prepare("SELECT * FROM assignment_plans WHERE id=?")
        .get(a.planId) as any;
      if (row) {
        this.plan(p, a.planId);
        if (row.state === "cancelled")
          reject("FORBIDDEN", "Cancelled plan is immutable; create a new plan");
      }
    }
    if (
      name === "learning_read_notification" &&
      !this.db
        .prepare(
          "SELECT 1 FROM learning_notifications WHERE id=? AND learner=? AND tenant=?",
        )
        .get(a.notificationId, p.id, p.tenant)
    )
      reject("FORBIDDEN", "Notification access denied");
  }
  private notify(
    p: Principal,
    cycleId: string,
    learner: string,
    kind: string,
    title: string,
    now: string,
  ) {
    const inserted = this.db
      .prepare(
        "INSERT OR IGNORE INTO learning_notifications VALUES(?,?,?,?,?,?,?,NULL)",
      )
      .run(randomUUID(), p.tenant, learner, cycleId, kind, title, now);
    return Number(inserted.changes);
  }
  private advance(p: Principal, learner: string) {
    this.db
      .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
      .run(`learning:${p.tenant}:${learner}`);
  }
  private recipientAvailable(p: Principal, id: string) {
    const u = this.db
      .prepare("SELECT active,manager_id FROM accounts WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    return u?.active && (p.role === "admin" || u.manager_id === p.id);
  }
  private due(s: AssignmentPlan, runAt: string, deliveredAt: string) {
    if (s.dueKind === "fixed" && s.repeatMonths) {
      const due = calendarMonth(s.fixedDueAt!, calendarRunIndex(s, runAt) * s.repeatMonths, s.timeZone!, s.dstChoice!);
      if (due < runAt) reject("INVALID_ARGUMENT", "Calendar deadline precedes its cycle");
      return due;
    }
    return s.dueKind === "none"
      ? null
      : new Date(
          s.dueKind === "fixed"
            ? date(s.fixedDueAt!) + (date(runAt) - date(s.startsAt))
            : date(deliveredAt) + s.rollingDays * day,
        ).toISOString();
  }
  private reconcile(
    p: Principal,
    cycle: any,
    s: AssignmentPlan,
    members: string[],
    now: string,
  ) {
    let changed = 0;
    const current = this.db
      .prepare("SELECT * FROM assignment_deliveries WHERE cycle_id=?")
      .all(cycle.id) as any[];
    const desired = new Set(
      members.filter((id) => {
        if(!this.recipientAvailable(p,id))return false;
        if(s.targetKind==="award"){try{const recipient=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(id,p.tenant) as unknown as Principal;new ProgramService(this.db).requireRecipient(recipient,cycle.target_id,cycle.target_version);return true;}catch{return false;}}
        const recipient=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(id,p.tenant) as unknown as Principal;
        const delivery=current.find(d=>d.learner===id),pinned=delivery?.enrollment_id?(this.db.prepare("SELECT version FROM enrollments WHERE id=?").get(delivery.enrollment_id) as any)?.version:cycle.target_version;
        const raw=this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(cycle.target_id,pinned) as any;if(!raw)return false;const value=JSON.parse(raw.content);
        try{new ContentAccess(this.db).current(recipient,"course",cycle.target_id);return new ContentAccess(this.db).visible(recipient,"course",cycle.target_id,value);}catch{return false;}
      }),
    );
    for (const d of current) {
      const table = d.enrollment_id ? "enrollments" : "award_enrollments",
        id = d.enrollment_id ?? d.award_enrollment_id,
        row = this.db
          .prepare(`SELECT * FROM ${table} WHERE id=?`)
          .get(id) as any;
      const complete = !!row.completed_at;
      if (complete && d.state !== "completed") {
        this.db
          .prepare(
            "UPDATE assignment_deliveries SET state='completed' WHERE cycle_id=? AND learner=?",
          )
          .run(cycle.id, d.learner);
        this.notify(
          p,
          cycle.id,
          d.learner,
          "completed",
          s.title + " completed",
          now,
        );
        this.advance(p, d.learner);
        changed++;
      } else if (!complete && d.state !== "cancelled") {
        const state = desired.has(d.learner) ? "active" : "withdrawn";
        if (d.state !== state) {
          this.db
            .prepare(
              "UPDATE assignment_deliveries SET state=? WHERE cycle_id=? AND learner=?",
            )
            .run(state, cycle.id, d.learner);
          this.db
            .prepare(`UPDATE ${table} SET assignment_state=? WHERE id=?`)
            .run(state, id);
          this.db
            .prepare(
              "UPDATE enrollments SET assignment_state=? WHERE assignment_cycle_id=? AND learner=? AND completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM enrollments successor WHERE successor.retake_of=enrollments.id) AND NOT EXISTS(SELECT 1 FROM award_course_reviews r JOIN award_course_bindings b ON b.id=r.binding_id WHERE r.source_enrollment_id=enrollments.id AND r.state='accepted' AND b.course_enrollment_id!=enrollments.id)",
            )
            .run(state, cycle.id, d.learner);
          releaseInactiveBookings(this.db, p.tenant);
          this.notify(
            p,
            cycle.id,
            d.learner,
            state,
            s.title + " " + state,
            now,
          );
          this.advance(p, d.learner);
          changed++;
        }
      }
      if(d.award_enrollment_id){
        const recipient=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(d.learner,p.tenant) as unknown as Principal;
        const children=this.db.prepare("SELECT e.*,b.pinned_version,b.current_version FROM award_course_bindings b JOIN enrollments e ON e.id=b.course_enrollment_id WHERE b.award_enrollment_id=? AND e.completed_at IS NULL").all(d.award_enrollment_id) as any[];
        for(const child of children){
          let allowed=!!recipient&&desired.has(d.learner)&&d.state!=="cancelled";
          if(allowed){try{const access=new ContentAccess(this.db);access.enrolled(recipient,"course",child.course_id,child.pinned_version);access.enrolled(recipient,"course",child.course_id,child.current_version);access.current(recipient,"course",child.course_id);new AwardCourses(this.db).requireCurrentCourse(recipient,child.id,false);}catch{allowed=false;}}
          const state=d.state==="cancelled"?"cancelled":allowed?"active":"withdrawn";
          if(child.assignment_state!==state){this.db.prepare("UPDATE enrollments SET assignment_state=? WHERE id=?").run(state,child.id);this.advance(p,d.learner);changed++;}
        }
      }
      releaseInactiveBookings(this.db, p.tenant);
    }
    for (const learner of desired) {
      if (current.some((d) => d.learner === learner)) continue;
      if(s.targetKind==="course"){try{const recipient=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(learner,p.tenant) as unknown as Principal;new ContentAccess(this.db).newCourse(recipient,cycle.target_id,cycle.target_version);}catch(error){if(error instanceof DomainError)continue;throw error;}}
      const id = randomUUID(),
        due = this.due(s, cycle.run_at, now);
      if (s.targetKind === "course")
        this.db
          .prepare(
            "INSERT INTO enrollments(id,tenant,learner,course_id,version,assigned_by,due_date,assignment_cycle_id) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            p.tenant,
            learner,
            cycle.target_id,
            cycle.target_version,
            p.id,
            due,
            cycle.id,
          );
      else
        this.db
          .prepare(
            "INSERT INTO award_enrollments(id,tenant,learner,award_id,version,assigned_by,assignment_cycle_id,due_date) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            p.tenant,
            learner,
            cycle.target_id,
            cycle.target_version,
            p.id,
            cycle.id,
            due,
          );
      this.db
        .prepare(
          "INSERT INTO assignment_deliveries(cycle_id,learner,enrollment_id,award_enrollment_id,state,delivered_at) VALUES(?,?,?,?, 'active',?)",
        )
        .run(
          cycle.id,
          learner,
          s.targetKind === "course" ? id : null,
          s.targetKind === "award" ? id : null,
          now,
        );
      this.notify(p, cycle.id, learner, "assigned", s.title, now);
      this.advance(p, learner);
      if (s.targetKind === "award")
        this.programs.refreshLearner(p.tenant, learner);
      changed++;
    }
    return changed;
  }
  refreshCompletionNotifications(
    tenant: string,
    learner: string,
    advanceRevision = true,
  ) {
    const rows = this.db
      .prepare(
        "SELECT d.*,c.definition FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id JOIN assignment_plans p ON p.id=c.plan_id LEFT JOIN enrollments e ON e.id=d.enrollment_id LEFT JOIN award_enrollments a ON a.id=d.award_enrollment_id WHERE p.tenant=? AND d.learner=? AND d.state!='completed' AND COALESCE(e.completed_at,a.completed_at) IS NOT NULL",
      )
      .all(tenant, learner) as any[];
    for (const d of rows) {
      this.db
        .prepare(
          "UPDATE assignment_deliveries SET state='completed' WHERE cycle_id=? AND learner=?",
        )
        .run(d.cycle_id, learner);
      this.notify(
        { tenant } as Principal,
        d.cycle_id,
        learner,
        "completed",
        JSON.parse(d.definition).title + " completed",
        new Date().toISOString(),
      );
    }
    if (rows.length && advanceRevision)
      this.advance({ tenant } as Principal, learner);
    return rows.length;
  }
  private enrollAwardCourse(p: Principal, a: any, authorizeOnly = false) {
    return new AwardCourses(this.db).open(p,a,authorizeOnly);
  }

  // Caller owns an IMMEDIATE transaction. Clock is injectable only in trusted server/tests.
  runDue(tenant: string, now = new Date().toISOString(), maxCycles = 5) {
    date(now);
    let changes = 0,
      cycles = 0;
    const cursor =
      (
        this.db
          .prepare("SELECT after_id FROM assignment_scheduler WHERE tenant=?")
          .get(tenant) as any
      )?.after_id ?? "";
    const select = (operator: string, limit: number) =>
      this.db
        .prepare(
          `SELECT * FROM assignment_plans WHERE tenant=? AND state='active' AND id${operator}? ORDER BY id LIMIT ?`,
        )
        .all(tenant, cursor, limit) as any[];
    const rows = select(">", 20);
    if (rows.length < 20) rows.push(...select("<=", 20 - rows.length));
    if (rows.length)
      this.db
        .prepare(
          "INSERT INTO assignment_scheduler VALUES(?,?) ON CONFLICT(tenant) DO UPDATE SET after_id=excluded.after_id",
        )
        .run(tenant, rows.at(-1).id);
    for (const row of rows) {
      let p: Principal;
      try {
        p = this.principal(row.owner);
      } catch {
        this.db
          .prepare(
            "UPDATE assignment_plans SET state='blocked',last_error='Owner authority revoked' WHERE id=?",
          )
          .run(row.id);
        changes++;
        continue;
      }
      const s = JSON.parse(row.definition) as AssignmentPlan;
      try {
        this.target(p, s, row.target_version);
      } catch {
        this.db
          .prepare(
            "UPDATE assignment_plans SET state='blocked',last_error='Target unavailable' WHERE id=?",
          )
          .run(row.id);
        changes++;
        continue;
      }
      let runAt = row.next_run;
      while (runAt <= now && cycles < maxCycles) {
        if (s.endAt && runAt > s.endAt) {
          this.db
            .prepare("UPDATE assignment_plans SET state='closed' WHERE id=?")
            .run(row.id);
          changes++;
          break;
        }
        const cycleId = createHash("sha256")
            .update(row.id + ":" + runAt)
            .digest("hex"),
          definition = {
            ...s,
            fixedAudience: JSON.parse(row.audience_snapshot),
            groupVersion:
              s.audienceKind === "group"
                ? this.people.group(p, s.groupId).version
                : null,
          };
        const inserted = this.db
          .prepare(
            "INSERT OR IGNORE INTO assignment_cycles VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            cycleId,
            row.id,
            runAt,
            this.due(s, runAt, runAt),
            s.targetKind,
            s.targetId,
            row.target_version,
            JSON.stringify(definition),
          );
        const snapshot = JSON.parse(row.audience_snapshot) as string[];
        let members: string[];
        try {
          members =
            s.membership === "dynamic" ? this.recipients(p, s) : snapshot;
        } catch {
          members = [];
        }
        changes +=
          this.reconcile(
            p,
            {
              id: cycleId,
              run_at: runAt,
              target_id: s.targetId,
              target_version: row.target_version,
            },
            s,
            members,
            now,
          ) + Number(inserted.changes);
        cycles++;
        if (!s.repeatDays && !s.repeatMonths) {
          this.db
            .prepare("UPDATE assignment_plans SET next_run=? WHERE id=?")
            .run("9999-12-31T23:59:59.999Z", row.id);
          changes++;
          break;
        }
        runAt = s.repeatMonths ? nextCalendarRun(s, runAt) : new Date(date(runAt) + s.repeatDays * day).toISOString();
        this.db
          .prepare("UPDATE assignment_plans SET next_run=? WHERE id=?")
          .run(runAt, row.id);
        changes++;
      }
      if(s.endAt&&String(this.db.prepare('SELECT next_run FROM assignment_plans WHERE id=?').get(row.id)!.next_run)>s.endAt){this.db.prepare("UPDATE assignment_plans SET state='closed' WHERE id=?").run(row.id);changes++;}
      const learners = this.db
        .prepare(
          "SELECT DISTINCT d.learner FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id WHERE c.plan_id=?",
        )
        .all(row.id) as any[];
      for (const { learner } of learners)
        changes += this.refreshCompletionNotifications(tenant, learner);
      // Only the latest occurrence admits new dynamic members; older cycles retain history.
      const latest = this.db
        .prepare(
          "SELECT * FROM assignment_cycles WHERE plan_id=? ORDER BY run_at DESC LIMIT 1",
        )
        .get(row.id) as any;
      if (latest) {
        const frozen = JSON.parse(latest.definition) as AssignmentPlan & {
          fixedAudience: string[];
        };
        const members =
          frozen.membership === "dynamic"
            ? this.recipients(p, frozen)
            : frozen.fixedAudience;
        changes += this.reconcile(p, latest, frozen, members, now);
      }
    }
    return {
      cyclesProcessed: cycles,
      changes,
      moreDue: !!this.db
        .prepare(
          "SELECT 1 FROM assignment_plans WHERE tenant=? AND state='active' AND next_run<=?",
        )
        .get(tenant, now),
    };
  }
  runBackground(now = new Date().toISOString()) {
    const tenants = this.db
      .prepare(
        "SELECT DISTINCT tenant FROM assignment_plans WHERE state='active'",
      )
      .all() as any[];
    for (const { tenant } of tenants) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const result = this.runDue(tenant, now);
        if (result.changes) {
          this.db
            .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
            .run(`library:${tenant}`);
          this.db
            .prepare(
              "INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)",
            )
            .run(
              tenant,
              "deterministic-scheduler",
              `library:${tenant}`,
              "assignment_jobs",
              JSON.stringify(result),
              now,
            );
        }
        this.db.exec("COMMIT");
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    }
  }
  read(p: Principal, name: string, a: any): any {
    switch (name) {
      case "learning_get_notifications":
        return boundedPage(
          this.db
            .prepare(
              "SELECT id,cycle_id,kind,title,created_at,read_at FROM learning_notifications WHERE learner=? AND tenant=? ORDER BY created_at DESC,id",
            )
            .all(p.id, p.tenant),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_preview_assignment_plan": {
        const { recipients, ...target } = this.validate(p, a.plan);
        return {
          ...target,
          ...boundedPage(
            recipients.map((id) => ({ id })),
            a.offset ?? 0,
            a.limit ?? 20,
          ),
          policy: {
            membership: a.plan.membership,
            dueKind: a.plan.dueKind,
            recurrenceDays: a.plan.repeatDays,
            ...(a.plan.repeatMonths ? {
              recurrenceMonths: a.plan.repeatMonths, timeZone: a.plan.timeZone, dstChoice: a.plan.dstChoice,
              gapPolicy: "shift_forward", monthEndPolicy: "clamp_to_last_day", nextRuns: calendarPreview(a.plan),
            } : {}),
          },
        };
      }
      case "learning_list_assignment_plans":
        return boundedPage(
          (
            this.db
              .prepare(
                "SELECT * FROM assignment_plans WHERE tenant=? ORDER BY id",
              )
              .all(p.tenant) as any[]
          )
            .filter((row) => p.role === "admin" || row.owner === p.id)
            .map(({ definition, audience_snapshot, ...row }) => ({
              ...row,
              plan: {
                ...JSON.parse(definition),
                learnerIds: JSON.parse(definition).learnerIds.filter(
                  (id: string) =>
                    p.role === "admin" || this.recipientAvailable(p, id),
                ),
              },
              fixedAudienceCount: (
                JSON.parse(audience_snapshot) as string[]
              ).filter(
                (id) => p.role === "admin" || this.recipientAvailable(p, id),
              ).length,
              cycleCount: (
                this.db
                  .prepare(
                    "SELECT COUNT(*) n FROM assignment_cycles WHERE plan_id=?",
                  )
                  .get(row.id) as any
              ).n,
            })),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      default:
        reject("UNSUPPORTED", "Unknown assignment read");
    }
  }
  write(p: Principal, name: string, a: any): any {
    switch (name) {
      case "learning_enroll_award_course":
        return this.enrollAwardCourse(p, a);
      case "learning_read_notification":
        this.db
          .prepare(
            "UPDATE learning_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND learner=? AND tenant=?",
          )
          .run(new Date().toISOString(), a.notificationId, p.id, p.tenant);
        return { notificationId: a.notificationId, read: true };
      case "learning_save_assignment_plan": {
        if (!idPattern.test(a.planId) || !a.reason.trim())
          reject("INVALID_ARGUMENT", "Plan ID and change reason required");
        const checked = this.validate(p, a.plan),
          old = this.db
            .prepare("SELECT * FROM assignment_plans WHERE id=?")
            .get(a.planId) as any;
        let next = a.plan.startsAt;
        const last = old
          ? (this.db
              .prepare(
                "SELECT run_at FROM assignment_cycles WHERE plan_id=? ORDER BY run_at DESC LIMIT 1",
              )
              .get(old.id) as any)
          : null;
        if (last && next <= last.run_at) {
          next = a.plan.repeatMonths ? nextCalendarRun(a.plan, last.run_at) : a.plan.repeatDays
            ? new Date(
                date(next) +
                  (Math.floor(
                    (date(last.run_at) - date(next)) /
                      (a.plan.repeatDays * day),
                  ) +
                    1) *
                    a.plan.repeatDays *
                    day,
              ).toISOString()
            : "9999-12-31T23:59:59.999Z";
        }
        this.db
          .prepare(
            "INSERT INTO assignment_plans VALUES(?,?,?,'active',?,?,?,1,?,NULL) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,state='active',definition=excluded.definition,target_version=excluded.target_version,audience_snapshot=excluded.audience_snapshot,version=assignment_plans.version+1,next_run=excluded.next_run,last_error=NULL",
          )
          .run(
            a.planId,
            p.tenant,
            p.id,
            JSON.stringify(a.plan),
            checked.version,
            JSON.stringify(checked.recipients),
            next,
          );
        return {
          planId: a.planId,
          version: this.plan(p, a.planId).version,
          targetVersion: checked.version,
          fixedAudienceCount: checked.recipients.length,
          existingCyclesPreserved: true,
        };
      }
      case "learning_set_assignment_plan_state": {
        const row = this.plan(p, a.planId);
        if (!a.reason.trim() || row.state === "cancelled")
          reject(
            "FORBIDDEN",
            "Reason required; cancelled plans cannot reactivate",
          );
        this.db
          .prepare(
            "UPDATE assignment_plans SET state=?,last_error=NULL WHERE id=?",
          )
          .run(a.state, row.id);
        let cancelled = 0;
        if (a.state === "cancelled") {
          const rows = this.db
            .prepare(
              "SELECT d.* FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id WHERE c.plan_id=? AND d.state IN ('active','withdrawn')",
            )
            .all(row.id) as any[];
          for (const d of rows) {
            const table = d.enrollment_id ? "enrollments" : "award_enrollments",
              id = d.enrollment_id ?? d.award_enrollment_id;
            const progress = this.db
              .prepare(`SELECT completed_at FROM ${table} WHERE id=?`)
              .get(id) as any;
            if (progress.completed_at) continue;
            this.db
              .prepare(
                "UPDATE assignment_deliveries SET state='cancelled' WHERE cycle_id=? AND learner=?",
              )
              .run(d.cycle_id, d.learner);
            this.db
              .prepare(
                `UPDATE ${table} SET assignment_state='cancelled' WHERE id=?`,
              )
              .run(id);
            this.db
              .prepare(
                "UPDATE enrollments SET assignment_state='cancelled' WHERE assignment_cycle_id=? AND learner=? AND completed_at IS NULL AND NOT EXISTS(SELECT 1 FROM enrollments successor WHERE successor.retake_of=enrollments.id) AND NOT EXISTS(SELECT 1 FROM award_course_reviews r JOIN award_course_bindings b ON b.id=r.binding_id WHERE r.source_enrollment_id=enrollments.id AND r.state='accepted' AND b.course_enrollment_id!=enrollments.id)",
              )
              .run(d.cycle_id, d.learner);
            releaseInactiveBookings(this.db, p.tenant);
            this.notify(
              p,
              d.cycle_id,
              d.learner,
              "cancelled",
              JSON.parse(row.definition).title + " cancelled",
              new Date().toISOString(),
            );
            this.advance(p, d.learner);
            cancelled++;
          }
        }
        return {
          planId: row.id,
          state: a.state,
          cancelled,
          historyPreserved: true,
        };
      }
      case "learning_run_assignment_jobs":
        return this.runDue(p.tenant);
      default:
        reject("UNSUPPORTED", "Unknown assignment write");
    }
  }
}
