import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {createApp} from "../src/server/app.ts";
import type {Award,Playlist} from "../src/shared/programs.ts";
import type {AssignmentPlan} from "../src/shared/assignments.ts";
const group=(ids=["learner-a","admin","editor-peer"])=>({name:"Original approved audience",kind:"static",memberIds:ids,mode:"ALL",rules:[]});
function setup(){
 const f=fixture();f.db.prepare("INSERT INTO accounts(id,tenant,name,role,password_hash,salt) SELECT 'editor-peer',tenant,'Peer',role,password_hash,salt FROM accounts WHERE id='editor'").run();f.db.prepare("INSERT INTO workspaces(id,tenant,owner) VALUES('learning:demo:editor-peer','demo','editor-peer')").run();
 data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group()}));data(f.call("admin","learning_save_group",{groupId:"audience-b",group:group(["learner-b"])}));
 const course={...structuredClone(courses["systems-basics"]),title:"Original group source",access:"groups",groupIds:["audience-a"]};data(f.call("editor","learning_create_course",{courseId:"group-source",course}));data(f.call("editor","learning_publish_course",{courseId:"group-source"}));
 return {...f,course};
}
const award=(changes:Partial<Award>={}):Award=>({title:"Original group award",summary:"Synthetic self-authored group program",access:"groups",groupIds:["audience-a"],unit:"credits",target:1,ongoing:false,moderatedExternal:true,requirements:[{id:"evidence",title:"Original evidence",required:true,credits:1,alternatives:[{kind:"external",id:"original-practice"}]}],...changes});
function publish(f:ReturnType<typeof setup>,id:string,value:Award){data(f.call("editor","learning_save_award",{collectionId:id,award:value}));data(f.call("editor","learning_publish_collection",{collectionId:id}));}
test("playlist and nested award group audiences cannot widen original group courses/awards; current discovery denies outsiders and preserves original versions",()=>{
 const f=setup();try{
  const playlist:Playlist={title:"Original group playlist",summary:"Reading only",access:"groups",groupIds:["audience-a"],items:[{kind:"course",id:"group-source"}]};data(f.call("editor","learning_save_playlist",{collectionId:"group-reading",playlist}));data(f.call("editor","learning_publish_collection",{collectionId:"group-reading"}));
  assert.equal(data(f.call("learner-a","learning_get_collection",{collectionId:"group-reading"})).references.items[0].version,1);
  for(const user of ["learner-b","outsider"]){assert.equal(f.call(user,"learning_get_collection",{collectionId:"group-reading"}).ok,false);assert.equal(data(f.call(user,"learning_search_collections")).items.length,0);}
  assert.equal(f.call("editor","learning_save_playlist",{collectionId:"wider-reading",playlist:{...playlist,groupIds:["audience-a","audience-b"]}}).error?.code,"FORBIDDEN");
  publish(f,"group-child",award());const root=award({title:"Original nested group award",requirements:[{id:"nested",title:"Nested requirement",required:true,credits:1,alternatives:[{kind:"award",id:"group-child"}]}]});publish(f,"group-root",root);
  assert.equal(f.call("editor","learning_save_award",{collectionId:"wider-root",award:{...root,groupIds:["audience-a","audience-b"]}}).error?.code,"FORBIDDEN");
  assert.equal(f.call("editor","learning_save_award",{collectionId:"public-root",award:{...root,access:"tenant",groupIds:undefined}}).ok,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM integration_events WHERE resource_id IN ('group-reading','group-root','group-child')").get()!.n,0);
  const original=f.db.prepare("SELECT content FROM collection_versions WHERE collection_id='group-reading' AND version=1").get()!.content;data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group(["admin"])}));assert.equal(f.call("learner-a","learning_get_collection",{collectionId:"group-reading"}).ok,false);assert.equal(f.db.prepare("SELECT content FROM collection_versions WHERE collection_id='group-reading' AND version=1").get()!.content,original);
 }finally{f.db.close();}
});
test("own award group activity and recipient assignment recheck membership before key replay, while original pending evidence and enrollment remain immutable",()=>{
 const f=setup();try{
  publish(f,"group-award",award());const key={idempotencyKey:"group-award-enroll",expectedRevision:f.service.context("learner-a").revision},r=f.call("learner-a","learning_enroll_award",{collectionId:"group-award"},"bridge",key),e=data(r);
  data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:e.awardEnrollmentId,criterionPath:"evidence",amount:1,evidence:"Original own group evidence",confirmed:true},"human"));
  const records=f.db.prepare("SELECT * FROM external_records").all(),enrollments=f.db.prepare("SELECT * FROM award_enrollments").all();
  assert.equal(f.call("admin","learning_assign_award",{collectionId:"group-award",learnerId:"learner-b"}).error?.code,"FORBIDDEN");
  data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group(["admin"])}));
  assert.equal(f.call("learner-a","learning_enroll_award",{collectionId:"group-award"},"bridge",key).ok,false);assert.equal(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:e.awardEnrollmentId,criterionPath:"evidence",amount:1,evidence:"New after withdrawal",confirmed:true},"human").error?.code,"FORBIDDEN");
  assert.deepEqual(f.db.prepare("SELECT * FROM external_records").all(),records);assert.deepEqual(f.db.prepare("SELECT * FROM award_enrollments").all(),enrollments);
  data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group()}));assert.deepEqual(f.call("learner-a","learning_enroll_award",{collectionId:"group-award"},"bridge",key),r);
 }finally{f.db.close();}
});
test("scheduled group awards validate each recipient and withdraw/rejoin the same pinned obligation without duplicate enrollment or notifications",()=>{
 const f=setup();try{
  publish(f,"scheduled-group-award",award());const plan:AssignmentPlan={title:"Original scheduled group award",targetKind:"award",targetId:"scheduled-group-award",audienceKind:"individuals",learnerIds:["learner-a"],groupId:"",membership:"fixed",startsAt:"2026-10-01T10:00:00.000Z",repeatDays:0,endAt:null,dueKind:"none",fixedDueAt:null,rollingDays:0};
  assert.equal(f.call("admin","learning_save_assignment_plan",{planId:"wider-group-plan",plan:{...plan,learnerIds:["learner-a","learner-b"]},reason:"Reviewed recipients"}).error?.code,"FORBIDDEN");
  data(f.call("admin","learning_save_assignment_plan",{planId:"group-plan",plan,reason:"Reviewed original group plan"}));f.service.assignments.runBackground("2026-10-01T10:00:00.000Z");f.service.assignments.runBackground("2026-10-01T10:00:00.000Z");
  const e=f.db.prepare("SELECT * FROM award_enrollments WHERE award_id='scheduled-group-award'").get()!;assert.equal(e.assignment_state,"active");assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM award_enrollments WHERE award_id='scheduled-group-award'").get()!.n,1);
  data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group(["admin"])}));f.service.assignments.runBackground("2026-10-01T11:00:00.000Z");assert.equal(f.db.prepare("SELECT assignment_state FROM award_enrollments WHERE id=?").get(e.id)!.assignment_state,"withdrawn");
  data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group()}));f.service.assignments.runBackground("2026-10-01T12:00:00.000Z");assert.equal(f.db.prepare("SELECT assignment_state FROM award_enrollments WHERE id=?").get(e.id)!.assignment_state,"active");const notices=f.db.prepare("SELECT COUNT(*) AS n FROM learning_notifications").get()!.n;f.service.assignments.runBackground("2026-10-01T12:00:00.000Z");assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM learning_notifications").get()!.n,notices);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM award_enrollments WHERE award_id='scheduled-group-award'").get()!.n,1);
 }finally{f.db.close();}
});
test("group banks support scoped staff reuse with safe source/course group sets and pinned provenance; removed staff cannot read/apply or replay",()=>{
 const f=setup();try{
  const bank={title:"Original group bank",access:"groups",groupIds:["audience-a"],aiProcessingAllowed:true,questions:f.course.quiz.questions};data(f.call("editor","learning_save_question_bank",{bankId:"group-bank",bank,sourceCourseId:"group-source"}));
  assert.equal(data(f.call("editor-peer","learning_get_question_bank",{bankId:"group-bank"})).questions.length,bank.questions.length);
  assert.equal(f.call("learner-a","learning_get_question_bank",{bankId:"group-bank"}).error?.code,"FORBIDDEN");
  assert.equal(f.call("editor","learning_save_question_bank",{bankId:"wider-bank",bank:{...bank,groupIds:["audience-a","audience-b"]},sourceCourseId:"group-source"}).error?.code,"FORBIDDEN");
  data(f.call("editor-peer","learning_create_course",{courseId:"group-bank-target",course:{...f.course,title:"Group bank target"}}));const source={bankId:"group-bank",version:1,questionIds:bank.questions.map(q=>q.id)},key={idempotencyKey:"group-bank-apply",expectedRevision:f.service.context("editor-peer","library:demo").revision},applied=f.call("editor-peer","learning_apply_question_bank",{courseId:"group-bank-target",source},"bridge",key);data(applied);data(f.call("editor-peer","learning_publish_course",{courseId:"group-bank-target"}));
  const before=f.db.prepare("SELECT content FROM course_versions WHERE course_id='group-bank-target' AND version=1").get()!.content;
  const {groupIds,...publicCourse}=f.course;assert.equal(f.call("editor-peer","learning_update_course",{courseId:"group-bank-target",course:{...publicCourse,access:"tenant",quiz:{...f.course.quiz,questionBankRef:source}}}).error?.code,"FORBIDDEN");
  data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group(["admin","learner-a"])}));assert.equal(f.call("editor-peer","learning_get_question_bank",{bankId:"group-bank"}).ok,false);assert.equal(f.call("editor-peer","learning_apply_question_bank",{courseId:"group-bank-target",source},"bridge",key).ok,false);assert.equal(f.db.prepare("SELECT content FROM course_versions WHERE course_id='group-bank-target' AND version=1").get()!.content,before);
 }finally{f.db.close();}
});
test("collection/bank group validation and audit failure roll back new versions, provenance and original keys",()=>{
 const f=setup();try{
  for(const groupIds of [[],["missing"],["audience-a","audience-a"]])assert.equal(f.call("editor","learning_save_award",{collectionId:"invalid-group-award",award:award({groupIds})}).error?.code,"INVALID_ARGUMENT");
  publish(f,"atomic-group-award",award());const original=f.db.prepare("SELECT * FROM collection_versions WHERE collection_id='atomic-group-award'").all();data(f.call("editor","learning_save_award",{collectionId:"atomic-group-award",award:award({title:"Changed original draft"})}));
  f.db.exec("CREATE TRIGGER reject_collection_publish BEFORE INSERT ON audit WHEN NEW.tool='learning_publish_collection' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.equal(f.call("editor","learning_publish_collection",{collectionId:"atomic-group-award"},"bridge",{idempotencyKey:"collection-group-rollback"}).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM collection_versions WHERE collection_id='atomic-group-award'").all(),original);assert.equal(f.db.prepare("SELECT 1 FROM idempotency WHERE key='collection-group-rollback'").get(),undefined);
 }finally{f.db.close();}
});
test("actual bridge/human HTTP respects collection groups and staff-bank boundaries after membership removal; learners never receive bank answer keys",async()=>{
 const f=setup(),origin="http://127.0.0.1:4314";let app:any;try{
  publish(f,"http-group-award",award());data(f.call("editor","learning_save_question_bank",{bankId:"http-group-bank",bank:{title:"HTTP group bank",access:"groups",groupIds:["audience-a"],aiProcessingAllowed:true,questions:f.course.quiz.questions},sourceCourseId:"group-source"}));({app}=await createApp({db:f.db,origin,developmentAuth:true}));
  const base={host:"127.0.0.1:4314",origin};async function login(user:string,password=user+"-dev"){const r=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:user,password}});assert.equal(r.statusCode,200);return {...base,cookie:String(r.headers["set-cookie"]).split(";")[0],"x-csrf-token":r.json().csrf,"x-pear-epoch":r.json().sessionEpoch};}
  const learner=await login("learner-a"),peer=await login("editor-peer","editor-dev"),body=(toolName:string,documentId:string,args:any)=>({requestId:"group-collection-http",toolName,documentId,arguments:args,expectedRevision:null,idempotencyKey:null});
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:learner,payload:body("learning_get_collection","learning:demo:learner-a::programs",{collectionId:"http-group-award"})})).statusCode,200);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:learner,payload:body("learning_get_question_bank","learning:demo:learner-a",{bankId:"http-group-bank"})})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:peer,payload:body("learning_get_question_bank","library:demo::assessments",{bankId:"http-group-bank"})})).statusCode,200);
  data(f.call("admin","learning_save_group",{groupId:"audience-a",group:group(["admin"])}));
  assert.notEqual((await app.inject({method:"POST",url:"/api/bridge/invoke",headers:learner,payload:body("learning_get_collection","learning:demo:learner-a::programs",{collectionId:"http-group-award"})})).statusCode,200);
  assert.notEqual((await app.inject({method:"POST",url:"/api/human/invoke",headers:peer,payload:body("learning_get_question_bank","library:demo",{bankId:"http-group-bank"})})).statusCode,200);
 }finally{if(app)await app.close();f.db.close();}
});
