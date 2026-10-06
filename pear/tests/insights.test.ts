import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {TelemetryService} from "../src/server/telemetry.ts";
import {InsightService} from "../src/server/insights.ts";
import {createApp} from "../src/server/app.ts";
function tagged(skills:string[]){return {...structuredClone(courses["systems-basics"]),title:"Original tagged learning",discovery:{skills,industries:[],outcomes:[],accessibility:{features:[],provenance:"author_declared" as const}}};}
function publish(f:ReturnType<typeof fixture>,id:string,skills:string[]){const course=tagged(skills);data(f.call("editor","learning_create_course",{courseId:id,course}));data(f.call("editor","learning_publish_course",{courseId:id}));return course;}
test("own insights reconcile official completion, self-confirmed reading, intended duration, observed intervals and pinned declared skill sources without mastery inference",()=>{
 const f=fixture();try{
  const course=publish(f,"insight-course",["Reliability"]),eid=data(f.call("learner-a","learning_enroll",{courseId:"insight-course"})).enrollmentId;
  const item={title:"Original declared reading",summary:"Original",language:"en",provider:"Pear Originals",license:"self-authored",aiProcessingAllowed:true,kind:"text",text:"Private reading body must stay out of insights",discovery:{skills:["reliability"],industries:[],outcomes:[],accessibility:{features:[],provenance:"author_declared"}}};
  data(f.call("editor","learning_create_content_item",{itemId:"insight-item",item}));data(f.call("editor","learning_publish_content_item",{itemId:"insight-item"}));
  const itemId=data(f.call("learner-a","learning_enroll_item",{itemId:"insight-item"})).itemEnrollmentId;data(f.call("learner-a","human_complete_item",{itemEnrollmentId:itemId,confirmed:true},"human"));
  let now=100000;const timer=new TelemetryService(f.db,()=>now),lease=timer.act(f.service.principal("learner-a"),"insight-binding",{action:"start",kind:"course",targetId:eid});now+=5000;timer.act(f.service.principal("learner-a"),"insight-binding",{action:"stop",kind:"course",targetId:eid,token:lease.token});
  const beforeCompletion=data(f.call("learner-a","learning_get_my_insights"));assert.equal(beforeCompletion.summary.officialCourseCompletions,0);assert.equal(beforeCompletion.summary.selfConfirmedItemCompletions,1);
  for(const lesson of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:eid,lessonId:lesson.id},"human"));
  const attempt=data(f.call("learner-a","learning_start_attempt",{enrollmentId:eid}));for(const q of course.quiz.questions)data(f.call("learner-a","human_save_answer",{attemptId:attempt.attemptId,questionId:q.id,answer:q.correct},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:attempt.attemptId,confirmed:true},"human"));
  data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"}));
  const other=data(f.call("learner-b","learning_enroll",{courseId:"insight-course"})).enrollmentId;
  data(f.call("editor","learning_update_course",{courseId:"insight-course",course:{...course,discovery:{...course.discovery,skills:["Changed private tag"]}}}));data(f.call("editor","learning_publish_course",{courseId:"insight-course"}));
  const rowsBefore=f.db.prepare("SELECT * FROM enrollments").all(),audit=f.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n,keys=f.db.prepare("SELECT COUNT(*) AS n FROM idempotency").get()!.n,revision=f.service.context("learner-a").revision;
  const insights=data(f.call("learner-a","learning_get_my_insights"));assert.equal(insights.summary.enrollmentRecords,3);assert.equal(insights.summary.courseRecords,2);assert.equal(insights.summary.officialCourseCompletions,1);assert.equal(insights.summary.selfConfirmedItemCompletions,1);assert.equal(insights.summary.intendedCourseMinutes,30);assert.equal(insights.summary.observedSeconds,5);assert.equal(insights.summary.recordsWithTimer,1);assert.equal(insights.summary.untaggedContentRecords,1);
  assert.equal(insights.items.length,1);assert.equal(insights.items[0].enrollmentRecords,2);assert.equal(insights.items[0].completedRecords,2);assert.equal(insights.items[0].mastery,null);assert.ok(insights.items[0].examples.every((r:any)=>r.version===1));assert.equal(JSON.stringify(insights).includes(other),false);assert.equal(JSON.stringify(insights).includes("Changed private tag"),false);assert.equal(JSON.stringify(insights).includes(item.text),false);assert.equal(JSON.stringify(insights).includes("q-retry"),false);
  assert.deepEqual(f.db.prepare("SELECT * FROM enrollments").all(),rowsBefore);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n,audit);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM idempotency").get()!.n,keys);assert.equal(f.service.context("learner-a").revision,revision);
  assert.equal(data(f.call("manager","learning_get_my_insights")).summary.enrollmentRecords,0);assert.equal(data(f.call("outsider","learning_get_my_insights")).summary.enrollmentRecords,0);
 }finally{f.db.close();}
});
test("whole skill pages retain own snapshot while other learners change; own changes require refresh and live revoked authority denies before any result",()=>{
 const f=fixture();try{
  const skills=Array.from({length:12},(_,i)=>"Original skill "+String(i).padStart(2,"0"));publish(f,"insight-pages-a",skills.slice(0,6));publish(f,"insight-pages-b",skills.slice(6));for(const courseId of ["insight-pages-a","insight-pages-b"])data(f.call("learner-a","learning_enroll",{courseId}));
  const first=data(f.call("learner-a","learning_get_my_insights",{limit:5}));assert.equal(first.items.length,5);assert.equal(first.total,12);assert.equal(first.nextOffset,5);
  data(f.call("learner-b","learning_enroll",{courseId:"systems-basics"}));const second=data(f.call("learner-a","learning_get_my_insights",{offset:5,limit:5,snapshotHash:first.snapshotHash}));assert.equal(second.snapshotHash,first.snapshotHash);assert.equal(second.items.length,5);assert.equal(second.nextOffset,10);assert.equal(new Set([...first.items,...second.items].map(r=>r.skill)).size,10);
  data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"}));assert.equal(f.call("learner-a","learning_get_my_insights",{offset:10,limit:5,snapshotHash:first.snapshotHash}).error?.code,"STALE_CONTEXT");
  assert.equal(f.call("learner-a","learning_get_my_insights",{learnerId:"learner-b"}).error?.code,"INVALID_ARGUMENT");
  const principal=f.service.principal("learner-a");f.db.prepare("UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'").run();assert.throws(()=>new InsightService(f.db).read(principal,{}),/authority changed/);assert.equal(f.call("learner-a","learning_get_my_insights").error?.code,"UNAUTHORIZED");
 }finally{f.db.close();}
});
test("actual human and bridge HTTP insight reads expose only own ledger; cookies/epoch are required and bearer settings credentials grant no learner session",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";let app:any;try{
  publish(f,"insight-http",["Original HTTP tag"]);data(f.call("learner-a","learning_enroll",{courseId:"insight-http"}));data(f.call("learner-b","learning_enroll",{courseId:"learning-vi"}));
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));const headers={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers,payload:{username:"learner-a",password:"learner-a-dev"}});assert.equal(login.statusCode,200);
  const own={...headers,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch},payload={requestId:"insights",documentId:"learning:demo:learner-a::reports",toolName:"learning_get_my_insights",arguments:{},expectedRevision:null,idempotencyKey:null};
  for(const source of ["human","bridge"]){const r=await app.inject({method:"POST",url:"/api/"+source+"/invoke",headers:own,payload});assert.equal(r.statusCode,200);assert.equal(r.json().data.summary.enrollmentRecords,1);assert.equal(r.json().data.items[0].examples[0].contentId,"insight-http");assert.equal(JSON.stringify(r.json()).includes("learning-vi"),false);}
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:{...own,"x-pear-epoch":"other-session"},payload})).statusCode,409);
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:{...headers,authorization:"Bearer pear_"+"a".repeat(64)},payload})).statusCode,401);
 }finally{if(app)await app.close();f.db.close();}
});
