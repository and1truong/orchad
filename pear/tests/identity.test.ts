import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./helpers.ts";
import {createApp} from "../src/server/app.ts";
import {IdentityService} from "../src/server/identity.ts";
import {startIdentityFixture} from "./identity-fixture.ts";
const origin="http://127.0.0.1:4314",baseHeaders={host:"127.0.0.1:4314",origin};
async function setup(){
 const f=fixture(),provider=await startIdentityFixture(origin+"/api/auth/callback");
 const {app}=await createApp({db:f.db,origin,oidc:provider.config,identityFixture:true,developmentAuth:false});
 const identity=new IdentityService(f.db,provider.config,origin,true);
 const mapping=(userId="learner-a",subject="subject-a",extra:any={})=>identity.link(f.service.principal("admin"),{userId,subject,action:"link",reason:"Reviewed original fixture",revision:f.service.context("admin","library:demo").revision,key:crypto.randomUUID(),...extra});
 const begin=async()=>{
  const r=await app.inject({method:"POST",url:"/api/auth/start",headers:baseHeaders,payload:{}});
  assert.equal(r.statusCode,200);const auth=r.json(),cookie=String(r.headers["set-cookie"]).split(";")[0]!;
  const target=await provider.authorize(auth.url);return {auth,cookie,target};
 };
 const callback=(flow:any,extra:any={})=>app.inject({url:flow.target.pathname+flow.target.search,headers:{...baseHeaders,cookie:flow.cookie},...extra});
 return {f,provider,app,identity,mapping,begin,callback,async close(){await app.close();await provider.close();f.db.close();}};
}
async function synthetic(app:any,id:string){
 const r=await app.inject({method:"POST",url:"/api/login",headers:baseHeaders,payload:{username:id,password:id+"-dev"}});
 assert.equal(r.statusCode,200);const b=r.json();return {...baseHeaders,cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-csrf-token":b.csrf,"x-pear-epoch":b.sessionEpoch};
}
test("OIDC configuration rejects insecure/unpinned endpoints and remains disabled without reviewed server configuration",async()=>{
 const f=fixture();try{
  const config={issuer:"https://identity.example",authorizationEndpoint:"https://identity.example/auth",tokenEndpoint:"https://identity.example/token",jwksUri:"https://identity.example/keys",clientId:"pear"};
  assert.throws(()=>new IdentityService(f.db,{...config,tokenEndpoint:"https://other.example/token"},"https://pear.example"),/pinned/);
  assert.throws(()=>new IdentityService(f.db,{...config,issuer:"http://identity.example"},"https://pear.example"),/HTTPS|pinned/);
  assert.throws(()=>new IdentityService(f.db,{...config,issuer:config.issuer+"/"},"https://pear.example"),/issuer/);
  assert.throws(()=>new IdentityService(f.db,{...config,clientId:""},"https://pear.example"),/client/);
  await assert.rejects(()=>createApp({db:f.db,origin:"https://pear.example",oidc:config}),/secure session cookies/);
  const {app}=await createApp({db:f.db,origin});try{
   assert.deepEqual((await app.inject({url:"/api/auth/config",headers:baseHeaders})).json(),{oidcEnabled:false,developmentEnabled:false});
   assert.equal((await app.inject({method:"POST",url:"/api/auth/start",headers:baseHeaders,payload:{}})).statusCode,403);
   assert.equal((await app.inject({method:"POST",url:"/api/login",headers:baseHeaders,payload:{username:"admin",password:"admin-dev"}})).statusCode,403);
  }finally{await app.close();}
 }finally{f.db.close();}
});
test("real signed code exchange enforces S256/browser binding and uses reviewed server roles rather than claims",async()=>{
 const s=await setup();try{
  s.mapping();const flow=await s.begin(),auth=new URL(flow.auth.url);
  assert.equal(auth.searchParams.get("code_challenge_method"),"S256");assert.equal(auth.searchParams.has("code_verifier"),false);
  const result=await s.callback(flow);assert.equal(result.statusCode,302);assert.equal(result.headers.location,"/");
  const cookie=String(result.headers["set-cookie"]);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  const sessionCookie=cookie.split(",").find(v=>v.includes("pear-session="))!.trim().split(";")[0]!;
  const session=await s.app.inject({url:"/api/session",headers:{...baseHeaders,cookie:sessionCookie}});
  assert.equal(session.statusCode,200);assert.equal(session.json().principal.id,"learner-a");assert.equal(session.json().principal.role,"learner");
  assert.equal(s.provider.controls.lastTokenBody.code_verifier.length,43);
  assert.equal((await s.callback(flow)).statusCode,401);
  assert.equal(s.f.db.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n,1);
  assert.equal(JSON.stringify(s.f.db.prepare("SELECT arguments FROM audit WHERE tool='human_oidc_login'").all()).includes("unused-fixture-token"),false);
 }finally{await s.close();}
});
test("state/cookie mismatch, expiry, reused callback and changed provider do not dispatch a token exchange",async()=>{
 const s=await setup();try{
  s.mapping();const flow=await s.begin();
  assert.equal((await s.callback(flow,{headers:{...baseHeaders,cookie:"pear-oidc=wrong"}})).statusCode,401);
  assert.equal(s.provider.controls.tokenRequests,0);
  s.f.db.prepare("UPDATE identity_transactions SET expires=0").run();
  assert.equal((await s.callback(flow)).statusCode,401);assert.equal(s.provider.controls.tokenRequests,0);
  const second=await s.begin(),changed=new IdentityService(s.f.db,{...s.provider.config,clientId:"changed"},origin,true);
  await assert.rejects(()=>changed.callback(Object.fromEntries(second.target.searchParams),second.cookie.split("=")[1]),/state/);
  assert.equal(s.provider.controls.tokenRequests,0);
 }finally{await s.close();}
});
test("signature/profile/issuer/audience/nonce/time validation rejects bad tokens without a session or privilege escalation",async()=>{
 const s=await setup();try{
  s.mapping();
  const now=Math.floor(Date.now()/1000),cases=[
   {corrupt:true},{header:{alg:"none"}},{header:{jku:"https://evil.example"}},{claims:{iss:"https://evil.example"}},
   {claims:{aud:"other"}},{claims:{aud:["pear-fixture","other"]}},{claims:{azp:"other"}},
   {claims:{nonce:"wrong"}},{claims:{exp:now-1}},{claims:{iat:now+600}},
   {claims:{iat:now-601}},{claims:{nbf:now+600}},{claims:{sub:""}},{claims:{sub:"invalid subject"}},{oversize:true},{denyToken:true}
  ];
  for(const override of cases){
   Object.assign(s.provider.controls,{corrupt:false,header:{},claims:{},oversize:false,denyToken:false},override);
   const result=await s.callback(await s.begin());assert.equal(result.statusCode,401,JSON.stringify(override));
   assert.equal(s.f.db.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n,0);
  }
 }finally{await s.close();}
});
test("unknown/deactivated/unlinked subjects fail and key rotation refreshes signed public keys",async()=>{
 const s=await setup();try{
  assert.equal((await s.callback(await s.begin())).statusCode,401);
  s.mapping();s.f.db.prepare("UPDATE accounts SET active=0 WHERE id='learner-a'").run();
  assert.equal((await s.callback(await s.begin())).statusCode,401);
  s.f.db.prepare("UPDATE accounts SET active=1 WHERE id='learner-a'").run();
  assert.equal((await s.callback(await s.begin())).statusCode,302);
  s.provider.controls.key=1;assert.equal((await s.callback(await s.begin())).statusCode,302);
  assert.ok(s.provider.controls.jwksRequests>=2);
  s.mapping("learner-a","subject-a",{action:"unlink"});
  assert.equal(s.f.db.prepare("SELECT COUNT(*) AS n FROM sessions").get()!.n,0);
  assert.equal((await s.callback(await s.begin())).statusCode,401);
 }finally{await s.close();}
});
test("admin identity mapping enforces tenant/role/CAS/retry/conflict and rolls back sessions, revisions and audit together",async()=>{
 const s=await setup();try{
  const p=s.f.service.principal("admin"),args={userId:"learner-a",subject:"subject-a",action:"link",reason:"Reviewed mapping",revision:s.f.service.context("admin","library:demo").revision,key:"reviewed-link"};
  for(const user of ["editor","manager","assessor","learner-a","outsider"])assert.throws(()=>s.identity.link(s.f.service.principal(user),args),/administrator/);
  assert.throws(()=>s.mapping("outsider"),/same-tenant/);
  const result=s.identity.link(p,args);assert.deepEqual(s.identity.link(p,{...args,revision:999}),result);
  assert.throws(()=>s.identity.link(p,{...args,reason:"changed"}),/changed/);
  assert.throws(()=>s.mapping("learner-b","subject-a"),/another account/);
  assert.throws(()=>s.mapping("learner-a","another-subject"),/already/);
  const before=s.f.service.context("admin","library:demo").revision,auth=(s.f.db.prepare("SELECT auth_version FROM accounts WHERE id='learner-b'").get() as any).auth_version;
  s.f.db.exec("CREATE TRIGGER fail_identity_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'identity audit unavailable'); END");
  assert.throws(()=>s.mapping("learner-b","subject-b"),/audit unavailable/);
  assert.equal(s.f.service.context("admin","library:demo").revision,before);
  assert.equal((s.f.db.prepare("SELECT auth_version FROM accounts WHERE id='learner-b'").get() as any).auth_version,auth);
  assert.equal(s.f.db.prepare("SELECT COUNT(*) AS n FROM identity_links").get()!.n,1);
  s.f.db.exec("DROP TRIGGER fail_identity_audit");
  assert.deepEqual(s.f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{await s.close();}
});
test("HTTP identity admin routes require live administrator, same-origin CSRF and epoch; settings stay absent from bridge",async()=>{
 const f=fixture(),provider=await startIdentityFixture(origin+"/api/auth/callback");
 const {app}=await createApp({db:f.db,origin,oidc:provider.config,identityFixture:true,developmentAuth:true});
 try{
  const headers=await synthetic(app,"admin"),body={userId:"learner-a",subject:"subject-a",action:"link",reason:"HTTP reviewed",key:"http-link",revision:f.service.context("admin","library:demo").revision};
  assert.equal((await app.inject({method:"POST",url:"/api/identity-links",headers:{...headers,"x-csrf-token":"wrong"},payload:body})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/identity-links",headers:{...headers,"x-pear-epoch":"wrong"},payload:body})).statusCode,409);
  assert.equal((await app.inject({method:"POST",url:"/api/identity-links",headers:await synthetic(app,"editor"),payload:body})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/identity-links",headers,payload:body})).statusCode,200);
  assert.equal((await app.inject({url:"/api/identity-links",headers})).json().items[0].userId,"learner-a");
  assert.equal(f.service.description("admin","library:demo").tools.some(t=>/identity|oidc/.test(t.name)),false);
  f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='admin'").run();
  assert.equal((await app.inject({url:"/api/identity-links",headers})).statusCode,401);
 }finally{await app.close();await provider.close();f.db.close();}
});
