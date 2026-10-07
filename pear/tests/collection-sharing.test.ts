import {CURRENT_SCHEMA_VERSION} from "../src/server/database.ts";
import {test} from "node:test";
import assert from "node:assert/strict";
import {shareFixture,offerArgs,references} from "./collection-sharing-fixture.ts";
import {data,fixture} from "./helpers.ts";
import {createApp} from "../src/server/app.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const offer=(f:ReturnType<typeof shareFixture>,overrides:any={})=>f.call("admin","human_offer_original_collection",offerArgs,"human",overrides);
const accept=(f:ReturnType<typeof shareFixture>,id:string,refs=references,user="receiver",overrides:any={})=>f.call(user,"human_accept_original_collection_offer",{offerId:id,expectedVersion:0,references:refs,confirmed:true},"human",overrides);
const incoming=(f:ReturnType<typeof shareFixture>,user="receiver")=>data(f.call(user,"human_get_original_collection_offers",{direction:"incoming"},"human")).items;
test("two independent administrators review configuration and local references; acceptance creates only author-private draft, no copied original media, learner history or assessor grants",()=>{
 const f=shareFixture();try{
  const id=data(offer(f)).offerId;assert.equal(incoming(f).length,1);assert.equal(incoming(f)[0].definition.title,f.award.title);assert.equal(incoming(f,"receiver-two").length,0);assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='share-receiver-award'").get(),undefined);
  const result=data(accept(f,id));assert.equal(result.published,false);assert.equal(result.rightsTransferred,false);const row=f.db.prepare("SELECT * FROM collections WHERE id='share-receiver-award'").get()!;assert.equal(row.tenant,"other");assert.equal(row.owner,"receiver");assert.equal(row.state,"draft");assert.equal(row.latest_version,0);const draft=JSON.parse(row.draft as string);assert.equal(draft.access,"author");assert.equal(draft.groupIds,undefined);assert.equal(draft.requirements[0].alternatives[0].id,"share-local-course");assert.equal(draft.primaryModeration,true);
  for(const table of ["enrollments","attempts","award_enrollments","external_records","assets","award_assessors"])assert.equal(f.db.prepare("SELECT count(*) n FROM "+table).get()!.n,0);
  assert.equal(incoming(f)[0].definition,null);assert.equal(incoming(f)[0].state,"accepted");
 }finally{f.db.close();}
});
test("cross-tenant/reference/role/channel/version mapping is explicit and denied before creating destination state",()=>{
 const f=shareFixture();try{
  const id=data(offer(f)).offerId;assert.equal(accept(f,id,references,"receiver-two").ok,false);assert.equal(accept(f,id,references,"admin").ok,false);assert.equal(f.call("admin","human_offer_original_collection",offerArgs).ok,false);
  for(const refs of [[],[...references,...references],[{...references[0],destinationId:"share-source-course"}],[{...references[0],version:2}],[{...references[0],sourceId:"invented"}]])assert.equal(accept(f,id,refs).ok,false);
  assert.equal(offer(f,{idempotencyKey:"wrong-dest"}).ok,true);
  assert.equal(f.call("admin","human_offer_original_collection",{...offerArgs,destinationAdminId:"outsider"},"human").ok,false);assert.equal(f.call("admin","human_offer_original_collection",{...offerArgs,sourceVersion:2},"human").ok,false);assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='share-receiver-award'").get(),undefined);
 }finally{f.db.close();}
});
test("source cancellation/expiry/live role revoke hide definition from subsequent addressed reads and deny acceptance",()=>{
 const f=shareFixture();try{
  const first=data(offer(f)).offerId;data(f.call("admin","human_cancel_original_collection_offer",{offerId:first,expectedVersion:0,reason:"Original cancellation"},"human"));assert.equal(accept(f,first).ok,false);assert.equal(incoming(f)[0].definition,null);
  const second=data(offer(f)).offerId;f.db.prepare("UPDATE original_collection_offers SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(second);assert.equal(accept(f,second).ok,false);assert.equal(incoming(f).find((r:any)=>r.id===second).definition,null);
  const third=data(offer(f)).offerId;f.db.prepare("UPDATE accounts SET role='manager' WHERE id='admin'").run();assert.equal(accept(f,third).ok,false);const revoked=incoming(f).find((r:any)=>r.id===third);assert.equal(revoked.definition,null);assert.equal(revoked.sourceCollection,null);
 }finally{f.db.close();}
});
test("current destination reference authority is rechecked before original accept receipt and duplicate new keys cannot create another copy",()=>{
 const f=shareFixture();try{
  const id=data(offer(f)).offerId,override={idempotencyKey:"original-share-copy",expectedRevision:f.service.context("receiver","library:other").revision},result=accept(f,id,references,"receiver",override);data(result);assert.deepEqual(accept(f,id,references,"receiver",override),result);assert.equal(accept(f,id).ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM collections WHERE id='share-receiver-award'").get()!.n,1);
  data(f.call("receiver","learning_unpublish_course",{courseId:"share-local-course"}));assert.equal(accept(f,id,references,"receiver",override).ok,false);
 }finally{f.db.close();}
});
test("offer, draft, counterpart revision and redacted audit roll back together if source or receiver audit fails",()=>{
 const f=shareFixture();try{
  const revision=f.service.context("receiver","library:other").revision;f.db.exec("CREATE TRIGGER source_share_abort BEFORE INSERT ON audit WHEN NEW.tool='human_offer_original_collection' BEGIN SELECT RAISE(ABORT,'source share fixture'); END;");assert.equal(offer(f).ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM original_collection_offers").get()!.n,0);assert.equal(f.service.context("receiver","library:other").revision,revision);f.db.exec("DROP TRIGGER source_share_abort");
  const id=data(offer(f)).offerId,sourceRevision=f.service.context("admin","library:demo").revision;f.db.exec("CREATE TRIGGER accept_share_abort BEFORE INSERT ON audit WHEN NEW.tool='human_accept_original_collection_offer' BEGIN SELECT RAISE(ABORT,'accept share fixture'); END;");assert.equal(accept(f,id).ok,false);assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='share-receiver-award'").get(),undefined);assert.equal(f.db.prepare("SELECT state FROM original_collection_offers WHERE id=?").get(id)!.state,"pending");assert.equal(f.service.context("admin","library:demo").revision,sourceRevision);f.db.exec("DROP TRIGGER accept_share_abort");data(accept(f,id));const audit=f.db.prepare("SELECT arguments FROM audit WHERE tool LIKE '%original_collection%'").all();assert.equal(JSON.stringify(audit).includes("Original criterion"),false);assert.equal(JSON.stringify(audit).includes(f.award.title),false);
 }finally{f.db.close();}
});
test("immutable addressed offers and independently mapped drafts survive actual SQLite reopen without auto-publication",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-collection-share-"));let f=shareFixture(join(dir,"state.sqlite"));try{
  const id=data(offer(f)).offerId;data(accept(f,id));const before=f.db.prepare("SELECT * FROM collections WHERE id='share-receiver-award'").get(),award=f.award;f.db.close();f={...fixture(join(dir,"state.sqlite")),award};assert.deepEqual(f.db.prepare("SELECT * FROM collections WHERE id='share-receiver-award'").get(),before);assert.equal(incoming(f)[0].state,"accepted");assert.equal(f.db.prepare("SELECT max(version) n FROM schema_version").get()!.n,CURRENT_SCHEMA_VERSION);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("actual HTTP requires addressed human cookie/epoch/CSRF and independent destination administrator; model bridge cannot offer or accept",async()=>{
 const f=shareFixture(),origin="http://127.0.0.1:4372",{app}=await createApp({db:f.db,origin,developmentAuth:true});
 async function login(user:string){const r=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4372",origin},payload:{username:user,password:user+"-dev"}});assert.equal(r.statusCode,200);return {host:"127.0.0.1:4372",origin,cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-csrf-token":r.json().csrf,"x-pear-epoch":r.json().sessionEpoch};}
 try{
  const id=data(offer(f)).offerId,headers=await login("receiver"),body={requestId:"original-share-http",documentId:"library:other",toolName:"human_accept_original_collection_offer",arguments:{offerId:id,expectedVersion:0,references,confirmed:true},expectedRevision:f.service.context("receiver","library:other").revision,idempotencyKey:"share-http"};
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-csrf-token":"wrong"},payload:body})).statusCode,403);
  const bridgeDenied=await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:body});
  assert.equal(bridgeDenied.statusCode,403);
  assert.equal(bridgeDenied.json().ok,false);
  assert.equal(bridgeDenied.json().error.code,"FORBIDDEN");
  assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='share-receiver-award'").get(),undefined);
  assert.equal(f.db.prepare("SELECT state FROM original_collection_offers WHERE id=?").get(id)!.state,"pending");
  const wrong=await login("receiver-two");assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:wrong,payload:body})).json().ok,false);assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='share-receiver-award'").get(),undefined);
  const accepted=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:body});assert.equal(accepted.json().ok,true,accepted.body);assert.equal(f.db.prepare("SELECT state FROM collections WHERE id='share-receiver-award'").get()!.state,"draft");
 }finally{await app.close();f.db.close();}
});
