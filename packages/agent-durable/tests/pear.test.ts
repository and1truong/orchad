import {test} from "node:test";
import assert from "node:assert/strict";
import {rmSync,readFileSync} from "node:fs";
import {openRunner,type DurableRunner} from "../src/index.js";
import type {OpEnvelope} from "../src/journal.js";
import {MODEL,fakeGateway,tmpDb,until} from "./helpers.js";
import {fixture,data} from "../../../pear/tests/helpers.ts";
import {createApp} from "../../../pear/src/server/app.ts";
import {HostPolicy} from "../../../lime/src/host/policy.ts";
const toolCall=(id:string,saved=true)=>({id,type:"function" as const,function:{name:"learning_set_bookmark",arguments:JSON.stringify({courseId:"learning-vi",saved})}});
async function host(path:string){
 const f=fixture(path),origin="http://127.0.0.1:4314",{app}=await createApp({db:f.db,origin,developmentAuth:true});
 const login=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:"learner-a",password:"learner-a-dev"}});
 const session=login.json(),headers={host:"127.0.0.1:4314",origin,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":session.csrf,"x-pear-epoch":session.sessionEpoch};
 const target={targetId:"pear-learner-target",pageInstanceId:"pear-page",origin,appId:"orchard-pear",documentId:"learning:demo:learner-a",title:"Pear"};
 let dispatched=0,approvals=0;
 const adapter={target,current:async()=>({...target}),describe:async()=>(await app.inject({url:"/api/describe",headers})).json(),getContext:async()=>(await app.inject({url:"/api/context",headers})).json(),invoke:async(call:any)=>{dispatched++;return (await app.inject({method:"POST",url:"/api/bridge/invoke",headers,payload:call})).json();}};
 const consent={clientId:"fixture",sessionId:"fixture-session",target:{...target},sessionEpoch:session.sessionEpoch,reads:new Set<string>()};
 const policy=()=>new HostPolicy(adapter,consent,async()=>{approvals++;return true;},new AbortController().signal);
 const descriptor=f.service.description("learner-a").tools.find(t=>t.name==="learning_set_bookmark")!;
 const binding=(p:HostPolicy)=>({targetId:target.targetId,tools:[descriptor],revision:()=>f.service.context("learner-a").revision,idempotentTools:["learning_set_bookmark"],revalidate:async()=>{const r=await p.context();if(!r.ok)throw Error(r.error?.message??"Live consent unavailable");}});
 const call=(p:HostPolicy,envelope:OpEnvelope)=>p.call({requestId:envelope.requestId,documentId:target.documentId,toolName:envelope.toolName,arguments:envelope.arguments,expectedRevision:envelope.expectedRevision,idempotencyKey:envelope.idempotencyKey});
 return {...f,app,headers,policy,binding,call,dispatches:()=>dispatched,approvals:()=>approvals,close:async()=>{await app.close();f.db.close();}};
}
function lostReply(){let release!:()=>void;const wait=new Promise<void>(r=>release=r);return {wait,release:()=>release()};}
test("actual shared Pi + Mango + Lime HostPolicy + Pear HTTP: lost committed bookmark response recovers same envelope once, preserves newer CAS and next mutation",async()=>{
 const {dir,db}=tmpDb(),h=await host(db+".pear"),gw=await fakeGateway([{toolCalls:[toolCall("pear-save")],usage:{input:10,output:5}},{content:"Saved.",usage:{input:10,output:5}},{toolCalls:[toolCall("pear-unsave",false)],usage:{input:10,output:5}},{content:"Unsaved.",usage:{input:10,output:5}}]),lost=lostReply();
 let first:DurableRunner|undefined,reopened:DurableRunner|undefined;
 const envelopes:OpEnvelope[]=[];
 try{
  first=await openRunner({storagePath:db});await first.configure({baseUrl:gw.baseUrl,token:gw.token,model:MODEL});const policy=h.policy();
  await first.bind([h.binding(policy)],async e=>{envelopes.push(e);const r=await h.call(policy,e);assert.equal(r.ok,true);await lost.wait;return r;});
  await first.submit({prompt:"Save the permitted original course",requestId:"pear-admission"});
  await until(()=>h.service.context("learner-a").revision,r=>r===1,"committed Pear bookmark");
  await until(first.status,s=>s.ops[0]?.status==="dispatched","journal without acknowledgment");
  data(h.service.invoke("learner-a",{requestId:"human-bookmark",documentId:"learning:demo:learner-a",toolName:"learning_set_bookmark",arguments:{courseId:"systems-basics",saved:true},expectedRevision:1,idempotencyKey:"human-bookmark"},"human"));
  assert.equal(h.service.context("learner-a").revision,2);
  rmSync(db+".owner",{force:true});reopened=await openRunner({storagePath:db});await reopened.configure({baseUrl:gw.baseUrl,token:gw.token,model:MODEL});const fresh=h.policy();
  await reopened.bind([h.binding(fresh)],async(e,attempt)=>{envelopes.push(e);if(envelopes.length===2)assert.equal(attempt.attemptNo,2);return h.call(fresh,e);});
  await reopened.resume();const done=await until(reopened.status,s=>s.phase==="completed","recovered Pear response");
  assert.deepEqual(envelopes[1],envelopes[0]);assert.equal(done.ops[0].attempts,2);assert.equal(h.service.context("learner-a").revision,2);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE tool='learning_set_bookmark' AND principal='learner-a'").get()!.n,2);
  assert.equal(h.approvals(),2);
  await reopened.submit({prompt:"Remove only the selected saved course",requestId:"pear-follow-up"});
  await until(reopened.status,s=>s.ops.length===2&&s.phase==="completed","next mutation after retry");
  assert.equal(envelopes[2].expectedRevision,2);assert.equal(h.service.context("learner-a").revision,3);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE learner='learner-a' AND course_id='learning-vi'").get()!.n,0);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE learner='learner-a' AND course_id='systems-basics'").get()!.n,1);
  for(const table of ["enrollments","attempts","certificates"])assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM "+table).get()!.n,0);
  const transcript=await reopened.transcript();assert.ok(transcript.messages.some(m=>m.role==="tool"));
  await reopened.close();reopened=undefined;lost.release();await first.close();first=undefined;
  const bytes=readFileSync(db);for(const secret of [gw.token,h.headers.cookie,h.headers["x-csrf-token"],"learner-a-dev"])assert.equal(bytes.includes(secret),false);
 }finally{lost.release();await reopened?.close();await first?.close();await h.close();await gw.close();rmSync(dir,{recursive:true,force:true});}
});
for(const revoke of ["consent","logout","deactivate"] as const)test("Pear durable re-entry rejects live "+revoke+" before retrying a committed key",async()=>{
 const {dir,db}=tmpDb(),h=await host(db+".pear"),gw=await fakeGateway([{toolCalls:[toolCall("pear-revoked")],usage:{input:10,output:5}},{content:"Unavailable.",usage:{input:10,output:5}}]),lost=lostReply();
 let first:DurableRunner|undefined,reopened:DurableRunner|undefined;
 try{
  first=await openRunner({storagePath:db});await first.configure({baseUrl:gw.baseUrl,token:gw.token,model:MODEL});const original=h.policy();
  await first.bind([h.binding(original)],async e=>{const r=await h.call(original,e);assert.equal(r.ok,true);await lost.wait;return r;});
  await first.submit({prompt:"Save the selected course",requestId:"pear-revoked-admission"});await until(()=>h.service.context("learner-a").revision,r=>r===1,"committed before revocation");await until(first.status,s=>s.ops[0]?.status==="dispatched");
  rmSync(db+".owner",{force:true});reopened=await openRunner({storagePath:db});await reopened.configure({baseUrl:gw.baseUrl,token:gw.token,model:MODEL});const fresh=h.policy(),bind=h.binding(fresh);
  if(revoke==="consent")fresh.revoke();
  if(revoke==="logout")await h.app.inject({method:"POST",url:"/api/logout",headers:h.headers,payload:{}});
  if(revoke==="deactivate")h.db.prepare("UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'").run();
  await reopened.bind([{...bind,revision:()=>1}],e=>h.call(fresh,e));await reopened.resume();
  const failed=await until(reopened.status,s=>s.ops[0]?.status==="failed","live authority rejection");
  assert.match(failed.ops[0].error??"",/revalidation failed/i);assert.equal(h.dispatches(),1);assert.equal(h.approvals(),1);
  assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE learner='learner-a'").get()!.n,1);
  assert.equal(h.db.prepare("SELECT revision FROM workspaces WHERE id='learning:demo:learner-a'").get()!.revision,1);
 }finally{lost.release();await reopened?.close();await first?.close();await h.close();await gw.close();rmSync(dir,{recursive:true,force:true});}
});

test("actual Pear committed response lost: unresolved mutation blocks new durable admissions across cancel and reopen, then original authoritative reconciliation permits a follow-up",async()=>{
 const {dir,db}=tmpDb(),h=await host(db+".pear"),gw=await fakeGateway([{toolCalls:[toolCall("pear-ambiguous")],usage:{input:10,output:5}},{content:"Outcome needs reconciliation.",usage:{input:10,output:5}},{toolCalls:[toolCall("pear-after-resolution",false)],usage:{input:10,output:5}},{content:"Removed.",usage:{input:10,output:5}}]);
 let runner:DurableRunner|undefined;let originalResult:any,envelope:OpEnvelope|undefined;
 try{
  runner=await openRunner({storagePath:db});await runner.configure({baseUrl:gw.baseUrl,token:gw.token,model:MODEL});const policy=h.policy();
  await runner.bind([h.binding(policy)],async e=>{envelope=e;originalResult=await h.call(policy,e);assert.equal(originalResult.ok,true);throw Error("fixture lost response after Pear commit");});
  await runner.submit({prompt:"Save the selected course",requestId:"pear-unknown-admission"});await until(runner.status,s=>s.ops[0]?.status==="ambiguous"&&s.tasks.length===0,"unknown committed Pear response");
  assert.equal(h.dispatches(),1);assert.equal(h.service.context("learner-a").revision,1);
  await assert.rejects(runner.submit({prompt:"Save again with a replacement request",requestId:"pear-forbidden-replacement"}),/NEEDS_RECONCILIATION/);
  assert.equal((await runner.transcript()).messages.some(m=>m.role==="user"&&String(m.content).includes("replacement request")),false);
  await runner.cancel();await assert.rejects(runner.submit({prompt:"Retry after cancel",requestId:"pear-after-cancel"}),/NEEDS_RECONCILIATION/);
  await runner.close();runner=await openRunner({storagePath:db});
  await assert.rejects(runner.submit({prompt:"Retry after reopen",requestId:"pear-after-reopen"}),/NEEDS_RECONCILIATION/);
  assert.equal(h.dispatches(),1);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE tool='learning_set_bookmark'").get()!.n,1);assert.ok(envelope);
  const current=data(h.service.invoke("learner-a",{requestId:"read-outcome",documentId:"learning:demo:learner-a",toolName:"learning_get_my_learning",arguments:{},expectedRevision:null,idempotencyKey:null},"human"));
  assert.ok(current.saved.some((r:any)=>r.course_id==="learning-vi"));
  await runner.resolveOp(envelope!.requestId,{status:"reconciled",result:originalResult});
  await runner.configure({baseUrl:gw.baseUrl,token:gw.token,model:MODEL});const fresh=h.policy();await runner.bind([h.binding(fresh)],e=>h.call(fresh,e));
  await runner.submit({prompt:"Remove the reconciled bookmark",requestId:"pear-reviewed-follow-up"});await until(runner.status,s=>s.ops.length===2&&s.phase==="completed","resolved follow-up");
  assert.equal(h.dispatches(),2);assert.equal(h.service.context("learner-a").revision,2);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE learner='learner-a' AND course_id='learning-vi'").get()!.n,0);
  for(const table of ["enrollments","attempts","certificates"])assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM "+table).get()!.n,0);
 }finally{await runner?.close();await h.close();await gw.close();rmSync(dir,{recursive:true,force:true});}
});
