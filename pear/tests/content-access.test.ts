import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import type {Course,ContentItem} from "../src/shared/model.ts";
function peer(f:ReturnType<typeof fixture>){f.db.prepare("INSERT INTO accounts(id,tenant,name,role,password_hash,salt) SELECT 'editor-peer',tenant,'Peer',role,password_hash,salt FROM accounts WHERE id='editor'").run();f.db.prepare("INSERT INTO workspaces(id,tenant,owner) VALUES('learning:demo:editor-peer','demo','editor-peer')").run();}
const authored=():Course=>({...structuredClone(courses["systems-basics"]),title:"Original private source",access:"author"});
const item:ContentItem={title:"Original private document",summary:"Original controlled fixture",language:"en",provider:"Pear Originals",license:"self-authored",aiProcessingAllowed:true,kind:"text",text:"Original private source text.",access:"author"};
test("author audience denies discovery, direct reads, draft edits, enrollment/assignment and private-reference redistribution before key replay",()=>{
 const f=fixture();try{
  peer(f);const c=authored();
  data(f.call("editor","learning_create_course",{courseId:"private-course",course:c}));data(f.call("editor","learning_publish_course",{courseId:"private-course"}));
  data(f.call("editor","learning_create_content_item",{itemId:"private-item",item}));data(f.call("editor","learning_publish_content_item",{itemId:"private-item"}));
  for(const user of ["learner-a","manager","editor-peer","assessor","admin","outsider"]){
   assert.equal(data(f.call(user,"learning_search",{query:"Original private source"})).items.length,0,user+" search");
   assert.equal(data(f.call(user,"learning_search_items",{query:"Original private document"})).items.length,0,user+" items");
   for(const [name,args] of [["learning_get_item",{courseId:"private-course"}],["learning_get_content_item",{itemId:"private-item"}],["learning_enroll",{courseId:"private-course"}],["learning_enroll_item",{itemId:"private-item",version:1}],["learning_get_language_variants",{kind:"course",sourceId:"private-course",preferredLanguage:"vi"}]] as const)assert.equal(f.call(user,name,args).ok,false,user+" "+name);
  }
  assert.equal(f.call("editor-peer","learning_update_course",{courseId:"private-course",course:{...c,title:"Denied"}}).error?.code,"FORBIDDEN");
  assert.equal(f.call("editor-peer","learning_get_course_draft",{courseId:"private-course"}).error?.code,"FORBIDDEN");
  assert.equal(data(f.call("editor-peer","learning_get_drafts")).items.some((r:any)=>r.id==="private-course"),false);
  assert.equal(data(f.call("editor-peer","learning_get_content_drafts")).items.some((r:any)=>r.id==="private-item"),false);
  assert.equal(data(f.call("admin","learning_get_course_draft",{courseId:"private-course"})).draft.title,c.title,"Admin review remains authorized");
  assert.equal(f.call("admin","learning_assign",{courseId:"private-course",learnerId:"learner-a",dueDate:null}).ok,false);
  const publicCopy={...structuredClone(courses["systems-basics"]),lessons:[{id:"source",title:"placeholder",text:"placeholder",kind:"text" as const,prerequisiteIds:[],contentRef:{itemId:"private-item",version:1}}]};
  assert.equal(f.call("editor","learning_create_course",{courseId:"public-copy",course:publicCopy}).ok,false);
  data(f.call("editor","learning_create_course",{courseId:"private-copy",course:{...publicCopy,access:"author"}}));data(f.call("editor","learning_publish_course",{courseId:"private-copy"}));
  const playlist={title:"Original playlist",summary:"Original controlled fixture",access:"tenant",items:[{kind:"course",id:"private-course"}]};
  assert.equal(f.call("editor","learning_save_playlist",{collectionId:"public-playlist",playlist}).ok,false);
  data(f.call("editor","learning_save_playlist",{collectionId:"private-playlist",playlist:{...playlist,access:"author"}}));data(f.call("editor","learning_publish_collection",{collectionId:"private-playlist"}));
  const e=data(f.call("editor","learning_enroll",{courseId:"private-course"}));
  assert.equal(data(f.call("editor","learning_get_lesson",{enrollmentId:e.enrollmentId,lessonId:c.lessons[0].id})).courseId,"private-course");
  const ie=data(f.call("editor","learning_enroll_item",{itemId:"private-item",version:1}));data(f.call("editor","human_complete_item",{itemEnrollmentId:ie.itemEnrollmentId},"human"));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM integration_events WHERE resource_id IN ('private-course','private-copy','private-item','private-playlist',?,?)").get(e.enrollmentId,ie.itemEnrollmentId)!.n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM courses WHERE id='public-copy'").get()!.n,0);
  const publicOwned=structuredClone(courses["systems-basics"]);data(f.call("editor","learning_create_course",{courseId:"retry-source",course:publicOwned}));
  const doc="library:demo::content",revision=f.service.context("editor-peer",doc).revision,key="reviewed-old-update";
  const args={courseId:"retry-source",course:{...publicOwned,title:"Public reviewed update"}};
  data(f.call("editor-peer","learning_update_course",args,"bridge",{documentId:doc,expectedRevision:revision,idempotencyKey:key}));
  data(f.call("editor","learning_update_course",{courseId:"retry-source",course:{...publicOwned,access:"author"}}));
  const before=f.service.context("editor",doc).revision;
  assert.equal(f.call("editor-peer","learning_update_course",args,"bridge",{documentId:doc,expectedRevision:revision,idempotencyKey:key}).error?.code,"FORBIDDEN");
  assert.equal(f.service.context("editor",doc).revision,before);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{f.db.close();}
});
test("published audience changes preserve authorized immutable pins; private files cannot be guessed or reused by other authors",()=>{
 const f=fixture();try{
  peer(f);const owner=f.service.principal("editor");
  const file=f.service.media.upload(owner,{filename:"original.pdf",mime:"application/pdf",confirmed:"true",key:"private-file",revision:String(f.service.context("editor","library:demo").revision)},Buffer.from("%PDF-1.4\nOriginal private fixture\n%%EOF"));
  const document={...item,kind:"document" as const,assetId:file.id};
  data(f.call("editor","learning_create_content_item",{itemId:"file-source",item:document}));data(f.call("editor","learning_publish_content_item",{itemId:"file-source"}));
  for(const user of ["learner-a","editor-peer"]){
   assert.throws(()=>f.service.media.read(f.service.principal(user),file.id,{itemId:"file-source",version:1}));
   assert.equal(f.call(user,"learning_create_content_item",{itemId:"file-leak-"+user,item:{...document,access:"tenant"}}).ok,false);
  }
  assert.equal(f.service.media.read(owner,file.id,{}).id,file.id);
  data(f.call("editor","learning_update_content_item",{itemId:"file-source",item:{...document,access:"tenant",text:"New shared draft"}}));
  const sharedDraft=data(f.call("editor-peer","learning_get_content_drafts")).items.find((r:any)=>r.id==="file-source");assert.equal(sharedDraft.draft.text,"New shared draft");assert.equal(sharedDraft.published,null,"Draft sharing does not expose an older private version");
  assert.equal(f.call("learner-a","learning_get_content_item",{itemId:"file-source"}).ok,false);
  const c=authored();data(f.call("editor","learning_create_course",{courseId:"audience-course",course:c}));data(f.call("editor","learning_publish_course",{courseId:"audience-course"}));
  data(f.call("editor","learning_update_course",{courseId:"audience-course",course:{...c,access:"tenant"}}));data(f.call("editor","learning_publish_course",{courseId:"audience-course"}));
  const enrolled=data(f.call("learner-a","learning_enroll",{courseId:"audience-course"}));assert.equal(enrolled.version,2);
  data(f.call("editor","learning_update_course",{courseId:"audience-course",course:{...c,title:"New private version"}}));data(f.call("editor","learning_publish_course",{courseId:"audience-course"}));
  assert.equal(f.call("learner-a","learning_get_item",{courseId:"audience-course"}).ok,false);
  assert.equal(f.call("learner-b","learning_enroll",{courseId:"audience-course"}).ok,false);
  assert.equal(data(f.call("learner-a","learning_get_lesson",{enrollmentId:enrolled.enrollmentId,lessonId:c.lessons[0].id})).version,2);
  const old=f.db.prepare("SELECT content FROM course_versions WHERE course_id='audience-course' AND version=2").get()!.content;assert.equal(JSON.parse(String(old)).access,"tenant");
  assert.equal(data(f.call("learner-a","learning_get_my_learning")).enrollments.find((e:any)=>e.id===enrolled.enrollmentId).course.version,2);
 }finally{f.db.close();}
});
