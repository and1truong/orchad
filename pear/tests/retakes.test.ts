import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {allCatalog} from "../src/shared/catalog.ts";
import {createApp} from "../src/server/app.ts";
export function completed(f:ReturnType<typeof fixture>,id="systems-basics"){
 const enrollmentId=data(f.call("learner-a","learning_enroll",{courseId:id})).enrollmentId,c=courses[id];
 for(const l of c.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId,lessonId:l.id},"human"));
 const attemptId=data(f.call("learner-a","learning_start_attempt",{enrollmentId})).attemptId;
 for(const q of c.quiz.questions)data(f.call("learner-a","human_save_answer",{attemptId,questionId:q.id,answer:q.correct},"human"));
 data(f.call("learner-a","human_submit_attempt",{attemptId,confirmed:true},"human"));
 return enrollmentId;
}
test("human retake creates an empty distinct pinned record without rewriting prior completion, attempts, certificate, deadline or assignment obligations; retries create one child",()=>{
 const f=fixture();try{
  const enrollmentId=completed(f),original=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId),attempts=f.db.prepare("SELECT * FROM attempts").all(),cert=f.db.prepare("SELECT * FROM certificates").get()!;
  const newer={...structuredClone(courses["systems-basics"]),title:"Original later course"};
  data(f.call("admin","learning_update_course",{courseId:"systems-basics",course:newer}));data(f.call("admin","learning_publish_course",{courseId:"systems-basics"}));
  const options=data(f.call("learner-a","human_get_course_retake_options",{enrollmentId},"human"));assert.deepEqual(options.options.map((v:any)=>[v.mode,v.version]),[["enrolled",1],["latest",2]]);
  const args={enrollmentId,mode:"enrolled",targetVersion:1,confirmed:true},overrides={idempotencyKey:"reviewed-retake",expectedRevision:f.service.context("learner-a","learning:demo:learner-a").revision};
  const result=f.call("learner-a","human_retake_completed_course",args,"human",overrides);const fresh=data(result);assert.notEqual(fresh.enrollmentId,enrollmentId);
  assert.deepEqual(f.call("learner-a","human_retake_completed_course",args,"human",overrides),result);
  assert.equal(f.call("learner-a","human_retake_completed_course",{...args,targetVersion:2,mode:"latest"},"human",overrides).error?.code,"IDEMPOTENCY_CONFLICT");
  assert.equal(f.call("learner-a","human_retake_completed_course",args,"human").error?.code,"INVALID_ARGUMENT");
  const row=f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(fresh.enrollmentId)!;assert.equal(row.version,1);assert.equal(row.retake_of,enrollmentId);assert.equal(row.status,"in_progress");assert.equal(row.completed_lessons,"[]");for(const key of ["assigned_by","due_date","completed_at","assignment_cycle_id"])assert.equal(row[key],null);
  assert.equal(f.call("learner-a","learning_start_attempt",{enrollmentId:fresh.enrollmentId}).error?.code,"FORBIDDEN");
  assert.deepEqual(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(enrollmentId),original);assert.deepEqual(f.db.prepare("SELECT * FROM attempts").all(),attempts);assert.deepEqual(f.db.prepare("SELECT * FROM certificates").get(),cert);
  assert.equal(f.service.certificate("learner-a",String(cert.id)).version,1);
  assert.equal(data(f.call("learner-a","learning_enroll",{courseId:"systems-basics"})).enrollmentId,enrollmentId);
  assert.equal(data(f.call("learner-a","human_get_course_retake_options",{enrollmentId},"human")).existingRetake.id,fresh.enrollmentId);
 }finally{f.db.close();}
});
test("retake requires own completed record, explicit current version and human channel; private latest/withdrawn course cannot authorize new records or stale-key replay",()=>{
 const f=fixture();try{
  const enrollmentId=completed(f),args={enrollmentId,mode:"latest",targetVersion:1,confirmed:true};
  for(const user of ["learner-b","manager","admin","editor","assessor","outsider"])assert.equal(f.call(user,"human_retake_completed_course",args,"human").ok,false);
  for(const role of ["learner","manager","admin","content_admin","assessor"] as const)assert.equal(allCatalog(role).some(t=>t.name.startsWith("human_")&&t.name.includes("retake")),false);
  assert.equal(f.call("learner-a","human_retake_completed_course",args).error?.code,"FORBIDDEN");
  assert.equal(f.call("learner-a","human_retake_completed_course",{...args,confirmed:false},"human").error?.code,"INVALID_ARGUMENT");
  const pending=data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"})).enrollmentId;assert.equal(f.call("learner-a","human_get_course_retake_options",{enrollmentId:pending},"human").error?.code,"FORBIDDEN");
  data(f.call("admin","learning_update_course",{courseId:"systems-basics",course:{...structuredClone(courses["systems-basics"]),access:"author"}}));data(f.call("admin","learning_publish_course",{courseId:"systems-basics"}));
  assert.equal(f.call("learner-a","human_retake_completed_course",args,"human").error?.code,"STALE_CONTEXT");assert.equal(f.call("learner-a","human_retake_completed_course",{...args,targetVersion:2},"human").error?.code,"NOT_FOUND");
  assert.deepEqual(data(f.call("learner-a","human_get_course_retake_options",{enrollmentId},"human")).options.map((v:any)=>v.mode),["enrolled"]);
  const own={...args,mode:"enrolled"},key={idempotencyKey:"old-public-retake",expectedRevision:f.service.context("learner-a","learning:demo:learner-a").revision};
  data(f.call("learner-a","human_retake_completed_course",own,"human",key));
  data(f.call("admin","learning_unpublish_course",{courseId:"systems-basics"}));
  assert.equal(f.call("learner-a","human_retake_completed_course",own,"human",key).error?.code,"FORBIDDEN");assert.equal(data(f.call("learner-a","human_get_course_retake_options",{enrollmentId},"human")).options[0].available,false);
 }finally{f.db.close();}
});
test("retake audit failure rolls back new enrollment, original key and revision; latest version choice is exact and owned reports retain both records",()=>{
 const f=fixture();try{
  const enrollmentId=completed(f),newer={...structuredClone(courses["systems-basics"]),title:"Reviewed latest retake"};
  data(f.call("admin","learning_update_course",{courseId:"systems-basics",course:newer}));data(f.call("admin","learning_publish_course",{courseId:"systems-basics"}));
  const args={enrollmentId,mode:"latest",targetVersion:2,confirmed:true},before=f.service.context("learner-a","learning:demo:learner-a").revision,count=f.db.prepare("SELECT COUNT(*) AS n FROM idempotency").get()!.n;
  f.db.exec("CREATE TRIGGER reject_retake BEFORE INSERT ON audit WHEN NEW.tool='human_retake_completed_course' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;");
  assert.equal(f.call("learner-a","human_retake_completed_course",args,"human").ok,false);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE retake_of IS NOT NULL").get()!.n,0);assert.equal(f.service.context("learner-a","learning:demo:learner-a").revision,before);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM idempotency").get()!.n,count);
  f.db.exec("DROP TRIGGER reject_retake");const fresh=data(f.call("learner-a","human_retake_completed_course",args,"human"));assert.equal(fresh.version,2);assert.equal(data(f.call("learner-a","learning_get_lesson",{enrollmentId:fresh.enrollmentId,lessonId:courses["systems-basics"].lessons[0].id})).version,2);
  const transcript=data(f.call("learner-a","learning_get_transcript",{limit:20}));assert.equal(transcript.total,2);assert.deepEqual(transcript.items.map((r:any)=>r.status).sort(),["completed","in_progress"]);
  const row=f.db.prepare("SELECT arguments FROM audit WHERE tool='human_retake_completed_course'").get()!;assert.equal(JSON.parse(String(row.arguments)).targetVersion,2);assert.equal(String(row.arguments).includes(newer.quiz.questions[0].prompt),false);
 }finally{f.db.close();}
});
test("actual retake HTTP denies bridge dispatch and cross-owner/epoch/CSRF, and creates fresh history through explicit learner human confirmation",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";let app:any;try{
  const enrollmentId=completed(f);({app}=await createApp({db:f.db,origin,developmentAuth:true}));
  const headers={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers,payload:{username:"learner-a",password:"learner-a-dev"}}),body=login.json();
  const own={...headers,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":body.csrf,"x-pear-epoch":body.sessionEpoch},payload={requestId:"retake-http",documentId:"learning:demo:learner-a",toolName:"human_retake_completed_course",arguments:{enrollmentId,mode:"enrolled",targetVersion:1,confirmed:true},expectedRevision:f.service.context("learner-a","learning:demo:learner-a").revision,idempotencyKey:"retake-http-key"};
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:own,payload})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...own,"x-pear-epoch":"old"},payload})).statusCode,409);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...own,"x-csrf-token":"wrong"},payload})).statusCode,403);
  const r=await app.inject({method:"POST",url:"/api/human/invoke",headers:own,payload});assert.equal(r.statusCode,200);assert.equal(r.json().data.retakeOf,enrollmentId);
  assert.deepEqual((await app.inject({method:"POST",url:"/api/human/invoke",headers:own,payload})).json(),r.json());assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE retake_of=?").get(enrollmentId)!.n,1);
 }finally{if(app)await app.close();f.db.close();}
});
