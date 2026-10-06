import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {fixture,data} from "./helpers.ts";
import {LearningService} from "../src/server/service.ts";
import {IntegrationCredentials} from "../src/server/integration-credentials.ts";
import type {ProviderAdapter} from "../src/server/provider-catalog.ts";
import {allCatalog,catalog,humanTools} from "../src/shared/catalog.ts";
import {createApp} from "../src/server/app.ts";
import type {Call} from "../src/shared/model.ts";
function setup(){
 const f=fixture(),credentials=new IntegrationCredentials(f.db),issued=credentials.mutate(f.service.principal("admin"),{action:"issue",name:"Synthetic provider",reason:"No commercial connection",scopes:["catalog.write","catalog.read"],ttlDays:1,key:randomUUID(),revision:0});
 const policy:ProviderAdapter={id:"fixture-provider",tenant:"demo",clientId:issued.id,licenseUntil:new Date(Date.now()+86400000).toISOString(),metadataForModels:false,launchOrigin:"https://provider-fixture.invalid"},service=new LearningService(f.db,undefined,[policy]);
 let sequence=0;const event=(action:string,d:any)=>service.providerCatalog.write("Bearer "+issued.token,policy.id,{profile:"pear-provider-metadata/1",id:randomUUID(),sequence:++sequence,sourceTime:new Date().toISOString(),action,data:d});
 const metadata={sourceId:"synthetic-source",version:1,title:"Synthetic entitled content",summary:"Metadata only, no lesson body",language:"en",topic:"Reliability",intendedMinutes:15};
 event("upsert",metadata);event("grant",{sourceId:metadata.sourceId,learnerId:"learner-a",validUntil:new Date(Date.now()+3600000).toISOString()});
 function call(user:string,name:string,args:any={},source:"human"|"bridge"="human",overrides:Partial<Call>={}){
  const p=service.principal(user),documentId=service.personal(p),tool=[...allCatalog(p.role),...humanTools].find(t=>t.name===name),write=tool?.effect!=="read";
  return service.invoke(user,{requestId:randomUUID(),documentId,toolName:name,arguments:args,expectedRevision:write?service.context(user).revision:null,idempotencyKey:write?randomUUID():null,...overrides},source);
 }
 return {...f,service,issued,policy,event,metadata,call,args:{providerId:policy.id,sourceId:metadata.sourceId,version:1,confirmed:true}};
}
test("provider discovery and own history obey live model rights; human launch requires reviewed version/key/CAS and creates no official outcomes",()=>{
 const f=setup();try{
  assert.equal(allCatalog("admin").some(t=>t.name==="human_open_provider_content"),false);assert.ok(catalog("learner").length<=64);
  assert.equal(data(f.call("learner-a","learning_search_provider_content",{},"bridge")).items.length,0);
  assert.equal(f.call("learner-a","learning_get_provider_item",{providerId:f.policy.id,sourceId:f.metadata.sourceId},"bridge").error?.code,"FORBIDDEN");
  assert.equal(data(f.call("learner-a","learning_search_provider_content")).items.length,1);
  assert.equal(data(f.call("learner-b","learning_search_provider_content")).items.length,0);
  assert.equal(f.call("learner-a","human_open_provider_content",f.args,"bridge").error?.code,"FORBIDDEN");
  const before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments").all()),key={idempotencyKey:"own-provider-launch",expectedRevision:f.service.context("learner-a").revision},r=f.call("learner-a","human_open_provider_content",f.args,"human",key),value=data(r);
  assert.deepEqual(f.call("learner-a","human_open_provider_content",f.args,"human",key),r);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_launches").get()!.n,1);
  assert.equal(f.call("learner-a","human_open_provider_content",{...f.args,confirmed:false}).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.call("learner-a","human_open_provider_content",f.args,"human",{expectedRevision:0}).error?.code,"STALE_CONTEXT");
  assert.equal(f.service.providerCatalog.launch(f.service.principal("learner-a"),value.launchId),"https://provider-fixture.invalid/content/synthetic-source");
  assert.throws(()=>f.service.providerCatalog.launch(f.service.principal("learner-b"),value.launchId));
  assert.deepEqual(JSON.stringify(f.db.prepare("SELECT * FROM enrollments").all()),before);
  const own=data(f.call("learner-a","learning_get_my_provider_launches"));assert.equal(own.items[0].sourceVersion,1);assert.equal(own.items[0].officialLearning,false);
  assert.equal(data(f.call("learner-a","learning_get_my_provider_launches",{},"bridge")).items[0].title,null);
  const audit=JSON.parse(f.db.prepare("SELECT arguments FROM audit WHERE tool='human_open_provider_content'").get()!.arguments as string);assert.equal(audit.launchId,value.launchId);
 }finally{f.db.close();}
});
test("revocation/source changes/expiry and auth-version deny old link and idempotent replay; failed launch audit rolls back",()=>{
 const f=setup();try{
  const key={idempotencyKey:"launch-before-revoke",expectedRevision:f.service.context("learner-a").revision},r=data(f.call("learner-a","human_open_provider_content",f.args,"human",key));
  f.event("upsert",{...f.metadata,version:2});assert.throws(()=>f.service.providerCatalog.launch(f.service.principal("learner-a"),r.launchId));assert.equal(f.call("learner-a","human_open_provider_content",f.args,"human",key).error?.code,"STALE_CONTEXT");
  f.event("revoke",{sourceId:f.metadata.sourceId,learnerId:"learner-a"});assert.equal(f.call("learner-a","human_open_provider_content",{...f.args,version:2}).error?.code,"FORBIDDEN");assert.equal(data(f.call("learner-a","learning_get_my_provider_launches")).items[0].title,null);
  f.event("grant",{sourceId:f.metadata.sourceId,learnerId:"learner-a",validUntil:new Date(Date.now()+3600000).toISOString()});
  const revision=f.service.context("learner-a").revision;f.db.exec("CREATE TRIGGER reject_launch BEFORE INSERT ON audit WHEN NEW.tool='human_open_provider_content' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.equal(f.call("learner-a","human_open_provider_content",{...f.args,version:2},"human",{idempotencyKey:"launch-rollback"}).error?.code,"INTERNAL");assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_launches").get()!.n,1);assert.equal(f.service.context("learner-a").revision,revision);assert.equal(f.db.prepare("SELECT 1 FROM idempotency WHERE key='launch-rollback'").get(),undefined);
  f.db.exec("DROP TRIGGER reject_launch");const fresh=data(f.call("learner-a","human_open_provider_content",{...f.args,version:2}));f.db.prepare("UPDATE provider_launches SET expires=? WHERE id=?").run(Date.now()-1000,fresh.launchId);assert.throws(()=>f.service.providerCatalog.launch(f.service.principal("learner-a"),fresh.launchId));
  const next=data(f.call("learner-a","human_open_provider_content",{...f.args,version:2}));f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'").run();assert.throws(()=>f.service.providerCatalog.launch(f.service.principal("learner-a"),next.launchId));
 }finally{f.db.close();}
});
test("actual cookie/CSRF/epoch protected human launch redirects only to reviewed origin; current entitlement and identity gate the second click",async()=>{
 const f=setup(),origin="http://127.0.0.1:4314";let app:any;try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true,catalogFixture:true,catalogAdapters:[f.policy]}));const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-a",password:"learner-a-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch},payload={requestId:"launch-http",documentId:"learning:demo:learner-a",toolName:"human_open_provider_content",arguments:f.args,expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"launch-http"};
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-csrf-token":"wrong"},payload})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-pear-epoch":"old"},payload})).statusCode,409);
  const r=await app.inject({method:"POST",url:"/api/human/invoke",headers,payload});assert.equal(r.statusCode,200);const href=r.json().data.href;assert.equal(href.startsWith("/api/provider-launch/"),true);
  assert.equal((await app.inject({method:"GET",url:href,headers:base})).statusCode,401);
  const opened=await app.inject({method:"GET",url:href,headers:{host:base.host,cookie:headers.cookie}});assert.equal(opened.statusCode,302);assert.equal(opened.headers.location,"https://provider-fixture.invalid/content/synthetic-source");assert.equal(opened.headers["referrer-policy"],"no-referrer");
  f.event("revoke",{sourceId:f.metadata.sourceId,learnerId:"learner-a"});assert.equal((await app.inject({method:"GET",url:href,headers:{host:base.host,cookie:headers.cookie}})).statusCode,403);
 }finally{if(app)await app.close();f.db.close();}
});
