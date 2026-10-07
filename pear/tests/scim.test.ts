import {test} from "node:test";
import assert from "node:assert/strict";
import {scryptSync} from "node:crypto";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fixture,data} from "./helpers.ts";
import {createApp} from "../src/server/app.ts";
import {IntegrationCredentials} from "../src/server/integration-credentials.ts";
import {SCIMService,userURN,groupURN} from "../src/server/scim.ts";
const origin="http://127.0.0.1:4314",base={host:"127.0.0.1:4314",origin};
function setup(path?:string){
 const f=fixture(path),credentials=new IntegrationCredentials(f.db),scim=new SCIMService(f.db,origin),p=f.service.principal("admin");
 function issue(scopes=["provisioning.read","provisioning.write"],extra:any={}){
  return credentials.mutate(p,{action:"issue",name:"Reviewed fixture",reason:"Explicit client review",scopes,ttlDays:7,key:crypto.randomUUID(),revision:f.service.context("admin","library:demo").revision,...extra});
 }
 const client=issue(),header="Bearer "+client.token;
 const create=(body:any={userName:"alice@example.test",displayName:"Alice",preferredLanguage:"vi"},key?:string)=>scim.mutate(header,"Users",undefined,"POST",body,undefined,key);
 return {...f,credentials,scim,p,issue,client,header,create,close(){f.db.close();}};
}
test("one-time scoped secrets are hashed, exact retries cannot reissue them, and authority is live",()=>{
 const s=setup();try{
  const args={action:"issue",name:"Read only",reason:"Reviewed",scopes:["provisioning.read"],ttlDays:1,key:"one-time-key",revision:s.service.context("admin","library:demo").revision};
  const result=s.credentials.mutate(s.p,args);assert.match(result.token!,/^pear_[a-f0-9]{64}$/);
  const serialized=JSON.stringify(s.db.prepare("SELECT * FROM integration_clients").all())+JSON.stringify(s.db.prepare("SELECT * FROM audit").all())+JSON.stringify(s.db.prepare("SELECT * FROM idempotency").all());
  assert.equal(serialized.includes(result.token!),false);
  const repeat=s.credentials.mutate(s.p,{...args,revision:999});assert.equal(repeat.token,null);assert.equal(repeat.oneTimeSecretUnavailable,true);
  assert.throws(()=>s.credentials.mutate(s.p,{...args,name:"Changed"}),/changed/);
  assert.throws(()=>s.scim.mutate("Bearer "+result.token,"Users",undefined,"POST",{userName:"denied"},undefined,undefined),/scope/);
  for(const id of ["editor","manager","learner-a","assessor","outsider"])assert.throws(()=>s.credentials.list(s.service.principal(id)),/administrator/);
  s.credentials.mutate(s.p,{action:"revoke",clientId:result.id,reason:"Reviewed revoke",key:"revoke-key",revision:s.service.context("admin","library:demo").revision});
  assert.throws(()=>s.credentials.authenticate("Bearer "+result.token,"provisioning.read"),/revoked/);
  assert.equal(s.credentials.mutate(s.p,{...args,revision:999}).active,false);
  s.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='admin'").run();
  assert.throws(()=>s.scim.read(s.header,"Users"),/revoked/);
  assert.throws(()=>s.credentials.mutate(s.p,args),/administrator/);
 }finally{s.close();}
});
test("managed users use opaque separate identities, never known development passwords or claimed roles/SSO mappings",()=>{
 const s=setup();try{
  const r=s.create(undefined,"create-alice");assert.equal(r.status,201);assert.equal(r.body.schemas[0],userURN);assert.equal(r.body.displayName,"Alice");
  const account=s.db.prepare("SELECT * FROM accounts WHERE id=(SELECT user_id FROM scim_users WHERE id=?)").get(r.body.id) as any;
  assert.equal(account.role,"learner");assert.equal(account.tenant,"demo");assert.notEqual(account.id,"alice@example.test");
  assert.notEqual(account.password_hash,scryptSync(account.id+"-dev",account.salt,64).toString("hex"));
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM identity_links").get()!.n,0);
  assert.deepEqual(s.create(undefined,"create-alice"),r);
  assert.throws(()=>s.create({userName:" ALICE@example.test "}),/already exists/);
  for(const field of ["roles","password","entitlements","manager","tenant"])assert.throws(()=>s.create({userName:"blocked-"+field,[field]:"admin"}),/Unsupported/);
  const filtered=s.scim.read(s.header,"Users",undefined,{filter:'userName eq "ALICE@example.test"'});assert.equal(filtered.totalResults,1);
  assert.equal(s.service.principal("learner-a").role,"learner");
  assert.equal(s.service.description("admin","library:demo").tools.some(t=>/scim|credential|integration/.test(t.name)),false);
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.close();}
});
test("ETags include live human changes; patch/deactivation revokes sessions and preserves learning and identity history",()=>{
 const s=setup();try{
  const r=s.create(),id=r.body.id,user=(s.db.prepare("SELECT user_id FROM scim_users WHERE id=?").get(id) as any).user_id;
  const old=s.scim.read(s.header,"Users",id);
  s.db.prepare("UPDATE accounts SET name='Human edit' WHERE id=?").run(user);
  assert.throws(()=>s.scim.mutate(s.header,"Users",id,"PUT",{userName:"alice@example.test"},old.meta.version,undefined),/If-Match/);
  s.db.prepare("INSERT INTO sessions(token_hash,principal,auth_version,csrf,expires) VALUES(?,?,?,?,?)").run("scim-session",user,1,"csrf",Date.now()+100000);
  const userP=s.service.principal(user),enroll=s.service.invoke(user,{requestId:crypto.randomUUID(),documentId:"learning:demo:"+user,toolName:"learning_enroll",arguments:{courseId:"systems-basics"},expectedRevision:s.service.context(user,"learning:demo:"+user).revision,idempotencyKey:"scim-enrollment"},"human");data(enroll);
  const live=s.scim.read(s.header,"Users",id),patch={schemas:["urn:ietf:params:scim:api:messages:2.0:PatchOp"],Operations:[{op:"replace",path:"active",value:false}]};
  const result=s.scim.mutate(s.header,"Users",id,"PATCH",patch,live.meta.version,"disable-once");assert.equal(result.body.active,false);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE principal=?").get(user)!.n,0);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE learner=?").get(user)!.n,1);
  assert.deepEqual(s.scim.mutate(s.header,"Users",id,"PATCH",patch,live.meta.version,"disable-once"),result);
  const before=s.scim.read(s.header,"Users",id);
  assert.throws(()=>s.scim.mutate(s.header,"Users",id,"PATCH",{...patch,Operations:[{op:"replace",path:"displayName",value:"Should roll back"},{op:"replace",path:"roles",value:["admin"]}]},before.meta.version,undefined),/paths/);
  assert.deepEqual(s.scim.read(s.header,"Users",id),before);
  s.db.prepare("UPDATE accounts SET role='manager' WHERE id=?").run(user);
  assert.throws(()=>s.scim.mutate(s.header,"Users",id,"PATCH",patch,before.meta.version,"disable-once"),/Human-promoted/);
 }finally{s.close();}
});
test("client ownership, exact replay and credential revocation precede ETag and never cross tenant or client scopes",()=>{
 const s=setup();try{
  const user=s.create(undefined,"owned"),other=s.issue(),second="Bearer "+other.token;
  assert.equal(s.scim.read(second,"Users").totalResults,0);
  assert.throws(()=>s.scim.read(second,"Users",user.body.id),/unavailable/);
  assert.throws(()=>s.scim.mutate(second,"Users",user.body.id,"DELETE",undefined,user.body.meta.version,"owned"),/unavailable/);
  s.db.prepare("UPDATE integration_clients SET expires=0 WHERE id=?").run(s.client.id);
  assert.throws(()=>s.create(undefined,"owned"),/revoked/);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM scim_users").get()!.n,1);
 }finally{s.close();}
});
test("static group members resolve only same-client managed users; deletes tombstone resources without destroying account history",()=>{
 const s=setup();try{
  const a=s.create(),b=s.create({userName:"bob"}),group=s.scim.mutate(s.header,"Groups",undefined,"POST",{schemas:[groupURN],displayName:"Team",members:[{value:a.body.id},{value:b.body.id}]},undefined,"group-once");
  assert.equal(group.body.members.length,2);
  assert.throws(()=>s.scim.mutate(s.header,"Groups",group.body.id,"PUT",{displayName:"Team",members:[{value:"learner-a"}]},group.body.meta.version,undefined),/unavailable/);
  const patch={schemas:["urn:ietf:params:scim:api:messages:2.0:PatchOp"],Operations:[{op:"remove",path:"members"}]};
  const empty=s.scim.mutate(s.header,"Groups",group.body.id,"PATCH",patch,group.body.meta.version,"empty-group");assert.deepEqual(empty.body.members,[]);
  const deleted=s.scim.mutate(s.header,"Groups",group.body.id,"DELETE",undefined,empty.body.meta.version,"delete-group");assert.equal(deleted.status,204);
  assert.deepEqual(s.scim.mutate(s.header,"Groups",group.body.id,"DELETE",undefined,empty.body.meta.version,"delete-group"),deleted);
  assert.throws(()=>s.scim.read(s.header,"Groups",group.body.id),/unavailable/);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM learning_groups WHERE id=(SELECT group_id FROM scim_groups WHERE id=?)").get(group.body.id)!.n,1);
  const retained=s.scim.mutate(s.header,"Groups",undefined,"POST",{displayName:"Retained team",members:[{value:a.body.id},{value:b.body.id}]},undefined,"retained-team");
  const internal=s.db.prepare("SELECT user_id FROM scim_users WHERE id=?").get(a.body.id)!.user_id;
  s.scim.mutate(s.header,"Users",a.body.id,"DELETE",undefined,a.body.meta.version,"delete-user");
  const definition=JSON.parse(String(s.db.prepare("SELECT definition FROM learning_groups WHERE id=(SELECT group_id FROM scim_groups WHERE id=?)").get(retained.body.id)!.definition));assert.equal(definition.memberIds.includes(internal),false);assert.equal(s.scim.read(s.header,"Groups",retained.body.id).members.length,1);
  assert.throws(()=>s.scim.read(s.header,"Users",a.body.id),/unavailable/);
  const replacement=s.create(undefined,"create-replacement");assert.notEqual(replacement.body.id,a.body.id);
  assert.throws(()=>s.create(undefined,"create-alice"),/already exists/);
 }finally{s.close();}
});
test("paged SCIM lists preserve every whole row and reject complex filters; audit failures roll back all managed writes",()=>{
 const s=setup();try{
  for(let i=0;i<23;i++)s.create({userName:"page-"+i,externalId:"external-"+i});
  const first=s.scim.read(s.header,"Users",undefined,{count:20}),second=s.scim.read(s.header,"Users",undefined,{startIndex:21,count:20});
  assert.equal(first.totalResults,23);assert.equal(first.itemsPerPage,20);assert.equal(second.itemsPerPage,3);
  assert.equal(new Set([...first.Resources,...second.Resources].map(r=>r.id)).size,23);
  assert.equal(s.scim.read(s.header,"Users",undefined,{count:0}).itemsPerPage,0);
  for(const q of [{count:21},{startIndex:0},{filter:'userName co "page"'},{filter:'userName eq "page-1" or active eq true'},{sortBy:"userName"}])assert.throws(()=>s.scim.read(s.header,"Users",undefined,q));
  const revision=s.service.context("admin","library:demo").revision;
  s.db.exec("CREATE TRIGGER reject_scim_audit BEFORE INSERT ON audit WHEN NEW.tool LIKE 'scim_%' BEGIN SELECT RAISE(ABORT,'scim audit failed'); END");
  assert.throws(()=>s.create({userName:"rollback"},"rollback-key"),/audit failed/);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM scim_users").get()!.n,23);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM integration_requests WHERE operation_key='rollback-key'").get()!.n,0);
  assert.equal(s.service.context("admin","library:demo").revision,revision);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE name='rollback'").get()!.n,0);
 }finally{s.close();}
});
test("durable reconciliation survives database reopen without recovering raw credential secrets",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-scim-")),path=join(dir,"test.sqlite");let s=setup(path);
 try{
  const header=s.header,r=s.create(undefined,"durable-create");s.close();s=setup(path);
  assert.deepEqual(s.scim.mutate(header,"Users",undefined,"POST",{userName:"alice@example.test",displayName:"Alice",preferredLanguage:"vi"},undefined,"durable-create"),r);
  assert.equal(s.scim.read(header,"Users").totalResults,1);assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
async function login(app:any){
 const r=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"admin",password:"admin-dev"}}),value=r.json();
 assert.equal(r.statusCode,200);return {...base,cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-csrf-token":value.csrf,"x-pear-epoch":value.sessionEpoch};
}
test("actual HTTP SCIM profile separates bearer from cookies and enforces secure configuration, host, schema, CAS, expiry and ETags",async()=>{
 const s=setup();let app:any;
 try{
  await assert.rejects(()=>createApp({db:s.db,origin,scimEnabled:true}),/HTTPS/);
  ({app}=await createApp({db:s.db,origin,developmentAuth:true,identityFixture:true,scimEnabled:true}));
  const human=await login(app),headers={...base,authorization:s.header,"content-type":"application/scim+json"};
  assert.equal((await app.inject({url:"/scim/v2/Users",headers:human})).statusCode,401);
  assert.equal((await app.inject({url:"/scim/v2/Users",headers:{...headers,host:"evil.example"}})).statusCode,403);
  const config=await app.inject({url:"/scim/v2/ServiceProviderConfig",headers});assert.equal(config.statusCode,200);assert.equal(config.json().bulk.supported,false);
  const created=await app.inject({method:"POST",url:"/scim/v2/Users",headers:{...headers,"idempotency-key":"http-create"},payload:{schemas:[userURN],userName:"http-user",active:true}});
  assert.equal(created.statusCode,201);assert.match(String(created.headers["content-type"]),/application\/scim\+json/);assert.equal(created.headers.etag,created.json().meta.version);
  assert.equal((await app.inject({method:"PUT",url:"/scim/v2/Users/"+created.json().id,headers,payload:{userName:"http-user",active:false}})).statusCode,412);
  assert.equal((await app.inject({method:"PATCH",url:"/scim/v2/Users/"+created.json().id,headers:{...headers,"if-match":String(created.headers.etag)},payload:{schemas:["urn:ietf:params:scim:api:messages:2.0:PatchOp"],Operations:[{op:"replace",path:"active",value:false}]}})).statusCode,200);
  const bad=await app.inject({method:"POST",url:"/scim/v2/Users",headers,payload:"{"});assert.equal(bad.statusCode,400);assert.match(bad.json().schemas[0],/Error$/);
  const args={action:"issue",name:"HTTP read",reason:"reviewed",scopes:["provisioning.read"],ttlDays:1,key:"http-credential",revision:s.service.context("admin","library:demo").revision};
  assert.equal((await app.inject({method:"POST",url:"/api/provisioning-clients",headers:{...human,"x-csrf-token":"bad"},payload:args})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/provisioning-clients",headers:{...human,"x-pear-epoch":"bad"},payload:args})).statusCode,409);
  const issued=await app.inject({method:"POST",url:"/api/provisioning-clients",headers:human,payload:args});assert.equal(issued.statusCode,200);
  const metadata=await app.inject({url:"/api/provisioning-clients",headers:human});assert.equal(JSON.stringify(metadata.json()).includes(issued.json().token),false);
  const revoked=await app.inject({method:"POST",url:"/api/provisioning-clients",headers:human,payload:{action:"revoke",clientId:issued.json().id,reason:"reviewed revoke",key:"http-revoke",revision:s.service.context("admin","library:demo").revision}});assert.equal(revoked.statusCode,200);
  assert.equal((await app.inject({url:"/scim/v2/Users",headers:{...headers,authorization:"Bearer "+issued.json().token}})).statusCode,401);
 }finally{if(app)await app.close();s.close();}
});
