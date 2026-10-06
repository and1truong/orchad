import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {Bounds} from "@orchard/bridge-contract";
const md=(extra:any={})=>({skills:["Idempotency","Concurrency","Retries"],industries:["Software"],
 outcomes:["Explain how idempotent work prevents duplicate operations"],accessibility:{features:["keyboard","transcript"],provenance:"author_declared"},...extra});
const course=(extra:any={})=>({title:"Safe repeated work",summary:"Bounded concurrency and safe recovery",topic:"Distributed systems",
 language:"en",duration:20,level:"advanced",provider:"Search originals",license:"self-authored",aiProcessingAllowed:true,
 completionPolicy:"human_attestation_and_quiz",discovery:md(),
 lessons:[{id:"read",title:"Original study",text:"Only the original lesson body",kind:"text",prerequisiteIds:[]}],
 quiz:{passScore:80,maxAttempts:2,questions:[{id:"q",prompt:"Choose the original correct answer",options:["Correct","Incorrect"],correct:0}]},...extra});
function publish(f:ReturnType<typeof fixture>,id="discovery-source",value=course()){
 data(f.call("editor","learning_create_course",{courseId:id,course:value}));
 data(f.call("editor","learning_publish_course",{courseId:id}));
}
const search=(f:ReturnType<typeof fixture>,args:any={},user="learner-a",source:"bridge"|"human"="bridge")=>data(f.call(user,"learning_search",args,source));
function complete(f:ReturnType<typeof fixture>,id:string){
 const enrollmentId=data(f.call("learner-a","learning_enroll",{courseId:id})).enrollmentId;
 data(f.call("learner-a","human_complete_lesson",{enrollmentId,lessonId:"read"},"human"));
 const attemptId=data(f.call("learner-a","learning_start_attempt",{enrollmentId})).attemptId;
 data(f.call("learner-a","human_save_answer",{attemptId,questionId:"q",answer:0},"human"));
 data(f.call("learner-a","human_submit_attempt",{attemptId,confirmed:true},"human"));
 return enrollmentId;
}
test("controlled-concept relevance finds authored metadata paraphrases, preserves keyword semantics and returns honest no-match",()=>{
 const f=fixture();try{
  publish(f);
  assert.equal(search(f,{query:"avoid doing the same work twice",queryMode:"keyword"}).total,0);
  for(const query of ["avoid doing the same work twice","recover a lost response","stop a retry storm","too many requests","mat phan hoi","gioi han dong thoi"]){
   const result=search(f,{query,queryMode:"concepts"});
   assert.equal(result.items[0].id,"discovery-source",query);assert.equal(result.retrieval,"controlled_concepts_v1");
   assert.ok(result.items[0].relevance.concepts.length>0);
  }
  assert.equal(search(f,{query:"underwater basket weaving",queryMode:"concepts"}).total,0);
  assert.equal(search(f,{query:"Safe repeated work"}).items[0].id,"discovery-source");
  assert.equal(search(f,{},"outsider").total,0);
  assert.equal(JSON.stringify(search(f)).includes("Only the original lesson body"),false);
  assert.equal(JSON.stringify(search(f)).includes('"correct":'),false);
 }finally{f.db.close();}
});
test("metadata/format/rating/publication/promotion filters intersect without widening scope, and publishing resets version ratings",()=>{
 const f=fixture();try{
  publish(f);
  data(f.call("editor","learning_save_curation",{kind:"course",contentId:"discovery-source",policy:{endorsed:true,featured:true,spotlight:false,retiring:false},reason:"Reviewed search fixture"}));
  const id=complete(f,"discovery-source");
  data(f.call("learner-a","human_save_course_feedback",{enrollmentId:id,rating:5,comment:"Private opinion never belongs in search",confirmed:true},"human"));
  const args={topic:"Distributed systems",language:"en",level:"advanced",provider:"Search originals",minDuration:10,maxDuration:20,
   skills:["Idempotency"],industry:"Software",format:"text",accessibility:["keyboard","transcript"],ratingAtLeast:4,promotion:"featured",
   aiProcessingAllowed:true,publishedSince:new Date().toISOString().slice(0,10)};
  const result=search(f,args);assert.equal(result.total,1);assert.equal(result.items[0].rating.average,5);
  assert.equal(result.items[0].publicationProvenance,"pear_transaction");
  assert.equal(JSON.stringify(result).includes("Private opinion"),false);
  assert.equal(search(f,{...args,accessibility:["captions"]}).total,0);
  assert.equal(search(f,{...args,industry:"Medicine"}).total,0);
  assert.equal(search(f,{...args,maxDuration:19}).total,0);
  assert.equal(search(f,{publishedSince:"2000-01-01"}).items.some((x:any)=>x.id==="systems-basics"),false);
  assert.equal(f.call("learner-a","learning_search",{publishedSince:"2026-02-30"}).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.call("learner-a","learning_search",{minDuration:30,maxDuration:20}).error?.code,"INVALID_ARGUMENT");
  data(f.call("editor","learning_update_course",{courseId:"discovery-source",course:course()}));
  data(f.call("editor","learning_publish_course",{courseId:"discovery-source"}));
  assert.equal(search(f,{ratingAtLeast:4,provider:"Search originals"}).total,0);
  assert.equal(data(f.call("learner-a","learning_get_progress",{enrollmentId:id})).version,1);
 }finally{f.db.close();}
});
test("comparison validates every current published source and withholds human-only outcomes from bridge",()=>{
 const f=fixture();try{
  publish(f,"allowed");
  publish(f,"human-only",course({aiProcessingAllowed:false,discovery:md({outcomes:["PRIVATE-ONLY authored outcome"]})}));
  const args={courseIds:["allowed","human-only"]};
  const bridge=data(f.call("learner-a","learning_compare_courses",args));
  assert.equal(bridge.items[1].outcomesWithheld,true);assert.equal(JSON.stringify(bridge).includes("PRIVATE-ONLY"),false);
  assert.ok(JSON.stringify(data(f.call("learner-a","learning_compare_courses",args,"human"))).includes("PRIVATE-ONLY"));
  assert.equal(JSON.stringify(data(f.call("learner-a","learning_get_item",{courseId:"human-only"}))).includes("PRIVATE-ONLY"),false);
  assert.equal(f.call("learner-a","learning_compare_courses",{courseIds:["allowed","allowed"]}).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.call("outsider","learning_compare_courses",args).ok,false);
  data(f.call("editor","learning_retire_course",{courseId:"allowed"}));
  assert.equal(f.call("learner-a","learning_compare_courses",args).error?.code,"NOT_FOUND");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM enrollments").get()!.n,0);
 }finally{f.db.close();}
});
test("large whole-metadata rows paginate below the shared cap without truncation or dropped sources",()=>{
 const f=fixture();try{
  const big=md({skills:Array.from({length:8},(_,i)=>"skill-"+i+"-"+ "s".repeat(70)),
    industries:Array.from({length:8},(_,i)=>"industry-"+i+"-"+ "i".repeat(65)),
    outcomes:Array.from({length:8},(_,i)=>"outcome-"+i+"-"+ "x".repeat(280))});
  for(let i=0;i<24;i++)publish(f,"bulk-"+String(i).padStart(2,"0"),course({discovery:big}));
  let offset=0;const ids:string[]=[];
  for(;;){
   const result=f.call("learner-a","learning_search",{provider:"Search originals",offset,limit:20,sort:"title"});
   assert.ok(Buffer.byteLength(JSON.stringify(result))<=Bounds.message);
   const page=data(result);assert.ok(page.items.length>0);assert.ok(page.items.length<20);
   for(const row of page.items){assert.equal(row.discovery.outcomes.length,8);assert.equal(row.discovery.outcomes[7],big.outcomes[7]);ids.push(row.id);}
   if(page.nextOffset===null)break;assert.ok(page.nextOffset>offset);offset=page.nextOffset;
  }
  assert.equal(ids.length,24);assert.equal(new Set(ids).size,24);
 }finally{f.db.close();}
});
test("profile recommendations use explicit own reasons, omit enrolled/retired content and prioritize due learning independently of estimates",()=>{
 const f=fixture();try{
  publish(f);
  data(f.call("learner-a","learning_save_profile",{preferredLanguage:"en",interests:["Capacity"]}));
  const recommended=data(f.call("learner-a","learning_get_recommendations"));
  const row=recommended.items.find((r:any)=>r.id==="discovery-source");assert.ok(row);
  assert.deepEqual(row.sourceIds,["discovery-source"]);assert.ok(row.reasons.includes("Declared interest: Capacity"));
  assert.equal(data(f.call("outsider","learning_get_recommendations")).total,0);
  const completed=complete(f,"discovery-source");
  assert.equal(data(f.call("learner-a","learning_get_recommendations")).items.some((r:any)=>r.id==="discovery-source"),false);
  const due=data(f.call("manager","learning_assign",{courseId:"systems-basics",learnerId:"learner-a",dueDate:"2020-01-01T00:00:00.000Z"})).enrollmentId;
  const self=data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"})).enrollmentId;
  const learning=data(f.call("learner-a","learning_get_my_learning"));
  assert.deepEqual(learning.enrollments.map((e:any)=>e.id),[due,self,completed]);
  assert.equal(learning.enrollments[0].overdue,true);
 }finally{f.db.close();}
});
test("metadata validation/publication rollback and disk reopen preserve version timestamps without inventing legacy dates",async()=>{
 const {mkdtempSync,rmSync}=await import("node:fs"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
 const dir=mkdtempSync(join(tmpdir(),"pear-discovery-"));let f=fixture(join(dir,"discovery.sqlite"));
 try{
  assert.equal(f.call("editor","learning_create_course",{courseId:"invalid",course:course({discovery:md({skills:["same"," SAME "]})})}).error?.code,"INVALID_ARGUMENT");
  publish(f);
  const before=search(f,{provider:"Search originals"}).items[0].publishedAt;assert.ok(before);
  f.db.exec("CREATE TRIGGER fail_publish BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  assert.equal(f.call("editor","learning_publish_course",{courseId:"discovery-source"}).ok,false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM content_publications WHERE content_id='discovery-source'").get()!.n,1);
  f.db.exec("DROP TRIGGER fail_publish");f.db.close();f=fixture(join(dir,"discovery.sqlite"));
  assert.equal(search(f,{provider:"Search originals"}).items[0].publishedAt,before);
  assert.equal(search(f).items.find((r:any)=>r.id==="systems-basics").publishedAt,null);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});

test("tracked standalone metadata never leaks human-only outcomes or raw asset IDs to the bridge",()=>{
 const f=fixture();try{
  const asset=f.service.media.upload(f.service.principal("editor"),{filename:"original.pdf",mime:"application/pdf",key:"original-file",
   revision:String(f.service.context("editor","library:demo").revision),confirmed:"true"},Buffer.from("%PDF-original"));
  const item={title:"Private standalone",summary:"Metadata only",language:"en",provider:"Original",license:"self-authored",aiProcessingAllowed:false,
   kind:"document",text:"PRIVATE-ITEM-BODY",assetId:asset.id,discovery:md({outcomes:["PRIVATE-ITEM-OUTCOME"]})};
  data(f.call("editor","learning_create_content_item",{itemId:"private-item",item}));
  data(f.call("editor","learning_publish_content_item",{itemId:"private-item"}));
  const e=data(f.call("learner-a","learning_enroll_item",{itemId:"private-item"}));
  for(const [name,args] of [["learning_get_content_item",{itemId:"private-item"}],["learning_get_item_enrollment",{itemEnrollmentId:e.itemEnrollmentId}]] as const){
   const bridge=JSON.stringify(data(f.call("learner-a",name,args)));
   assert.equal(bridge.includes(asset.id),false);assert.equal(bridge.includes("PRIVATE-ITEM"),false);
   const human=JSON.stringify(data(f.call("learner-a",name,args,"human")));
   assert.ok(human.includes(asset.id));assert.ok(human.includes("PRIVATE-ITEM-OUTCOME"));
  }
 }finally{f.db.close();}
});
