#!/usr/bin/env node
// Native runtime acceptance lane (issue #43). Drives the REAL Tauri binary
// (debug build, COCONUT_SMOKE=1) under xvfb against the real counter fixture
// served on the trusted origin. Asserts, against the live native runtime:
//   handshake   sidecar `ready` -> heartbeat -> open_guest -> `binding`
//   discovery   host_list_targets / host_list_tools through the real WebView
//   consent     explicit read-tool grant -> consented read
//   mutation    approval card -> decide -> revision bump
//   denial      privileged action without a live heartbeat is refused
//   revocation  navigation to a different page drops the binding + grants
//   inactivity  UI lease expiry (>4s without heartbeat) fails writes closed
// Every failure exits non-zero so the CI lane actually gates.
// Usage: node scripts/native-acceptance.mjs [path-to-coconut-binary]
//        (wrap in xvfb-run on headless Linux)
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {connect} from 'node:net';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const coconutRoot=fileURLToPath(new URL('..',import.meta.url));
const TRUSTED='http://127.0.0.1:4310';        // must match trusted-origin.txt
const SMOKE_PORT=4319,MCP_PORT=14313;
const lane='native-runtime';
const checks=[];
const check=(name,cond,detail='')=>{checks.push({name,ok:!!cond,detail});console.log(`  ${cond?'PASS':'FAIL'} ${name}${detail?' — '+detail:''}`);if(!cond)throw Object.assign(new Error(`acceptance failed: ${name}`),{acceptance:true});};

// --- fixture on the trusted origin --------------------------------------
const files={'/':'index.html','/counter.mjs':'counter.mjs','/unsupported.html':'unsupported.html'};
const fixture=createServer(async(req,res)=>{const f=files[req.url];if(!f){res.writeHead(404).end();return;}res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'none'");res.setHeader('Content-Type',f.endsWith('.mjs')?'text/javascript':'text/html');res.end(await readFile(new URL(`../fixtures/${f}`,import.meta.url)));});
await new Promise(r=>fixture.listen(4310,'127.0.0.1',r));

// --- spawn the real binary ----------------------------------------------
const bin=process.argv[2]??`${coconutRoot}/src-tauri/target/debug/coconut`;
await access(bin);
const child=spawn(bin,[],{env:{...process.env,COCONUT_SMOKE:'1',COCONUT_MCP_PORT:String(MCP_PORT)},stdio:['ignore','ignore','pipe']});
let stderr='';const markers=[];let exitCode=null;
child.stderr.on('data',d=>{stderr+=d;for(const l of String(d).split('\n'))if(l.startsWith('COCONUT_SMOKE:'))markers.push(l.trim());});
child.on('exit',c=>exitCode=c);
const waitMarker=(re,ms)=>new Promise((res,rej)=>{const t=Date.now()+ms;const tick=()=>{const hit=markers.find(m=>re.test(m));if(hit)return res(hit);if(exitCode!==null)return rej(new Error(`binary exited (${exitCode}) waiting for ${re}\n${stderr.slice(-2000)}`));if(Date.now()>t)return rej(new Error(`timeout waiting for ${re}\n${stderr.slice(-2000)}`));setTimeout(tick,100);};tick();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// --- smoke control channel: one fresh TCP connection per request ---------
const smoke=(op,extra={},ms=65000)=>new Promise((resolve,reject)=>{const s=connect(SMOKE_PORT,'127.0.0.1');let buf='';const to=setTimeout(()=>{s.destroy();reject(new Error(`smoke ${op} timed out`));},ms);s.on('connect',()=>s.write(JSON.stringify({op,...extra})+'\n'));s.on('data',d=>{buf+=d;const i=buf.indexOf('\n');if(i<0)return;clearTimeout(to);s.destroy();try{const r=JSON.parse(buf.slice(0,i));r.ok?resolve(r.result):reject(new Error(r.error));}catch(e){reject(e);}});s.on('error',e=>{clearTimeout(to);reject(e);});});
const request=(req,ms)=>smoke('request',{request:req},ms);
const tool=(name,args,ms)=>request({action:'tool',tool:name,args},ms);
const heartbeat=async()=>{const r=await request({action:'heartbeat'});return r;};
const waitFor=async(fn,ms,step=250)=>{const t=Date.now()+ms;for(;;){const v=await fn();if(v)return v;if(Date.now()>t)throw new Error('waitFor timed out');await sleep(step);}};

const failOut=async(e)=>{console.error(`\n[${lane}] FAILED: ${e?.message??e}`);console.error('last stderr:\n'+stderr.slice(-3000));try{await smoke('quit',{},2000);}catch{}child.kill('SIGKILL');fixture.close();process.exit(1);};

try{
  console.log(`[${lane}] driving ${bin}`);
  // handshake: sidecar ready marker proves the real host process + sidecar
  // are wired; it is NOT a --version probe.
  await waitMarker(/^COCONUT_SMOKE:recv:ready/,30000);
  check('handshake: sidecar ready marker emitted by real runtime',true);

  // open the real guest webview against the fixture and wait for the real
  // binding envelope the guest bridge replies with.
  markers.length=0;
  await smoke('open_guest',{url:TRUSTED+'/'});
  await waitMarker(/^COCONUT_SMOKE:send:binding/,20000);
  check('binding: guest bridge bound through real WebView',true);

  // negative: hide the host window, let the 4s lease lapse — writes must
  // fail closed (no lease extension while the trusted UI is inactive).
  await smoke('hide',{});
  await sleep(4500);
  const t0=(await tool('host_list_targets',{}))?.data?.targets?.[0];
  await tool('host_list_tools',{targetId:t0.targetId,pageInstanceId:t0.pageInstanceId});
  const early=await tool('host_call_tool',{targetId:t0.targetId,pageInstanceId:t0.pageInstanceId,call:{toolName:'demo_increment',arguments:{amount:1},documentId:t0.documentId,expectedRevision:0,idempotencyKey:randomUUID(),requestId:randomUUID()}});
  check('denial: write refused while trusted UI hidden',early.ok===false&&early.error?.code==='APPROVAL_DENIED',JSON.stringify(early.error));
  await smoke('show',{});
  await heartbeat();
  check('handshake: heartbeat accepted while trusted UI active',true);

  const targets=(await tool('host_list_targets',{}))?.data?.targets;
  const target=targets?.[0];
  check('discover: host_list_targets returns the bound target',!!target,target&&`${target.origin} ${target.documentId}`);
  const {targetId,pageInstanceId,documentId}=target;
  const tools=(await tool('host_list_tools',{targetId,pageInstanceId}))?.data?.tools;
  check('discover: host_list_tools returns fixture catalog',tools?.some(t=>t.name==='demo_read')&&tools?.some(t=>t.name==='demo_increment'),JSON.stringify(tools?.map(t=>t.name)));

  // unconsented read falls back to a trusted approval — deny it.
  const deniedP=tool('host_call_tool',{targetId,pageInstanceId,call:{toolName:'demo_read',arguments:{},documentId,expectedRevision:null,idempotencyKey:null,requestId:randomUUID()}});
  const pend1=await waitFor(async()=>(await heartbeat()).approvals[0],10000);
  await request({action:'decide',approvalId:pend1.id,allow:false});
  const denied=await deniedP;
  check('consent: unconsented read needs trusted approval (denied path)',denied.ok===false&&denied.error?.code==='APPROVAL_DENIED',JSON.stringify(denied.error));

  // explicit consent -> consented read.
  await request({action:'consent',targetId,readTools:['demo_read']});
  const read=await tool('host_call_tool',{targetId,pageInstanceId,call:{toolName:'demo_read',arguments:{},documentId,expectedRevision:null,idempotencyKey:null,requestId:randomUUID()}});
  check('consent: consented read returns fixture value',read.ok===true&&read.data?.value===0,JSON.stringify(read.data));

  // mutation: approval card shows up in the heartbeat snapshot, decide ->
  // revision bump.
  const rev0=(await tool('host_get_context',{targetId,pageInstanceId}))?.data?.revision;
  const writeP=tool('host_call_tool',{targetId,pageInstanceId,call:{toolName:'demo_increment',arguments:{amount:1},documentId,expectedRevision:rev0,idempotencyKey:randomUUID(),requestId:randomUUID()}});
  const card=await waitFor(async()=>(await heartbeat()).approvals.find(a=>a.call.toolName==='demo_increment'),10000);
  check('approval: write surfaces a real approval card in snapshot',!!card);
  await request({action:'decide',approvalId:card.id,allow:true});
  const write=await writeP;
  check('mutation: approved write lands and bumps revision',write.ok===true&&write.data?.revision===rev0+1,JSON.stringify(write.data));

  // UI inactivity, second angle: a pending approval card cannot be decided
  // while the trusted UI is hidden — the native gate refuses privileged
  // actions outright — but resumes once the UI is back and heartbeating.
  const deniedP2=tool('host_call_tool',{targetId,pageInstanceId,call:{toolName:'demo_increment',arguments:{amount:1},documentId,expectedRevision:rev0+1,idempotencyKey:randomUUID(),requestId:randomUUID()}});
  const card2=await waitFor(async()=>(await heartbeat()).approvals.find(a=>a.call.toolName==='demo_increment'),10000);
  await smoke('hide',{});
  await request({action:'decide',approvalId:card2.id,allow:true}).then(
    ()=>check('inactivity: decide refused while UI hidden',false),
    e=>check('inactivity: decide refused while UI hidden',/inactive/i.test(String(e)),String(e)));
  await smoke('show',{});
  await heartbeat();
  await request({action:'decide',approvalId:card2.id,allow:true});
  const resumed=await deniedP2;
  check('inactivity: pending card resumable only after UI returns',resumed.ok===true,JSON.stringify(resumed.error??resumed.data));

  // navigation/session change: opening a different page invalidates the
  // binding and every consent grant tied to it.
  markers.length=0;
  await smoke('open_guest',{url:TRUSTED+'/unsupported.html'});
  await waitMarker(/^COCONUT_SMOKE:send:closed/,15000);
  const snap=await heartbeat();
  check('revocation: navigation drops the target binding',!snap.targets.some(t=>t.targetId===targetId));
  check('revocation: consent grants wiped on rebind',!(snap.sidebar?.readTools?.[targetId]?.length));

  // fresh binding on the counter page must NOT inherit the old consent:
  // demo_read goes back through the approval path.
  markers.length=0;
  await smoke('open_guest',{url:TRUSTED+'/'});
  await waitMarker(/^COCONUT_SMOKE:send:binding/,20000);
  const t2=(await tool('host_list_targets',{}))?.data?.targets?.[0];
  await tool('host_list_tools',{targetId:t2.targetId,pageInstanceId:t2.pageInstanceId});
  const againP=tool('host_call_tool',{targetId:t2.targetId,pageInstanceId:t2.pageInstanceId,call:{toolName:'demo_read',arguments:{},documentId:t2.documentId,expectedRevision:null,idempotencyKey:null,requestId:randomUUID()}});
  const pend2=await waitFor(async()=>(await heartbeat()).approvals[0],10000);
  await request({action:'decide',approvalId:pend2.id,allow:false});
  const again=await againP;
  check('revocation: new binding re-requires explicit read consent',again.ok===false&&again.error?.code==='APPROVAL_DENIED');

  await smoke('quit',{},3000);
  const code=await new Promise(res=>{const t=setTimeout(()=>res(exitCode),5000);child.on('exit',c=>{clearTimeout(t);res(c);});});
  check('shutdown: clean exit after quit',code===0,`exit=${code}`);

  console.log(`\n[${lane}] ${checks.length}/${checks.length} checks passed`);
  fixture.close();
  process.exit(0);
}catch(e){await failOut(e);}
