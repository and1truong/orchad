import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {freshReport} from "../src/shared/reports.ts";
import {createApp} from "../src/server/app.ts";
const spec=()=>({...freshReport(),kind:"course" as const,columns:["title"] as any});
function complete(f:ReturnType<typeof fixture>,courseId:string,enrollmentId:string){
 const course=courses[courseId];for(const l of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId,lessonId:l.id},"human"));
 const attempt=data(f.call("learner-a","learning_start_attempt",{enrollmentId}));for(const q of course.quiz.questions)data(f.call("learner-a","human_save_answer",{attemptId:attempt.attemptId,questionId:q.id,answer:q.correct},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:attempt.attemptId,confirmed:true},"human"));
}
test("typed summaries cover entire filtered authorized ledger rather than one page; status counts reconcile actual completion and omit other learners' data",()=>{
 const f=fixture();try{
  const done=data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"})).enrollmentId;complete(f,"systems-basics",done);
  const overdue=data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"})).enrollmentId;f.db.prepare("UPDATE enrollments SET due_date='2000-01-01T00:00:00.000Z' WHERE id=?").run(overdue);
  data(f.call("learner-a","learning_enroll",{courseId:"privacy-basics"}));data(f.call("learner-b","learning_enroll",{courseId:"learning-vi"}));
  const preview=data(f.call("manager","learning_report_preview",{spec:spec(),limit:1}));assert.equal(preview.items.length,1);assert.equal(preview.total,3);assert.equal("status" in preview.items[0],false);
  const audit=f.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n,keys=f.db.prepare("SELECT COUNT(*) AS n FROM idempotency").get()!.n,revision=f.service.context("manager","library:demo").revision;
  const summary=data(f.call("manager","learning_report_summary",{spec:spec(),snapshotHash:preview.snapshotHash}));assert.equal(summary.rowTotal,3);assert.equal(summary.snapshotHash,preview.snapshotHash);assert.equal(summary.scope,"entire_filtered_authorized_audience");assert.equal(summary.unit,"learning_records");
  for(const status of ["completed","overdue","in_progress"])assert.equal(summary.statusCounts.find((r:any)=>r.status===status).count,1);
  assert.equal(summary.statusCounts.reduce((n:number,r:any)=>n+r.count,0),3);assert.equal(JSON.stringify(summary).includes("learner-b"),false);assert.equal(JSON.stringify(summary).includes(courses["systems-basics"].lessons[0].text),false);
  assert.equal(data(f.call("admin","learning_report_summary",{spec:spec()})).rowTotal,4);
  assert.equal(data(f.call("manager","learning_report_summary",{spec:{...spec(),status:"completed"}})).rowTotal,1);
  assert.equal(data(f.call("manager","learning_report_summary",{spec:{...spec(),query:"' DROP TABLE enrollments; --"}})).rowTotal,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n,audit);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM idempotency").get()!.n,keys);assert.equal(f.service.context("manager","library:demo").revision,revision);
  for(const user of ["learner-a","editor","assessor","outsider"])assert.equal(f.call(user,"learning_report_summary",{spec:spec()}).ok,false);
  assert.equal(f.call("manager","learning_report_summary",{spec:{...spec(),learnerId:"learner-b"}}).error?.code,"FORBIDDEN");
 }finally{f.db.close();}
});
test("summary and preview share one exact scope/data snapshot; another learner does not change manager results but a relationship change requires refresh",()=>{
 const f=fixture();try{
  data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));const preview=data(f.call("manager","learning_report_preview",{spec:spec(),limit:1}));
  data(f.call("learner-b","learning_enroll",{courseId:"learning-vi"}));assert.equal(data(f.call("manager","learning_report_summary",{spec:spec(),snapshotHash:preview.snapshotHash})).rowTotal,1);
  data(f.call("admin","learning_save_user",{user:{id:"learner-a",name:"learner-a",role:"learner",active:true,managerId:null,preferredLanguage:"en",interests:[],customFields:[]}}));
  assert.equal(f.call("manager","learning_report_summary",{spec:spec(),snapshotHash:preview.snapshotHash}).error?.code,"STALE_CONTEXT");assert.equal(data(f.call("manager","learning_report_summary",{spec:spec()})).rowTotal,0);
  assert.equal(f.call("manager","learning_report_summary",{spec:{...spec(),completedFrom:"2026-02-30"}}).error?.code,"INVALID_ARGUMENT");
 }finally{f.db.close();}
});
test("actual summary HTTP stays behind cookie role/epoch/CSRF checks; bearer credentials cannot broaden manager audience or supply a learner session",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";let app:any;try{
  data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"}));data(f.call("learner-b","learning_enroll",{courseId:"learning-vi"}));
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));const headers={host:"127.0.0.1:4314",origin},r=await app.inject({method:"POST",url:"/api/login",headers,payload:{username:"manager",password:"manager-dev"}});assert.equal(r.statusCode,200);
  const own={...headers,cookie:String(r.headers["set-cookie"]).split(";")[0],"x-csrf-token":r.json().csrf,"x-pear-epoch":r.json().sessionEpoch},payload={requestId:"summary-http",documentId:"library:demo::reports",toolName:"learning_report_summary",arguments:{spec:spec()},expectedRevision:null,idempotencyKey:null};
  for(const channel of ["human","bridge"]){const response=await app.inject({method:"POST",url:"/api/"+channel+"/invoke",headers:own,payload});assert.equal(response.statusCode,200);assert.equal(response.json().data.rowTotal,1);}
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:own,payload:{...payload,arguments:{spec:{...spec(),learnerId:"learner-b"}}}})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...own,"x-pear-epoch":"old"},payload})).statusCode,409);
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:{...headers,authorization:"Bearer pear_"+"a".repeat(64)},payload})).statusCode,401);
 }finally{if(app)await app.close();f.db.close();}
});
