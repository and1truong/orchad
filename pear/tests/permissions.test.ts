import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./helpers.ts";
import {startIdentityFixture} from "./identity-fixture.ts";
import {createApp} from "../src/server/app.ts";
import {toolGroups,scopedWorkspace} from "../src/shared/tool-groups.ts";
test("actual HTTP settings matrix: only tenant admin accesses identity/provisioning/webhooks; cookies and bearers never substitute channels",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314",provider=await startIdentityFixture(origin+"/api/auth/callback"),{app}=await createApp({db:f.db,origin,developmentAuth:true,oidc:provider.config,identityFixture:true,scimEnabled:true,xapiEnabled:true,webhookEndpoints:[{id:"matrix-fixture",url:"http://127.0.0.1:49999/events",secret:"d".repeat(64)}]});
 async function login(user:string){
  const r=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:user,password:user+"-dev"}});assert.equal(r.statusCode,200);
  const s=r.json();return {host:"127.0.0.1:4314",origin,cookie:String(r.headers["set-cookie"]).split(";")[0],"x-csrf-token":s.csrf,"x-pear-epoch":s.sessionEpoch};
 }
 const settings=["/api/identity-links","/api/provisioning-clients","/api/webhooks"];
 try{
  for(const url of settings)assert.equal((await app.inject({url,headers:{host:"127.0.0.1:4314",origin}})).statusCode,401);
  const before={clients:f.db.prepare("SELECT COUNT(*) AS n FROM integration_clients").get()!.n,subscriptions:f.db.prepare("SELECT COUNT(*) AS n FROM webhook_subscriptions").get()!.n,links:f.db.prepare("SELECT COUNT(*) AS n FROM identity_links").get()!.n,revision:f.db.prepare("SELECT revision FROM workspaces WHERE id='library:demo'").get()!.revision};
  for(const user of ["learner-a","manager","editor","assessor","outsider"]){
   const headers=await login(user),p=f.service.principal(user),revision=f.db.prepare("SELECT revision FROM workspaces WHERE id=?").get("library:"+p.tenant)!.revision;
   for(const url of settings){const r=await app.inject({url,headers});assert.equal(r.statusCode,403,user+" "+url);assert.equal(r.json().error.code,"FORBIDDEN");}
   const mutations=[
    {url:"/api/identity-links",payload:{action:"link",userId:user,subject:"reviewed-matrix-subject",reason:"Original fixture",key:"matrix-identity-"+user,revision}},
    {url:"/api/provisioning-clients",payload:{action:"issue",name:"Original matrix",scopes:["events.read"],ttlDays:1,reason:"Original fixture",key:"matrix-client-"+user,revision}},
    {url:"/api/webhooks",payload:{action:"subscribe",endpointId:"matrix-fixture",topics:["enrollment.created"],reason:"Original fixture",key:"matrix-subscribe-"+user,revision}}
   ];
   for(const m of mutations)assert.equal((await app.inject({method:"POST",headers,...m})).statusCode,403,user+" mutation "+m.url);
   for(const group of toolGroups){
    const doc=scopedWorkspace("learning:"+p.tenant+":"+p.id,group);
    const names=f.service.description(user,doc).tools.map(x=>x.name);
    assert.equal(names.some(name=>/human_|identity|provisioning|webhook|integration_credential|xapi_statement|set_score/.test(name)),false,user+" "+group);
   }
  }
  assert.deepEqual({clients:f.db.prepare("SELECT COUNT(*) AS n FROM integration_clients").get()!.n,subscriptions:f.db.prepare("SELECT COUNT(*) AS n FROM webhook_subscriptions").get()!.n,links:f.db.prepare("SELECT COUNT(*) AS n FROM identity_links").get()!.n,revision:f.db.prepare("SELECT revision FROM workspaces WHERE id='library:demo'").get()!.revision},before);
  const admin=await login("admin");for(const url of settings)assert.equal((await app.inject({url,headers:admin})).statusCode,200,url);
  const revision=f.service.context("admin","library:demo").revision;
  const issued=await app.inject({method:"POST",url:"/api/provisioning-clients",headers:admin,payload:{action:"issue",name:"Events only",scopes:["events.read"],ttlDays:1,reason:"Reviewed original matrix",key:"matrix-admin",revision}});assert.equal(issued.statusCode,200);const token=issued.json().token;assert.ok(token);
  for(const url of ["/scim/v2/Users","/integrations/v1/events","/integrations/xapi/1.0.3/statements"])assert.equal((await app.inject({url,headers:{...admin,"X-Experience-API-Version":"1.0.3"}})).statusCode,401,"Cookie-only "+url);
  for(const url of settings)assert.equal((await app.inject({url,headers:{host:"127.0.0.1:4314",origin,authorization:"Bearer "+token}})).statusCode,401,"Bearer-only "+url);
  assert.equal((await app.inject({url:"/integrations/v1/events",headers:{host:"127.0.0.1:4314",authorization:"Bearer "+token}})).statusCode,200);
  assert.equal((await app.inject({url:"/scim/v2/Users",headers:{host:"127.0.0.1:4314",authorization:"Bearer "+token}})).statusCode,403);
  f.db.prepare("UPDATE accounts SET role='admin',auth_version=auth_version+1 WHERE id='outsider'").run();
  const other=await login("outsider");
  const otherClients=await app.inject({url:"/api/provisioning-clients",headers:other});assert.equal(otherClients.statusCode,200);assert.equal(otherClients.json().items.length,0);
  const otherHooks=await app.inject({url:"/api/webhooks",headers:other});assert.equal(otherHooks.statusCode,200);assert.equal(otherHooks.json().items.length,0);
  const oldRevision=f.service.context("admin","library:demo").revision;
  f.db.prepare("UPDATE accounts SET role='content_admin',auth_version=auth_version+1 WHERE id='admin'").run();
  for(const url of settings)assert.equal((await app.inject({url,headers:admin})).statusCode,401,"Revoked session "+url);
  assert.equal((await app.inject({url:"/integrations/v1/events",headers:{host:"127.0.0.1:4314",authorization:"Bearer "+token}})).statusCode,401);
  assert.equal(f.db.prepare("SELECT revision FROM workspaces WHERE id='library:demo'").get()!.revision,oldRevision);
  assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{await app.close();await provider.close();f.db.close();}
});
