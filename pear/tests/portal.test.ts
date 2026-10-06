import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {fixture,data} from "./helpers.ts";
import {defaultPortal} from "../src/shared/portal.ts";
import {allCatalog} from "../src/shared/catalog.ts";
import {createApp} from "../src/server/app.ts";
const branding={name:"Original organization academy",tagline:"Learn from permitted originals",palette:"navy"};
test("only current tenant admin can update portal presentation; read is authenticated own-only, agent tools cannot mutate settings, and exact keys/CAS/live role stay authoritative",()=>{
 const f=fixture();try{
  for(const user of ["learner-a","learner-b","manager","editor","assessor","outsider"])assert.equal(f.call(user,"human_save_portal_branding",{branding},"human").ok,false);
  assert.equal(f.call("admin","human_save_portal_branding",{branding}).error?.code,"FORBIDDEN");assert.equal(allCatalog("admin").some(t=>t.name.includes("portal_branding")),false);
  const key={idempotencyKey:"portal-reviewed",expectedRevision:f.service.context("admin","library:demo").revision},r=f.call("admin","human_save_portal_branding",{branding},"human",key);assert.equal(data(r).version,1);assert.deepEqual(f.call("admin","human_save_portal_branding",{branding},"human",key),r);
  assert.equal(f.call("admin","human_save_portal_branding",{branding:{...branding,name:"Different"}},"human",key).error?.code,"IDEMPOTENCY_CONFLICT");assert.equal(f.call("admin","human_save_portal_branding",{branding},"human",{expectedRevision:0}).error?.code,"STALE_CONTEXT");
  assert.deepEqual(data(f.call("learner-a","human_get_portal_branding",{},"human")).branding,branding);assert.deepEqual(data(f.call("outsider","human_get_portal_branding",{},"human")).branding,defaultPortal);
  f.db.prepare("UPDATE accounts SET role='content_admin' WHERE id='admin'").run();assert.equal(f.call("admin","human_save_portal_branding",{branding},"human",key).error?.code,"FORBIDDEN");assert.equal(f.db.prepare("SELECT version FROM portal_branding WHERE tenant='demo'").get()!.version,1);
  f.db.prepare("UPDATE accounts SET role='admin' WHERE id='outsider'").run();data(f.call("outsider","human_save_portal_branding",{branding:{...branding,name:"Separate organization"}},"human"));assert.equal(data(f.call("learner-a","human_get_portal_branding",{},"human")).branding.name,branding.name);
 }finally{f.db.close();}
});
test("portal validation/audit failure is atomic and persisted text is literal bounded data without executable styling or identity changes",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-portal-")),path=join(dir,"store.sqlite");let f=fixture(path);try{
  const accounts=f.db.prepare("SELECT * FROM accounts ORDER BY id").all(),before=f.service.context("admin","library:demo").revision;
  for(const bad of [{...branding,name:" "},{...branding,palette:"url(https://example.test)"},{...branding,tagline:"bad\u0000text"},{...branding,logo:"https://example.test"}])assert.equal(f.call("admin","human_save_portal_branding",{branding:bad},"human").error?.code,"INVALID_ARGUMENT");
  f.db.exec("CREATE TRIGGER reject_portal BEFORE INSERT ON audit WHEN NEW.tool='human_save_portal_branding' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END;");
  assert.equal(f.call("admin","human_save_portal_branding",{branding},"human",{idempotencyKey:"portal-rollback"}).ok,false);assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM portal_branding").get()!.n,0);assert.equal(f.db.prepare("SELECT 1 FROM idempotency WHERE key='portal-rollback'").get(),undefined);assert.equal(f.service.context("admin","library:demo").revision,before);
  f.db.exec("DROP TRIGGER reject_portal");const literal={...branding,tagline:"<img src=x onerror=alert(1)>"};data(f.call("admin","human_save_portal_branding",{branding:literal},"human"));assert.deepEqual(f.db.prepare("SELECT * FROM accounts ORDER BY id").all(),accounts);f.db.close();f=fixture(path);assert.deepEqual(data(f.call("learner-a","human_get_portal_branding",{},"human")).branding,literal);assert.equal(f.db.prepare("SELECT MAX(version) AS n FROM schema_version").get()!.n,35);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("real portal HTTP settings use current cookie admin, CSRF, epoch and organization boundary; bearer and page bridge cannot become a settings channel",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";let app:any;try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));const headers={host:"127.0.0.1:4314",origin},r=await app.inject({method:"POST",url:"/api/login",headers,payload:{username:"admin",password:"admin-dev"}}),own={...headers,cookie:String(r.headers["set-cookie"]).split(";")[0],"x-csrf-token":r.json().csrf,"x-pear-epoch":r.json().sessionEpoch};
  const payload={requestId:"portal-http",documentId:"library:demo",toolName:"human_save_portal_branding",arguments:{branding},expectedRevision:0,idempotencyKey:"portal-http"};
  for(const [url,h,status] of [["/api/bridge/invoke",own,403],["/api/human/invoke",{...own,"x-csrf-token":"wrong"},403],["/api/human/invoke",{...own,"x-pear-epoch":"old"},409],["/api/human/invoke",{...headers,authorization:"Bearer test"},401]] as const)assert.equal((await app.inject({method:"POST",url,headers:h,payload})).statusCode,status);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers:own,payload:{...payload,arguments:{branding,tenant:"other"}}})).statusCode,400);
  const saved=await app.inject({method:"POST",url:"/api/human/invoke",headers:own,payload});assert.equal(saved.statusCode,200);assert.deepEqual(saved.json().data.branding,branding);
 }finally{if(app)await app.close();f.db.close();}
});
