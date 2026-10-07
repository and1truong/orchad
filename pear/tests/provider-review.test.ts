import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {fixture,data} from "./helpers.ts";
import {LearningService} from "../src/server/service.ts";
import {IntegrationCredentials} from "../src/server/integration-credentials.ts";
import type {ProviderAdapter} from "../src/server/provider-catalog.ts";
import {createApp} from "../src/server/app.ts";
import {allCatalog} from "../src/shared/catalog.ts";
import type {Call} from "../src/shared/model.ts";
function setup(){
 const f=fixture(),issued=new IntegrationCredentials(f.db).mutate(f.service.principal("admin"),{action:"issue",name:"Synthetic reviewed feed",reason:"Fixture",scopes:["catalog.read","catalog.write"],ttlDays:1,key:randomUUID(),revision:0}),policy:ProviderAdapter={id:"fixture-provider",tenant:"demo",clientId:issued.id,licenseUntil:new Date(Date.now()+86400000).toISOString(),metadataForModels:false,launchOrigin:"https://provider-fixture.invalid"},service=new LearningService(f.db,undefined,[policy]);
 function call(user:string,name:string,args:any={},source:"human"|"bridge"="human",overrides:Partial<Call>={}){
  const p=service.principal(user),write=name==="human_review_provider_connection",documentId="library:"+p.tenant;
  return service.invoke(user,{requestId:randomUUID(),documentId,toolName:name,arguments:args,expectedRevision:write?service.context(user,documentId).revision:null,idempotencyKey:write?randomUUID():null,...overrides},source);
 }
 const args={providerId:policy.id,enabled:true,rightsConfirmed:true,reason:"Synthetic contract review"},up={profile:"pear-provider-metadata/1",id:randomUUID(),sequence:1,sourceTime:new Date().toISOString(),action:"upsert",data:{sourceId:"synthetic-source",version:1,title:"Synthetic metadata",summary:"No licensed body",language:"en",topic:"Reliability",intendedMinutes:15}};
 return {...f,service,issued,policy,call,args,up,header:"Bearer "+issued.token};
}
test("provider connection is disabled until current same-owner admin human approval; disabled feed replay and original approval receipt never restore access",()=>{
 const f=setup();try{
  assert.equal(data(f.call("admin","human_get_provider_connections")).items[0].enabled,false);
  assert.throws(()=>f.service.providerCatalog.write(f.header,f.policy.id,f.up));
  for(const user of ["manager","editor","assessor"])assert.equal(f.call(user,"human_review_provider_connection",f.args).ok,false);
  assert.equal(f.call("admin","human_review_provider_connection",f.args,"bridge").error?.code,"FORBIDDEN");assert.equal(allCatalog("admin").some(t=>t.name==="human_get_provider_connections"),false);
  const key={idempotencyKey:"provider-approval",expectedRevision:f.service.context("admin","library:demo").revision},approved=f.call("admin","human_review_provider_connection",f.args,"human",key);data(approved);
  f.service.providerCatalog.write(f.header,f.policy.id,f.up);assert.equal(data(f.call("admin","human_get_provider_connections")).items[0].enabled,true);
  data(f.call("admin","human_review_provider_connection",{...f.args,enabled:false,reason:"Disable fixture rights"}));assert.throws(()=>f.service.providerCatalog.write(f.header,f.policy.id,f.up));assert.deepEqual(f.call("admin","human_review_provider_connection",f.args,"human",key),approved);assert.equal(data(f.call("admin","human_get_provider_connections")).items[0].enabled,false);
 }finally{f.db.close();}
});
test("changed server policy, client/owner/license and authority invalidate reviews; settings cannot expand trusted allowlist",()=>{
 const f=setup();try{
  data(f.call("admin","human_review_provider_connection",f.args));
  const changed=new LearningService(f.db,undefined,[{...f.policy,metadataForModels:true}]);assert.throws(()=>changed.providerCatalog.write(f.header,f.policy.id,f.up));
  const changedOrigin=new LearningService(f.db,undefined,[{...f.policy,launchOrigin:"https://different-fixture.invalid"}]);assert.throws(()=>changedOrigin.providerCatalog.write(f.header,f.policy.id,f.up));
  for(const extra of [{launchOrigin:"https://arbitrary.invalid"},{metadataForModels:true},{clientId:randomUUID()},{tenant:"other"}])assert.equal(f.call("admin","human_review_provider_connection",{...f.args,...extra}).error?.code,"INVALID_ARGUMENT");
  f.db.prepare("UPDATE integration_clients SET owner='manager' WHERE id=?").run(f.issued.id);assert.equal(f.call("admin","human_review_provider_connection",f.args).error?.code,"FORBIDDEN");f.db.prepare("UPDATE integration_clients SET owner='admin' WHERE id=?").run(f.issued.id);
  f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='admin'").run();assert.throws(()=>f.service.providerCatalog.write(f.header,f.policy.id,f.up));assert.equal(f.call("admin","human_review_provider_connection",f.args).error?.code,"FORBIDDEN");
 }finally{f.db.close();}
});
test("review requires exact original key/CAS, explicit rights/reason and atomic audit rollback",()=>{
 const f=setup();try{
  const revision=f.service.context("admin","library:demo").revision;
  assert.equal(f.call("admin","human_review_provider_connection",{...f.args,rightsConfirmed:false}).error?.code,"INVALID_ARGUMENT");assert.equal(f.call("admin","human_review_provider_connection",{...f.args,reason:" "}).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.call("admin","human_review_provider_connection",f.args,"human",{expectedRevision:0}).error?.code,"STALE_CONTEXT");
  f.db.exec("CREATE TRIGGER reject_review BEFORE INSERT ON audit WHEN NEW.tool='human_review_provider_connection' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.equal(f.call("admin","human_review_provider_connection",f.args,"human",{idempotencyKey:"review-rollback"}).error?.code,"INTERNAL");assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM provider_reviews").get()!.n,0);assert.equal(f.db.prepare("SELECT 1 FROM idempotency WHERE key='review-rollback'").get(),undefined);assert.equal(f.service.context("admin","library:demo").revision,revision);
  f.db.exec("DROP TRIGGER reject_review");const key={idempotencyKey:"review-exact",expectedRevision:revision};data(f.call("admin","human_review_provider_connection",f.args,"human",key));assert.equal(f.call("admin","human_review_provider_connection",{...f.args,reason:"Changed"},"human",key).error?.code,"IDEMPOTENCY_CONFLICT");
 }finally{f.db.close();}
});
test("actual cookie settings enforce CSRF/epoch/channel; catalog-only issuance does not enable SCIM and cannot issue disabled-channel scopes",async()=>{
 const f=setup(),origin="http://127.0.0.1:4314";let app:any;try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true,catalogFixture:true,catalogAdapters:[f.policy]}));const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"admin",password:"admin-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch},payload={requestId:"review-http",documentId:"library:demo",toolName:"human_review_provider_connection",arguments:f.args,expectedRevision:f.service.context("admin","library:demo").revision,idempotencyKey:"review-http"};
  assert.equal((await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload})).statusCode,403);assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-csrf-token":"wrong"},payload})).statusCode,403);assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-pear-epoch":"old"},payload})).statusCode,409);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers,payload})).statusCode,200);
  const metadata=await app.inject({method:"GET",url:"/api/provisioning-clients",headers});assert.equal(metadata.json().catalogEnabled,true);assert.equal(metadata.json().provisioningEnabled,false);
  const issue={action:"issue",name:"Only catalog",reason:"Synthetic fixture",scopes:["catalog.read","catalog.write"],ttlDays:1,key:"catalog-only-issue",revision:f.service.context("admin","library:demo").revision};
  assert.equal((await app.inject({method:"POST",url:"/api/provisioning-clients",headers,payload:{...issue,scopes:["catalog.write","provisioning.write"]}})).statusCode,403);
  const issued=await app.inject({method:"POST",url:"/api/provisioning-clients",headers,payload:issue});assert.equal(issued.statusCode,200);assert.ok(issued.json().token);
  assert.equal((await app.inject({method:"GET",url:"/scim/v2/Users",headers:{host:base.host,authorization:"Bearer "+issued.json().token}})).statusCode,404);
  assert.equal((await app.inject({method:"POST",url:"/integrations/catalog/1/fixture-provider/events",headers:{host:base.host,authorization:"Bearer "+issued.json().token},payload:f.up})).statusCode,403);
 }finally{if(app)await app.close();f.db.close();}
});
