import {hostSafeSchema} from "@orchard/bridge-contract";
import {allCatalog,humanTools} from "../src/shared/catalog.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import type {Course,Question} from "../src/shared/model.ts";
import {objectiveFraction,validateQuestion,validateAnswer,presentation,visibleQuestions} from "../src/server/assessments.ts";
import {createApp} from "../src/server/app.ts";
const multi:Question={id:"multi",prompt:"Select original correct choices",options:["Alpha","Beta","Gamma","Delta"],correct:0,correctIndices:[0,2],feedbackSelected:["Alpha selected","Beta selected","Gamma selected","Delta selected"],feedbackNotSelected:["Alpha not selected","Beta not selected","Gamma not selected","Delta not selected"]};
const blanks:Question={id:"blanks",kind:"blanks",prompt:"Choose a city and write a word",options:[],correct:0,prompts:["Original city","Original word"],correctAnswers:["Paris","Áp dụng"],blankChoiceOptions:["Paris","London","Berlin"],blankChoiceCounts:[3,0]};
function course(qs:Question[],quiz:Partial<Course["quiz"]>={}):Course{return {...structuredClone(courses["learning-vi"]),title:"Original question forms",language:"en",quiz:{passScore:100,maxAttempts:3,shuffleOptions:true,answerRelease:"after_submission",questions:qs,...quiz}};}
function setup(qs:Question[],quiz:Partial<Course["quiz"]>={}){
 const f=fixture(),value=course(qs,quiz);data(f.call("editor","learning_create_course",{courseId:"forms-course",course:value}));data(f.call("editor","learning_publish_course",{courseId:"forms-course"}));const e=data(f.call("learner-a","learning_enroll",{courseId:"forms-course"}));for(const l of value.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));return {...f,value,e,at};
}
test("multi-choice exact versus explicit correct-selection fraction follows stored shuffled indices; free/dropdown blanks preserve accepted text and randomized presentation",()=>{
 for(const role of ["admin","content_admin","manager","assessor","learner"] as const)for(const descriptor of [...allCatalog(role),...humanTools])assert.equal(hostSafeSchema(descriptor.inputSchema),true,descriptor.name);
 const value=course([multi,blanks]);
 for(let i=0;i<30;i++){
  const p=presentation(value),order=p.options.multi!,good=multi.correctIndices!.map(index=>order.indexOf(index)),wrong=order.indexOf(1);
  assert.equal(objectiveFraction(multi,good,p),1);assert.equal(objectiveFraction(multi,[good[0]],p),0);assert.equal(objectiveFraction(multi,[...good,wrong],p),0);
  assert.equal(objectiveFraction({...multi,partialCredit:true},[good[0]],p),0.5);assert.equal(objectiveFraction({...multi,partialCredit:true},[good[0],wrong],p),0.5);assert.equal(objectiveFraction({...multi,partialCredit:true},[...good,wrong],p),1);
  assert.equal(objectiveFraction(blanks,["Paris"," áp DỤNG "],p),1);assert.equal(objectiveFraction(blanks,["London","Áp dụng"],p),0.5);
  const visible=visibleQuestions(value,{presentation:JSON.stringify(p)});assert.equal(visible[0].multiple,true);assert.deepEqual(new Set(visible[1].blankChoices[0]),new Set(blanks.blankChoiceOptions));
  for(const key of ["correctIndices","optionFeedback","feedbackSelected","feedbackNotSelected","correctAnswers","rubric"])assert.equal(JSON.stringify(visible).includes('"'+key+'":'),false);
 }
 for(const answer of [[0,0],[4],["0"]])assert.throws(()=>validateAnswer(multi,answer,true));
 assert.throws(()=>validateAnswer(multi,[],true));assert.throws(()=>validateAnswer(blanks,["Unknown","word"],true));
 for(const bad of [{...multi,correctIndices:[0,0]},{...multi,correctIndices:[0],partialCredit:true},{...multi,feedbackSelected:multi.feedbackSelected!.slice(1)},{...blanks,blankChoiceOptions:["Paris","PARIS"],blankChoiceCounts:[2,0]},{...blanks,blankChoiceOptions:["London","Berlin"],blankChoiceCounts:[2,0]},{...multi,passRate:50}])assert.throws(()=>validateQuestion(bad));
});
test("human multi/dropdown responses grade from immutable presentation and release only configured selected/not-selected feedback; learner bridge remains restricted",()=>{
 const f=setup([{...multi,partialCredit:true},blanks]);try{
  const read=data(f.call("learner-a","learning_get_attempt",{attemptId:f.at.attemptId},"human")),chosen=[read.questions[0].options.indexOf("Alpha"),read.questions[0].options.indexOf("Beta")];
  data(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:"multi",answer:chosen},"human"));data(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:"blanks",answer:["Paris","Áp dụng"]},"human"));
  const result=data(f.call("learner-a","human_submit_attempt",{attemptId:f.at.attemptId,confirmed:true},"human"));assert.equal(result.score,75);assert.equal(result.passed,false);
  const human=data(f.call("learner-a","learning_get_attempt",{attemptId:f.at.attemptId},"human")),agent=data(f.call("learner-a","learning_get_attempt",{attemptId:f.at.attemptId}));assert.equal(human.questionResults[0].scorePercent,50);assert.equal(human.questionResults[0].correct,false);assert.equal(human.questionResults[1].correct,true);
  assert.deepEqual(human.feedback[0].optionFeedback.map((x:any)=>x.message),["Alpha selected","Beta selected","Gamma not selected","Delta not selected"]);
  assert.deepEqual(agent.questionResults,[]);assert.deepEqual(agent.feedback,[]);assert.equal(JSON.stringify(agent).includes("Alpha selected"),false);assert.equal(JSON.stringify(agent).includes('"correctIndices":'),false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates WHERE enrollment_id=?").get(f.e.enrollmentId)!.n,0);
 }finally{f.db.close();}
});
test("manual question correctness threshold differs from numerical contribution; never-release hides every correctness indicator and option feedback",()=>{
 const essay:Question={id:"essay",kind:"long_answer",prompt:"Original explanation",options:[],correct:0,rubric:"Original rubric",passRate:50,points:4};
 const f=setup([multi,essay],{answerRelease:"after_submission"});try{
  data(f.call("editor","learning_set_course_assessor",{courseId:"forms-course",assessorId:"assessor",enabled:true}));
  const p=JSON.parse(f.db.prepare("SELECT presentation FROM attempts WHERE id=?").get(f.at.attemptId)!.presentation as string),correct=multi.correctIndices!.map(index=>p.options.multi.indexOf(index));
  data(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:"multi",answer:correct},"human"));data(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:"essay",answer:"Original personal explanation"},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:f.at.attemptId,confirmed:true},"human"));
  assert.deepEqual(data(f.call("learner-a","learning_get_attempt",{attemptId:f.at.attemptId},"human")).questionResults,[]);
  data(f.call("assessor","human_assess_answer",{attemptId:f.at.attemptId,questionId:"essay",points:2,reason:"Original rubric"},"human"));
  const read=data(f.call("learner-a","learning_get_attempt",{attemptId:f.at.attemptId},"human"));assert.equal(read.questionResults.find((r:any)=>r.questionId==="essay").correct,true);assert.equal(read.score,60);assert.equal(read.passed,false);
 }finally{f.db.close();}
 const hidden=setup([multi],{answerRelease:"never",passScore:0});try{
  data(hidden.call("learner-a","human_save_answer",{attemptId:hidden.at.attemptId,questionId:"multi",answer:[0]},"human"));data(hidden.call("learner-a","human_submit_attempt",{attemptId:hidden.at.attemptId,confirmed:true},"human"));
  const read=data(hidden.call("learner-a","learning_get_attempt",{attemptId:hidden.at.attemptId},"human"));assert.deepEqual(read.feedback,[]);assert.deepEqual(read.questionResults,[]);assert.equal(JSON.stringify(read).includes("Alpha selected"),false);
 }finally{hidden.db.close();}
});
test("actual HTTP blocks invalid dropdown payloads and exposes feedback only on own human graded reads; audit rollback preserves response/version/attempt",async()=>{
 const f=setup([multi,blanks]),origin="http://127.0.0.1:4314";let app:any;try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-a",password:"learner-a-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  const raw={requestId:"forms-http",documentId:"learning:demo:learner-a",toolName:"human_save_answer",arguments:{attemptId:f.at.attemptId,questionId:"blanks",answer:["Unknown","word"]},expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"forms-invalid"};
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:raw})).json().error.code,"INVALID_ARGUMENT");assert.equal(f.db.prepare("SELECT answers FROM attempts WHERE id=?").get(f.at.attemptId)!.answers,"{}");
  const before=f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId);f.db.exec("CREATE TRIGGER forms_audit_failure BEFORE INSERT ON audit WHEN NEW.tool='human_save_answer' BEGIN SELECT RAISE(ABORT,'forms audit fixture'); END;");
  assert.equal(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:"blanks",answer:["Paris","Áp dụng"]},"human").ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM attempts WHERE id=?").get(f.at.attemptId),before);f.db.exec("DROP TRIGGER forms_audit_failure");
  const query={requestId:"forms-read",documentId:"learning:demo:learner-a",toolName:"learning_get_attempt",arguments:{attemptId:f.at.attemptId},expectedRevision:null,idempotencyKey:null};const read=await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:query});assert.equal(read.statusCode,200);for(const word of ["correctIndices","optionFeedback","correctAnswers","Alpha selected"])assert.equal(read.body.includes(word),false);
  const stored=JSON.parse(f.db.prepare("SELECT presentation FROM attempts WHERE id=?").get(f.at.attemptId)!.presentation as string);
  data(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:"multi",answer:multi.correctIndices!.map(index=>stored.options.multi.indexOf(index))},"human"));
  data(f.call("learner-a","human_save_answer",{attemptId:f.at.attemptId,questionId:"blanks",answer:["Paris","Áp dụng"]},"human"));
  const submitted=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:{...raw,toolName:"human_submit_attempt",arguments:{attemptId:f.at.attemptId,confirmed:true},expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"forms-submit"}});assert.equal(submitted.json().ok,true);
  const agent=await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:query}),human=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:query});
  assert.deepEqual(agent.json().data.feedback,[]);assert.deepEqual(agent.json().data.questionResults,[]);assert.equal(agent.body.includes("Alpha selected"),false);assert.equal(human.json().data.feedback[0].optionFeedback.length,4);assert.equal(human.json().data.questionResults.length,2);

 }finally{if(app)await app.close();f.db.close();}
});
