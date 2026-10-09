#!/usr/bin/env node
// Actual Tauri WebView -> Pear window bridge -> same-origin backend,
// reached by the real Coconut MCP transport. Synthetic fixture only.
import {spawn} from "node:child_process";
import {connect} from "node:net";
import {access} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {smokeLines} from "./smoke-lines.mjs";
const coconutRoot=fileURLToPath(new URL("..",import.meta.url));
const pearRoot=fileURLToPath(new URL("../../pear/",import.meta.url));
const TRUSTED="http://127.0.0.1:4310",SMOKE_PORT=4319,MCP_PORT=14313;
const nonce=randomUUID(),lane="native-pear",checks=[];
const check=(name,cond)=>{checks.push(name);console.log(`  ${cond?"PASS":"FAIL"} ${name}`);if(!cond)throw Error("Acceptance failed: "+name);};
const fixture=spawn(process.execPath,["--import","tsx","scripts/native-fixture.ts"],{cwd:pearRoot,env:{...process.env,PEAR_NATIVE_NONCE:nonce},stdio:["ignore","pipe","pipe","ipc"]});
let fixtureOutput="",fixtureError="",fixtureExit=null;
fixture.stdout.on("data",d=>fixtureOutput+=d);fixture.stderr.on("data",d=>fixtureError+=d);fixture.on("exit",c=>fixtureExit=c);
await new Promise((resolve,reject)=>{
 const until=Date.now()+30000;
 const tick=()=>{if(fixtureOutput.includes("PEAR_NATIVE_FIXTURE_READY"))return resolve();
  if(fixtureExit!==null||Date.now()>until)return reject(Error("Pear fixture failed: "+fixtureError.slice(-1000)));
  setTimeout(tick,100);};tick();
}).catch(e=>{fixture.kill("SIGKILL");throw e;});
// --- spawn the real binary ----------------------------------------------
const bin=process.argv[2]??`${coconutRoot}/src-tauri/target/debug/coconut`;
await access(bin).catch(e=>{fixture.kill("SIGKILL");throw e;});
const child=spawn(bin,[],{env:{...process.env,COCONUT_SMOKE:'1',COCONUT_MCP_PORT:String(MCP_PORT),WEBKIT_DISABLE_DMABUF_RENDERER:'1',WEBKIT_DISABLE_COMPOSITING_MODE:'1',LIBGL_ALWAYS_SOFTWARE:'1',GALLIUM_DRIVER:'llvmpipe'},stdio:['ignore','ignore','pipe']});
let stderr='';const markers=[];let exitCode=null;
const consumeMarkers=smokeLines(line=>markers.push(line));
child.stderr.on('data',d=>{stderr+=d;consumeMarkers(d);});
child.on('exit',c=>exitCode=c);
const waitMarker=(re,ms)=>new Promise((res,rej)=>{const t=Date.now()+ms;const tick=()=>{const hit=markers.find(m=>re.test(m));if(hit)return res(hit);if(exitCode!==null)return rej(new Error(`binary exited (${exitCode}) waiting for ${re}\n${stderr.slice(-2000)}`));if(Date.now()>t)return rej(new Error(`timeout waiting for ${re}\n${stderr.slice(-2000)}`));setTimeout(tick,100);};tick();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// --- smoke control channel: one fresh TCP connection per request ---------
const smoke=(op,extra={},ms=65000)=>new Promise((resolve,reject)=>{const s=connect(SMOKE_PORT,'127.0.0.1');let buf='';const to=setTimeout(()=>{s.destroy();reject(new Error(`smoke ${op} timed out`));},ms);s.on('connect',()=>s.write(JSON.stringify({op,...extra})+'\n'));s.on('data',d=>{buf+=d;const i=buf.indexOf('\n');if(i<0)return;clearTimeout(to);s.destroy();try{const r=JSON.parse(buf.slice(0,i));r.ok?resolve(r.result):reject(new Error(r.error));}catch(e){reject(e);}});s.on('error',e=>{clearTimeout(to);reject(e);});});
const request=(req,ms)=>smoke('request',{request:req},ms);
const tool=(name,args,ms)=>request({action:'tool',tool:name,args},ms);
const heartbeat=async()=>{const r=await request({action:'heartbeat'});return r;};
const openAndBind=async(url)=>{await smoke('open_guest',{url});for(let i=0;i<4;i++){try{await waitMarker(/^COCONUT_SMOKE:send:binding/,i?15000:40000);return;}catch(e){if(i===3)throw e;try{await smoke('discover');}catch{await smoke('open_guest',{url});}}}};
const waitFor=async(fn,ms,step=250)=>{const t=Date.now()+ms;for(;;){const v=await fn();if(v)return v;if(Date.now()>t)throw new Error('waitFor timed out');await sleep(step);}};


let client=null;
const shutdown={quitAcknowledged:false,nativeForced:false,fixtureForced:false,nativeSignal:null,fixtureSignal:null};
child.on('exit',(_code,signal)=>shutdown.nativeSignal=signal);fixture.on('exit',(_code,signal)=>shutdown.fixtureSignal=signal);
const state=async()=>{const r=await fetch(TRUSTED+"/native-fixture/"+nonce+"/state");if(!r.ok)throw Error("Fixture state unavailable");return r.json();};
const close=async()=>{
 if(client)await client.close().catch(()=>{});
 try{await smoke("quit",{},3000);shutdown.quitAcknowledged=true;}catch{}
 if(exitCode===null)await new Promise(resolve=>{const t=setTimeout(()=>{shutdown.nativeForced=true;child.kill("SIGKILL");resolve();},5000);child.once("exit",()=>{clearTimeout(t);resolve();});});
 if(fixture.connected)fixture.send({kind:"close"});
 if(fixtureExit===null)await new Promise(resolve=>{const t=setTimeout(()=>{shutdown.fixtureForced=true;fixture.kill("SIGKILL");resolve();},5000);fixture.once("exit",()=>{clearTimeout(t);resolve();});});
};
try{
 await waitMarker(/^COCONUT_SMOKE:boot:main/,20000);
 await waitMarker(/^COCONUT_SMOKE:setup:sidecar-spawned/,120000);
 await waitMarker(/^COCONUT_SMOKE:recv:ready/,60000);
 markers.length=0;
 await openAndBind(TRUSTED+"/native-fixture/"+nonce+"/bootstrap/learner-a");
 const target=await waitFor(async()=>{
  const targets=(await tool("host_list_targets",{}))?.data?.targets;
  return targets?.find(t=>t.appId==="orchard-pear"&&t.documentId==="learning:demo:learner-a");
 },30000);
 check("real native WebView binds Pear's authenticated learner workspace",!!target);
 const scope={targetId:target.targetId,pageInstanceId:target.pageInstanceId};
 const catalog=(await tool("host_list_tools",scope))?.data?.tools;
 check("real Pear catalog exposes learning and excludes human assessment confirmation",
  catalog?.some(t=>t.name==="learning_enroll")&&!catalog?.some(t=>t.name==="human_complete_lesson"||t.name==="human_submit_attempt"));
 await waitMarker(/^COCONUT_SMOKE:ui-response:consent$/,15000);
 await heartbeat();
 const pair=await request({action:"pair",name:"Pear native fixture",scopes:["read","write"],targetIds:[target.targetId],
  readTools:["learning_search","learning_get_my_learning","learning_get_progress","learning_get_lesson"]});
 client=new Client({name:"pear-native-acceptance",version:"0.1.0"});
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${MCP_PORT}/mcp`),
  {requestInit:{headers:{Authorization:`Bearer ${pair.token}`}}}));
 const mcp=async(name,args)=>{const r=await client.callTool({name,arguments:args});return r.structuredContent;};
 const targets=await mcp("host_list_targets",{});
 check("real external MCP client discovers the native Pear target",targets?.ok&&targets.data.targets.some(t=>t.targetId===target.targetId));
 await mcp("host_list_tools",scope);
 const call=(toolName,args,revision=null,key=null)=>({...scope,call:{requestId:randomUUID(),documentId:target.documentId,toolName,arguments:args,expectedRevision:revision,idempotencyKey:key}});
 const search=await mcp("host_call_tool",call("learning_search",{query:"systems",limit:10}));
 check("MCP search returns actual authorized Pear catalog metadata",search?.ok&&search.data.items.some(x=>x.id==="systems-basics"));
 const context=await mcp("host_get_context",scope),revision=context.data.revision;
 const deniedP=mcp("host_call_tool",call("learning_enroll",{courseId:"systems-basics"},revision,randomUUID()));
 const deniedCard=await waitFor(async()=>(await heartbeat()).approvals.find(a=>a.call.toolName==="learning_enroll"),10000);
 await request({action:"decide",approvalId:deniedCard.id,allow:false});
 check("denied native approval dispatches zero enrollment",(await deniedP).error?.code==="APPROVAL_DENIED"&&(await state()).enrollments.length===0);
 const writeP=mcp("host_call_tool",call("learning_enroll",{courseId:"systems-basics"},revision,randomUUID()));
 const card=await waitFor(async()=>(await heartbeat()).approvals.find(a=>a.call.toolName==="learning_enroll"),10000);
 await request({action:"decide",approvalId:card.id,allow:true});
 const enrolled=await writeP;check("approved MCP enrollment commits the real Pear transaction",enrolled?.ok&&enrolled.data.enrollmentId);
 const id=enrolled.data.enrollmentId;
 const progress=await mcp("host_call_tool",call("learning_get_progress",{enrollmentId:id}));
 check("native MCP reads authoritative pinned progress",progress?.ok&&progress.data.id===id&&progress.data.completed_lessons.length===0);
 const official=await mcp("host_call_tool",call("human_complete_lesson",{enrollmentId:id,lessonId:"retry"},enrolled.revision,randomUUID()));
 check("unavailable human confirmation cannot grant progress through MCP",official?.ok===false&&(await state()).enrollments[0].completed_lessons==="[]");
 await smoke("hide");await sleep(4500);
 const hidden=await mcp("host_call_tool",call("learning_enroll",{courseId:"learning-vi"},enrolled.revision,randomUUID()));
 check("hidden trusted UI denies native writes without another enrollment",hidden?.ok===false&&(await state()).enrollments.length===1);
 await smoke("show");await heartbeat();
 markers.length=0;
 await openAndBind(TRUSTED+"/native-fixture/"+nonce+"/bootstrap/learner-b");
 const other=await waitFor(async()=>{
  const targets=(await tool("host_list_targets",{}))?.data?.targets;
  return targets?.find(t=>t.documentId==="learning:demo:learner-b");
 },30000);
 check("native account switch rebinds Pear identity",!!other);
 const old=await mcp("host_call_tool",call("learning_get_my_learning",{}));
 check("old MCP pairing cannot read after native identity switch",old?.ok===false);
 const ledger=await state();
 check("native flow never fabricates scores, completion or certificates",ledger.enrollments.length===1&&ledger.enrollments[0].learner==="learner-a"&&ledger.attempts===0&&ledger.certificates===0);
 await close();console.log(JSON.stringify({shutdown,nativeExit:exitCode,fixtureExit}));check("native Pear fixture shuts down cleanly",exitCode===0&&fixtureExit===0&&!shutdown.nativeForced&&!shutdown.fixtureForced);
 console.log(`[${lane}] ${checks.length}/${checks.length} checks passed`);
}catch(e){console.error("["+lane+"] FAILED: "+e.message);console.error(stderr.slice(-2000));console.error(fixtureError.slice(-1000));await close();process.exitCode=1;}
