import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fixture,data} from "./helpers.ts";
import {courseRestartFixture,reviewFresh,restartFresh} from "./course-restart-fixture.ts";
test("nonquiz latest course change restarts from zero after human review; pinned old grades/lessons remain immutable and only fresh work completes",()=>{
 const f=courseRestartFixture();try{
  const before=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),source=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(f.e.enrollmentId)!;
  assert.equal(reviewFresh(f).available,true);assert.equal(f.call("learner-a","human_restart_latest_quiz",{enrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true},"human").ok,false);
  const result=data(restartFresh(f)),row=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(result.enrollmentId)!;assert.equal(row.version,2);assert.equal(row.completed_lessons,"[]");assert.equal(row.assigned_by,null);assert.equal(row.due_date,null);assert.equal(row.status,"in_progress");assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),before);assert.equal(f.db.prepare("SELECT completed_lessons FROM enrollments WHERE id=?").get(f.e.enrollmentId)!.completed_lessons,source.completed_lessons);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
  for(const l of f.next.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:result.enrollmentId,lessonId:l.id},"human"));const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:result.enrollmentId}));assert.deepEqual(data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human")).answers,{});data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:f.next.quiz.questions[0].id,answer:1},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));assert.equal(f.db.prepare("SELECT status FROM enrollments WHERE id=?").get(result.enrollmentId)!.status,"completed");assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),before);
 }finally{f.db.close();}
});
test("pending essay assessment cannot be abandoned; resolved failed essay history permits fresh work but never carries its grade",()=>{
 const f=courseRestartFixture("essay");try{
  assert.equal(reviewFresh(f).pendingOfficialWork,true);assert.equal(restartFresh(f).ok,false);data(f.call("assessor","human_assess_answer",{attemptId:f.at.attemptId,questionId:"essay",points:0,reason:"Original reviewed insufficient reasoning"},"human"));const old=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId);assert.equal(reviewFresh(f).available,true);const result=data(restartFresh(f));assert.equal(f.db.prepare("SELECT count(*) n FROM attempts WHERE enrollment_id=?").get(result.enrollmentId)!.n,0);assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),old);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
 }finally{f.db.close();}
});
test("pending submission remains available for its current assessor; resolved failed evidence is never copied into fresh enrollment",()=>{
 const f=courseRestartFixture("submission");try{
  const p=f.service.principal("learner-a"),file=f.service.media.upload(p,{purpose:"submission",enrollmentId:f.e.enrollmentId,lessonId:"submission",filename:"original.pdf",mime:"application/pdf",confirmed:"true",key:randomUUID(),revision:String(f.service.context("learner-a").revision)},Buffer.from("%PDF-1.4\nOriginal own work\n%%EOF"));
  const sub=data(f.call("learner-a","human_submit_submission",{enrollmentId:f.e.enrollmentId,lessonId:"submission",assetId:file.id,confirmed:true},"human"));assert.equal(reviewFresh(f).pendingOfficialWork,true);assert.equal(restartFresh(f).ok,false);
  data(f.call("assessor","human_assess_submission",{submissionId:sub.submissionId,points:0,reason:"Original insufficient work"},"human"));const original=f.db.prepare("SELECT * FROM submissions WHERE id=?").get(sub.submissionId),result=data(restartFresh(f));assert.deepEqual(f.db.prepare("SELECT * FROM submissions WHERE id=?").get(sub.submissionId),original);assert.equal(f.db.prepare("SELECT count(*) n FROM submissions WHERE enrollment_id=?").get(result.enrollmentId)!.n,0);
 }finally{f.db.close();}
});
test("booked event must be explicitly cancelled first; no original booking or attendance is silently carried or completed",()=>{
 const f=courseRestartFixture("event");try{
  const booking=data(f.call("learner-a","learning_book_session",{enrollmentId:f.e.enrollmentId,lessonId:"event",sessionId:"original"}));assert.equal(reviewFresh(f).pendingOfficialWork,true);assert.equal(restartFresh(f).ok,false);assert.equal(f.db.prepare("SELECT state FROM bookings WHERE id=?").get(booking.bookingId)!.state,"booked");
  data(f.call("learner-a","learning_cancel_booking",{bookingId:booking.bookingId},"human"));const before=f.db.prepare("SELECT * FROM bookings WHERE id=?").get(booking.bookingId),result=data(restartFresh(f));assert.deepEqual(f.db.prepare("SELECT * FROM bookings WHERE id=?").get(booking.bookingId),before);assert.equal(f.db.prepare("SELECT count(*) n FROM bookings WHERE enrollment_id=?").get(result.enrollmentId)!.n,0);assert.equal(f.db.prepare("SELECT completed_lessons FROM enrollments WHERE id=?").get(result.enrollmentId)!.completed_lessons,"[]");
 }finally{f.db.close();}
});
test("own human channel, active self-direction and latest target precede original-key replay; new-key duplicate never makes a second successor",()=>{
 const f=courseRestartFixture();try{
  const args={enrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true},call={requestId:"fresh",documentId:f.service.personal(f.service.principal("learner-a")),toolName:"human_restart_latest_course",arguments:args,expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"fresh-original-key"};
  assert.equal(f.call("learner-a","human_restart_latest_course",args).ok,false);assert.equal(f.call("learner-b","human_restart_latest_course",args,"human").ok,false);assert.equal(restartFresh(f,{expectedRevision:0}).ok,false);
  const result=f.service.invoke("learner-a",call,"human");assert.equal(result.ok,true);assert.deepEqual(f.service.invoke("learner-a",call,"human"),result);assert.equal(restartFresh(f).ok,false);
  data(f.call("editor","learning_update_course",{courseId:"fresh-course",course:{...f.next,title:"Original changed third version"}}));data(f.call("editor","learning_publish_course",{courseId:"fresh-course"}));assert.equal(f.service.invoke("learner-a",call,"human").ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments WHERE retake_of=?").get(f.e.enrollmentId)!.n,1);
 }finally{f.db.close();}
});
test("audit failure atomically preserves source state, official history, workspace and receipts; assigned source requires coordinator workflow",()=>{
 const f=courseRestartFixture();try{
  const before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),revision=f.service.context("learner-a").revision,receipts=f.db.prepare("SELECT count(*) n FROM idempotency").get()!.n;
  f.db.exec("CREATE TRIGGER reject_fresh_audit BEFORE INSERT ON audit WHEN NEW.tool='human_restart_latest_course' BEGIN SELECT RAISE(ABORT,'fresh audit fixture'); END;");
  assert.equal(restartFresh(f).ok,false);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),before);assert.equal(f.service.context("learner-a").revision,revision);assert.equal(f.db.prepare("SELECT count(*) n FROM idempotency").get()!.n,receipts);f.db.exec("DROP TRIGGER reject_fresh_audit");
  f.db.prepare("UPDATE enrollments SET assigned_by='manager' WHERE id=?").run(f.e.enrollmentId);assert.equal(restartFresh(f).ok,false);
 }finally{f.db.close();}
});
test("fresh successor and prior pinned failed attempt survive reopen without duplicate or fabricated completion",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-fresh-")),path=join(dir,"db.sqlite"),f=courseRestartFixture("objective",path);let reopened:ReturnType<typeof fixture>|null=null;
 try{const result=data(restartFresh(f)),old=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),oldId=f.at.attemptId;f.db.close();reopened=fixture(path);assert.equal(reopened.db.prepare("SELECT version FROM enrollments WHERE id=?").get(result.enrollmentId)!.version,2);assert.equal(reopened.db.prepare("SELECT completed_lessons FROM enrollments WHERE id=?").get(result.enrollmentId)!.completed_lessons,"[]");assert.deepEqual(reopened.db.prepare("SELECT * FROM attempts WHERE id=?").get(oldId),old);assert.equal(reopened.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);}finally{if(reopened)reopened.db.close();else f.db.close();rmSync(dir,{recursive:true,force:true});}
});
