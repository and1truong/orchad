import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {DigestService} from "../src/server/digest.ts";
test("own digest respects pinned prerequisites/withdrawal, due priority, budget honesty, private scope and unchanged official records",()=>{
 const f=fixture();try{
  const own=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));
  data(f.call("learner-b","learning_enroll",{courseId:"learning-vi"}));
  f.db.prepare("UPDATE enrollments SET due_date='2000-01-01T00:00:00.000Z' WHERE id=?").run(own.enrollmentId);
  data(f.call("admin","learning_unpublish_course",{courseId:"systems-basics"}));
  const before=f.db.prepare("SELECT * FROM enrollments").all(),revision=f.service.context("learner-a","learning:demo:learner-a").revision;
  const r=data(f.call("learner-a","learning_get_digest",{minutes:1,timeZone:"Asia/Ho_Chi_Minh",limit:5}));
  assert.equal(r.items.length,1);const c=r.items[0];assert.equal(c.id,"systems-basics");assert.equal(c.version,1);assert.equal(c.enrollmentId,own.enrollmentId);assert.equal(c.overdue,true);assert.equal(c.action,"open_lesson");
  assert.equal(c.remainingMinutes,null);assert.equal(c.fitsWholeContentBudget,false);assert.ok(c.intendedMinutes>1);
  const version=JSON.parse(f.db.prepare("SELECT content FROM course_versions WHERE course_id='systems-basics' AND version=1").get()!.content as string);
  assert.equal(c.lessonId,version.lessons[0].id);
  const wire=JSON.stringify(r);for(const x of ["answers","correct","password","csrf","external_records","learner-b","learning-vi"])assert.equal(wire.includes(x),false);
  assert.deepEqual(f.db.prepare("SELECT * FROM enrollments").all(),before);assert.equal(f.service.context("learner-a","learning:demo:learner-a").revision,revision);
  const other=data(f.call("learner-b","learning_get_digest",{minutes:1}));assert.equal(other.items.some((x:any)=>x.id==="systems-basics"),false);
  assert.equal(data(f.call("outsider","learning_get_digest")).items.length,0);
  assert.equal(f.call("learner-a","learning_get_digest",{learnerId:"learner-b"}).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.call("learner-a","learning_get_digest",{timeZone:"Mars/Arbitrary"}).error?.code,"INVALID_ARGUMENT");
  for(const args of [{minutes:0},{minutes:1441},{limit:6}])assert.equal(f.call("learner-a","learning_get_digest",args).error?.code,"INVALID_ARGUMENT");
  f.db.prepare("UPDATE enrollments SET assignment_state='cancelled' WHERE id=?").run(own.enrollmentId);
  assert.equal(data(f.call("learner-a","learning_get_digest",{minutes:1})).items.length,0);
 }finally{f.db.close();}
});
test("digest displays exact UTC plus selected zone/DST, stable whole-row bounds, eligible next prerequisites and completed exclusion",()=>{
 const f=fixture();try{
  const own=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));const v=JSON.parse(f.db.prepare("SELECT content FROM course_versions WHERE course_id='systems-basics' AND version=1").get()!.content as string);
  f.db.prepare("UPDATE enrollments SET due_date='2026-03-08T07:30:00.000Z',completed_lessons=? WHERE id=?").run(JSON.stringify([v.lessons[0].id]),own.enrollmentId);
  const service=new DigestService(f.db,()=>new Date("2026-03-08T07:00:00Z"));
  const a=service.read(f.service.principal("learner-a"),{timeZone:"America/New_York",minutes:1,limit:1},"bridge");
  assert.equal(a.items.length,1);assert.equal(a.items[0].dueAt,"2026-03-08T07:30:00.000Z");assert.ok(a.items[0].dueLocal.includes("3:30"));assert.equal(a.items[0].overdue,false);assert.equal(a.items[0].lessonId,v.lessons[1].id);
  assert.deepEqual(service.read(f.service.principal("learner-a"),{timeZone:"America/New_York",minutes:1,limit:1},"bridge"),a);
  f.db.prepare("UPDATE enrollments SET completed_lessons=? WHERE id=?").run(JSON.stringify(v.lessons.map((l:any)=>l.id)),own.enrollmentId);
  assert.equal(service.read(f.service.principal("learner-a"),{minutes:1},"bridge").items[0].action,"review_assessment");
  f.db.prepare("UPDATE enrollments SET status='completed',completed_at='2026-03-08T07:00:00Z' WHERE id=?").run(own.enrollmentId);
  assert.equal(service.read(f.service.principal("learner-a"),{minutes:1},"bridge").items.length,0);
 }finally{f.db.close();}
});
