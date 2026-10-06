import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fixture,data} from "./helpers.ts";
import {createApp} from "../src/server/app.ts";
import {OutboxService} from "../src/server/outbox.ts";
import {IntegrationCredentials} from "../src/server/integration-credentials.ts";
import {signWebhook,verifyWebhook} from "../src/shared/webhook-signature.ts";
const secret="a".repeat(64),origin="http://127.0.0.1:4314";
async function receiver(){
 const received:any[]=[],committed=new Map<string,string>(),controls={failures:0,loseOnce:false,redirect:false,now:undefined as number|undefined},server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk.toString();
  assert.ok(verifyWebhook(secret,req.headers["x-pear-timestamp"],req.headers["x-pear-signature"],body,controls.now));
  const event=JSON.parse(body);assert.equal(req.headers["x-pear-event-id"],event.id);
  received.push({event,body,attempt:Number(req.headers["x-pear-attempt"])});
  if(controls.redirect){res.writeHead(302,{location:"http://127.0.0.1:1/forbidden"});res.end();return;}
  if(controls.failures){controls.failures--;res.writeHead(503);res.end("secret remote error must never be persisted");return;}
  const old=committed.get(event.id);if(old)assert.equal(old,body);else committed.set(event.id,body);
  if(controls.loseOnce){controls.loseOnce=false;req.socket.destroy();return;}
  res.writeHead(200);res.end("ack");
 });await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address() as any;
 return {received,committed,controls,url:"http://127.0.0.1:"+address.port+"/events",async close(){await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
function setup(url:string,path?:string){
 const f=fixture(path),outbox=new OutboxService(f.db,[{id:"original-fixture",url,secret}],true),p=f.service.principal("admin");
 const action=(args:any)=>outbox.mutate(p,{reason:"Reviewed event delivery",revision:f.service.context("admin","library:demo").revision,key:crypto.randomUUID(),...args});
 const subscribe=(extra:any={})=>action({action:"subscribe",endpointId:"original-fixture",topics:["enrollment.created","enrollment.completed","content.published","content.retired"],...extra});
 const enroll=(learner="learner-a",key=crypto.randomUUID())=>data(f.call(learner,"learning_enroll",{courseId:"systems-basics"},"bridge",{idempotencyKey:key}));
 return {...f,outbox,p,action,subscribe,enroll};
}
test("HMAC receiver rejects altered bytes/signature, old/future timestamps and invalid syntax",()=>{
 const body='{"id":"original"}',timestamp=String(Math.floor(Date.now()/1000)),signature="v1="+signWebhook(secret,timestamp,body);
 assert.equal(verifyWebhook(secret,timestamp,signature,body),true);
 for(const [t,s,b] of [[timestamp,signature,body+" "],[timestamp,"v1="+"0".repeat(64),body],["0",signature,body],[String(Number(timestamp)-301),signature,body],[String(Number(timestamp)+301),signature,body],[timestamp,"v2="+signature.slice(3),body]])
  assert.equal(verifyWebhook(secret,t,s,b),false);
 assert.equal(verifyWebhook(secret,timestamp,signature,"x".repeat(48*1024+1)),false);
});
test("domain enrollment/completion/content transactions append minimal ordered events exactly once and roll back with audit",async()=>{
 const r=await receiver(),s=setup(r.url);try{
  const sub=s.subscribe(),enrollment=s.enroll("learner-a","enroll-exact");
  s.enroll("learner-a","enroll-exact");
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM integration_events WHERE topic='enrollment.created'").get()!.n,1);
  for(const lessonId of ["retry","capacity"])data(s.call("learner-a","human_complete_lesson",{enrollmentId:enrollment.enrollmentId,lessonId},"human"));
  const at=data(s.call("learner-a","learning_start_attempt",{enrollmentId:enrollment.enrollmentId}));
  for(const [questionId,answer] of [["q-retry",1],["q-write",2]])data(s.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId,answer},"human"));
  const submitted=data(s.call("learner-a","human_submit_attempt",{attemptId:at.attemptId},"human",{idempotencyKey:"completion-exact"}));assert.equal(submitted.progress.status,"completed");
  data(s.call("learner-a","human_submit_attempt",{attemptId:at.attemptId},"human",{idempotencyKey:"completion-exact"}));
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM integration_events WHERE topic='enrollment.completed'").get()!.n,1);
  const before=s.db.prepare("SELECT COUNT(*) AS n FROM integration_events").get()!.n;
  s.db.exec("CREATE TRIGGER reject_outbox_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit failed'); END");
  assert.equal(s.call("learner-b","learning_enroll",{courseId:"systems-basics"}).ok,false);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM integration_events").get()!.n,before);
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE learner='learner-b'").get()!.n,0);
  s.db.exec("DROP TRIGGER reject_outbox_audit");
  data(s.call("admin","learning_retire_course",{courseId:"privacy-basics"}));
  await s.outbox.run();
  assert.deepEqual(r.received.map(x=>x.event.topic),["enrollment.created","enrollment.completed","content.retired"]);
  assert.equal(r.received[0].event.data.enrollmentId,enrollment.enrollmentId);
  assert.equal(JSON.stringify(r.received).includes("answers"),false);assert.equal(JSON.stringify(r.received).includes("password"),false);
  assert.equal(s.outbox.deliveries(s.p,sub.id).items.every(x=>x.state==="delivered"),true);
 }finally{s.db.close();await r.close();}
});
test("lost response after receiver commit retries the same event ID/body before later events and receiver deduplicates",async()=>{
 const r=await receiver(),s=setup(r.url);try{
  const sub=s.subscribe();s.enroll("learner-a");s.enroll("learner-b");r.controls.loseOnce=true;
  const now=Date.now();await s.outbox.run(now);assert.equal(r.received.length,1);assert.equal(r.committed.size,1);
  await s.outbox.run(now+500);assert.equal(r.received.length,1);
  await s.outbox.run(now+1001);assert.equal(r.received.length,3);assert.equal(r.committed.size,2);
  assert.equal(r.received[0].event.id,r.received[1].event.id);assert.equal(r.received[0].body,r.received[1].body);assert.equal(r.received[1].attempt,2);
  assert.ok(r.received[2].event.sequence>r.received[1].event.sequence);
  assert.equal(JSON.stringify(s.outbox.deliveries(s.p,sub.id)).includes(secret),false);
 }finally{s.db.close();await r.close();}
});
test("lease prevents concurrent dispatch, abandoned leases recover after restart and config/owner revocation stops delivery",async()=>{
 const r=await receiver(),s=setup(r.url);try{
  const sub=s.subscribe();s.enroll();const event=s.db.prepare("SELECT * FROM integration_events WHERE topic='enrollment.created'").get() as any,now=Date.now();
  s.db.prepare("INSERT INTO webhook_deliveries(subscription_id,event_sequence,state,attempts,lease,lease_until) VALUES(?,?,'sending',1,'abandoned',?)").run(sub.id,event.sequence,now+30000);
  await s.outbox.run(now);assert.equal(r.received.length,0);
  const recovered=new OutboxService(s.db,[{id:"original-fixture",url:r.url,secret}],true);
  await Promise.all([recovered.run(now+30001),s.outbox.run(now+30001)]);assert.equal(r.received.length,1);assert.equal(r.received[0].attempt,2);
  s.enroll("learner-b");const rotated=new OutboxService(s.db,[{id:"original-fixture",url:r.url,secret:"b".repeat(64)}],true);
  await rotated.run();assert.equal(r.received.length,1);
  s.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='admin'").run();await recovered.run();assert.equal(r.received.length,1);
  assert.throws(()=>s.outbox.settings(s.p),/administrator/);
 }finally{s.db.close();await r.close();}
});
test("bounded retry exhaustion blocks later events until an explicit reviewed retry; redirects never follow",async()=>{
 const r=await receiver(),s=setup(r.url);try{
  const sub=s.subscribe();s.enroll("learner-a");s.enroll("learner-b");r.controls.failures=8;
  const now=Date.now();for(let i=0;i<8;i++){r.controls.now=now+i*100000;await s.outbox.run(r.controls.now);}
  r.controls.now=undefined;
  assert.equal(r.received.length,8);assert.equal(new Set(r.received.map(x=>x.event.id)).size,1);
  const delivery=s.outbox.deliveries(s.p,sub.id).items[0];assert.equal(delivery.state,"failed");assert.equal(delivery.attempts,8);
  await s.outbox.run(now+1000000);assert.equal(r.received.length,8);
  const retried=s.action({action:"retry",subscriptionId:sub.id,eventSequence:delivery.eventSequence});assert.equal(retried.live,true);
  await s.outbox.run();assert.equal(r.committed.size,2);
  const next=s.subscribe({topics:["enrollment.created"]});s.enroll("learner-a","existing-self-enroll"); // existing enrollment creates no event
  const u=data(s.call("learner-a","learning_enroll",{courseId:"learning-vi"}));r.controls.redirect=true;await s.outbox.run();
  assert.equal(s.outbox.deliveries(s.p,next.id).items[0].state,"pending");
  assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE id=?").get(u.enrollmentId)!.n,1);
 }finally{s.db.close();await r.close();}
});
test("scoped event reconciliation is tenant-isolated, paged and contains no secrets; human settings require admin/CAS/retry",async()=>{
 const r=await receiver(),s=setup(r.url);try{
  const credentials=new IntegrationCredentials(s.db),issue=(id:string,scopes:string[])=>credentials.mutate(s.service.principal(id),{action:"issue",name:"Event sync",reason:"Reviewed",scopes,ttlDays:1,key:crypto.randomUUID(),revision:s.service.context(id,"library:"+s.service.principal(id).tenant).revision});
  const reader=issue("admin",["events.read"]),limited=issue("admin",["provisioning.read"]);s.enroll();
  assert.throws(()=>s.outbox.events("Bearer "+limited.token),/scope/);
  const first=s.outbox.events("Bearer "+reader.token,{after:0,limit:2});assert.equal(first.events.length,2);assert.equal(first.hasMore,true);
  const next=s.outbox.events("Bearer "+reader.token,{after:first.nextAfter,limit:20});assert.equal(next.events.length,2);assert.ok(next.events.every(e=>e.sequence>first.nextAfter));
  assert.throws(()=>s.outbox.events("Bearer "+reader.token,{limit:21}));
  for(const id of ["editor","manager","assessor","learner-a","outsider"])assert.throws(()=>s.outbox.settings(s.service.principal(id)),/administrator/);
  const args={action:"subscribe",endpointId:"original-fixture",topics:["enrollment.created"],reason:"Reviewed",revision:s.service.context("admin","library:demo").revision,key:"subscribe-once"};
  const saved=s.outbox.mutate(s.p,args);assert.deepEqual(s.outbox.mutate(s.p,{...args,revision:999}),saved);
  assert.throws(()=>s.outbox.mutate(s.p,{...args,reason:"changed"}),/changed/);
  assert.throws(()=>s.subscribe({endpointId:"http://evil.example"}),/endpoint/);
  assert.throws(()=>s.subscribe({revision:999}),/stale/);
  s.action({action:"disable",subscriptionId:saved.id});assert.equal(s.outbox.mutate(s.p,{...args,revision:999}).active,false);
  assert.equal(JSON.stringify(s.outbox.settings(s.p)).includes(secret),false);
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.db.close();await r.close();}
});
test("delivery cursor and event reconciliation survive database restart with explicit reviewed server configuration",async()=>{
 const r=await receiver(),dir=mkdtempSync(join(tmpdir(),"pear-outbox-")),path=join(dir,"events.sqlite");let s=setup(r.url,path);
 try{
  const sub=s.subscribe();s.enroll();r.controls.failures=1;const now=Date.now();await s.outbox.run(now);s.db.close();s=setup(r.url,path);
  await s.outbox.run(now+1001);assert.equal(r.received.length,2);assert.equal(r.received[0].event.id,r.received[1].event.id);
  assert.equal(s.outbox.deliveries(s.p,sub.id).items[0].state,"delivered");
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{s.db.close();rmSync(dir,{recursive:true,force:true});await r.close();}
});
test("HTTP event API accepts only scoped bearer, exact Host and metadata-only human settings; server endpoints are pinned",async()=>{
 const r=await receiver(),s=setup(r.url);let app:any;try{
  assert.throws(()=>new OutboxService(s.db,[{id:"x",url:r.url,secret}]),/HTTPS/);
  assert.throws(()=>new OutboxService(s.db,[{id:"x",url:"https://example.test/events?token=x",secret}]),/HTTPS/);
  ({app}=await createApp({db:s.db,origin,developmentAuth:true,identityFixture:true,webhookEndpoints:[{id:"original-fixture",url:r.url,secret}]}));
  const headers={host:"127.0.0.1:4314",origin},login=await app.inject({method:"POST",url:"/api/login",headers,payload:{username:"admin",password:"admin-dev"}});
  const human={...headers,cookie:String(login.headers["set-cookie"]).split(";")[0]!,"x-csrf-token":login.json().csrf,"x-pear-epoch":login.json().sessionEpoch};
  assert.equal((await app.inject({url:"/integrations/v1/events",headers:human})).statusCode,401);
  const credentials=new IntegrationCredentials(s.db),reader=credentials.mutate(s.p,{action:"issue",name:"API",reason:"review",scopes:["events.read"],ttlDays:1,key:"http-events",revision:s.service.context("admin","library:demo").revision});
  assert.equal((await app.inject({url:"/integrations/v1/events",headers:{...headers,authorization:"Bearer "+reader.token}})).statusCode,200);
  assert.equal((await app.inject({url:"/integrations/v1/events",headers:{...headers,host:"evil.test",authorization:"Bearer "+reader.token}})).statusCode,403);
  const args={action:"subscribe",endpointId:"original-fixture",topics:["enrollment.created"],reason:"review",key:"http-sub",revision:s.service.context("admin","library:demo").revision};
  assert.equal((await app.inject({method:"POST",url:"/api/webhooks",headers:{...human,"x-csrf-token":"wrong"},payload:args})).statusCode,403);
  assert.equal((await app.inject({method:"POST",url:"/api/webhooks",headers:human,payload:args})).statusCode,200);
  assert.equal(JSON.stringify((await app.inject({url:"/api/webhooks",headers:human})).json()).includes(secret),false);
  assert.equal(s.service.description("admin","library:demo").tools.some(t=>/webhook|integration/.test(t.name)),false);
 }finally{if(app)await app.close();s.db.close();await r.close();}
});
