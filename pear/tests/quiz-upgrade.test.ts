import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
function setup(path=":memory:"){
 const f=fixture(path),value={...structuredClone(courses["learning-vi"]),title:"Original objective upgrade",language:"en",quiz:{passScore:100,maxAttempts:2,questions:[{id:"question",prompt:"Original old question",options:["Alpha","Beta"],correct:0}]}};
 data(f.call("editor","learning_create_course",{courseId:"upgrade-course",course:value}));data(f.call("editor","learning_publish_course",{courseId:"upgrade-course"}));const e=data(f.call("learner-a","learning_enroll",{courseId:"upgrade-course"}));
 for(const l of value.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));
 const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:"question",answer:1},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));
 const next={...value,quiz:{...value.quiz,questions:[{id:"new-question",prompt:"Original replacement quiz",options:["New correct","New incorrect"],correct:0}]}};
 data(f.call("editor","learning_update_course",{courseId:"upgrade-course",course:next}));data(f.call("editor","learning_publish_course",{courseId:"upgrade-course"}));return {...f,e,at,value,next};
}
const review=(f:ReturnType<typeof setup>)=>data(f.call("learner-a","human_get_latest_quiz_options",{enrollmentId:f.e.enrollmentId},"human"));
const upgrade=(f:ReturnType<typeof setup>,overrides:any={})=>f.call("learner-a","human_restart_latest_quiz",{enrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true},"human",overrides);
test("explicit latest objective quiz creates fresh immutable successor retaining identical completed lessons, never editing old failed answers or producing synthetic completion",()=>{
 const f=setup();try{
  const old=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),before=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId)!;assert.equal(review(f).available,true);assert.equal(before.version,1);
  const result=data(upgrade(f)),fresh=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(result.enrollmentId)!;assert.equal(fresh.version,2);assert.equal(fresh.completed_lessons,before.completed_lessons);assert.equal(fresh.status,"in_progress");assert.equal(fresh.completed_at,null);assert.equal(f.db.prepare("SELECT assignment_state FROM enrollments WHERE id=?").get(f.e.enrollmentId)!.assignment_state,"withdrawn");assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),old);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
  assert.equal(f.call("learner-a","learning_start_attempt",{enrollmentId:f.e.enrollmentId}).ok,false);const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:result.enrollmentId})),read=data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human"));assert.deepEqual(read.answers,{});assert.equal(read.questions[0].id,"new-question");data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:"new-question",answer:0},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));assert.equal(f.db.prepare("SELECT status FROM enrollments WHERE id=?").get(result.enrollmentId)!.status,"completed");assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),old);
 }finally{f.db.close();}
});
test("review alone keeps enrolled quiz; invalid target/nonquiz edits and assigned learning fail without changing source",()=>{
 const f=setup();try{
  const old=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId);review(f);assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),old);
  assert.equal(f.call("learner-a","human_restart_latest_quiz",{enrollmentId:f.e.enrollmentId,targetVersion:1,confirmed:true},"human").ok,false);assert.equal(f.call("learner-a","human_restart_latest_quiz",{enrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true}).ok,false);assert.equal(f.call("learner-b","human_get_latest_quiz_options",{enrollmentId:f.e.enrollmentId},"human").ok,false);
  f.db.prepare("UPDATE enrollments SET assigned_by='admin' WHERE id=?").run(f.e.enrollmentId);assert.equal(upgrade(f).ok,false);f.db.prepare("UPDATE enrollments SET assigned_by=NULL WHERE id=?").run(f.e.enrollmentId);
  data(f.call("editor","learning_update_course",{courseId:"upgrade-course",course:{...f.next,title:"Changed nonquiz title"}}));data(f.call("editor","learning_publish_course",{courseId:"upgrade-course"}));assert.equal(review(f).available,false);assert.equal(upgrade(f).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),old);
 }finally{f.db.close();}
});
test("original upgrade receipt survives immediate retry but duplicate new operation and lost current content rights are denied",()=>{
 const f=setup();try{
  const override={idempotencyKey:"upgrade-original",expectedRevision:f.service.context("learner-a").revision},result=upgrade(f,override);data(result);assert.deepEqual(upgrade(f,override),result);assert.equal(upgrade(f).ok,false);
  f.db.prepare("UPDATE accounts SET tenant='other' WHERE id='learner-a'").run();assert.equal(f.service.invoke("learner-a",{requestId:"revoked-original-upgrade",documentId:"learning:demo:learner-a",toolName:"human_restart_latest_quiz",arguments:{enrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true},...override},"human").ok,false);
 }finally{f.db.close();}
});
test("audit failure rolls withdrawal, successor, key and revision back atomically",()=>{
 const f=setup();try{
  const old=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),revision=f.service.context("learner-a").revision;
  f.db.exec("CREATE TRIGGER upgrade_abort BEFORE INSERT ON audit WHEN NEW.tool='human_restart_latest_quiz' BEGIN SELECT RAISE(ABORT,'upgrade fixture'); END;");assert.equal(upgrade(f).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),old);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!.n,0);assert.equal(f.service.context("learner-a").revision,revision);f.db.exec("DROP TRIGGER upgrade_abort");data(upgrade(f));
 }finally{f.db.close();}
});
test("actual SQLite reopen retains old quiz/result and new objective successor progress",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-quiz-upgrade-"));let f=setup(join(dir,"store.sqlite"));try{
  const old=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),fresh=data(upgrade(f)),e=f.e,at=f.at,value=f.value,next=f.next;f.db.close();f={...fixture(join(dir,"store.sqlite")),e,at,value,next};assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(at.attemptId),old);assert.equal(f.db.prepare("SELECT version FROM enrollments WHERE id=?").get(fresh.enrollmentId)!.version,2);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
