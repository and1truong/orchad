import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {xapiFixture} from "./xapi-fixture.ts";
import {parseUniqueJSON} from "../src/shared/json-unique.ts";
import {createApp} from "../src/server/app.ts";
test("strict JSON profile detects decoded duplicate keys, invalid syntax/depth and preserves normal JSON",()=>{
 assert.deepEqual(parseUniqueJSON('{"a":[1,true,null,{"b":"text"}]}'),{a:[1,true,null,{b:"text"}]});
 for(const value of ['{"id":1,"id":2}','{"id":1,"\\u0069d":2}','{"a":1,}','[1,]','true false','1e999',"[".repeat(18)+"0"+"]".repeat(18)])assert.throws(()=>parseUniqueJSON(value));
});
test("UUID statement identity deduplicates property order and normalizes ID case while conflicts and mixed invalid batches roll back",()=>{
 const s=xapiFixture();try{
  const statement=s.statement(),first=s.xapi.write(s.header,statement),revision=s.service.context(s.internal,"learning:demo:"+s.internal).revision;
  assert.deepEqual(first,[statement.id]);assert.deepEqual(s.xapi.write(s.header,{...Object.fromEntries(Object.entries(statement).reverse()),id:statement.id.toUpperCase()}),first);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM xapi_statements").get()!.n,1);assert.equal(s.service.context(s.internal,"learning:demo:"+s.internal).revision,revision);
  assert.throws(()=>s.xapi.write(s.header,{...statement,result:{completion:true}}),/changed payload/);
  const newStatement=s.statement(),before=s.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n;
  assert.throws(()=>s.xapi.write(s.header,[newStatement,{...statement,result:{completion:false}}]),/agree|changed/);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM xapi_statements").get()!.n,1);assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n,before);
  assert.equal(s.xapi.read(s.header,{statementId:statement.id}).authority.account.name,s.client.id);
 }finally{s.db.close();}
});
test("out-of-order external statements project deterministically and never create official enrollment, score, timer or certificate",()=>{
 const s=xapiFixture();try{
  const newer=s.statement({timestamp:"2026-10-05T13:00:00.000Z"}),older=s.statement({verb:{id:"http://adlnet.gov/expapi/verbs/experienced"},timestamp:"2026-10-05T11:00:00.000Z",result:{completion:false,success:false,score:{raw:0}}});
  s.xapi.write(s.header,newer);s.xapi.write(s.header,older);
  const projected=s.xapi.learning(s.service.principal(s.internal)).items[0];assert.equal(projected.reportedCompletion,true);assert.equal(projected.reportedSuccess,true);assert.equal(projected.reportedScore.raw,80);assert.equal(projected.statementCount,2);assert.equal(projected.lastStatementId,newer.id);
  for(const table of ["enrollments","attempts","certificates","study_totals"])assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM "+table).get()!.n,0);
  const own=s.call(s.internal,"learning_get_external_activity",{limit:20});assert.equal(own.ok,true);
  assert.equal(s.xapi.learning(s.service.principal("learner-a")).items.length,0);
  assert.equal(s.xapi.learning(s.service.principal("outsider")).items.length,0);
 }finally{s.db.close();}
});
test("only current same-client managed actor, tenant source and explicitly scoped live issuer can write or recover statements",()=>{
 const s=xapiFixture();try{
  const statement=s.statement();s.xapi.write(s.header,statement);
  for(const actor of [{mbox:"mailto:any@example.test"},{account:{homePage:s.origin+"/scim/v2",name:"learner-a"}},{account:{homePage:"https://evil.example",name:s.user.id}}])assert.throws(()=>s.xapi.write(s.header,{...s.statement(),actor}),/attribute|actor|learner/);
  const other=s.credentials.mutate(s.p,{action:"issue",name:"Other client",reason:"Reviewed",scopes:["xapi.read","xapi.write"],ttlDays:1,key:crypto.randomUUID(),revision:s.service.context("admin","library:demo").revision});
  assert.throws(()=>s.xapi.read("Bearer "+other.token,{statementId:statement.id}),/unavailable/);assert.throws(()=>s.xapi.write("Bearer "+other.token,statement),/managed learner/);
  s.db.prepare("UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id=?").run(s.internal);
  assert.throws(()=>s.xapi.write(s.header,statement),/managed learner/);
  assert.equal(s.xapi.read(s.header,{statementId:statement.id}).id,statement.id); // authorized connector may reconcile retained historical metadata
  s.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='admin'").run();
  assert.throws(()=>s.xapi.read(s.header,{statementId:statement.id}),/revoked/);assert.throws(()=>s.xapi.write(s.header,statement),/revoked/);
 }finally{s.db.close();}
});
test("unsupported versions/verbs/extensions/attachments/result bounds/UTC times fail and audit failure rolls back history and revisions",()=>{
 const s=xapiFixture();try{
  for(const extra of [{attachments:[]},{authority:{}},{version:"2.0.0"},{verb:{id:"http://adlnet.gov/expapi/verbs/voided"}},{result:{completion:true,score:{scaled:2}}},{result:{completion:true,score:{raw:101,min:0,max:100}}},{result:{completion:true,duration:"P1Y"}},{timestamp:"2026-02-30T00:00:00.000Z"},{timestamp:"2099-01-01T00:00:00.000Z"},{context:{registration:crypto.randomUUID(),extensions:{arbitrary:"secret"}}}])assert.throws(()=>s.xapi.write(s.header,s.statement(extra)));
  const revision=s.service.context(s.internal,"learning:demo:"+s.internal).revision;
  s.db.exec("CREATE TRIGGER reject_xapi_audit BEFORE INSERT ON audit WHEN NEW.tool='xapi_statement' BEGIN SELECT RAISE(ABORT,'xapi audit failed'); END");
  assert.throws(()=>s.xapi.write(s.header,s.statement()),/audit failed/);assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM xapi_statements").get()!.n,0);assert.equal(s.service.context(s.internal,"learning:demo:"+s.internal).revision,revision);
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.db.close();}
});
test("statement pagination follows stored sequence with whole rows and registration scope without dropping out-of-order source timestamps",()=>{
 const s=xapiFixture();try{
  for(let i=0;i<23;i++)s.xapi.write(s.header,s.statement({timestamp:"2026-10-05T"+String(23-i).padStart(2,"0")+":00:00.000Z"}));
  const first=s.xapi.read(s.header,{limit:20}) as any;assert.equal(first.statements.length,20);assert.ok(first.more);
  const query=Object.fromEntries(new URL(first.more,s.origin).searchParams),second=s.xapi.read(s.header,query) as any;assert.equal(second.statements.length,3);assert.equal(second.more,"");
  assert.equal(new Set([...first.statements,...second.statements].map((s:any)=>s.id)).size,23);
  assert.equal((s.xapi.read(s.header,{registration:crypto.randomUUID()}) as any).statements.length,0);
  assert.throws(()=>s.xapi.read(s.header,{limit:21}));assert.throws(()=>s.xapi.read(s.header,{agent:'{"mbox":"mailto:test@example.test"}'}));
 }finally{s.db.close();}
});
test("statement identity and immutable external projection survive restart independently from new managed actors",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-xapi-")),path=join(dir,"statements.sqlite");let s=xapiFixture(path);
 try{
  const header=s.header,statement=s.statement(),internal=s.internal;s.xapi.write(header,statement);s.db.close();s=xapiFixture(path);
  assert.deepEqual(s.xapi.write(header,statement),[statement.id]);assert.equal(s.xapi.learning(s.service.principal(internal)).items[0].statementCount,1);
  assert.equal(s.xapi.learning(s.service.principal(s.internal)).items.length,0);assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("actual HTTP xAPI profile enforces version header, Bearer, Host, unique JSON, PUT/POST/GET reconciliation and secure startup",async()=>{
 const s=xapiFixture();let app:any;try{
  await assert.rejects(()=>createApp({db:s.db,origin:s.origin,xapiEnabled:true}),/secure configuration/);
  ({app}=await createApp({db:s.db,origin:s.origin,identityFixture:true,scimEnabled:true,xapiEnabled:true,developmentAuth:true}));
  const headers={host:"127.0.0.1:4314",authorization:s.header,"x-experience-api-version":"1.0.3","content-type":"application/json"},statement=s.statement(),url="/integrations/xapi/1.0.3/statements";
  assert.equal((await app.inject({method:"POST",url,headers,payload:statement})).statusCode,200);
  assert.equal((await app.inject({method:"PUT",url:url+"?statementId="+statement.id,headers,payload:statement})).statusCode,204);
  const read=await app.inject({url:url+"?statementId="+statement.id,headers});assert.equal(read.statusCode,200);assert.equal(read.headers["x-experience-api-version"],"1.0.3");assert.equal(read.json().id,statement.id);
  assert.equal((await app.inject({url,headers:{...headers,"x-experience-api-version":"2.0.0"}})).statusCode,400);
  assert.equal((await app.inject({url,headers:{...headers,host:"evil.test"}})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url,headers,payload:'{"id":"a","id":"b"}'})).statusCode,400);
  const base={host:"127.0.0.1:4314",origin:s.origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"admin",password:"admin-dev"}});
  assert.equal(login.statusCode,200);assert.equal((await app.inject({url,headers:{...base,"x-experience-api-version":"1.0.3",cookie:String(login.headers["set-cookie"]).split(";")[0]!}})).statusCode,401);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM xapi_statements").get()!.n,1);
 }finally{if(app)await app.close();s.db.close();}
});
