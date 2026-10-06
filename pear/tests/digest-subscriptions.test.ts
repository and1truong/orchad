import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {nextDigestRun,defaultDigestPreferences} from "../src/shared/digest-subscriptions.ts";
import {courses} from "../src/server/seed.ts";
import {DigestSubscriptionService} from "../src/server/digest-subscriptions.ts";
import {createApp} from "../src/server/app.ts";
const preferences={...defaultDigestPreferences,enabled:true,weekdays:[1,2,3,4,5,6,7],minutes:1};
const save=(f:ReturnType<typeof fixture>,user="learner-a",p=preferences,overrides={})=>f.call(user,"human_save_digest_preferences",{preferences:p,confirmed:true},"human",overrides);
test("reviewed daily wall schedule resolves selected folds/gaps, weekdays and strict next-instant without changing monthly recurrence",()=>{
 const base={...preferences,timeZone:"America/New_York",hour:1,minute:30,weekdays:[7]};
 assert.equal(nextDigestRun(base,"2026-11-01T00:00:00.000Z"),"2026-11-01T05:30:00.000Z");
 assert.equal(nextDigestRun({...base,dstChoice:"later"},"2026-11-01T00:00:00.000Z"),"2026-11-01T06:30:00.000Z");
 assert.equal(nextDigestRun({...base,hour:2},"2026-03-08T00:00:00.000Z"),"2026-03-08T07:30:00.000Z");
 assert.equal(nextDigestRun({...preferences,hour:9,weekdays:[1]},"2026-10-06T10:00:00.000Z"),"2026-10-12T09:00:00.000Z");
 assert.equal(nextDigestRun({...base,timeZone:"Australia/Lord_Howe",hour:2,minute:15},"2026-10-03T00:00:00.000Z"),"2026-10-03T15:45:00.000Z");
 assert.throws(()=>nextDigestRun({...preferences,weekdays:[1,1]},"2026-10-06T00:00:00.000Z"));
 assert.throws(()=>nextDigestRun({...preferences,timeZone:"Mars/Unknown"},"2026-10-06T00:00:00.000Z"));
});
test("disabled default and human-only own confirmed preferences preserve original-key receipts, CAS and authority re-review",()=>{
 const f=fixture();try{
  assert.equal(data(f.call("learner-a","human_get_digest_preferences",{},"human")).effectiveEnabled,false);
  assert.equal(save(f).ok,true);assert.equal(f.call("learner-a","human_get_digest_preferences").ok,false);
  assert.equal(f.call("learner-a","human_save_digest_preferences",{preferences,confirmed:true}).ok,false);
  for(const p of [{...preferences,weekdays:[]},{...preferences,weekdays:[1,1]},{...preferences,timeZone:"Mars/Unknown"},{...preferences,retentionDays:31}])assert.equal(save(f,"learner-b",p).error?.code,"INVALID_ARGUMENT");
  assert.equal(f.call("learner-a","human_save_digest_preferences",{preferences,confirmed:false},"human").ok,false);
  const key={idempotencyKey:"digest-original",expectedRevision:f.service.context("learner-a").revision},first=save(f,"learner-a",preferences,key);data(first);
  data(save(f,"learner-a",{...preferences,enabled:false}));assert.deepEqual(save(f,"learner-a",preferences,key),first);
  assert.equal(data(f.call("learner-a","human_get_digest_preferences",{},"human")).effectiveEnabled,false);
  assert.equal(save(f,"learner-a",preferences,{expectedRevision:0}).error?.code,"STALE_CONTEXT");
  data(save(f));f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'").run();
  const changed=data(f.call("learner-a","human_get_digest_preferences",{},"human"));assert.equal(changed.reviewRequired,true);assert.equal(changed.effectiveEnabled,false);assert.equal(changed.nextRun,null);
  const due=f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run as string;
  assert.equal(f.service.digestSubscriptions.runBackground(due).generated,0);
  assert.equal(f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run,null);
  assert.equal(data(f.call("outsider","human_get_digest_notifications",{},"human")).total,0);
  assert.equal(f.call("learner-a","human_get_digest_preferences",{learnerId:"learner-b"},"human").error?.code,"INVALID_ARGUMENT");
 }finally{f.db.close();}
});
test("restart-safe delivery snapshots current group rights and history rechecks revocation without changing official records",()=>{
 const f=fixture();try{
  const group={name:"Digest group",kind:"static",mode:"ALL",memberIds:["learner-a"],rules:[]};
  data(f.call("admin","learning_save_group",{groupId:"digest-group",group}));
  const course={...structuredClone(courses["systems-basics"]),title:"Original digest group course",access:"groups",groupIds:["digest-group"]};
  data(f.call("editor","learning_create_course",{courseId:"digest-course",course}));data(f.call("editor","learning_publish_course",{courseId:"digest-course"}));data(f.call("learner-a","learning_enroll",{courseId:"digest-course"}));
  const before=f.db.prepare("SELECT * FROM enrollments").all(),revision=f.service.context("learner-a").revision,due=data(save(f)).nextRun;
  assert.deepEqual(f.service.digestSubscriptions.runBackground(due),{generated:1,skipped:0,processed:1});
  assert.equal(new DigestSubscriptionService(f.db).runBackground(due).generated,0);
  let list=data(f.call("learner-a","human_get_digest_notifications",{},"human"));assert.equal(list.total,1);assert.equal(list.items[0].payload.items[0].title,course.title);
  assert.equal(f.service.context("learner-a").revision,revision+2);
  assert.deepEqual(f.db.prepare("SELECT * FROM enrollments").all(),before);
  const id=list.items[0].id;assert.equal(f.call("learner-b","human_read_digest_notification",{notificationId:id},"human").ok,false);
  data(f.call("learner-a","human_read_digest_notification",{notificationId:id},"human"));assert.ok(data(f.call("learner-a","human_get_digest_notifications",{},"human")).items[0].readAt);
  data(f.call("admin","learning_save_group",{groupId:"digest-group",group:{...group,memberIds:[]}}));
  list=data(f.call("learner-a","human_get_digest_notifications",{},"human"));assert.equal(list.items[0].payload.items.length,0);assert.equal(list.items[0].withheldItems,1);
  assert.equal(data(f.call("learner-a","learning_get_digest",{minutes:1})).items.length,0);
  const next=f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run as string;
  assert.equal(f.service.digestSubscriptions.runBackground(next).generated,1);assert.equal(JSON.parse(f.db.prepare("SELECT payload FROM digest_notifications ORDER BY created_at DESC LIMIT 1").get()!.payload as string).items.length,0);
  assert.deepEqual(f.db.prepare("SELECT * FROM enrollments").all(),before);
  f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'").run();assert.equal(data(f.call("learner-a","human_get_digest_notifications",{},"human")).total,0);
 }finally{f.db.close();}
});
test("late skip, cross-preference spam bound survives history deletion, TTL read hiding and physical pruning are deterministic",()=>{
 const f=fixture();try{
  const scheduler=new DigestSubscriptionService(f.db,()=>new Date("2026-10-06T08:00:00.000Z")),p=f.service.principal("learner-a");
  let due=scheduler.write(p,"human_save_digest_preferences",{preferences}).nextRun!;
  assert.equal(scheduler.runBackground(new Date(Date.parse(due)+21600001).toISOString()).generated,0);
  for(let i=0;i<4;i++){
   scheduler.write(p,"human_save_digest_preferences",{preferences});
   due=f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run as string;
   assert.equal(scheduler.runBackground(due).generated,i<3?1:0);
   scheduler.write(p,"human_delete_digest_history",{confirmed:true});
  }
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE tool='digest_in_app_delivery'").get()!.n,3);
  const later=new DigestSubscriptionService(f.db,()=>new Date("2026-10-08T08:00:00.000Z"));due=later.write(p,"human_save_digest_preferences",{preferences:{...preferences,retentionDays:1}}).nextRun!;
  assert.equal(later.runBackground(due).generated,1);
  const id=f.db.prepare("SELECT id FROM digest_notifications").get()!.id as string;
  const expired=new DigestSubscriptionService(f.db,()=>new Date(Date.parse(due)+86400000));
  const hidden=expired.read(p,"human_get_digest_notifications");assert.ok("total" in hidden);assert.equal(hidden.total,0);
  assert.throws(()=>expired.authorize(p,"human_read_digest_notification",{notificationId:id}));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM digest_notifications").get()!.n,1);
  expired.runBackground();assert.equal(f.db.prepare("SELECT 1 FROM digest_notifications WHERE id=?").get(id),undefined);
 }finally{f.db.close();}
});
test("audit failure rolls back payload, own revision, occurrence and advancement then safely retries; reads stay whole-page bounded",()=>{
 const f=fixture();try{
  const due=data(save(f)).nextRun,before=f.service.context("learner-a").revision;
  f.db.exec("CREATE TRIGGER digest_audit_failure BEFORE INSERT ON audit WHEN NEW.tool='digest_in_app_delivery' BEGIN SELECT RAISE(ABORT,'digest audit fixture'); END;");
  assert.throws(()=>f.service.digestSubscriptions.runBackground(due));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM digest_notifications").get()!.n,0);assert.equal(f.service.context("learner-a").revision,before);
  assert.equal(f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run,due);
  f.db.exec("DROP TRIGGER digest_audit_failure");assert.equal(f.service.digestSubscriptions.runBackground(due).generated,1);
  const first=f.db.prepare("SELECT * FROM digest_notifications").get() as any;
  for(let i=0;i<10;i++)f.db.prepare("INSERT INTO digest_notifications VALUES(?,?,?,?,?,?,?,?,?,NULL)").run("bound-"+i,first.tenant,first.learner,first.auth_version,first.subscription_version+i+1,first.run_at,JSON.stringify({items:[],padding:"x".repeat(15000)}),first.created_at,first.expires_at);
  const result=data(f.call("learner-a","human_get_digest_notifications",{},"human"));assert.ok(result.items.length<11);assert.ok(result.nextOffset!==null);assert.ok(Buffer.byteLength(JSON.stringify(result))<65536);
  const tail=data(f.call("learner-a","human_get_digest_notifications",{offset:result.nextOffset},"human"));assert.ok(tail.items.length>0);
 }finally{f.db.close();}
});
test("actual cookie human HTTP requires CSRF/epoch and rejects bridge access and cross-account payloads",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";let app:any;
 try{
  ({app}=await createApp({db:f.db,origin,developmentAuth:true}));
  const base={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers:base,payload:{username:"learner-a",password:"learner-a-dev"}}),headers={...base,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  const payload={requestId:"digest-http",documentId:"learning:demo:learner-a",toolName:"human_save_digest_preferences",arguments:{preferences,confirmed:true},expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"digest-http"};
  assert.notEqual((await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload})).statusCode,200);
  assert.notEqual((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-csrf-token":"invalid"},payload})).statusCode,200);
  assert.notEqual((await app.inject({method:"POST",url:"/api/human/invoke",headers:{...headers,"x-pear-epoch":"invalid"},payload})).statusCode,200);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers,payload})).json().ok,true);
  assert.equal((await app.inject({method:"POST",url:"/api/human/invoke",headers,payload:{...payload,arguments:{...payload.arguments,learnerId:"learner-b"}}})).json().error.code,"INVALID_ARGUMENT");
  const due=f.db.prepare("SELECT next_run FROM digest_subscriptions WHERE learner='learner-a'").get()!.next_run as string;assert.equal(f.service.digestSubscriptions.runBackground(due).generated,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM webhook_deliveries").get()!.n,0);
 }finally{if(app)await app.close();f.db.close();}
});
test("actual SQLite close/reopen retains reviewed schedule, original approval receipt, notification and occurrence dedup",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-digest-restart-")),path=join(dir,"learning.sqlite");let f=fixture(path);
 try{
  const key={idempotencyKey:"digest-disk-review",expectedRevision:f.service.context("learner-a").revision},first=save(f,"learner-a",preferences,key),due=data(first).nextRun;
  assert.equal(f.service.digestSubscriptions.runBackground(due).generated,1);
  const subscription=f.db.prepare("SELECT * FROM digest_subscriptions WHERE learner='learner-a'").get(),notifications=f.db.prepare("SELECT * FROM digest_notifications").all(),audit=f.db.prepare("SELECT * FROM audit WHERE tool='digest_in_app_delivery'").all(),revision=f.service.context("learner-a").revision;
  f.db.close();f=fixture(path);
  assert.deepEqual(f.db.prepare("SELECT * FROM digest_subscriptions WHERE learner='learner-a'").get(),subscription);
  assert.deepEqual(f.db.prepare("SELECT * FROM digest_notifications").all(),notifications);
  assert.deepEqual(save(f,"learner-a",preferences,key),first);
  assert.equal(f.service.digestSubscriptions.runBackground(due).generated,0);
  assert.deepEqual(f.db.prepare("SELECT * FROM digest_notifications").all(),notifications);
  assert.deepEqual(f.db.prepare("SELECT * FROM audit WHERE tool='digest_in_app_delivery'").all(),audit);
  assert.equal(f.service.context("learner-a").revision,revision);
  assert.equal(f.db.prepare("SELECT MAX(version) AS n FROM schema_version").get()!.n,40);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
