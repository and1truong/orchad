// Isolated CI fixture. Not imported or mounted by any product entry point.
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import Fastify from 'fastify';
import {createApp} from '../src/server/app.ts';
import {scormLearningFixture} from '../tests/scorm-learning-fixture.ts';
import {interopPackage} from '../tests/scorm-interop-fixture.ts';
import {sequencingResponsePatterns} from '../tests/scorm-sequencing-response-vectors.ts';
import {absentCollectionPaths} from '../tests/scorm-collection-read-vectors.ts';
const edition = process.env.PEAR_NATIVE_SCORM_EDITION ?? '2004-4';
if (!['1.2', '2004-2', '2004-3', '2004-4'].includes(edition)) throw Error('Unsupported native SCORM edition');
const nonce = process.env.PEAR_NATIVE_NONCE;
if (!nonce || !/^[-a-zA-Z0-9]{20,64}$/.test(nonce)) throw Error('Explicit native fixture nonce required');
const dir = mkdtempSync(join(tmpdir(), 'pear-native-scorm-')), prefix = '/native-scorm/' + nonce, origin = 'http://127.0.0.1:4310';
let action = 'start', droppedACK = false, exactRetry = false, droppedPayload = '', droppedReceipt = '', droppedCount = 0, droppedRevision = 0, largestCheckpointBytes = 0, responseBindingCheckpoints = 0, responseWriteCheckpoints = 0; const probes: any[] = [], calls: string[] = [], navigationAttempts: string[] = [], pearCanaryCalls: string[] = [], navigationViolations: string[] = [], driverErrors: string[] = [], contentRequests: {kind: string; status: number}[] = [];
const script = `
(async()=>{
  const evidence={pearCookieDenied:false,pearStorageDenied:false,pearBridgeDenied:false,pearNativeDenied:false,noOwnBridge:!window.agentBridgeV1&&!parent.agentBridgeV1,nativeDenied:false,externalFetchDenied:false,userAgent:navigator.userAgent,entry:get('${edition === '1.2' ? 'cmi.core.entry' : 'cmi.entry'}'),bookmark:get('${edition === '1.2' ? 'cmi.core.lesson_location' : 'cmi.location'}')};
  if('${edition}'!=='1.2'){
    const api=parent.API_1484_11;if(api.SetValue('cmi.interactions.0.id','urn:pear:native-read-errors')!=='true')throw Error('Native interaction ID refused');
    evidence.collectionReadErrors=${JSON.stringify(absentCollectionPaths)}.map(path=>{if(api.GetValue(path)!=='')throw Error('Absent collection value');return {path,code:api.GetLastError()};});
    evidence.interactionReadErrors=['type','timestamp','weighting','result','latency'].map(field=>{
      if(api.GetValue('cmi.interactions.2.'+field)!=='')throw Error('Absent interaction value');const absentCode=api.GetLastError();
      if(api.GetValue('cmi.interactions.0.'+field)!=='')throw Error('Unset interaction value');return {field,absentCode,unsetCode:api.GetLastError()};
    });
    const patterns=${JSON.stringify(sequencingResponsePatterns)},base='cmi.interactions.1';
    if(evidence.entry!=='resume'){if(api.SetValue(base+'.id','urn:pear:native-ordered')!=='true'||api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native ordered dependency');for(const [n,p] of patterns.entries())if(api.SetValue(base+'.correct_responses.'+n+'.pattern',p)!=='true')throw Error('Native ordered pattern');}
    const uriIDs='${edition}'==='2004-2'?['custom://registry:alpha@name:part/a','custom:opaque?part']:['http://[2001:DB8::1]:999999/answer?x=1#part','custom://[v1.future:host]/answer'];
    const uriResumed=evidence.entry!=='resume'||uriIDs.every((id,n)=>api.GetValue(base+'.objectives.'+n+'.id')===id&&api.GetLastError()==='0');
    for(const [n,id] of uriIDs.entries())if(api.SetValue(base+'.objectives.'+n+'.id',id)!=='true')throw Error('Native URI authority rejected');
    const uriCodes=('${edition}'==='2004-2'?['custom://host[part]/','custom://host/part[one]','custom://host/?q=[part]']:['http://[::1]tail/','http://host:abc/','http://host/path[part]']).map(id=>{if(api.SetValue(base+'.objectives.2.id',id)!=='false')throw Error('Native invalid URI authority admitted');return api.GetLastError();});
    evidence.uriAuthority={resumed:uriResumed,preserved:uriIDs.every((id,n)=>api.GetValue(base+'.objectives.'+n+'.id')===id&&api.GetLastError()==='0'),codes:uriCodes,count:api.GetValue(base+'.objectives._count')};
    if(evidence.entry!=='resume'){if(api.SetValue(base+'.learner_response','first-response')!=='true'||api.SetValue(base+'.type','numeric')!=='true'||api.Commit('')!=='true')throw Error('Native first response type change');evidence.responseWriteCheckpoint={committed:true,preserved:api.GetValue(base+'.learner_response')==='first-response'&&api.GetLastError()==='0'};if(api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native original type recovery');}else evidence.responseWriteCheckpoint={resumed:api.GetValue(base+'.learner_response')==='first-response'&&api.GetLastError()==='0'};
    const codes=[[1,patterns[0]],[patterns.length,patterns[0]],[patterns.length,'']].map(([n,p])=>{if(api.SetValue(base+'.correct_responses.'+n+'.pattern',p)!=='false')throw Error('Native duplicate admitted');return api.GetLastError();});
    const preserved=patterns.every((p,n)=>api.GetValue(base+'.correct_responses.'+n+'.pattern')===p&&api.GetLastError()==='0');
    evidence.sequencingResponses={count:api.GetValue(base+'.correct_responses._count'),codes,preserved};
    if(api.SetValue(base+'.correct_responses.0.pattern','uncommitted[,]pattern')!=='true')throw Error('Native unsaved response');
    for(let i=0;i<4097;i++)if(api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native journal setup');
    const typeAccepted=api.SetValue(base+'.type','numeric')==='true'&&api.GetLastError()==='0';
    if(api.Commit('')!=='false')throw Error('Native unreloadable checkpoint queued');const commitCode=api.GetLastError();
    if(api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native checkpoint recovery');
    if(api.SetValue(base+'.correct_responses.0.pattern',patterns[0])!=='true')throw Error('Native original response recovery');
    evidence.reloadableCheckpoint={typeAccepted,commitCode,preserved:patterns.every((p,n)=>api.GetValue(base+'.correct_responses.'+n+'.pattern')===p&&api.GetLastError()==='0')};
    if(evidence.entry==='resume'){if(api.SetValue(base+'.type','numeric')!=='true'||api.Commit('')!=='true')throw Error('Native accepted response type change');evidence.responseBindingCheckpoint={committed:true,preserved:patterns.every((p,n)=>api.GetValue(base+'.correct_responses.'+n+'.pattern')===p&&api.GetLastError()==='0')};if(api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native binding recovery');}
    const comment='🙂'.repeat(4000);if(evidence.entry!=='resume')for(let n=0;n<35;n++)if(api.SetValue('cmi.comments_from_learner.'+n+'.comment',comment)!=='true')throw Error('Native large comment');
    evidence.checkpointCapacity={count:api.GetValue('cmi.comments_from_learner._count'),preserved:Array.from({length:35},(_,n)=>api.GetValue('cmi.comments_from_learner.'+n+'.comment')===comment&&api.GetLastError()==='0').every(Boolean)};
  }
  const top=parent.parent;
  for(const [key,read] of Object.entries({pearCookieDenied:()=>top.document.cookie,pearStorageDenied:()=>top.localStorage.length,pearBridgeDenied:()=>top.agentBridgeV1,pearNativeDenied:()=>top.__TAURI_INTERNALS__}))try{read();}catch{evidence[key]=true;}
  const native=window.__TAURI_INTERNALS__||parent.__TAURI_INTERNALS__;
  evidence.nativeSurface={invoke:typeof native?.invoke,ipc:typeof native?.ipc,postMessage:typeof native?.postMessage,messageChannel:typeof window.ipc?.postMessage,pattern:native?.__TAURI_PATTERN__?.pattern??null,pending:false};
  if(!native)evidence.nativeDenied=true;
  else await Promise.race([Promise.resolve().then(()=>native.invoke('host_request',{request:{action:'heartbeat'}})).catch(()=>{evidence.nativeDenied=true;}),new Promise(resolve=>setTimeout(()=>{evidence.nativeSurface.pending=true;resolve();},5000))]);
  try{await fetch('http://127.0.0.1:4316/external-fetch');}catch{evidence.externalFetchDenied=true;}
  const sink='http://127.0.0.1:4316',violations=[];
  document.addEventListener('securitypolicyviolation',event=>violations.push(event.effectiveDirective));
  for(const [key,run] of Object.entries({xhr:()=>{const request=new XMLHttpRequest();request.open('GET',sink+'/xhr');request.send();},websocket:()=>new WebSocket('ws://127.0.0.1:4316/websocket'),beacon:()=>navigator.sendBeacon(sink+'/beacon','synthetic')}))try{run();}catch{}
  for(const [tag,path] of [['img','image'],['iframe','frame']]){const element=document.createElement(tag);element.src=sink+'/'+path;document.body.append(element);}
  const media=document.createElement('audio'),source=document.createElement('source');source.src=sink+'/media.mp3';source.type='audio/mpeg';media.preload='auto';media.append(source);document.body.append(media);media.load();
  evidence.mediaPlayback=false;evidence.mediaError=null;
  const playback=media.play().then(()=>{evidence.mediaPlayback=true;},error=>{evidence.mediaError=error.name;});
  await Promise.race([playback,new Promise(resolve=>setTimeout(resolve,300))]);
  const style=document.createElement('style');style.textContent='body{background-image:url('+sink+'/css)}';document.head.append(style);
  const form=document.createElement('form');form.action=sink+'/form';form.method='POST';document.body.append(form);evidence.formAttempted=true;try{form.submit();}catch{}
  evidence.popupDenied=window.open(sink+'/popup')===null;
  try{await navigator.serviceWorker.register('native-worker.js');evidence.serviceWorkerDenied=false;}catch{evidence.serviceWorkerDenied=true;}
  try{const worker=new Worker(sink+'/worker');worker.terminate();}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
  // Sandbox disallows forms before CSP dispatch, so form-action need not emit an event.
  evidence.egressDirectives=['connect-src','img-src','media-src','frame-src','worker-src'].every(directive=>violations.includes(directive));
  evidence.egressViolations=[...new Set(violations)];
  evidence.redirectDenied=(await fetch('${prefix}/redirect')).status===403;
  document.getElementById('save').onclick();
  await fetch('${prefix}/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});
  let finished=false,navigated=false;
  const timer=setInterval(async()=>{const command=await(await fetch('${prefix}/command')).json();if(command.action==='finish'&&!finished){finished=true;document.getElementById('finish').onclick();}if(command.action==='navigate'&&finished&&!navigated){navigated=true;clearInterval(timer);
    await fetch('${prefix}/navigation-attempt',{method:'POST'});
    // The SCO can read this same-origin nonce; it is not an authority boundary.
    const injected=parent.document.createElement('script');injected.nonce=parent.document.querySelector('script[nonce]').nonce;
    injected.textContent='location.href='+JSON.stringify('${origin}${prefix}/pear-canary');parent.document.body.append(injected);
  }},200);
})();`;
const f = await scormLearningFixture(join(dir, 'pear.sqlite'), interopPackage(edition as '1.2' | '2004-2' | '2004-3' | '2004-4', 'pipwerks', script)), binding = f.enroll();
const {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4315', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
// Synthetic diagnostics record route classes/status, never launch capabilities.
content!.addHook('onResponse', async (req, reply) => {
  const kind = req.url.startsWith('/launch/') ? req.url.endsWith('/checkpoint') ? 'checkpoint' : req.url.includes('/files/') ? 'resource' : 'launch' : req.url === '/runtime.js' ? 'runtime' : req.url.startsWith(prefix) ? req.url.endsWith('/probe') ? 'probe' : 'fixture-command' : 'other';
  contentRequests.push({kind, status: reply.statusCode});
});
// Lose one successful response after the real player transaction has committed.
content!.addHook('onSend', async (req, reply, payload) => {
  if (!req.url.endsWith('/checkpoint') || reply.statusCode !== 200) return payload;
  const serialized = JSON.stringify(req.body);largestCheckpointBytes=Math.max(largestCheckpointBytes,Buffer.byteLength(serialized));
  if(Object.keys(JSON.parse(String(payload)).responseBindings??{}).length)responseBindingCheckpoints++;
  if(Array.isArray((req.body as any)?.interactionWrites)&&(req.body as any).interactionWrites.length)responseWriteCheckpoints++;
  const count = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
  const revision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
  if (!droppedACK) {
    droppedACK = true; droppedPayload = serialized; droppedReceipt = String(payload); droppedCount = count; droppedRevision = revision;
    reply.code(503); return JSON.stringify({error: 'Synthetic lost acknowledgement after commit'});
  }
  if (serialized === droppedPayload) exactRetry = String(payload) === droppedReceipt && count === droppedCount && revision === droppedRevision;
  return payload;
});
const sink = Fastify({logger: false}); sink.addHook('onRequest', async req => {calls.push(req.url);}); sink.all('/*', async () => 'Synthetic native isolation sink');
content!.get(prefix + '/redirect', async (_req, reply) => reply.redirect(origin + prefix + '/pear-canary'));
content!.post(prefix + '/navigation-attempt', async () => {navigationAttempts.push('player-script-pear'); return {ok: true};});
app.get(prefix + '/pear-canary', async () => {pearCanaryCalls.push('pear-canary'); return 'Synthetic Pear navigation sink';});
app.post(prefix + '/navigation-violation', async req => {if ((req.body as any)?.directive === 'frame-src') navigationViolations.push('frame-src'); return {ok: true};});
content!.get(prefix + '/command', async () => ({action}));
content!.post(prefix + '/probe', async req => {probes.push(req.body); return {ok: true};});
app.get(prefix + '/bootstrap/:user', async (req, reply) => {
  const user = (req.params as any).user; if (!['learner-a', 'learner-b'].includes(user)) return reply.code(404).send();
  const login = await app.inject({method: 'POST', url: '/api/login', headers: {host: '127.0.0.1:4310', origin}, payload: {username: user, password: user + '-dev'}});
  if (login.statusCode !== 200) throw Error('Synthetic native login failed');
  return reply.header('Set-Cookie', login.headers['set-cookie']!).redirect(user === 'learner-a' ? prefix + '/view' : '/');
});
app.get(prefix + '/view', async (_req, reply) => reply.type('text/html').send(readFileSync('dist/index.html', 'utf8').replace('</head>', '<script defer src="' + prefix + '/driver.js"></script></head>')));
app.get(prefix + '/driver.js', async (_req, reply) => reply.type('text/javascript').send(`
document.addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective==='frame-src')void fetch('${prefix}/navigation-violation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({directive:event.effectiveDirective})});});
(async()=>{const wait=async(fn)=>{const until=Date.now()+60000;for(;;){const result=fn();if(result)return result;if(Date.now()>until)throw Error('Native driver timeout');await new Promise(r=>setTimeout(r,100));}};
const button=label=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label&&!b.disabled);
try{await wait(()=>button('Sign out'));(await wait(()=>button('My learning'))).click();(await wait(()=>button('Continue learning'))).click();
const panel=await wait(()=>document.querySelector('[aria-label="Enrolled SCORM player"]'));
const consent=Array.from(panel.querySelectorAll('input')).find(i=>i.type==='checkbox'&&i.parentElement.textContent.includes('I consent to SCORM progress tracking'));consent.click();
const intro=()=>Array.from(panel.querySelectorAll('button')).find(b=>b.textContent.includes('Introduction')&&!b.disabled);(await wait(intro)).click();
let resumed=false,retried=false;setInterval(async()=>{const state=await(await fetch('${prefix}/state')).json();if(state.action==='retry'&&!retried){retried=true;(await wait(()=>button('Retry engine checkpoint'))).click();}if(state.action==='resume'&&!resumed){resumed=true;(await wait(()=>button('Close SCO and choose another'))).click();(await wait(intro)).click();}},200);
}catch(error){await fetch('${prefix}/driver-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:error.name,message:error.message})});}})();`));
app.get(prefix + '/state', async () => ({edition, action, droppedACK, exactRetry, largestCheckpointBytes, responseBindingCheckpoints, responseWriteCheckpoints, binding, contentRequests, probes, calls, navigationAttempts, pearCanaryCalls, navigationViolations, driverErrors, checkpoints: (f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get() as any).n, proofs: (f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get() as any).n, certificates: (f.db.prepare('SELECT count(*) n FROM certificates').get() as any).n}));
app.post(prefix + '/command', async (req, reply) => {const next = (req.body as any)?.action; if (!['retry', 'resume', 'finish', 'navigate'].includes(next)) return reply.code(400).send(); action = next; return {ok: true};});
app.post(prefix + '/driver-error', async req => {driverErrors.push(String((req.body as any)?.message).slice(0, 200)); return {ok: true};});
await sink.listen({host: '127.0.0.1', port: 4316}); await content!.listen({host: '127.0.0.1', port: 4315}); await app.listen({host: '127.0.0.1', port: 4310});
console.log('PEAR_NATIVE_FIXTURE_READY');
let closing = false;
async function close() {
  if (closing) return; closing = true; console.log('PEAR_NATIVE_FIXTURE_CLOSE:received');
  sink.server.closeAllConnections(); content!.server.closeAllConnections(); app.server.closeAllConnections();
  console.log('PEAR_NATIVE_FIXTURE_CLOSE:connections-closed');
  await sink.close(); console.log('PEAR_NATIVE_FIXTURE_CLOSE:sink-closed');
  await app.close(); console.log('PEAR_NATIVE_FIXTURE_CLOSE:app-closed');
  f.db.close(); console.log('PEAR_NATIVE_FIXTURE_CLOSE:database-closed'); rmSync(dir, {recursive: true, force: true}); console.log('PEAR_NATIVE_FIXTURE_CLOSE:cleanup-complete'); process.exit(0);
}
process.on('SIGTERM', () => void close()); process.on('SIGINT', () => void close());

// Node IPC gives Windows the same graceful fixture cleanup as Unix signals.
process.on("message", message => {if ((message as any)?.kind === "close") void close();});
