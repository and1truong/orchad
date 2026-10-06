import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {courseRestartFixture} from "./course-restart-fixture.ts";
import {assignedQuizFixture,offerAssigned} from "./assigned-quiz-fixture.ts";
import {data} from "./helpers.ts";
function setup(mode="objective"){return courseRestartFixture(mode,":memory:",true);}
const offer=(f:ReturnType<typeof setup>,overrides:any={})=>f.call("manager","human_offer_assigned_quiz_restart",{sourceEnrollmentId:f.e.enrollmentId,targetVersion:2,mode:"fresh_course",previousReviewId:null,confirmed:true},"human",overrides);
const accept=(f:ReturnType<typeof setup>,reviewId:string,overrides:any={})=>f.call("learner-a","human_accept_assigned_quiz_restart",{reviewId,targetVersion:2,mode:"fresh_course",confirmed:true},"human",overrides);
test("separately confirmed full assigned course starts empty with original due date/assigner and immutable prior failed learning",()=>{
 const f=setup();try{
  const source=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId)!,attempt=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),review=data(offer(f));assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId),source);assert.equal(review.mode,"fresh_course");
  const shown=data(f.call("learner-a","human_get_assigned_quiz_review",{sourceEnrollmentId:f.e.enrollmentId},"human"));assert.equal(shown.mode,"fresh_course");assert.equal(shown.title,f.next.title);
  assert.equal(f.call("learner-a","human_accept_assigned_quiz_restart",{reviewId:review.reviewId,targetVersion:2,confirmed:true},"human").ok,false);assert.equal(f.call("manager","human_accept_assigned_quiz_restart",{reviewId:review.reviewId,targetVersion:2,mode:"fresh_course",confirmed:true},"human").ok,false);
  const result=data(accept(f,review.reviewId)),row=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(result.enrollmentId)!;assert.equal(row.completed_lessons,"[]");assert.equal(row.version,2);assert.equal(row.due_date,source.due_date);assert.equal(row.assigned_by,"manager");assert.equal(row.status,"in_progress");assert.equal(f.db.prepare("SELECT count(*) n FROM attempts WHERE enrollment_id=?").get(row.id)!.n,0);assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),attempt);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
 }finally{f.db.close();}
});
test("pending/resolved essay is gated for both coordinator offer and learner acceptance, without carrying any official grade",()=>{
 const f=setup("essay");try{
  assert.equal(offer(f).ok,false);data(f.call("assessor","human_assess_answer",{attemptId:f.at.attemptId,questionId:"essay",points:0,reason:"Original resolved failed reasoning"},"human"));const before=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),review=data(offer(f)),result=data(accept(f,review.reviewId));assert.equal(f.db.prepare("SELECT completed_lessons FROM enrollments WHERE id=?").get(result.enrollmentId)!.completed_lessons,"[]");assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),before);
 }finally{f.db.close();}
});
test("new pending submission after offer blocks acceptance; current human assessor resolves it before a fresh assigned record can be created",()=>{
 const f=setup("submission");try{
  const review=data(offer(f)),p=f.service.principal("learner-a"),file=f.service.media.upload(p,{purpose:"submission",enrollmentId:f.e.enrollmentId,lessonId:"submission",filename:"original.pdf",mime:"application/pdf",confirmed:"true",key:randomUUID(),revision:String(f.service.context("learner-a").revision)},Buffer.from("%PDF-1.4\nOriginal assigned evidence\n%%EOF")),sub=data(f.call("learner-a","human_submit_submission",{enrollmentId:f.e.enrollmentId,lessonId:"submission",assetId:file.id,confirmed:true},"human"));
  assert.equal(accept(f,review.reviewId).ok,false);assert.equal(f.db.prepare("SELECT state FROM assigned_quiz_reviews WHERE id=?").get(review.reviewId)!.state,"pending");data(f.call("assessor","human_assess_submission",{submissionId:sub.submissionId,points:0,reason:"Original failed assigned evidence"},"human"));const result=data(accept(f,review.reviewId));assert.equal(f.db.prepare("SELECT count(*) n FROM submissions WHERE enrollment_id=?").get(result.enrollmentId)!.n,0);assert.equal(f.db.prepare("SELECT state FROM submissions WHERE id=?").get(sub.submissionId)!.state,"failed");
 }finally{f.db.close();}
});
test("new booked event after offer blocks acceptance until explicit learner cancellation; no silent cancellation or attendance",()=>{
 const f=setup("event");try{
  const review=data(offer(f)),booking=data(f.call("learner-a","learning_book_session",{enrollmentId:f.e.enrollmentId,lessonId:"event",sessionId:"original"}));assert.equal(accept(f,review.reviewId).ok,false);assert.equal(f.db.prepare("SELECT state FROM bookings WHERE id=?").get(booking.bookingId)!.state,"booked");data(f.call("learner-a","learning_cancel_booking",{bookingId:booking.bookingId},"human"));const before=f.db.prepare("SELECT * FROM bookings WHERE id=?").get(booking.bookingId),result=data(accept(f,review.reviewId));assert.deepEqual(f.db.prepare("SELECT * FROM bookings WHERE id=?").get(booking.bookingId),before);assert.equal(f.db.prepare("SELECT count(*) n FROM bookings WHERE enrollment_id=?").get(result.enrollmentId)!.n,0);
 }finally{f.db.close();}
});
test("original exact-mode receipt is current-authority bound; wrong mode/new key/relationship loss cannot replay or create another successor",()=>{
 const f=setup();try{
  const review=data(offer(f)),args={reviewId:review.reviewId,targetVersion:2,mode:"fresh_course",confirmed:true},call={requestId:"assigned-full",documentId:f.service.personal(f.service.principal("learner-a")),toolName:"human_accept_assigned_quiz_restart",arguments:args,expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"assigned-full-original-key"};
  const result=f.service.invoke("learner-a",call,"human");assert.equal(result.ok,true);assert.deepEqual(f.service.invoke("learner-a",call,"human"),result);assert.equal(f.service.invoke("learner-a",{...call,arguments:{...args,mode:"objective_only"}},"human").ok,false);assert.equal(accept(f,review.reviewId).ok,false);
  f.db.prepare("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'").run();assert.equal(f.service.invoke("learner-a",call,"human").ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!.n,1);
 }finally{f.db.close();}
});
test("full-mode acceptance audit failure rolls back both workspaces/review/source/successor; live objective offer cannot be silently replaced",()=>{
 const f=setup();try{
  const review=data(offer(f)),before=JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all());f.db.exec("CREATE TRIGGER reject_full_audit BEFORE INSERT ON audit WHEN NEW.tool='human_accept_assigned_quiz_restart' BEGIN SELECT RAISE(ABORT,'full restart fixture'); END;");assert.equal(accept(f,review.reviewId).ok,false);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all()),before);assert.equal(f.db.prepare("SELECT state FROM assigned_quiz_reviews WHERE id=?").get(review.reviewId)!.state,"pending");assert.equal(f.db.prepare("SELECT assignment_state FROM enrollments WHERE id=?").get(f.e.enrollmentId)!.assignment_state,"active");assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!.n,0);
 }finally{f.db.close();}
 const g=assignedQuizFixture();try{const existing=data(offerAssigned(g));assert.equal(g.call("manager","human_offer_assigned_quiz_restart",{sourceEnrollmentId:g.e.enrollmentId,targetVersion:2,mode:"fresh_course",previousReviewId:existing.reviewId,confirmed:true},"human").ok,false);assert.equal(g.db.prepare("SELECT count(*) n FROM assigned_quiz_reviews").get()!.n,1);}finally{g.db.close();}
});
