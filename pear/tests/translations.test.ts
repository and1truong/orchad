import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {data} from "./helpers.ts";
import {translationFixture} from "./translation-fixture.ts";
import {TranslationService} from "../src/server/translations.ts";
import {createApp} from "../src/server/app.ts";
test("one content identity chooses a reviewed authorized language, labels provenance and collapses catalog identities",()=>{
 const s=translationFixture();try{
  const fallback=s.translations.read(s.learner,"course","systems-basics","vi");assert.equal(fallback.fallback,true);assert.equal(fallback.preferredId,null);
  const link=s.link(),read=s.translations.read(s.learner,"course","systems-basics","vi");assert.equal(read.identityId,link.identityId);assert.equal(read.preferredId,"systems-vi");assert.equal(read.fallback,false);
  assert.equal(read.variants[1].humanQualityReviewed,true);assert.match(read.variants[1].disclosure,/Human/);
  assert.equal(s.translations.read(s.learner,"course","systems-vi","en").identityId,read.identityId);
  const model=data(s.call("learner-a","learning_get_language_variants",{kind:"course",sourceId:"systems-basics",preferredLanguage:"vi"}));
  assert.equal(JSON.stringify(model).includes("qualityReview"),false);for(const field of ["text","quiz","assetId","correct"])assert.equal(Object.hasOwn(model.variants[1],field),false);
  const search=data(s.call("learner-a","learning_search",{query:"",limit:20}));
  assert.equal(search.items.filter((r:any)=>r.identityId===link.identityId).length,1);assert.equal(search.items.find((r:any)=>r.identityId===link.identityId).id,"systems-basics");
  const vi=data(s.call("learner-a","learning_search",{language:"vi",limit:20}));assert.equal(vi.items.find((r:any)=>r.identityId===link.identityId).id,"systems-vi");
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM enrollments").get()!.n,0);
  assert.throws(()=>s.translations.read(s.learner,"course","systems-basics","fr"),/unsupported/);
 }finally{s.db.close();}
});
test("review uses current same-tenant published source versions, content roles, CAS, no translation chains and atomic audit",()=>{
 const s=translationFixture();try{
  for(const id of ["manager","assessor","learner-a","outsider"])assert.throws(()=>s.translations.mutate(s.service.principal(id),s.args()),/administrator/);
  assert.throws(()=>s.link({sourceVersion:2}),/version changed/);assert.throws(()=>s.link({revision:999}),/review changed/);
  assert.throws(()=>s.link({sourceId:"systems-basics"}),/distinct/);
  s.db.prepare("UPDATE courses SET state='draft' WHERE id='systems-vi'").run();assert.throws(()=>s.link(),/Published/);s.db.prepare("UPDATE courses SET state='published' WHERE id='systems-vi'").run();
  const revision=s.service.context("admin","library:demo").revision;
  s.db.exec("CREATE TRIGGER reject_translation_audit BEFORE INSERT ON audit WHEN NEW.tool LIKE 'human_translation_%' BEGIN SELECT RAISE(ABORT,'translation audit failed'); END");
  assert.throws(()=>s.link(),/audit failed/);assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM translation_identities").get()!.n,0);assert.equal(s.service.context("admin","library:demo").revision,revision);
  s.db.exec("DROP TRIGGER reject_translation_audit");
  const result=s.translations.mutate(s.service.principal("editor"),s.args());assert.ok(result.active);
  assert.throws(()=>s.link({originalId:"systems-vi",sourceId:"systems-basics"}),/chains|canonical/);
  assert.throws(()=>s.link({provenance:"provider_generated"}),/provenance/);
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.db.close();}
});
test("published source changes invalidate translation review, explicit new review restores preference and retains existing pins",()=>{
 const s=translationFixture();try{
  const linked=s.link(),enrollment=data(s.call("learner-a","learning_enroll",{courseId:"systems-basics"}));
  data(s.call("learner-a","human_complete_lesson",{enrollmentId:enrollment.enrollmentId,lessonId:"retry"},"human"));
  const before=data(s.call("learner-a","learning_get_progress",{enrollmentId:enrollment.enrollmentId}));
  data(s.call("admin","learning_publish_course",{courseId:"systems-vi"}));
  const outdated=s.translations.read(s.learner,"course","systems-basics","vi");assert.equal(outdated.preferredId,null);assert.match(outdated.unavailable[0].reason,/review/);
  s.translations.mutate(s.admin,{action:"disable",variantId:linked.variantId,reason:"Re-review changed version",key:"disable-old",revision:s.service.context("admin","library:demo").revision});
  const fresh=s.link({sourceVersion:2,provenance:"ai_assisted_reviewed",qualityReview:"Human checked explicitly labelled AI-assisted original derivative"});assert.equal(fresh.identityId,linked.identityId);
  assert.equal(s.translations.read(s.learner,"course","systems-basics","vi").preferredId,"systems-vi");
  assert.equal(s.translations.read(s.learner,"course","systems-basics","vi").variants[1].provenance,"ai_assisted_reviewed");
  assert.deepEqual(data(s.call("learner-a","learning_get_progress",{enrollmentId:enrollment.enrollmentId})),before);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE learner='learner-a'").get()!.n,1);
  const recommendation=data(s.call("learner-a","learning_get_recommendations",{limit:10}));assert.equal(recommendation.items.some((r:any)=>r.identityId===linked.identityId),false);
 }finally{s.db.close();}
});
test("retired or outside-tenant variants never become silent fallback, and retired enrolled originals remain immutable",()=>{
 const s=translationFixture();try{
  s.link();const enrollment=data(s.call("learner-a","learning_enroll",{courseId:"systems-basics"}));
  data(s.call("admin","learning_retire_course",{courseId:"systems-vi"}));
  const unavailable=s.translations.read(s.learner,"course","systems-basics","vi");assert.equal(unavailable.fallback,true);assert.equal(unavailable.variants.length,1);assert.equal(unavailable.variants[0].id,"systems-basics");
  assert.throws(()=>s.translations.read(s.service.principal("outsider"),"course","systems-basics","vi"),/Published/);
  data(s.call("admin","learning_retire_course",{courseId:"systems-basics"}));
  assert.throws(()=>s.translations.read(s.learner,"course","systems-basics","en"),/Published/);
  assert.equal(data(s.call("learner-a","learning_get_lesson",{enrollmentId:enrollment.enrollmentId,lessonId:"retry"},"human")).id,"retry");
  assert.equal(s.db.prepare("SELECT version FROM enrollments WHERE id=?").get(enrollment.enrollmentId)!.version,1);
 }finally{s.db.close();}
});
test("review retries retain current disabled state, payload conflicts and live revoked roles fail before historical response",()=>{
 const s=translationFixture();try{
  const args=s.args({key:"translation-once"}),result=s.translations.mutate(s.admin,args);
  assert.deepEqual(s.translations.mutate(s.admin,{...args,revision:999}),result);
  assert.throws(()=>s.translations.mutate(s.admin,{...args,reason:"changed"}),/changed/);
  s.translations.mutate(s.admin,{action:"disable",variantId:result.variantId,reason:"reviewed disable",key:"disable-once",revision:s.service.context("admin","library:demo").revision});
  assert.equal(s.translations.mutate(s.admin,{...args,revision:999}).active,false);
  s.db.prepare("UPDATE accounts SET role='learner',auth_version=auth_version+1 WHERE id='admin'").run();
  assert.throws(()=>s.translations.mutate(s.admin,args),/Active/);
  assert.throws(()=>s.translations.mutate(s.service.principal("admin"),args),/administrator/);
 }finally{s.db.close();}
});
test("standalone originals share identity with reviewed derivatives without creating course credit or exposing private assets",()=>{
 const s=translationFixture();try{
  const item={title:"Original guide",summary:"Self-authored guide",language:"en",provider:"Pear Originals",license:"self-authored",aiProcessingAllowed:false,kind:"text",text:"Private original text",url:"",transcript:""};
  for(const [id,language] of [["guide-en","en"],["guide-vi","vi"]]){
   data(s.call("admin","learning_create_content_item",{itemId:id,item:{...item,language,title:language==="vi"?"Hướng dẫn tự soạn":"Original guide"}}));
   data(s.call("admin","learning_publish_content_item",{itemId:id}));
  }
  const linked=s.link({kind:"item",originalId:"guide-en",sourceId:"guide-vi",qualityReview:"Private review note"});
  const read=data(s.call("learner-a","learning_get_language_variants",{kind:"item",sourceId:"guide-en",preferredLanguage:"vi"}));assert.equal(read.identityId,linked.identityId);assert.equal(read.preferredId,"guide-vi");
  for(const forbidden of ["Private review note","Private original text","assetId"])assert.equal(JSON.stringify(read).includes(forbidden),false);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM enrollments").get()!.n,0);assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM certificates").get()!.n,0);
 }finally{s.db.close();}
});
test("translation identities/review evidence survive restart and human HTTP mutation retains CSRF/epoch/role scope",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-translations-")),path=join(dir,"variants.sqlite");let s=translationFixture(path),app:any;
 try{
  const result=s.link();s.db.close();s=translationFixture(path);assert.equal(s.translations.read(s.learner,"course","systems-vi","en").identityId,result.identityId);
  const origin="http://127.0.0.1:4314",headers={host:"127.0.0.1:4314",origin};({app}=await createApp({db:s.db,origin,developmentAuth:true}));
  const login=await app.inject({method:"POST",url:"/api/login",headers,payload:{username:"admin",password:"admin-dev"}});
  const auth={...headers,cookie:String(login.headers["set-cookie"]).split(";")[0]!,"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  const args={action:"disable",variantId:result.variantId,reason:"HTTP reviewed",key:"http-disable",revision:s.service.context("admin","library:demo").revision};
  assert.equal((await app.inject({method:"POST",url:"/api/translations",headers:{...auth,"x-csrf-token":"bad"},payload:args})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/translations",headers:{...auth,"x-pear-epoch":"bad"},payload:args})).statusCode,409);
  assert.equal((await app.inject({method:"POST",url:"/api/translations",headers:auth,payload:args})).statusCode,200);
  assert.equal((await app.inject({url:"/api/translations",headers:auth})).json().items[0].active,0);
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{if(app)await app.close();s.db.close();rmSync(dir,{recursive:true,force:true});}
});
