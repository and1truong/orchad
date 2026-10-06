import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {fixture} from "./helpers.ts";
import {ProviderCatalogService,type ProviderAdapter} from "../src/server/provider-catalog.ts";
import {IntegrationCredentials} from "../src/server/integration-credentials.ts";
import {createApp} from "../src/server/app.ts";
function setup(path=":memory:",models=true){
 const f=fixture(path),p=f.service.principal("admin"),credentials=new IntegrationCredentials(f.db),issued=credentials.mutate(p,{action:"issue",reason:"Synthetic metadata fixture only",key:randomUUID(),revision:f.service.context("admin","library:demo").revision,name:"Fixture feed",scopes:["catalog.read","catalog.write"],ttlDays:2});
 const policy:ProviderAdapter={id:"fixture-provider",tenant:"demo",clientId:issued.id,licenseUntil:new Date(Date.now()+86400000).toISOString(),metadataForModels:models,launchOrigin:"https://provider-fixture.invalid"},s=new ProviderCatalogService(f.db,[policy]),header="Bearer "+issued.token;
 s.review(p,{providerId:policy.id,enabled:true,rightsConfirmed:true,reason:"Synthetic reviewed fixture only"});
 const sourceTime=new Date(Date.now()-1000).toISOString();
 const event=(sequence:number,action:string,data:any)=>({profile:"pear-provider-metadata/1",id:randomUUID(),sequence,sourceTime,action,data});
 const metadata={sourceId:"synthetic-item",version:1,title:"Synthetic provider metadata",summary:"No licensed lesson body",language:"en",topic:"Reliability",intendedMinutes:15};
 return {...f,p,issued,policy,s,header,event,metadata};
}
const denies=(fn:()=>unknown,code:string)=>assert.throws(fn,(e:any)=>e.code===code);
test("strict metadata feed is ordered, canonically deduplicated, auditable and separate from official learning; reconciliation is bounded",()=>{
 const f=setup();try{
  const official=JSON.stringify(f.db.prepare("SELECT * FROM enrollments").all()),rev=f.service.context("learner-a").revision,up=f.event(1,"upsert",f.metadata),r=f.s.write(f.header,f.policy.id,up);
  assert.deepEqual(f.s.write(f.header,f.policy.id,{data:{...f.metadata},action:up.action,sourceTime:up.sourceTime,sequence:1,id:up.id,profile:up.profile}),r);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_events").get()!.n,1);assert.equal(f.service.context("learner-a").revision,rev+1);
  denies(()=>f.s.write(f.header,f.policy.id,{...up,data:{...f.metadata,title:"Changed"}}),"IDEMPOTENCY_CONFLICT");
  denies(()=>f.s.write(f.header,f.policy.id,f.event(3,"retire",{sourceId:f.metadata.sourceId})),"STALE_CONTEXT");
  denies(()=>f.s.write(f.header,f.policy.id,f.event(2,"upsert",f.metadata)),"STALE_CONTEXT");
  for(const d of [{...f.metadata,body:"licensed body"},{...f.metadata,url:"https://fixture.invalid"},{...f.metadata,title:"x".repeat(201)},{...f.metadata,summary:"猫".repeat(2000)},{...f.metadata,language:"xx"}])denies(()=>f.s.write(f.header,f.policy.id,f.event(2,"upsert",d)),"INVALID_ARGUMENT");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_events").get()!.n,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE tool='provider_catalog_event'").get()!.n,1);
  assert.deepEqual(JSON.stringify(f.db.prepare("SELECT * FROM enrollments").all()),official);
  const page:any=f.s.reconcile(f.header,f.policy.id);assert.ok(Buffer.byteLength(JSON.stringify(page))<=49152);assert.equal(JSON.stringify(page).includes(f.issued.token!),false);assert.equal(JSON.stringify(page).includes("No licensed lesson body"),false);
 }finally{f.db.close();}
});
test("entitlements, retirement, account/version/client/license and model metadata rights are live gates without fallback or grant resurrection",()=>{
 const f=setup(undefined,false);try{
  const learner=f.service.principal("learner-a");f.s.write(f.header,f.policy.id,f.event(1,"upsert",f.metadata));
  denies(()=>f.s.item(learner,f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  const grant=f.event(2,"grant",{sourceId:f.metadata.sourceId,learnerId:"learner-a",validUntil:new Date(Date.now()+3600000).toISOString()});f.s.write(f.header,f.policy.id,grant);
  assert.equal(f.s.item(learner,f.policy.id,f.metadata.sourceId).officialLearning,false);
  denies(()=>f.s.item(learner,f.policy.id,f.metadata.sourceId,"bridge"),"FORBIDDEN");
  denies(()=>f.s.item(f.service.principal("learner-b"),f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  denies(()=>f.s.item(f.service.principal("outsider"),f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  f.s.write(f.header,f.policy.id,f.event(3,"retire",{sourceId:f.metadata.sourceId}));denies(()=>f.s.item(learner,f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  f.s.write(f.header,f.policy.id,f.event(4,"upsert",{...f.metadata,version:2}));denies(()=>f.s.item(learner,f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  f.s.write(f.header,f.policy.id,f.event(5,"grant",grant.data));assert.equal(f.s.item(learner,f.policy.id,f.metadata.sourceId).version,2);
  f.s.write(f.header,f.policy.id,f.event(6,"revoke",{sourceId:f.metadata.sourceId,learnerId:"learner-a"}));denies(()=>f.s.item(learner,f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  f.s.write(f.header,f.policy.id,f.event(7,"grant",grant.data));
  f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'").run();denies(()=>f.s.item(learner,f.policy.id,f.metadata.sourceId),"UNAUTHORIZED");
  const current=f.service.principal("learner-a");
  const expired=new ProviderCatalogService(f.db,[{...f.policy,licenseUntil:new Date(Date.now()-1000).toISOString()}]);denies(()=>expired.item(current,f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  f.db.prepare("UPDATE integration_clients SET active=0 WHERE id=?").run(f.issued.id);denies(()=>f.s.item(current,f.policy.id,f.metadata.sourceId),"FORBIDDEN");denies(()=>f.s.write(f.header,f.policy.id,grant),"UNAUTHORIZED");
 }finally{f.db.close();}
});
test("audit failure rolls catalog, entitlement, receipt and revisions back; restart retains dedup and trusted config is immutable",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-provider-"));const f=setup(join(dir,"store.sqlite"));let closed=false;try{
  const revision=f.service.context("learner-a").revision,up=f.event(1,"upsert",f.metadata);
  f.db.exec("CREATE TRIGGER reject_provider BEFORE INSERT ON audit WHEN NEW.tool='provider_catalog_event' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;");
  assert.throws(()=>f.s.write(f.header,f.policy.id,up));assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_items").get()!.n,0);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_events").get()!.n,0);assert.equal(f.service.context("learner-a").revision,revision);
  f.db.exec("DROP TRIGGER reject_provider");const result=f.s.write(f.header,f.policy.id,up);
  const policy={...f.policy};f.policy.clientId=randomUUID();assert.deepEqual(f.s.write(f.header,policy.id,up),result);f.db.close();closed=true;
  const reopened=fixture(join(dir,"store.sqlite"));try{const s=new ProviderCatalogService(reopened.db,[policy]);assert.deepEqual(s.write(f.header,policy.id,up),result);assert.equal(reopened.db.prepare("SELECT MAX(version) AS n FROM schema_version").get()!.n,41);}finally{reopened.db.close();}
 }finally{if(!closed)f.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("owner role/client scope/tenant and license bounds gate even replay; invalid grants never consume a sequence",()=>{
 const f=setup();try{
  const up=f.event(1,"upsert",f.metadata);f.s.write(f.header,f.policy.id,up);
  for(const d of [{sourceId:f.metadata.sourceId,learnerId:"outsider",validUntil:new Date(Date.now()+3600000).toISOString()},{sourceId:f.metadata.sourceId,learnerId:"learner-a",validUntil:new Date(Date.now()+2*86400000).toISOString()}])assert.throws(()=>f.s.write(f.header,f.policy.id,f.event(2,"grant",d)));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_events").get()!.n,1);
  const originalScopes=JSON.stringify(["catalog.read","catalog.write"]);f.db.prepare("UPDATE integration_clients SET scopes=? WHERE id=?").run(JSON.stringify(["catalog.read"]),f.issued.id);denies(()=>f.s.write(f.header,f.policy.id,up),"FORBIDDEN");denies(()=>f.s.item(f.service.principal("learner-a"),f.policy.id,f.metadata.sourceId),"FORBIDDEN");
  f.db.prepare("UPDATE integration_clients SET scopes=? WHERE id=?").run(originalScopes,f.issued.id);f.db.prepare("UPDATE accounts SET role='content_admin' WHERE id='admin'").run();denies(()=>f.s.write(f.header,f.policy.id,up),"UNAUTHORIZED");denies(()=>f.s.reconcile(f.header,f.policy.id),"UNAUTHORIZED");
 }finally{f.db.close();}
});
test("actual Fastify feed denies absent config, cookie-only and wrong scopes; strict JSON and Host bounds preserve exact event replay",async()=>{
 const f=setup(),origin="http://127.0.0.1:4314";let app:any,disabled:any;try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true,catalogFixture:true,catalogAdapters:[f.policy]}));({app:disabled}=await createApp({db:f.db,origin,developmentAuth:true}));
  const url="/integrations/catalog/1/fixture-provider/events",headers={host:"127.0.0.1:4314",authorization:f.header},up=f.event(1,"upsert",f.metadata);
  assert.equal((await disabled.inject({method:"POST",url,headers,payload:up})).statusCode,404);
  assert.equal((await app.inject({method:"POST",url,headers:{host:headers.host},payload:up})).statusCode,401);
  assert.equal((await app.inject({method:"POST",url,headers:{...headers,host:"other.test"},payload:up})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url,headers:{...headers,"content-type":"application/json"},payload:'{"profile":"pear-provider-metadata/1","profile":"bad"}'})).statusCode,400);
  const accepted=await app.inject({method:"POST",url,headers,payload:up});assert.equal(accepted.statusCode,200);
  assert.deepEqual((await app.inject({method:"POST",url,headers,payload:up})).json(),accepted.json());
  assert.equal((await app.inject({method:"POST",url,headers,payload:{...up,data:{...f.metadata,title:"changed"}}})).statusCode,409);
  assert.equal((await app.inject({method:"POST",url,headers:{...headers,"content-type":"application/json"},payload:JSON.stringify({...up,data:{...f.metadata,summary:"x".repeat(20000)}})})).statusCode,413);
  assert.equal((await app.inject({method:"GET",url:url+"?offset=-1",headers})).statusCode,400);
  assert.equal((await app.inject({method:"GET",url,headers})).statusCode,200);
  await assert.rejects(createApp({db:f.db,origin,developmentAuth:true,catalogAdapters:[f.policy]}),/HTTPS/);
  await assert.rejects(createApp({db:f.db,origin:"http://example.test",developmentAuth:true,catalogFixture:true,catalogAdapters:[f.policy]}),/loopback/);
  f.db.prepare("UPDATE integration_clients SET active=0 WHERE id=?").run(f.issued.id);assert.equal((await app.inject({method:"POST",url,headers,payload:up})).statusCode,401);
 }finally{if(app)await app.close();if(disabled)await disabled.close();f.db.close();}
});
