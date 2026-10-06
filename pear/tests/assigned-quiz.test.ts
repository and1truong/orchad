import {test} from "node:test";
import assert from "node:assert/strict";
import {assignedQuizFixture,offerAssigned,acceptAssigned} from "./assigned-quiz-fixture.ts";
import {data,fixture} from "./helpers.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("separate coordinator and learner confirmations preserve assigned obligation, prior failed result and due date; only new human answers complete",()=>{
 const f=assignedQuizFixture();try{
  const old=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId)!,attempt=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId);
  const review=data(offerAssigned(f));assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),old);
  assert.equal(f.call("manager","human_accept_assigned_quiz_restart",{reviewId:review.reviewId,targetVersion:2,confirmed:true},"human").ok,false);
  const result=data(acceptAssigned(f,review.reviewId)),fresh=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(result.enrollmentId)!;
  assert.equal(fresh.assigned_by,"manager");assert.equal(fresh.due_date,old.due_date);assert.equal(fresh.completed_lessons,old.completed_lessons);assert.equal(fresh.version,2);assert.equal(fresh.status,"in_progress");assert.equal(fresh.completed_at,null);assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),attempt);
  assert.equal(f.call("learner-a","learning_start_attempt",{enrollmentId:f.e.enrollmentId}).ok,false);const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:result.enrollmentId}));
  assert.deepEqual(data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human")).answers,{});
  data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:"new",answer:0},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));assert.equal(f.db.prepare("SELECT status FROM enrollments WHERE id=?").get(result.enrollmentId)!.status,"completed");assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),attempt);
 }finally{f.db.close();}
});
test("current manager relationship, channels and addressed learner gate acceptance before any mutation or old receipt",()=>{
 const f=assignedQuizFixture();try{
  const offer=data(offerAssigned(f)),args={reviewId:offer.reviewId,targetVersion:2,confirmed:true};
  assert.equal(f.call("learner-b","human_accept_assigned_quiz_restart",args,"human").ok,false);assert.equal(f.call("learner-a","human_accept_assigned_quiz_restart",args).ok,false);assert.equal(f.call("learner-a","human_restart_latest_quiz",{enrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true},"human").ok,false);
  const c={requestId:"review",documentId:f.service.personal(f.service.principal("learner-a")),toolName:"human_accept_assigned_quiz_restart",arguments:args,expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"assigned-original-key"};
  const result=f.service.invoke("learner-a",c,"human");assert.equal(result.ok,true);assert.deepEqual(f.service.invoke("learner-a",c,"human"),result);
  f.db.prepare("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'").run();assert.equal(f.service.invoke("learner-a",c,"human").ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!.n,1);
 }finally{f.db.close();}
});
test("changed latest target, expired offer and unrelated edits never silently change the direct assignment",()=>{
 const f=assignedQuizFixture();try{
  const review=data(offerAssigned(f)),before=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId);
  f.db.prepare("UPDATE assigned_quiz_reviews SET expires_at='2000-01-01T00:00:00.000Z'").run();assert.equal(acceptAssigned(f,review.reviewId).ok,false);
  f.db.prepare("UPDATE assigned_quiz_reviews SET expires_at='2099-01-01T00:00:00.000Z'").run();data(f.call("editor","learning_update_course",{courseId:"assigned-quiz-course",course:{...f.next,title:"Changed nonquiz title"}}));data(f.call("editor","learning_publish_course",{courseId:"assigned-quiz-course"}));assert.equal(acceptAssigned(f,review.reviewId).ok,false);assert.equal(offerAssigned(f).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),before);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!.n,0);
 }finally{f.db.close();}
});
test("stale coordinator CAS and failed learner audit atomically roll back review, successor, source state and both workspace revisions",()=>{
 const f=assignedQuizFixture();try{
  assert.equal(offerAssigned(f,{expectedRevision:0}).ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM assigned_quiz_reviews").get()!.n,0);
  const review=data(offerAssigned(f)),before=JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all());
  f.db.exec("CREATE TRIGGER reject_assigned_audit BEFORE INSERT ON audit WHEN NEW.tool='human_accept_assigned_quiz_restart' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  assert.equal(acceptAssigned(f,review.reviewId).ok,false);assert.equal(f.db.prepare("SELECT assignment_state FROM enrollments WHERE id=?").get(f.e.enrollmentId)!.assignment_state,"active");assert.equal(f.db.prepare("SELECT state FROM assigned_quiz_reviews").get()!.state,"pending");assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!.n,0);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all()),before);
 }finally{f.db.close();}
});
test("pending reviewed assignment restart survives database reopen and rejects revoked coordinator authority",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-assigned-")),path=join(dir,"db.sqlite"),f=assignedQuizFixture(path);let reopened:ReturnType<typeof fixture>|null=null;
 try{const review=data(offerAssigned(f)),sourceEnrollmentId=f.e.enrollmentId;f.db.close();reopened=fixture(path);assert.equal(data(reopened.call("learner-a","human_get_assigned_quiz_review",{sourceEnrollmentId},"human")).offer?.id,review.reviewId);reopened.db.prepare("UPDATE accounts SET role='learner' WHERE id='manager'").run();assert.equal(reopened.call("learner-a","human_accept_assigned_quiz_restart",{reviewId:review.reviewId,targetVersion:2,confirmed:true},"human").ok,false);}finally{if(reopened)reopened.db.close();else f.db.close();rmSync(dir,{recursive:true,force:true});}
});
