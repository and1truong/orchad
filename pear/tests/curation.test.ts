import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {createApp} from "../src/server/app.ts";
const policy={endorsed:true,featured:true,spotlight:false,retiring:false};
function create(f:ReturnType<typeof fixture>,id:string){
 const course=structuredClone(courses["systems-basics"]);course.title="Curation "+id;
 data(f.call("editor","learning_create_course",{courseId:id,course}));
 data(f.call("editor","learning_publish_course",{courseId:id}));
}
const preview=(f:ReturnType<typeof fixture>,kind="course",contentId="source",replacementId="replacement")=>
 data(f.call("editor","learning_preview_retirement",{kind,contentId,replacementId}));
test("organization promotions are metadata-only, deterministic, bounded and tenant scoped; content actions preserve role boundaries",()=>{
 const f=fixture();try{
  create(f,"source");create(f,"replacement");
  data(f.call("editor","learning_save_curation",{kind:"course",contentId:"source",policy,reason:"Reviewed promotion"}));
  data(f.call("admin","learning_save_curation",{kind:"course",contentId:"replacement",policy:{...policy,spotlight:true},reason:"Reviewed spotlight"}));
  const picks=data(f.call("learner-a","learning_get_curated_content",{offset:0,limit:1}));
  assert.equal(picks.total,2);assert.equal(picks.items[0].id,"replacement");assert.equal(picks.nextOffset,1);
  assert.ok(picks.items[0].reasons.includes("Organization spotlight"));
  assert.equal(JSON.stringify(picks).includes("Retries need a budget"),false);
  assert.equal(JSON.stringify(picks).includes("correct"),false);
  assert.equal(data(f.call("outsider","learning_get_curated_content")).total,0);
  for(const user of ["learner-a","manager","assessor","outsider"])
   assert.equal(f.call(user,"learning_save_curation",{kind:"course",contentId:"source",policy,reason:"Denied"}).ok,false);
  assert.equal(f.call("editor","learning_preview_retirement",{kind:"course",contentId:"source",replacementId:"source"}).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.call("editor","learning_preview_retirement",{kind:"course",contentId:"source",replacementId:"missing"}).ok,false);
 }finally{f.db.close();}
});
test("retirement requires unchanged impact and exact replacement, preserves pinned course progress and reconciles a committed key",()=>{
 const f=fixture();try{
  create(f,"source");create(f,"replacement");
  const id=data(f.call("learner-a","learning_enroll",{courseId:"source"})).enrollmentId;
  data(f.call("learner-a","human_complete_lesson",{enrollmentId:id,lessonId:"retry"},"human"));
  const old=JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id));
  const reviewed=preview(f);assert.equal(reviewed.impact.pinnedEnrollments,1);
  data(f.call("learner-b","learning_enroll",{courseId:"source"}));
  assert.equal(f.call("editor","learning_retire_with_replacement",{kind:"course",contentId:"source",replacementId:"replacement",previewHash:reviewed.previewHash,reason:"Stale impact"}).error?.code,"STALE_CONTEXT");
  assert.equal(f.db.prepare("SELECT state FROM courses WHERE id='source'").get()!.state,"published");
  const next=preview(f),revision=f.service.context("editor","library:demo").revision;
  const args={kind:"course",contentId:"source",replacementId:"replacement",previewHash:next.previewHash,reason:"Reviewed immutable replacement"};
  const overrides={expectedRevision:revision,idempotencyKey:"retire-source-once"};
  const result=f.call("editor","learning_retire_with_replacement",args,"bridge",overrides);data(result);
  assert.deepEqual(f.call("editor","learning_retire_with_replacement",args,"bridge",overrides),result);
  assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments WHERE id=?").get(id)),old);
  assert.equal(data(f.call("learner-a","learning_get_lesson",{enrollmentId:id,lessonId:"retry"})).completed,true);
  assert.equal(f.call("manager","learning_assign",{courseId:"source",learnerId:"learner-a",dueDate:null}).ok,false);
  const alternative=data(f.call("learner-a","learning_get_retirement_alternative",{kind:"course",contentId:"source"}));
  assert.equal(alternative.replacement.id,"replacement");assert.equal(alternative.automaticMigration,false);
  data(f.call("editor","learning_retire_course",{courseId:"replacement"}));
  assert.equal(data(f.call("learner-a","learning_get_retirement_alternative",{kind:"course",contentId:"source"})).available,false);
  assert.equal(data(f.call("learner-a","learning_get_curated_content")).total,0);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{f.db.close();}
});
test("impact finds pinned reusable-item course/playlist references and nested award dependencies without rewriting them",()=>{
 const f=fixture();try{
  const item={title:"Source item",summary:"Original",language:"en",provider:"Pear",license:"self-authored",aiProcessingAllowed:true,kind:"text",text:"Pinned reusable source"};
  for(const id of ["source-item","replacement-item"]){
   data(f.call("editor","learning_create_content_item",{itemId:id,item}));
   data(f.call("editor","learning_publish_content_item",{itemId:id}));
  }
  const course=structuredClone(courses["systems-basics"]);
  course.lessons=[{...course.lessons[0],contentRef:{itemId:"source-item",version:1}}];
  data(f.call("editor","learning_create_course",{courseId:"reference-course",course}));
  data(f.call("editor","learning_publish_course",{courseId:"reference-course"}));
  data(f.call("editor","learning_save_playlist",{collectionId:"reference-playlist",playlist:{title:"Reference playlist",summary:"Pinned",access:"tenant",items:[{kind:"item",id:"source-item"}]}}));
  data(f.call("editor","learning_publish_collection",{collectionId:"reference-playlist"}));
  const tracked=data(f.call("learner-a","learning_enroll_item",{itemId:"source-item"})).itemEnrollmentId;
  const review=preview(f,"item","source-item","replacement-item");
  assert.equal(review.impact.pinnedEnrollments,1);assert.equal(review.impact.pinnedCourseVersions,1);assert.equal(review.impact.pinnedCollectionVersions,1);
  data(f.call("editor","learning_retire_with_replacement",{kind:"item",contentId:"source-item",replacementId:"replacement-item",previewHash:review.previewHash,reason:"Reviewed references"}));
  assert.equal(data(f.call("learner-a","learning_get_item_enrollment",{itemEnrollmentId:tracked},"human")).item.text,item.text);
  assert.equal(JSON.parse((f.db.prepare("SELECT content FROM course_versions WHERE course_id='reference-course'").get() as any).content).lessons[0].text,item.text);
  const award=(ref:any)=>({title:"Pinned award",summary:"Original",access:"tenant",unit:"credits",target:1,ongoing:false,moderatedExternal:true,requirements:[{id:"required",title:"Required",required:true,credits:1,alternatives:[ref]}]});
  data(f.call("editor","learning_save_award",{collectionId:"inner-reference",award:award({kind:"course",id:"reference-course"})}));
  data(f.call("editor","learning_publish_collection",{collectionId:"inner-reference"}));
  data(f.call("editor","learning_save_award",{collectionId:"outer-reference",award:award({kind:"award",id:"inner-reference"})}));
  data(f.call("editor","learning_publish_collection",{collectionId:"outer-reference"}));
  create(f,"replacement");
  assert.equal(preview(f,"course","reference-course","replacement").impact.pinnedCollectionVersions,2);
 }finally{f.db.close();}
});
test("curation audit rollback and restart preserve historical ledgers, replacement and promotions",async()=>{
 const {mkdtempSync,rmSync}=await import("node:fs"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
 const dir=mkdtempSync(join(tmpdir(),"pear-curation-"));let f=fixture(join(dir,"curation.sqlite"));
 try{
  create(f,"source");create(f,"replacement");
  const review=preview(f);f.db.exec("CREATE TRIGGER fail_curation BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  const args={kind:"course",contentId:"source",replacementId:"replacement",previewHash:review.previewHash,reason:"Reviewed replacement"};
  assert.equal(f.call("editor","learning_retire_with_replacement",args).ok,false);
  assert.equal(f.db.prepare("SELECT state FROM courses WHERE id='source'").get()!.state,"published");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM content_curation").get()!.n,0);
  f.db.exec("DROP TRIGGER fail_curation");data(f.call("editor","learning_retire_with_replacement",args));
  f.db.close();f=fixture(join(dir,"curation.sqlite"));
  assert.equal(data(f.call("learner-a","learning_get_retirement_alternative",{kind:"course",contentId:"source"})).replacement.id,"replacement");
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("human and bridge retirement HTTP use the same reviewed impact, tenant and channel authority",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314",{app}=await createApp({db:f.db,origin,developmentAuth:true});
 try{
  create(f,"source");create(f,"replacement");
  const response=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:"editor",password:"editor-dev"}});
  const login=response.json(),headers={host:"127.0.0.1:4314",origin,cookie:String(response.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.csrf,"x-pear-epoch":login.sessionEpoch};
  const args={kind:"course",contentId:"source",replacementId:"replacement"};
  const read={requestId:"impact-http",documentId:"library:demo",toolName:"learning_preview_retirement",arguments:args,expectedRevision:null,idempotencyKey:null};
  const result=await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:read});assert.equal(result.statusCode,200);
  const human=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:read});assert.deepEqual(data(human.json()),data(result.json()));
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:{...read,documentId:"learning:demo:editor"}})).statusCode,403);
  const retire={...read,toolName:"learning_retire_with_replacement",arguments:{...args,previewHash:data(result.json()).previewHash,reason:"Reviewed HTTP impact"},expectedRevision:f.service.context("editor","library:demo").revision,idempotencyKey:"retire-http"};
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:retire})).statusCode,200);
 }finally{await app.close();f.db.close();}
});
