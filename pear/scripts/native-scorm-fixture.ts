// Isolated CI fixture. Not imported or mounted by any product entry point.
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import Fastify from 'fastify';
import {createApp} from '../src/server/app.ts';
import {scormLearningFixture} from '../tests/scorm-learning-fixture.ts';
import {interopPackage} from '../tests/scorm-interop-fixture.ts';
const edition = process.env.PEAR_NATIVE_SCORM_EDITION ?? '2004-4';
if (!['1.2', '2004-2', '2004-3', '2004-4'].includes(edition)) throw Error('Unsupported native SCORM edition');
const nonce = process.env.PEAR_NATIVE_NONCE;
if (!nonce || !/^[-a-zA-Z0-9]{20,64}$/.test(nonce)) throw Error('Explicit native fixture nonce required');
const dir = mkdtempSync(join(tmpdir(), 'pear-native-scorm-')), prefix = '/native-scorm/' + nonce, origin = 'http://127.0.0.1:4310';
let action = 'start', droppedACK = false, exactRetry = false, droppedPayload = '', droppedReceipt = '', droppedCount = 0, droppedRevision = 0; const probes: any[] = [], calls: string[] = [], driverErrors: string[] = [];
const script = `
(async()=>{
  const evidence={pearCookieDenied:false,pearStorageDenied:false,pearBridgeDenied:false,pearNativeDenied:false,noOwnBridge:!window.agentBridgeV1&&!parent.agentBridgeV1,nativeDenied:false,externalFetchDenied:false,userAgent:navigator.userAgent,entry:get('${edition === '1.2' ? 'cmi.core.entry' : 'cmi.entry'}'),bookmark:get('${edition === '1.2' ? 'cmi.core.lesson_location' : 'cmi.location'}')};
  const top=parent.parent;
  for(const [key,read] of Object.entries({pearCookieDenied:()=>top.document.cookie,pearStorageDenied:()=>top.localStorage.length,pearBridgeDenied:()=>top.agentBridgeV1,pearNativeDenied:()=>top.__TAURI_INTERNALS__}))try{read();}catch{evidence[key]=true;}
  try{const native=window.__TAURI_INTERNALS__||parent.__TAURI_INTERNALS__;if(native)await native.invoke('host_request',{request:{action:'heartbeat'}});else evidence.nativeDenied=true;}catch{evidence.nativeDenied=true;}
  try{await fetch('http://127.0.0.1:4316/external-fetch');}catch{evidence.externalFetchDenied=true;}
  const image=new Image();image.src='http://127.0.0.1:4316/external-image';document.body.append(image);
  document.getElementById('save').onclick();
  await fetch('${prefix}/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});
  const timer=setInterval(async()=>{const command=await(await fetch('${prefix}/command')).json();if(command.action==='finish'){clearInterval(timer);document.getElementById('finish').onclick();}},200);
})();`;
const f = await scormLearningFixture(join(dir, 'pear.sqlite'), interopPackage(edition as '1.2' | '2004-2' | '2004-3' | '2004-4', 'pipwerks', script)), binding = f.enroll();
const {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4315', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
// Lose one successful response after the real player transaction has committed.
content!.addHook('onSend', async (req, reply, payload) => {
  if (!req.url.endsWith('/checkpoint') || reply.statusCode !== 200) return payload;
  const serialized = JSON.stringify(req.body);
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
(async()=>{const wait=async(fn)=>{const until=Date.now()+60000;for(;;){const result=fn();if(result)return result;if(Date.now()>until)throw Error('Native driver timeout');await new Promise(r=>setTimeout(r,100));}};
const button=label=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label&&!b.disabled);
try{await wait(()=>button('Sign out'));(await wait(()=>button('My learning'))).click();(await wait(()=>button('Continue learning'))).click();
const panel=await wait(()=>document.querySelector('[aria-label="Enrolled SCORM player"]'));
const consent=Array.from(panel.querySelectorAll('input')).find(i=>i.type==='checkbox'&&i.parentElement.textContent.includes('I consent to SCORM progress tracking'));consent.click();
const intro=()=>Array.from(panel.querySelectorAll('button')).find(b=>b.textContent.includes('Introduction')&&!b.disabled);(await wait(intro)).click();
let resumed=false,retried=false;setInterval(async()=>{const state=await(await fetch('${prefix}/state')).json();if(state.action==='retry'&&!retried){retried=true;(await wait(()=>button('Retry engine checkpoint'))).click();}if(state.action==='resume'&&!resumed){resumed=true;(await wait(()=>button('Close SCO and choose another'))).click();(await wait(intro)).click();}},200);
}catch(error){await fetch('${prefix}/driver-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:error.name,message:error.message})});}})();`));
app.get(prefix + '/state', async () => ({edition, action, droppedACK, exactRetry, binding, probes, calls, driverErrors, checkpoints: (f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get() as any).n, proofs: (f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get() as any).n, certificates: (f.db.prepare('SELECT count(*) n FROM certificates').get() as any).n}));
app.post(prefix + '/command', async (req, reply) => {const next = (req.body as any)?.action; if (!['retry', 'resume', 'finish'].includes(next)) return reply.code(400).send(); action = next; return {ok: true};});
app.post(prefix + '/driver-error', async req => {driverErrors.push(String((req.body as any)?.message).slice(0, 200)); return {ok: true};});
await sink.listen({host: '127.0.0.1', port: 4316}); await content!.listen({host: '127.0.0.1', port: 4315}); await app.listen({host: '127.0.0.1', port: 4310});
console.log('PEAR_NATIVE_FIXTURE_READY');
let closing = false;
async function close() {if (closing) return; closing = true; sink.server.closeAllConnections(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await sink.close(); await app.close(); f.db.close(); rmSync(dir, {recursive: true, force: true}); process.exit(0);}
process.on('SIGTERM', () => void close()); process.on('SIGINT', () => void close());

// Node IPC gives Windows the same graceful fixture cleanup as Unix signals.
process.on("message", message => {if ((message as any)?.kind === "close") void close();});
