
import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import type {Course} from "../src/shared/model.ts";
import {remapQuizResponse} from "../src/server/quiz-retries.ts";
import {createApp} from "../src/server/app.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const value:Course={...structuredClone(courses["learning-vi"]),title:"Original incorrect-only retry",language:"en",quiz:{passScore:100,maxAttempts:4,shuffleOptions:true,shuffleQuestions:true,retryIncorrectOnly:true,showPreviousResponses:true,answerRelease:"never",questions:[{id:"choice",prompt:"Original preserved choice",options:["Alpha","Beta","Gamma"],correct:0},{id:"matching",kind:"matching",prompt:"Original preserved matching",options:["First meaning","Second meaning"],correct:0,prompts:["First term","Second term"],matches:[0,1]},{id:"blank",kind:"blanks",prompt:"Original retry city",options:[],correct:0,prompts:["City"],correctAnswers:["Paris"],blankChoiceOptions:["Paris","London"],blankChoiceCounts:[2]}]}};
function setup(quiz:Partial<Course["quiz"]>={},path=":memory:"){
 const f=fixture(path),course={...structuredClone(value),quiz:{...value.quiz,...quiz}};
 data(f.call("editor","learning_create_course",{courseId:"retry-course",course}));data(f.call("editor","learning_publish_course",{courseId:"retry-course"}));const e=data(f.call("learner-a","learning_enroll",{courseId:"retry-course"}));for(const l of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));const read=data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human"));
 const choice=read.questions.find((q:any)=>q.id==="choice"),matching=read.questions.find((q:any)=>q.id==="matching");
 for(const [questionId,answer] of [["choice",choice.options.indexOf("Alpha")],["matching",["First meaning","Second meaning"].map(text=>matching.options.indexOf(text))],["blank",["London"]]] as const)data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId,answer},"human"));
 const first=data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));assert.equal(first.passed,false);
 return {...f,course,e,at,read};
}
const next=(f:ReturnType<typeof setup>,overrides={})=>f.call("learner-a","learning_start_attempt",{enrollmentId:f.e.enrollmentId},"bridge",overrides);
test("incorrect-only retry freezes previous successful objective responses under fresh presentation and changes no grade until human submits remaining response",()=>{
 const f=setup();try{
  const prior=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),started=data(next(f)),human=data(f.call("learner-a","learning_get_attempt",{attemptId:started.attemptId},"human")),agent=data(f.call("learner-a","learning_get_attempt",{attemptId:started.attemptId}));
  assert.deepEqual(human.questions.map((q:any)=>q.id),["blank"]);assert.equal(human.carriedQuestionCount,2);assert.deepEqual(human.previousResponses.answers.blank,["London"]);assert.equal(human.score,null);assert.equal(human.submitted,false);
  assert.equal(agent.contentWithheld,true);for(const key of ["answers","previousResponses","carriedQuestionCount","questions","feedback"])assert.equal(Object.hasOwn(agent,key),false);
  assert.equal(f.call("learner-a","human_save_answer",{attemptId:started.attemptId,questionId:"choice",answer:0},"human").ok,false);assert.equal(f.call("learner-a","human_submit_attempt",{attemptId:started.attemptId,confirmed:true},"human").ok,false);
  data(f.call("learner-a","human_save_answer",{attemptId:started.attemptId,questionId:"blank",answer:["Paris"]},"human"));const submitted=data(f.call("learner-a","human_submit_attempt",{attemptId:started.attemptId,confirmed:true},"human"));assert.equal(submitted.score,100);assert.equal(submitted.passed,true);
  assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),prior);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates WHERE enrollment_id=?").get(f.e.enrollmentId)!.n,1);
 }finally{f.db.close();}
});
test("optional previous-response hints map same immutable selection into new option positions but do not prefill incorrect/all-question retries or expose human responses through model",()=>{
 const f=setup({retryIncorrectOnly:false});try{
  const started=data(next(f)),human=data(f.call("learner-a","learning_get_attempt",{attemptId:started.attemptId},"human"));assert.equal(human.questions.length,3);assert.deepEqual(human.answers,{});assert.equal(human.carriedQuestionCount,0);
  const q=human.questions.find((q:any)=>q.id==="choice");assert.equal(q.options[human.previousResponses.answers.choice],"Alpha");const matching=human.questions.find((q:any)=>q.id==="matching");assert.deepEqual(human.previousResponses.answers.matching.map((index:number)=>matching.options[index]),["First meaning","Second meaning"]);
  const agent=data(f.call("learner-a","learning_get_attempt",{attemptId:started.attemptId}));assert.deepEqual(agent.answers,{});assert.equal(agent.previousResponses,undefined);assert.equal(agent.carriedQuestionCount,undefined);
 }finally{f.db.close();}
 const hidden=setup({showPreviousResponses:false});try{const started=data(next(hidden));assert.equal(data(hidden.call("learner-a","learning_get_attempt",{attemptId:started.attemptId},"human")).previousResponses,null);}finally{hidden.db.close();}
 const q={id:"multi",prompt:"Original",options:["A","B","C"],correct:0,correctIndices:[0,2]};assert.deepEqual(remapQuizResponse(q,[0,2],{options:{multi:[2,1,0]}},{options:{multi:[1,0,2]}}),[1,2]);
});
test("retry creation/carries/previous pin share original key, CAS and audit transaction; source enrollment authority precedes receipt replay",()=>{
 const f=setup();try{
  const before=f.db.prepare("SELECT * FROM attempts ORDER BY id").all(),revision=f.service.context("learner-a").revision,overrides={expectedRevision:revision,idempotencyKey:"retry-start-original"};
  f.db.exec("CREATE TRIGGER reject_retry BEFORE INSERT ON audit WHEN NEW.tool='learning_start_attempt' BEGIN SELECT RAISE(ABORT,'retry audit fixture'); END;");assert.equal(next(f,overrides).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM attempts ORDER BY id").all(),before);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM quiz_retry_carries").get()!.n,0);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM quiz_attempt_previous").get()!.n,0);assert.equal(f.service.context("learner-a").revision,revision);f.db.exec("DROP TRIGGER reject_retry");
  const good=next(f,overrides);data(good);assert.deepEqual(next(f,overrides),good);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE enrollment_id=?").get(f.e.enrollmentId)!.n,2);
  f.db.prepare("UPDATE enrollments SET assignment_state='withdrawn' WHERE id=?").run(f.e.enrollmentId);assert.equal(next(f,overrides).ok,false);
 }finally{f.db.close();}
});
test("settings reject incorrect-only plus objective progression/essay before persistence; actual HTTP denies cross-account retained responses and bridge response leakage",async()=>{
 const invalid=fixture();try{for(const quiz of [{...value.quiz,requireCorrectToContinue:true},{...value.quiz,questions:[{id:"essay",kind:"long_answer",prompt:"Original essay",options:[],correct:0,rubric:"Original"}]}])assert.equal(invalid.call("editor","learning_create_course",{courseId:"bad-retry",course:{...value,quiz}}).ok,false);assert.equal(invalid.db.prepare("SELECT 1 FROM courses WHERE id='bad-retry'").get(),undefined);}finally{invalid.db.close();}
 const f=setup(),origin="http://127.0.0.1:4314";let app:any;try{
  const started=data(next(f));({app}=await createApp({db:f.db,origin,developmentAuth:true}));const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-a",password:"learner-a-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  const raw={requestId:"retry-read",documentId:"learning:demo:learner-a",toolName:"learning_get_attempt",arguments:{attemptId:started.attemptId},expectedRevision:null,idempotencyKey:null};
  const human=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:raw}),agent=await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:raw});assert.equal(human.json().data.previousResponses.number,1);assert.equal(agent.json().data.contentWithheld,true);assert.equal(agent.body.includes("London"),false);
  assert.equal(f.call("learner-b","learning_get_attempt",{attemptId:started.attemptId},"human").ok,false);
  const denied=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:{...raw,toolName:"human_save_answer",arguments:{attemptId:started.attemptId,questionId:"matching",answer:[0,1]},expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"overwrite-carry"}});assert.equal(denied.json().ok,false);
 }finally{if(app)await app.close();f.db.close();}
});
test("actual SQLite reopen keeps fresh retry presentation, previous source/carries and human hint privacy without changing failed prior grade",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-quiz-retry-"));let f=setup({},join(dir,"store.sqlite"));try{
  const started=data(next(f)),before=data(f.call("learner-a","learning_get_attempt",{attemptId:started.attemptId},"human")),first=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),old=f.at,course=f.course,e=f.e;f.db.close();const reopened=fixture(join(dir,"store.sqlite"));f={...reopened,at:old,course,e,read:f.read};
  assert.deepEqual(data(f.call("learner-a","learning_get_attempt",{attemptId:started.attemptId},"human")),before);assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(old.attemptId),first);assert.equal(before.score,null);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
