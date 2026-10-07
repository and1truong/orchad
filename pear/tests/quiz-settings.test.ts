import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import type {Course} from "../src/shared/model.ts";
import {createApp} from "../src/server/app.ts";
const questions=(n:number)=>Array.from({length:n},(_,i)=>({id:"q"+i,prompt:"Original question "+i,options:["Correct","Incorrect"],correct:0}));
function course(quiz:Partial<Course["quiz"]>={}):Course{return {...structuredClone(courses["learning-vi"]),title:"Original quiz settings",language:"en",quiz:{passScore:100,maxAttempts:1,questions:questions(1),...quiz}};}
function publish(f:ReturnType<typeof fixture>,id:string,value:Course){data(f.call("editor","learning_create_course",{courseId:id,course:value}));data(f.call("editor","learning_publish_course",{courseId:id}));}
function ready(f:ReturnType<typeof fixture>,id:string,value:Course){const e=data(f.call("learner-a","learning_enroll",{courseId:id}));for(const l of value.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));return e.enrollmentId;}
function submit(f:ReturnType<typeof fixture>,enrollmentId:string,value:Course,answer=1){const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId}));for(const q of value.quiz.questions)data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:q.id,answer:(q.kind==="long_answer"?"Original own response":answer)},"human"));return {at,result:data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"))};}
test("fifty bounded questions and pinned bank reuse support zero pass threshold only after human answers and submit; messages and released keys stay human-only",()=>{
 const f=fixture();try{
  const value=course({questions:questions(50),passScore:0,answerRelease:"after_submission",passMessage:"Original zero-threshold result"});publish(f,"quiz-fifty",value);
  const bank={title:"Original fifty bank",access:"tenant",aiProcessingAllowed:true,questions:value.quiz.questions};data(f.call("editor","learning_save_question_bank",{bankId:"fifty-bank",bank,sourceCourseId:"quiz-fifty"}));
  const source={bankId:"fifty-bank",version:1,questionIds:value.quiz.questions.map(q=>q.id)};data(f.call("editor","learning_apply_question_bank",{courseId:"quiz-fifty",source}));data(f.call("editor","learning_publish_course",{courseId:"quiz-fifty"}));
  const e=ready(f,"quiz-fifty",value);assert.equal(f.db.prepare("SELECT status FROM enrollments WHERE id=?").get(e)!.status,"in_progress");assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,0);
  const {at,result}=submit(f,e,value);assert.equal(result.score,0);assert.equal(result.passed,true);assert.equal(result.resultMessage,value.quiz.passMessage);
  const human=data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human")),agent=data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId}));
  assert.equal(human.questions.length,50);assert.equal(human.feedback.length,50);assert.equal(human.resultMessage,value.quiz.passMessage);
  assert.equal(agent.feedback.length,0);assert.equal(agent.resultMessage,null);assert.deepEqual(agent.answers,{});assert.equal(JSON.stringify(agent).includes('"correct":'),false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates WHERE enrollment_id=?").get(e)!.n,1);
  assert.equal(f.call("editor","learning_create_course",{courseId:"quiz-too-many",course:course({questions:questions(51)})}).error?.code,"INVALID_ARGUMENT");
  const large=questions(50).map(q=>({...q,prompt:"x".repeat(400)}));assert.equal(f.call("editor","learning_create_course",{courseId:"quiz-too-large",course:course({questions:large})}).error?.code,"INVALID_ARGUMENT");
 }finally{f.db.close();}
});
test("finite exhaustion versus unlimited config, unlimited exhaustion feedback suppression, stable retries and explicit operational quota",()=>{
 const f=fixture();try{
  const finite=course({failMessage:"Original finite fail"}),unlimited=course({unlimitedAttempts:true,answerRelease:"after_exhausted",failMessage:"Original unlimited fail"});
  publish(f,"quiz-finite",finite);publish(f,"quiz-unlimited",unlimited);const a=ready(f,"quiz-finite",finite),b=ready(f,"quiz-unlimited",unlimited);
  assert.equal(submit(f,a,finite).result.resultMessage,finite.quiz.failMessage);assert.equal(f.call("learner-a","learning_start_attempt",{enrollmentId:a}).error?.code,"FORBIDDEN");
  const failed=submit(f,b,unlimited);assert.equal(failed.result.passed,false);assert.equal(data(f.call("learner-a","learning_get_attempt",{attemptId:failed.at.attemptId},"human")).feedback.length,0);
  const key={expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"quiz-unlimited-second"},second=f.call("learner-a","learning_start_attempt",{enrollmentId:b},"bridge",key);assert.equal(data(second).number,2);assert.deepEqual(f.call("learner-a","learning_start_attempt",{enrollmentId:b},"bridge",key),second);
  assert.equal(data(f.call("learner-a","learning_get_item",{courseId:"quiz-unlimited"})).quiz.unlimitedAttempts,true);
  f.db.prepare("UPDATE attempts SET submitted=1,grading_state='graded',score=0,passed=0 WHERE id=?").run(data(second).attemptId);
  f.db.prepare("WITH RECURSIVE n(x) AS (VALUES(3) UNION ALL SELECT x+1 FROM n WHERE x<2500) INSERT INTO attempts(id,enrollment_id,number,submitted,grading_state,score,passed) SELECT 'quota-'||x,?,x,1,'graded',0,0 FROM n").run(b);
  assert.equal(f.call("learner-a","learning_start_attempt",{enrollmentId:b}).error?.code,"INVALID_ARGUMENT");assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE enrollment_id=?").get(b)!.n,2500);
  assert.deepEqual(f.call("learner-a","learning_start_attempt",{enrollmentId:b},"bridge",key),second);
 }finally{f.db.close();}
});
test("pending manual scores withhold result and submission feedback until scoped final review; bounds/audit rollback keep old history intact",()=>{
 const f=fixture();try{
  const value=course({passScore:0,unlimitedAttempts:true,answerRelease:"after_submission",passMessage:"Original manually reviewed result",questions:[...questions(1),{id:"essay",kind:"long_answer",prompt:"Explain original learning",options:[],correct:0,rubric:"Review own explanation"}]});publish(f,"quiz-manual",value);data(f.call("editor","learning_set_course_assessor",{courseId:"quiz-manual",assessorId:"assessor",enabled:true}));
  const e=ready(f,"quiz-manual",value),{at,result}=submit(f,e,value);assert.equal(result.gradingState,"pending_manual");assert.equal(result.resultMessage,null);
  assert.equal(data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human")).feedback.length,0);assert.equal(f.call("learner-a","learning_start_attempt",{enrollmentId:e}).error?.code,"FORBIDDEN");
  f.db.exec("CREATE TRIGGER quiz_message_audit BEFORE INSERT ON audit WHEN NEW.tool='human_assess_answer' BEGIN SELECT RAISE(ABORT,'quiz audit fixture'); END;");
  assert.equal(f.call("assessor","human_assess_answer",{attemptId:at.attemptId,questionId:"essay",points:0,reason:"Original rubric review"},"human").ok,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM essay_reviews").get()!.n,0);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates WHERE enrollment_id=?").get(e)!.n,0);
  f.db.exec("DROP TRIGGER quiz_message_audit");const graded=data(f.call("assessor","human_assess_answer",{attemptId:at.attemptId,questionId:"essay",points:0,reason:"Original rubric review"},"human"));assert.equal(graded.resultMessage,value.quiz.passMessage);
  const read=data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human"));assert.equal(read.feedback.length,1);assert.equal(read.resultMessage,value.quiz.passMessage);
  for(const quiz of [{passScore:-1},{maxAttempts:1001},{passMessage:"x".repeat(601)},{unlimitedAttempts:"true"}])assert.equal(f.call("editor","learning_create_course",{courseId:"invalid-quiz-setting",course:{...course(),quiz:{...course().quiz,...quiz}}}).error?.code,"INVALID_ARGUMENT");
 }finally{f.db.close();}
});
test("actual cookie human/bridge HTTP keeps fifty-question human feedback and authored messages outside learner model context",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";let app:any;
 try{
  const value=course({questions:questions(50),answerRelease:"after_submission",failMessage:"Original human-only fail text"});publish(f,"quiz-http-fifty",value);const e=ready(f,"quiz-http-fifty",value),{at}=submit(f,e,value);
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-a",password:"learner-a-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  const payload={requestId:"quiz-settings-http",documentId:"learning:demo:learner-a",toolName:"learning_get_attempt",arguments:{attemptId:at.attemptId},expectedRevision:null,idempotencyKey:null};
  const human=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload}),bridge=await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload});
  assert.equal(human.statusCode,200);assert.equal(human.json().data.feedback.length,50);assert.equal(human.json().data.resultMessage,value.quiz.failMessage);
  assert.equal(bridge.statusCode,200);assert.equal(bridge.json().data.feedback.length,0);assert.equal(bridge.body.includes(value.quiz.failMessage!),false);assert.equal(bridge.body.includes('"correct":'),false);assert.ok(Buffer.byteLength(human.body)<65536);
  const otherLogin=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-b",password:"learner-b-dev"}}),other={...base,cookie:String(otherLogin.headers["set-cookie"]).split(";")[0],"x-csrf-token":otherLogin.json().csrf,"x-pear-epoch":otherLogin.json().sessionEpoch};
  assert.notEqual((await app.inject({method:"POST",url:"/api/human/invoke",headers:other,payload:{...payload,documentId:"learning:demo:learner-b"}})).statusCode,200);
 }finally{if(app)await app.close();f.db.close();}
});
