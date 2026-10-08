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
const edition=process.env.PEAR_NATIVE_SCORM_EDITION??"2004-4";
const nonce=randomUUID(),lane="native-scorm:"+edition,checks=[];
const check=(name,cond)=>{checks.push(name);console.log(`  ${cond?"PASS":"FAIL"} ${name}`);if(!cond)throw Error("Acceptance failed: "+name);};
const fixture=spawn(process.execPath,["--import","tsx","scripts/native-scorm-fixture.ts"],{cwd:pearRoot,env:{...process.env,PEAR_NATIVE_NONCE:nonce},stdio:["ignore","pipe","pipe","ipc"]});
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
const state=async()=>{const r=await fetch(TRUSTED+"/native-scorm/"+nonce+"/state");if(!r.ok)throw Error("Fixture state unavailable");return r.json();};
const close=async()=>{
 if(client)await client.close().catch(()=>{});
 try{await smoke("quit",{},3000);}catch{}
 if(exitCode===null)await new Promise(resolve=>{const t=setTimeout(()=>{child.kill("SIGKILL");resolve();},5000);child.once("exit",()=>{clearTimeout(t);resolve();});});
 if(fixture.connected)fixture.send({kind:"close"});
 if(fixtureExit===null)await new Promise(resolve=>{const t=setTimeout(()=>{fixture.kill("SIGKILL");resolve();},5000);fixture.once("exit",()=>{clearTimeout(t);resolve();});});
};
try {
 await waitMarker(/^COCONUT_SMOKE:boot:main/,20000);
 await waitMarker(/^COCONUT_SMOKE:setup:sidecar-spawned/,120000);
 await waitMarker(/^COCONUT_SMOKE:recv:ready/,60000);
 markers.length=0;
 await openAndBind(TRUSTED+'/native-scorm/'+nonce+'/bootstrap/learner-a');
 const target=await waitFor(async()=>(await tool('host_list_targets',{}))?.data?.targets?.find(t=>t.appId==='orchard-pear'&&t.documentId==='learning:demo:learner-a'),30000);
 check('real Tauri WebView binds the authenticated Pear workspace during SCORM playback',!!target);
 await waitMarker(/^COCONUT_SMOKE:ui-response:consent$/,15000); await heartbeat();
 const first=await waitFor(async()=>{const value=await state();if(value.driverErrors.length)throw Error(value.driverErrors.join(';'));return value.probes.length>=1&&value.checkpoints>=1?value:false;},60000);
 check('real requested edition and actual WebView user agent are recorded',first.edition===edition&&typeof first.probes[0].userAgent==='string'&&first.probes[0].userAgent.length>0);
 console.log(JSON.stringify({platform:process.platform,edition,userAgent:first.probes[0].userAgent}));
 const isolated=probe=>['pearCookieDenied','pearStorageDenied','pearBridgeDenied','pearNativeDenied','noOwnBridge','nativeDenied','externalFetchDenied'].every(key=>probe[key]===true);
 check('native untrusted SCO cannot read Pear credentials/storage or invoke app/native authority',isolated(first.probes[0]));
 check('native SCORM reports incomplete progress without official proof or external fixture requests',first.proofs===0&&first.calls.length===0&&first.probes[0].entry==='ab-initio'&&first.droppedACK===true);
 const scope={targetId:target.targetId,pageInstanceId:target.pageInstanceId};
 const pair=await request({action:'pair',name:'Native SCORM fixture',scopes:['read'],targetIds:[target.targetId],readTools:['learning_get_lesson']});
 client=new Client({name:'native-scorm-acceptance',version:'0.1.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${MCP_PORT}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${pair.token}`}}}));
 const mcp=async(name,args)=>{const result=await client.callTool({name,arguments:args});return result.structuredContent;};
 await mcp('host_list_tools',scope);
 const call={...scope,call:{requestId:randomUUID(),documentId:target.documentId,toolName:'learning_get_lesson',arguments:first.binding,expectedRevision:null,idempotencyKey:null}};
 const lesson=await mcp('host_call_tool',call);
 check('real external MCP reads permitted source metadata while SCORM is active',lesson?.ok&&lesson.data.title==='Package lesson');
 check('native host source read excludes SCORM CMI/capabilities/private responses',['scorm','state','runtime_state','token','suspend_data','answers','csrf'].every(key=>!Object.hasOwn(lesson.data,key)));
 const command=async action=>{const result=await fetch(TRUSTED+'/native-scorm/'+nonce+'/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});if(!result.ok)throw Error('Synthetic fixture command denied');};
 await command('retry');
 await waitFor(async()=>{const value=await state();return value.exactRetry&&value.checkpoints>=2?value:false;},30000);
 check('actual native lost ACK retries identical payload/receipt without another revision/history record',true);
 await command('resume');
 const resumed=await waitFor(async()=>{const value=await state();if(value.driverErrors.length)throw Error(value.driverErrors.join(';'));return value.probes.length>=2&&value.checkpoints>=2?value:false;},60000);
 check('native close/reopen resumes durable bookmark through licensed wrapper',resumed.probes[1].entry==='resume'&&resumed.probes[1].bookmark==='licensed-page'&&isolated(resumed.probes[1]));
 await command('finish');
 const completed=await waitFor(async()=>{const value=await state();return value.proofs===1?value:false;},30000);
 check('native Terminate projects exactly one authoritative SCORM proof and preserves quiz requirement',completed.proofs===1&&completed.certificates===0&&completed.calls.length===0);
 markers.length=0; await openAndBind(TRUSTED+'/native-scorm/'+nonce+'/bootstrap/learner-b');
 await waitFor(async()=>(await tool('host_list_targets',{}))?.data?.targets?.find(t=>t.documentId==='learning:demo:learner-b'),30000);
 const old=await mcp('host_call_tool',{...call,call:{...call.call,requestId:randomUUID()}});
 check('old native MCP pairing cannot read the SCORM source after identity change',old?.ok===false);
 await close(); check('native SCORM fixture shuts down cleanly',exitCode===0&&fixtureExit===0);
 console.log(`[${lane}] ${checks.length}/${checks.length} checks passed`);
} catch(error) {console.error('['+lane+'] FAILED: '+error.message);
 const diagnostic=await state().catch(()=>null);if(diagnostic)console.error(JSON.stringify({edition:diagnostic.edition,driverErrors:diagnostic.driverErrors,contentRequests:diagnostic.contentRequests,probes:diagnostic.probes.length,checkpoints:diagnostic.checkpoints,droppedACK:diagnostic.droppedACK,exactRetry:diagnostic.exactRetry,proofs:diagnostic.proofs}));console.error(stderr.slice(-2000));console.error(fixtureError.slice(-1000));await close();process.exitCode=1;}
