import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {createApp} from "../src/server/app.ts";
const bank=(access="tenant",aiProcessingAllowed=true)=>({title:"Original reusable bank",access,aiProcessingAllowed,questions:structuredClone(courses["systems-basics"].quiz.questions)});
const source={bankId:"original-bank",version:1,questionIds:["q-retry"]};
function create(f:ReturnType<typeof fixture>,id="bank-course",access="tenant"){
 const course={...structuredClone(courses["systems-basics"]),access};
 data(f.call("editor","learning_create_course",{courseId:id,course}));return course;
}
function peer(f:ReturnType<typeof fixture>){f.db.prepare("INSERT INTO accounts(id,tenant,name,role,password_hash,salt) SELECT 'editor-peer',tenant,'Peer',role,password_hash,salt FROM accounts WHERE id='editor'").run();f.db.prepare("INSERT INTO workspaces(id,tenant,owner) VALUES('learning:demo:editor-peer','demo','editor-peer')").run();}
test("selected immutable bank versions enter only drafts; existing course pins and actual grading retain original questions after bank updates and retirement",()=>{
 const f=fixture();try{
  const course=create(f);data(f.call("editor","learning_save_question_bank",{bankId:source.bankId,bank:bank()}));data(f.call("editor","learning_apply_question_bank",{courseId:"bank-course",source}));data(f.call("editor","learning_publish_course",{courseId:"bank-course"}));
  const enrollmentId=data(f.call("learner-a","learning_enroll",{courseId:"bank-course"})).enrollmentId;
  for(const lesson of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId,lessonId:lesson.id},"human"));
  const attempt=data(f.call("learner-a","learning_start_attempt",{enrollmentId}));data(f.call("learner-a","human_save_answer",{attemptId:attempt.attemptId,questionId:"q-retry",answer:1},"human"));
  const v1=String(f.db.prepare("SELECT content FROM course_versions WHERE course_id='bank-course' AND version=1").get()!.content);
  const updated=bank();updated.questions[0].prompt="Revised original question";updated.questions[0].correct=0;
  data(f.call("editor","learning_save_question_bank",{bankId:source.bankId,bank:updated}));assert.equal(data(f.call("editor","learning_get_question_bank",{bankId:source.bankId,version:1})).questions[0].correct,1);
  data(f.call("editor","learning_apply_question_bank",{courseId:"bank-course",source:{...source,version:2}}));data(f.call("editor","learning_publish_course",{courseId:"bank-course"}));
  assert.equal(String(f.db.prepare("SELECT content FROM course_versions WHERE course_id='bank-course' AND version=1").get()!.content),v1);assert.equal(JSON.parse(v1).quiz.questionBankRef.version,1);assert.equal(data(f.call("learner-b","learning_enroll",{courseId:"bank-course"})).version,2);
  const graded=data(f.call("learner-a","human_submit_attempt",{attemptId:attempt.attemptId,confirmed:true},"human"));assert.equal(graded.score,100);assert.equal(graded.passed,true);
  data(f.call("editor","learning_retire_question_bank",{bankId:source.bankId}));assert.equal(f.call("editor","learning_apply_question_bank",{courseId:"bank-course",source}).ok,false);
  assert.equal(data(f.call("learner-a","learning_get_attempt",{attemptId:attempt.attemptId})).score,100);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM certificates WHERE enrollment_id=?").get(enrollmentId)!.n,1);
  for(const user of ["learner-a","manager","assessor","outsider"]){assert.equal(f.call(user,"learning_get_question_bank",{bankId:source.bankId}).ok,false);assert.equal(f.service.description(user).tools.some(t=>t.name.includes("question_bank")),false);}
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{f.db.close();}
});
test("private banks require matching owned author courses, current visibility precedes key replay and model-prohibited questions stay in human authoring",()=>{
 const f=fixture();try{
  peer(f);create(f,"private-bank-course","author");create(f,"public-bank-course");
  data(f.call("editor","learning_save_question_bank",{bankId:source.bankId,bank:bank("author",false)}));
  assert.equal(f.call("editor-peer","learning_get_question_bank",{bankId:source.bankId}).ok,false);assert.equal(data(f.call("editor-peer","learning_get_question_banks")).items.length,0);
  const withheld=data(f.call("editor","learning_get_question_bank",{bankId:source.bankId}));assert.equal(withheld.contentWithheld,true);assert.equal("questions" in withheld,false);assert.equal(JSON.stringify(withheld).includes(courses["systems-basics"].quiz.questions[0].prompt),false);
  assert.equal(data(f.call("editor","learning_get_question_bank",{bankId:source.bankId},"human")).questions.length,2);
  assert.equal(f.call("editor","learning_apply_question_bank",{courseId:"public-bank-course",source}).ok,false);assert.equal(f.call("admin","learning_apply_question_bank",{courseId:"systems-basics",source}).ok,false);
  data(f.call("editor","learning_apply_question_bank",{courseId:"private-bank-course",source}));const applied=data(f.call("editor","learning_get_course_draft",{courseId:"private-bank-course"},"human")).draft;assert.equal(applied.aiProcessingAllowed,false);
  const changed=structuredClone(applied);changed.quiz.questions[0].prompt="Manual change with invalid provenance";assert.equal(f.call("editor","learning_update_course",{courseId:"private-bank-course",course:changed}).ok,false);delete changed.quiz.questionBankRef;data(f.call("editor","learning_update_course",{courseId:"private-bank-course",course:changed}));
  assert.equal(f.call("editor","learning_save_question_bank",{bankId:"wider-private-copy",sourceCourseId:"private-bank-course",bank:{...bank(),questions:changed.quiz.questions}}).ok,false);
  data(f.call("editor","learning_save_question_bank",{bankId:"shared-bank",bank:bank()}));
  data(f.call("editor-peer","learning_create_course",{courseId:"peer-bank-course",course:structuredClone(courses["systems-basics"])}));
  const shared={bankId:"shared-bank",version:1,questionIds:["q-retry"]},overrides={idempotencyKey:"peer-apply",expectedRevision:f.service.context("editor-peer","library:demo").revision};
  data(f.call("editor-peer","learning_apply_question_bank",{courseId:"peer-bank-course",source:shared},"bridge",overrides));
  assert.equal(f.call("editor-peer","learning_save_question_bank",{bankId:"shared-bank",bank:bank()}).ok,false);
  data(f.call("editor","learning_save_question_bank",{bankId:"shared-bank",bank:bank("author")}));
  assert.equal(f.call("editor-peer","learning_apply_question_bank",{courseId:"peer-bank-course",source:shared},"bridge",overrides).ok,false);
 }finally{f.db.close();}
});
test("bank validation, original operation key, stale CAS and audit rollback preserve complete version/draft state without auditing authored answer keys",()=>{
 const f=fixture();try{
  create(f);const args={bankId:source.bankId,bank:bank()},overrides={idempotencyKey:"bank-original",expectedRevision:f.service.context("editor","library:demo").revision};
  const saved=data(f.call("editor","learning_save_question_bank",args,"bridge",overrides));assert.deepEqual(data(f.call("editor","learning_save_question_bank",args,"bridge",overrides)),saved);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM question_bank_versions").get()!.n,1);
  assert.equal(f.call("editor","learning_save_question_bank",{...args,bank:{...args.bank,title:"changed"}},"bridge",overrides).error?.code,"IDEMPOTENCY_CONFLICT");
  for(const invalid of [{...bank(),questions:[...bank().questions,bank().questions[0]]},{...bank(),questions:[{...bank().questions[0],correct:7}]}])assert.equal(f.call("editor","learning_save_question_bank",{bankId:"invalid-bank",bank:invalid}).ok,false);
  assert.equal(f.call("editor","learning_apply_question_bank",{courseId:"bank-course",source:{...source,questionIds:["missing"]}}).ok,false);
  assert.equal(f.call("editor","learning_apply_question_bank",{courseId:"bank-course",source:{...source,questionIds:["q-retry","q-retry"]}}).ok,false);
  const draft=String(f.db.prepare("SELECT draft FROM courses WHERE id='bank-course'").get()!.draft),revision=f.service.context("editor","library:demo").revision;
  f.db.exec("CREATE TRIGGER fail_bank_audit BEFORE INSERT ON audit WHEN NEW.tool='learning_apply_question_bank' BEGIN SELECT RAISE(ABORT,'Audit unavailable'); END");
  const apply={courseId:"bank-course",source};assert.equal(f.call("editor","learning_apply_question_bank",apply).ok,false);assert.equal(String(f.db.prepare("SELECT draft FROM courses WHERE id='bank-course'").get()!.draft),draft);assert.equal(f.service.context("editor","library:demo").revision,revision);
  f.db.exec("DROP TRIGGER fail_bank_audit");assert.equal(f.call("editor","learning_apply_question_bank",apply,"bridge",{expectedRevision:99999}).ok,false);data(f.call("editor","learning_apply_question_bank",apply));
  const audit=String(f.db.prepare("SELECT arguments FROM audit WHERE tool='learning_save_question_bank'").get()!.arguments);assert.equal(audit.includes("correct"),false);assert.equal(audit.includes("q-retry"),false);assert.equal(audit.includes("questionCount"),true);
  assert.equal(f.call("editor","learning_create_course",{courseId:"invalid-new-ref",course:{...structuredClone(courses["systems-basics"]),quiz:{...structuredClone(courses["systems-basics"].quiz),questionBankRef:source}}}).ok,false);
 }finally{f.db.close();}
});
test("actual human/bridge HTTP enforces bank role/audience and live session boundaries, with no learner bank solution endpoint",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";let app:any;try{
  peer(f);data(f.call("editor","learning_save_question_bank",{bankId:source.bankId,bank:bank("author",false)}));
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));
  async function auth(user:string){const r=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:user,password:user==="editor-peer"?"editor-dev":user+"-dev"}});assert.equal(r.statusCode,200);return {host:"127.0.0.1:4314",origin,cookie:String(r.headers["set-cookie"]).split(";")[0],"x-csrf-token":r.json().csrf,"x-pear-epoch":r.json().sessionEpoch};}
  for(const user of ["learner-a","editor-peer","editor"]){
   const headers=await auth(user),payload={requestId:"bank-http",documentId:"learning:demo:"+user+"::assessments",toolName:"learning_get_question_bank",arguments:{bankId:source.bankId,version:1},expectedRevision:null,idempotencyKey:null};
   for(const channel of ["human","bridge"]){const r=await app.inject({method:"POST",url:"/api/"+channel+"/invoke",headers,payload});assert.equal(r.statusCode,user==="editor"?200:user==="editor-peer"?404:403);
    if(user==="editor")assert.equal(Array.isArray(r.json().data.questions),channel==="human");else assert.equal(r.body.includes(courses["systems-basics"].quiz.questions[0].prompt),false);
   }
   assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-csrf-token":"wrong"},payload})).statusCode,403);
  }
 }finally{if(app)await app.close();f.db.close();}
});
