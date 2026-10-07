import {test} from "node:test";
import assert from "node:assert/strict";
import {assignedQuizFixture,offerAssigned,acceptAssigned} from "./assigned-quiz-fixture.ts";
import {fixture,data} from "./helpers.ts";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const renew=(f:ReturnType<typeof assignedQuizFixture>,previousReviewId:string,overrides:any={})=>f.call("manager","human_offer_assigned_quiz_restart",{sourceEnrollmentId:f.e.enrollmentId,targetVersion:2,previousReviewId,confirmed:true},"human",overrides);
const cancel=(f:ReturnType<typeof assignedQuizFixture>,reviewId:string,user="manager",overrides:any={})=>f.call(user,"human_cancel_assigned_quiz_review",{reviewId,confirmed:true},"human",overrides);
test("expired review is renewed only after explicit latest-review choice, preserving expired history and official learning",()=>{
 const f=assignedQuizFixture();try{
  const key="old-review-original-key",originalArgs={sourceEnrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true};
  const call={requestId:"old",documentId:f.service.library(f.service.principal("manager")),toolName:"human_offer_assigned_quiz_restart",arguments:originalArgs,expectedRevision:f.service.context("manager",f.service.library(f.service.principal("manager"))).revision,idempotencyKey:key};
  const old=data(f.service.invoke("manager",call,"human")),before=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId);
  f.db.prepare("UPDATE assigned_quiz_reviews SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(old.reviewId);
  assert.equal(f.service.invoke("manager",call,"human").ok,false);assert.equal(offerAssigned(f).ok,false);assert.equal(renew(f,"guessed-review").ok,false);
  const current=data(f.call("manager","human_get_assigned_quiz_review",{sourceEnrollmentId:f.e.enrollmentId},"human"));assert.equal(current.previousReviewId,old.reviewId);assert.equal(current.offer,null);
  const next=data(renew(f,old.reviewId));assert.notEqual(next.reviewId,old.reviewId);assert.equal(f.db.prepare("SELECT previous_review FROM assigned_quiz_reviews WHERE id=?").get(next.reviewId)!.previous_review,old.reviewId);assert.equal(f.db.prepare("SELECT count(*) n FROM assigned_quiz_reviews").get()!.n,2);assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),before);
  assert.equal(acceptAssigned(f,old.reviewId).ok,false);assert.equal(renew(f,old.reviewId).ok,false);assert.equal(acceptAssigned(f,next.reviewId).ok,true);
 }finally{f.db.close();}
});
test("cancellation is current coordinator scoped, original key replay-safe and creates no successor; new explicit review remains independently auditable",()=>{
 const f=assignedQuizFixture();try{
  const old=data(offerAssigned(f)),before=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId);
  assert.equal(cancel(f,old.reviewId,"learner-a").ok,false);assert.equal(f.call("manager","human_cancel_assigned_quiz_review",{reviewId:old.reviewId,confirmed:true}).ok,false);
  const call={requestId:"cancel",documentId:f.service.library(f.service.principal("manager")),toolName:"human_cancel_assigned_quiz_review",arguments:{reviewId:old.reviewId,confirmed:true},expectedRevision:f.service.context("manager",f.service.library(f.service.principal("manager"))).revision,idempotencyKey:"original-cancel-key"};
  const result=f.service.invoke("manager",call,"human");assert.equal(result.ok,true);assert.deepEqual(f.service.invoke("manager",call,"human"),result);assert.equal(cancel(f,old.reviewId).ok,false);assert.equal(acceptAssigned(f,old.reviewId).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),before);
  const next=data(renew(f,old.reviewId));assert.equal(f.db.prepare("SELECT state FROM assigned_quiz_reviews WHERE id=?").get(old.reviewId)!.state,"cancelled");assert.equal(acceptAssigned(f,next.reviewId).ok,true);assert.equal(cancel(f,next.reviewId).ok,false);
  f.db.prepare("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'").run();assert.equal(f.service.invoke("manager",call,"human").ok,false);
 }finally{f.db.close();}
});
test("cancel audit failure rolls back review state, both revisions and receipt; live review blocks duplicate offer",()=>{
 const f=assignedQuizFixture();try{
  const old=data(offerAssigned(f));assert.equal(offerAssigned(f).ok,false);assert.equal(renew(f,old.reviewId).ok,false);const before=JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all()),receipts=f.db.prepare("SELECT count(*) n FROM idempotency").get()!.n;
  f.db.exec("CREATE TRIGGER reject_cancel_audit BEFORE INSERT ON audit WHEN NEW.tool='human_cancel_assigned_quiz_review' BEGIN SELECT RAISE(ABORT,'cancel fixture'); END;");
  assert.equal(cancel(f,old.reviewId).ok,false);assert.equal(f.db.prepare("SELECT state FROM assigned_quiz_reviews WHERE id=?").get(old.reviewId)!.state,"pending");assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all()),before);assert.equal(f.db.prepare("SELECT count(*) n FROM idempotency").get()!.n,receipts);
 }finally{f.db.close();}
});
test("real 037 to 040 migration preserves existing reviewed assignment and receipts before renewal",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-review-migrate-")),path=join(dir,"db.sqlite"),f=assignedQuizFixture(path);let reopened:ReturnType<typeof fixture>|null=null;
 try{
  const old=data(offerAssigned(f)),record=f.db.prepare("SELECT id,tenant,source_enrollment,owner,learner,target_version,state,created_at,expires_at,successor FROM assigned_quiz_reviews WHERE id=?").get(old.reviewId)!,sourceEnrollmentId=f.e.enrollmentId,receipts=f.db.prepare("SELECT count(*) n FROM idempotency").get()!.n;
  assert.equal(f.db.prepare("SELECT count(*) n FROM assignment_deliveries").get()!.n,0);
  f.db.exec("DROP TABLE assignment_deliveries;CREATE TABLE assignment_deliveries(cycle_id TEXT NOT NULL REFERENCES assignment_cycles(id),learner TEXT NOT NULL REFERENCES accounts(id),enrollment_id TEXT REFERENCES enrollments(id),award_enrollment_id TEXT REFERENCES award_enrollments(id),state TEXT NOT NULL CHECK(state IN ('active','withdrawn','cancelled','completed')),delivered_at TEXT NOT NULL,PRIMARY KEY(cycle_id,learner));DROP INDEX enrollment_cycle;CREATE UNIQUE INDEX enrollment_cycle ON enrollments(learner,assignment_cycle_id,course_id) WHERE assignment_cycle_id IS NOT NULL;");
  f.db.exec("DROP TABLE scorm_import_jobs; DROP TABLE scorm_sco_attempts; DROP TABLE scorm_engine_attempts; DROP TABLE scorm_registrations; DROP TABLE scorm_engine_resources; DROP TABLE scorm_engine_versions; DROP TABLE scorm_engine_packages; DROP INDEX accounts_id_tenant");f.db.exec("DROP TABLE assigned_quiz_reviews");f.db.exec(readFileSync(new URL("../migrations/037.sql",import.meta.url),"utf8").replace("INSERT INTO schema_version(version) VALUES(37);",""));f.db.prepare("INSERT INTO assigned_quiz_reviews(id,tenant,source_enrollment,owner,learner,target_version,state,created_at,expires_at,successor) VALUES(?,?,?,?,?,?,?,?,?,?)").run(...Object.values(record) as any);f.db.exec("DROP INDEX enrollment_award_binding; DROP INDEX enrollment_direct; DROP INDEX enrollment_cycle; ALTER TABLE enrollments DROP COLUMN award_binding_id; DROP TABLE award_course_reviews; DROP TABLE award_course_bindings; DROP TRIGGER IF EXISTS integration_enrollment_assignment_created; DROP TRIGGER IF EXISTS integration_award_assignment_created; DROP TABLE award_completion_snapshots; DROP TABLE webhook_claim_cursor; CREATE UNIQUE INDEX enrollment_direct ON enrollments(learner,course_id) WHERE assignment_cycle_id IS NULL AND retake_of IS NULL; CREATE UNIQUE INDEX enrollment_cycle ON enrollments(learner,assignment_cycle_id,course_id) WHERE assignment_cycle_id IS NOT NULL; DELETE FROM schema_version WHERE version>=38");f.db.close();reopened=fixture(path);
  assert.deepEqual(reopened.db.prepare("SELECT id,tenant,source_enrollment,owner,learner,target_version,state,created_at,expires_at,successor FROM assigned_quiz_reviews WHERE id=?").get(old.reviewId),record);assert.equal(reopened.db.prepare("SELECT restart_mode FROM assigned_quiz_reviews WHERE id=?").get(old.reviewId)!.restart_mode,"objective_only");assert.equal(reopened.db.prepare("SELECT count(*) n FROM idempotency").get()!.n,receipts);assert.deepEqual(reopened.db.prepare("PRAGMA foreign_key_check").all(),[]);assert.equal(data(reopened.call("learner-a","human_get_assigned_quiz_review",{sourceEnrollmentId},"human")).offer.id,old.reviewId);
 }finally{if(reopened)reopened.db.close();else f.db.close();rmSync(dir,{recursive:true,force:true});}
});
