
import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import type {Course} from "../src/shared/model.ts";
import {createApp} from "../src/server/app.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const original:Course={...structuredClone(courses["learning-vi"]),title:"Original ordered quiz",language:"en",quiz:{passScore:100,maxAttempts:3,requireCorrectToContinue:true,answerRelease:"after_question",shuffleQuestions:true,shuffleOptions:true,questions:[{id:"one",prompt:"Original first prompt",options:["Original correct one","Original wrong one"],correct:0,feedbackSelected:["Original first feedback","Try one again"],feedbackNotSelected:["Original omitted one","Original avoided wrong one"]},{id:"two",prompt:"Original second prompt",options:["Original correct two","Original wrong two"],correct:0}]}};
function setup(quiz:Partial<Course["quiz"]>={},path=":memory:"){
 const f=fixture(path),course={...structuredClone(original),quiz:{...original.quiz,...quiz}};
 data(f.call("editor","learning_create_course",{courseId:"ordered-course",course}));data(f.call("editor","learning_publish_course",{courseId:"ordered-course"}));
 const e=data(f.call("learner-a","learning_enroll",{courseId:"ordered-course"}));for(const l of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));
 const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));return {...f,e,at,course};
}
const read=(f:ReturnType<typeof setup>,source:"human"|"bridge"="human")=>data(f.call("learner-a","learning_get_attempt",{attemptId:f.at.attemptId},source));
const save=(f:ReturnType<typeof setup>,q:any,correct=true)=>data(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:q.id,answer:q.options.findIndex((s:string)=>s.startsWith(correct?"Original correct":"Original wrong"))},"human"));
const check=(f:ReturnType<typeof setup>,id:string,overrides={})=>f.call("learner-a","human_check_question",{attemptId:f.at.attemptId,questionId:id,fingerprint:read(f).questionChecks.find((r:any)=>r.questionId===id).fingerprint},"human",overrides);
test("stored shuffled cursor gates both future writes and early submit; checks release own objective feedback without official score/certificate and model cannot check or see answers",()=>{
 const f=setup();try{
  const first=read(f),q=first.questions[0],later=f.course.quiz.questions.find(q2=>q2.id!==q.id)!;
  assert.equal(first.questions.length,1);assert.equal(first.canSubmit,false);
  assert.equal(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:later.id,answer:0},"human").ok,false);
  assert.equal(f.call("learner-a","human_submit_attempt",{attemptId:f.at.attemptId,confirmed:true},"human").ok,false);
  save(f,q,false);assert.equal(data(check(f,q.id)).correct,false);assert.equal(read(f).questions.length,1);assert.equal(read(f).feedback.length,1);
  assert.equal(f.call("learner-a","human_check_question",{attemptId:f.at.attemptId,questionId:q.id,fingerprint:read(f).questionChecks[0].fingerprint}).ok,false);
  const agent=read(f,"bridge");for(const word of ["fingerprint","questionChecks","correctIndices","Original first feedback"])assert.equal(JSON.stringify(agent).includes(word),false);assert.deepEqual(agent.answers,{});assert.deepEqual(agent.feedback,[]);
  save(f,q,true);data(check(f,q.id));const next=read(f);assert.equal(next.questions.length,2);assert.equal(next.score,null);assert.equal(next.submitted,false);assert.equal(next.canSubmit,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates WHERE enrollment_id=?").get(f.e.enrollmentId)!.n,0);
  const second=next.questions.find((row:any)=>row.id!==q.id);save(f,second);data(check(f,second.id));assert.equal(read(f).canSubmit,true);
  const submitted=data(f.call("learner-a","human_submit_attempt",{attemptId:f.at.attemptId,confirmed:true},"human"));assert.equal(submitted.score,100);assert.equal(submitted.passed,true);
 }finally{f.db.close();}
});
test("changed earlier answers invalidate downstream checks while keeping hidden drafts; restored same text cannot replay an old check receipt; identical saves retain current checks",()=>{
 const f=setup({shuffleQuestions:false,shuffleOptions:false});try{
  let q=read(f).questions[0];save(f,q);
  const args={attemptId:f.at.attemptId,questionId:q.id,fingerprint:read(f).questionChecks[0].fingerprint},revision=f.service.context("learner-a").revision,overrides={idempotencyKey:"ordered-check",expectedRevision:revision};
  const result=f.call("learner-a","human_check_question",args,"human",overrides);data(result);assert.deepEqual(f.call("learner-a","human_check_question",args,"human",overrides),result);
  const second=read(f).questions[1];save(f,second);
  const laterArgs={attemptId:f.at.attemptId,questionId:second.id,fingerprint:read(f).questionChecks[1].fingerprint},laterOverrides={idempotencyKey:"later-check",expectedRevision:f.service.context("learner-a").revision};data(f.call("learner-a","human_check_question",laterArgs,"human",laterOverrides));assert.equal(read(f).canSubmit,true);
  const fingerprint=read(f).questionChecks[0].fingerprint;save(f,q);assert.equal(read(f).canSubmit,true);assert.equal(read(f).questionChecks[0].fingerprint,fingerprint);
  save(f,q,false);assert.equal(read(f).questions.length,1);assert.equal(Object.hasOwn(read(f).answers,second.id),false);assert.equal(JSON.parse(f.db.prepare("SELECT answers FROM attempts WHERE id=?").get(f.at.attemptId)!.answers as string)[second.id],0);
  save(f,q,true);const denied=f.call("learner-a","human_check_question",args,"human",overrides);assert.equal(denied.ok,false);if(!denied.ok)assert.equal(denied.error.code,"STALE_CONTEXT");
  data(check(f,q.id));assert.equal(read(f).questions.length,2);assert.equal(read(f).questionChecks[1].checked,false);assert.equal(read(f).canSubmit,false);const laterDenied=f.call("learner-a","human_check_question",laterArgs,"human",laterOverrides);assert.equal(laterDenied.ok,false);if(!laterDenied.ok)assert.equal(laterDenied.error.code,"STALE_CONTEXT");data(check(f,second.id));assert.equal(read(f).canSubmit,true);
 }finally{f.db.close();}
});
test("never-release correct gate gives human retry state without keys; essay combinations reject before draft creation while after-question essays keep pending official grade private",()=>{
 const never=setup({answerRelease:"never",shuffleQuestions:false,shuffleOptions:false});try{const q=read(never).questions[0];save(never,q);data(check(never,q.id));assert.equal(read(never).questionChecks[0].correct,true);assert.deepEqual(read(never).feedback,[]);assert.deepEqual(read(never).questionResults,[]);}finally{never.db.close();}
 const essay={id:"essay",kind:"long_answer" as const,prompt:"Original written response",options:[],correct:0,rubric:"Original rubric"};
 const f=fixture();try{assert.equal(f.call("editor","learning_create_course",{courseId:"bad-ordered-essay",course:{...original,quiz:{...original.quiz,questions:[essay]}}}).ok,false);assert.equal(f.db.prepare("SELECT 1 FROM courses WHERE id='bad-ordered-essay'").get(),undefined);}finally{f.db.close();}
 const mixed=setup({requireCorrectToContinue:false,shuffleQuestions:false,shuffleOptions:false,questions:[original.quiz.questions[0],essay]});try{
  let state=read(mixed),q=state.questions[0];save(mixed,q);data(check(mixed,q.id));assert.equal(read(mixed).feedback.length,1);
  assert.equal(mixed.call("learner-a","human_check_question",{attemptId:mixed.at.attemptId,questionId:"essay",fingerprint:"0".repeat(64)},"human").ok,false);
  data(mixed.call("learner-a","human_save_answer",{attemptId:mixed.at.attemptId,questionId:"essay",answer:"Original explanation"},"human"));data(mixed.call("learner-a","human_submit_attempt",{attemptId:mixed.at.attemptId,confirmed:true},"human"));
  state=read(mixed);assert.equal(state.gradingState,"pending_manual");assert.equal(state.score,null);assert.deepEqual(state.feedback,[]);assert.deepEqual(state.questionResults,[]);
 }finally{mixed.db.close();}
});
test("actual HTTP requires human channel and fresh response fingerprint; audit failure atomically rolls back check/revision/receipt; live owner/assignment denies old receipt",async()=>{
 const f=setup({shuffleQuestions:false,shuffleOptions:false}),origin="http://127.0.0.1:4314";let app:any;try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-a",password:"learner-a-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  const q=read(f).questions[0];save(f,q);const raw={requestId:"ordered-http",documentId:"learning:demo:learner-a",toolName:"human_check_question",arguments:{attemptId:f.at.attemptId,questionId:q.id,fingerprint:read(f).questionChecks[0].fingerprint},expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"ordered-http-check"};
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:raw})).json().ok,false);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:{...raw,arguments:{...raw.arguments,fingerprint:"0".repeat(64)}}})).json().error.code,"STALE_CONTEXT");
  const before=f.db.prepare("SELECT * FROM quiz_question_states WHERE attempt_id=?").all(f.at.attemptId),revision=f.service.context("learner-a").revision;
  f.db.exec("CREATE TRIGGER reject_question_check BEFORE INSERT ON audit WHEN NEW.tool='human_check_question' BEGIN SELECT RAISE(ABORT,'question check fixture'); END;");
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:raw})).json().ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM quiz_question_states WHERE attempt_id=?").all(f.at.attemptId),before);assert.equal(f.service.context("learner-a").revision,revision);assert.equal(f.db.prepare("SELECT 1 FROM idempotency WHERE key='ordered-http-check'").get(),undefined);
  f.db.exec("DROP TRIGGER reject_question_check");const good=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:raw});assert.equal(good.json().ok,true);
  const audit=f.db.prepare("SELECT arguments FROM audit WHERE tool='human_check_question' ORDER BY rowid DESC LIMIT 1").get()!.arguments as string;assert.equal(audit.includes("fingerprint"),false);assert.equal(audit.includes("Original correct"),false);
  assert.equal(f.call("learner-b","human_check_question",raw.arguments,"human").ok,false);f.db.prepare("UPDATE enrollments SET assignment_state='withdrawn' WHERE id=?").run(f.e.enrollmentId);assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:raw})).json().ok,false);
 }finally{if(app)await app.close();f.db.close();}
});
test("question cursor/check versions survive actual SQLite close/reopen without scores or synthetic progress",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-question-state-"));let f=setup({shuffleQuestions:false,shuffleOptions:false},join(dir,"store.sqlite"));try{
  const q=read(f).questions[0];save(f,q);data(check(f,q.id));const before=read(f),attemptId=f.at.attemptId,enrollmentId=f.e.enrollmentId;f.db.close();
  const reopen=fixture(join(dir,"store.sqlite"));f={...reopen,at:{attemptId},e:{enrollmentId},course:f.course};assert.deepEqual(read(f),before);assert.equal(read(f).score,null);assert.equal(read(f).submitted,false);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
