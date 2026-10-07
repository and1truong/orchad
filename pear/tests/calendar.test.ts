import {test} from "node:test";
import assert from "node:assert/strict";
import {calendarMonth, nextCalendarRun, calendarRunIndex} from "../src/shared/calendar.ts";
import type {AssignmentPlan} from "../src/shared/assignments.ts";
import {fixture, data} from "./helpers.ts";
const plan = (extra: Partial<AssignmentPlan> = {}): AssignmentPlan => ({
  title: "Calendar-month practice", targetKind: "course", targetId: "systems-basics",
  audienceKind: "individuals", learnerIds: ["learner-a"], groupId: "", membership: "fixed",
  startsAt: "2026-01-31T13:00:00.000Z", repeatDays: 0, repeatMonths: 1,
  timeZone: "America/New_York", dstChoice: "earlier", endAt: null,
  dueKind: "fixed", fixedDueAt: "2026-02-02T13:00:00.000Z", rollingDays: 0, ...extra,
});
const save = (f: ReturnType<typeof fixture>, value = plan()) => data(f.call("admin",
  "learning_save_assignment_plan", {planId:"calendar-plan", plan:value, reason:"Reviewed calendar anchor and audience"}));
test("calendar months retain original month-end anchor and local clock across leap years and DST", () => {
  const first = "2026-01-31T13:00:00.000Z";
  assert.equal(calendarMonth(first, 1, "America/New_York", "earlier"), "2026-02-28T13:00:00.000Z");
  assert.equal(calendarMonth(first, 2, "America/New_York", "earlier"), "2026-03-31T12:00:00.000Z");
  assert.equal(calendarMonth(first, 3, "America/New_York", "earlier"), "2026-04-30T12:00:00.000Z");
  assert.equal(calendarMonth("2024-01-31T00:00:00.000Z", 1, "UTC", "earlier"), "2024-02-29T00:00:00.000Z");
  assert.equal(calendarMonth(first, 12, "America/New_York", "earlier"), "2027-01-31T13:00:00.000Z");
  assert.equal(nextCalendarRun(plan(), "2026-03-31T12:00:00.000Z"), "2026-04-30T12:00:00.000Z");
  assert.equal(calendarRunIndex(plan(), "2026-03-31T12:00:00.000Z"), 2);
});
test("missing and repeated wall times resolve explicitly, including half-hour, quarter-hour and skipped-day transitions", () => {
  assert.equal(calendarMonth("2026-02-08T07:30:00.000Z", 1, "America/New_York", "earlier"), "2026-03-08T07:30:00.000Z");
  assert.equal(calendarMonth("2026-02-08T07:30:00.000Z", 2, "America/New_York", "earlier"), "2026-04-08T06:30:00.000Z");
  assert.equal(calendarMonth("2026-10-01T05:30:00.000Z", 1, "America/New_York", "earlier"), "2026-11-01T05:30:00.000Z");
  assert.equal(calendarMonth("2026-10-01T05:30:00.000Z", 1, "America/New_York", "later"), "2026-11-01T06:30:00.000Z");
  assert.equal(calendarMonth("2026-09-03T15:45:00.000Z", 1, "Australia/Lord_Howe", "earlier"), "2026-10-03T15:45:00.000Z");
  assert.equal(calendarMonth("2011-11-30T22:30:00.000Z", 1, "Pacific/Apia", "earlier"), "2011-12-30T22:30:00.000Z");
  assert.equal(calendarMonth("1985-11-30T18:30:00.000Z", 1, "Asia/Kathmandu", "earlier"), "1985-12-31T18:30:00.000Z");
});
test("monthly scheduler pins independent cycles and calendar deadlines; editing skips delivered instants without rewriting history", () => {
  const f=fixture();
  try {
    save(f); f.service.assignments.runBackground("2026-03-31T12:00:00.000Z");
    let cycles=f.db.prepare("SELECT * FROM assignment_cycles ORDER BY run_at").all() as any[];
    assert.deepEqual(cycles.map(c=>c.run_at), ["2026-01-31T13:00:00.000Z","2026-02-28T13:00:00.000Z","2026-03-31T12:00:00.000Z"]);
    assert.deepEqual(cycles.map(c=>c.due_date), ["2026-02-02T13:00:00.000Z","2026-03-02T13:00:00.000Z","2026-04-02T12:00:00.000Z"]);
    const before=JSON.stringify(cycles);
    f.service.assignments.runBackground("2026-03-31T12:00:00.000Z");
    assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM assignment_cycles ORDER BY run_at").all()), before);
    save(f,plan({repeatMonths:2}));
    assert.equal(f.db.prepare("SELECT next_run FROM assignment_plans WHERE id='calendar-plan'").get()!.next_run,"2026-05-31T12:00:00.000Z");
    f.service.assignments.runBackground("2026-05-31T12:00:00.000Z");
    cycles=f.db.prepare("SELECT * FROM assignment_cycles ORDER BY run_at").all() as any[];
    assert.equal(JSON.stringify(cycles.slice(0,3)),before);
    assert.equal(cycles[3].due_date,"2026-06-02T12:00:00.000Z");
    assert.equal(JSON.parse(cycles[3].definition).repeatMonths,2);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM enrollments").get()!.n,4);
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
  } finally {f.db.close();}
});
test("monthly fixed wall-clock deadlines differ from rolling elapsed UTC-day offsets at a DST gap", () => {
  const f=fixture();
  try {
    save(f,plan({startsAt:"2026-02-08T07:30:00.000Z",fixedDueAt:"2026-02-09T07:30:00.000Z"}));
    f.service.assignments.runBackground("2026-03-08T07:30:00.000Z");
    const c=f.db.prepare("SELECT * FROM assignment_cycles ORDER BY run_at DESC LIMIT 1").get() as any;
    assert.equal(c.run_at,"2026-03-08T07:30:00.000Z"); assert.equal(c.due_date,"2026-03-09T06:30:00.000Z");
    assert.equal(Date.parse(c.due_date)-Date.parse(c.run_at),23*3600000);
    const rolling=plan({startsAt:"2026-02-08T07:30:00.000Z",dueKind:"rolling",fixedDueAt:null,rollingDays:1});
    data(f.call("admin","learning_save_assignment_plan",{planId:"rolling-calendar",plan:rolling,reason:"Reviewed rolling policy"}));
    f.service.assignments.runBackground("2026-03-08T07:30:00.000Z");
    const e=f.db.prepare("SELECT e.* FROM enrollments e JOIN assignment_cycles c ON c.id=e.assignment_cycle_id WHERE c.plan_id='rolling-calendar' AND c.run_at=?").get(c.run_at) as any;
    assert.equal(e.due_date,"2026-03-09T07:30:00.000Z");
  } finally {f.db.close();}
});
test("calendar validation fails closed for mixed cadence, missing/unknown timezone, invalid fold choice and deadline before future cycle", () => {
  const f=fixture();
  try {
    for(const invalid of [plan({repeatDays:1}),plan({timeZone:undefined}),plan({dstChoice:undefined}),plan({timeZone:"America/Mars"}),plan({timeZone:"+07:00"}),plan({repeatMonths:0}),plan({repeatMonths:13}),
      plan({startsAt:"2026-02-08T07:30:00.000Z",fixedDueAt:"2026-02-08T08:00:00.000Z"})]) {
      const result=f.call("admin","learning_save_assignment_plan",{planId:"invalid-calendar",plan:invalid,reason:"Validation fixture"});
      assert.equal(result.error?.code,"INVALID_ARGUMENT");
    }
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM assignment_plans").get()!.n,0);
    assert.throws(()=>calendarMonth("1969-01-31T00:00:00.000Z",1,"UTC","earlier"), /1970/);
    assert.throws(()=>calendarMonth("9998-12-31T00:00:00.000Z",1,"UTC","earlier"), /9998/);
  } finally {f.db.close();}
});
test("calendar cursor/deadline rules survive restart and retain bounded catchup", async () => {
  const {mkdtempSync,rmSync}=await import("node:fs"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
  const dir=mkdtempSync(join(tmpdir(),"pear-calendar-")); let f=fixture(join(dir,"calendar.sqlite"));
  try {
    save(f); f.service.assignments.runBackground("2026-12-31T13:00:00.000Z");
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM assignment_cycles").get()!.n,5);
    const cursor=f.db.prepare("SELECT next_run FROM assignment_plans").get()!.next_run;
    f.db.close(); f=fixture(join(dir,"calendar.sqlite"));
    assert.equal(f.db.prepare("SELECT next_run FROM assignment_plans").get()!.next_run,cursor);
    f.service.assignments.runBackground("2026-12-31T13:00:00.000Z");
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM assignment_cycles").get()!.n,10);
    assert.equal(f.db.prepare("SELECT COUNT(DISTINCT assignment_cycle_id) AS n FROM enrollments").get()!.n,10);
    assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
  } finally {f.db.close();rmSync(dir,{recursive:true,force:true});}
});
