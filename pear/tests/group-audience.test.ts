import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import type {Course,ContentItem} from "../src/shared/model.ts";
import {ContentAccess} from "../src/server/content-access.ts";
import {createApp} from "../src/server/app.ts";
const staticGroup=(ids=["learner-a","manager","admin"])=>({name:"Original audience",kind:"static",memberIds:ids,mode:"ALL",rules:[]});
const item:ContentItem={title:"Original group item",summary:"Original group-only fixture",language:"en",provider:"Pear Originals",license:"self-authored",aiProcessingAllowed:true,kind:"text",text:"Original group-controlled source body",access:"groups",groupIds:["group-a"]};
function setup(){
 const f=fixture();data(f.call("admin","learning_save_group",{groupId:"group-a",group:staticGroup()}));data(f.call("admin","learning_save_group",{groupId:"group-b",group:staticGroup(["learner-b"])}));
 const course:Course={...structuredClone(courses["systems-basics"]),title:"Original group course",access:"groups",groupIds:["group-a"]};
 data(f.call("editor","learning_create_course",{courseId:"group-course",course}));data(f.call("editor","learning_publish_course",{courseId:"group-course"}));data(f.call("editor","learning_create_content_item",{itemId:"group-item",item}));data(f.call("editor","learning_publish_content_item",{itemId:"group-item"}));
 return {...f,course};
}
test("declared same-tenant groups gate search/compare/direct preview/enrollment/assignment and source copying without exposing group rosters",()=>{
 const f=setup();try{
  for(const user of ["learner-b","assessor","outsider"]){
   assert.equal(data(f.call(user,"learning_search",{query:f.course.title})).items.length,0);
   assert.equal(data(f.call(user,"learning_search_items",{query:item.title})).items.length,0);
   assert.equal(f.call(user,"learning_get_item",{courseId:"group-course"}).ok,false);
   assert.equal(f.call(user,"learning_get_content_item",{itemId:"group-item"}).ok,false);
   assert.equal(f.call(user,"learning_enroll",{courseId:"group-course"}).ok,false);
  }
  for(const user of ["learner-a","editor"])assert.equal(data(f.call(user,"learning_get_item",{courseId:"group-course"})).title,f.course.title);
  assert.equal(f.call("admin","learning_assign",{courseId:"group-course",learnerId:"learner-b",dueDate:null}).ok,false);
  data(f.call("manager","learning_assign",{courseId:"group-course",learnerId:"learner-a",dueDate:null}));
  const reference={...structuredClone(f.course),lessons:[{id:"source",title:"placeholder",text:"placeholder",kind:"text" as const,prerequisiteIds:[],contentRef:{itemId:"group-item",version:1}}]};
  const {groupIds,...tenantReference}=reference;
  assert.equal(f.call("editor","learning_create_course",{courseId:"wider-course",course:{...tenantReference,access:"tenant"}}).error?.code,"FORBIDDEN");
  assert.equal(f.call("editor","learning_create_course",{courseId:"union-course",course:{...reference,groupIds:["group-a","group-b"]}}).error?.code,"FORBIDDEN");
  data(f.call("editor","learning_create_course",{courseId:"pinned-group-copy",course:reference}));data(f.call("editor","learning_publish_course",{courseId:"pinned-group-copy"}));
  assert.equal(f.call("editor","learning_save_playlist",{collectionId:"public-group-copy",playlist:{title:"Public copy",summary:"No unauthorized redistribution",access:"tenant",items:[{kind:"course",id:"group-course"}]}}).ok,false);
  const query=JSON.stringify(data(f.call("learner-a","learning_get_item",{courseId:"group-course"})));assert.equal(query.includes("memberIds"),false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM integration_events WHERE resource_id IN ('group-course','group-item','pinned-group-copy')").get()!.n,0);
 }finally{f.db.close();}
});
test("live static/dynamic membership removal denies pinned body, answers, completion, timers and original enrollment replay while retaining original ledger",()=>{
 const f=setup();try{
  const revision=f.service.context("learner-a").revision,key={idempotencyKey:"group-enrollment-original",expectedRevision:revision},enrolled=f.call("learner-a","learning_enroll",{courseId:"group-course"},"bridge",key),e=data(enrolled),ie=data(f.call("learner-a","learning_enroll_item",{itemId:"group-item",version:1}));
  assert.equal(data(f.call("learner-a","learning_get_lesson",{enrollmentId:e.enrollmentId,lessonId:f.course.lessons[0].id})).courseId,"group-course");
  for(const lesson of f.course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:lesson.id},"human"));
  const attempt=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId})),before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(e.enrollmentId)),attempts=JSON.stringify(f.db.prepare("SELECT * FROM attempts WHERE enrollment_id=?").all(e.enrollmentId));
  data(f.call("admin","learning_save_group",{groupId:"group-a",group:staticGroup(["manager","admin"])}));
  for(const [name,args,source] of [["learning_get_lesson",{enrollmentId:e.enrollmentId,lessonId:f.course.lessons[0].id},"bridge"],["learning_get_attempt",{attemptId:attempt.attemptId},"bridge"],["human_save_answer",{attemptId:attempt.attemptId,questionId:f.course.quiz.questions[0].id,answer:0},"human"],["human_submit_attempt",{attemptId:attempt.attemptId,confirmed:true},"human"],["learning_get_item_enrollment",{itemEnrollmentId:ie.itemEnrollmentId},"bridge"],["human_complete_item",{itemEnrollmentId:ie.itemEnrollmentId,confirmed:true},"human"]] as const)assert.equal(f.call("learner-a",name,args,source).ok,false,name);
  assert.equal(f.call("learner-a","learning_enroll",{courseId:"group-course"},"bridge",key).ok,false);
  assert.throws(()=>new ContentAccess(f.db).enrolled(f.service.principal("learner-a"),"course","group-course",1));
  assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(e.enrollmentId)),before);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM attempts WHERE enrollment_id=?").all(e.enrollmentId)),attempts);
  data(f.call("admin","learning_save_group",{groupId:"group-a",group:{name:"Current direct reports",kind:"dynamic",mode:"ALL",memberIds:[],rules:[{field:"managerId",customField:"",operator:"equals",value:"manager"}]}}));
  assert.deepEqual(f.call("learner-a","learning_enroll",{courseId:"group-course"},"bridge",key),enrolled);
  f.db.prepare("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'").run();assert.equal(f.call("learner-a","learning_get_lesson",{enrollmentId:e.enrollmentId,lessonId:f.course.lessons[0].id}).ok,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE course_id='group-course' AND learner='learner-a'").get()!.n,1);
 }finally{f.db.close();}
});
test("group audience validation, publication rollback and private quiz-bank extraction preserve versions and history",()=>{
 const f=setup();try{
  for(const bad of [{...f.course,groupIds:[]},{...f.course,groupIds:["group-a","group-a"]},{...f.course,groupIds:["missing"]},{...f.course,access:"tenant",groupIds:["group-a"]}])assert.equal(f.call("editor","learning_create_course",{courseId:"invalid-group",course:bad}).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.db.prepare("SELECT 1 FROM courses WHERE id='invalid-group'").get(),undefined);
  const bank={title:"Group source bank",access:"tenant",aiProcessingAllowed:true,questions:f.course.quiz.questions};assert.equal(f.call("editor","learning_save_question_bank",{bankId:"wider-bank",bank,sourceCourseId:"group-course"}).error?.code,"FORBIDDEN");
  const old=f.db.prepare("SELECT * FROM course_versions WHERE course_id='group-course'").all();
  data(f.call("editor","learning_update_course",{courseId:"group-course",course:{...f.course,title:"Group version 2"}}));
  f.db.exec("CREATE TRIGGER reject_group_publish BEFORE INSERT ON audit WHEN NEW.tool='learning_publish_course' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;");
  assert.equal(f.call("editor","learning_publish_course",{courseId:"group-course"}).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM course_versions WHERE course_id='group-course'").all(),old);
  assert.equal(f.db.prepare("SELECT latest_version FROM courses WHERE id='group-course'").get()!.latest_version,1);
 }finally{f.db.close();}
});
test("actual human/bridge/file/timer HTTP rechecks group audience after enrollment and membership removal without changing official history",async()=>{
 const f=setup(),origin="http://127.0.0.1:4314",asset=f.service.media.upload(f.service.principal("editor"),{filename:"group.pdf",mime:"application/pdf",confirmed:"true",key:"group-http-file",revision:String(f.service.context("editor","library:demo").revision)},Buffer.from("%PDF-1.4\nOriginal controlled fixture\n%%EOF"));
 data(f.call("editor","learning_create_content_item",{itemId:"group-document",item:{...item,kind:"document",assetId:asset.id}}));data(f.call("editor","learning_publish_content_item",{itemId:"group-document"}));
 const e=data(f.call("learner-a","learning_enroll",{courseId:"group-course"})),ie=data(f.call("learner-a","learning_enroll_item",{itemId:"group-document",version:1}));let app:any;
 try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-a",password:"learner-a-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  const payload={requestId:"group-http",documentId:"learning:demo:learner-a",toolName:"learning_get_lesson",arguments:{enrollmentId:e.enrollmentId,lessonId:f.course.lessons[0].id},expectedRevision:null,idempotencyKey:null};
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload})).statusCode,200);
  assert.equal((await app.inject({method:"GET",url:"/api/assets/"+asset.id+"?itemEnrollmentId="+ie.itemEnrollmentId,headers})).statusCode,200);
  assert.equal((await app.inject({method:"POST",url:"/api/study-timer",headers,payload:{action:"start",kind:"course",targetId:e.enrollmentId}})).statusCode,200);
  const before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(e.enrollmentId));data(f.call("admin","learning_save_group",{groupId:"group-a",group:staticGroup(["admin"])}));
  for(const url of ["/api/bridge/invoke","/api/human/invoke"])assert.notEqual((await app.inject({method:"POST",url,headers,payload})).statusCode,200);
  assert.equal((await app.inject({method:"GET",url:"/api/assets/"+asset.id+"?itemEnrollmentId="+ie.itemEnrollmentId,headers})).statusCode,404);
  assert.notEqual((await app.inject({method:"POST",url:"/api/study-timer",headers,payload:{action:"start",kind:"course",targetId:e.enrollmentId}})).statusCode,200);
  assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(e.enrollmentId)),before);
 }finally{if(app)await app.close();f.db.close();}
});
