import {createSCORM2004API, scorm2004CheckpointBytes} from '../shared/scorm2004-runtime.ts';
import {createSCORM12API} from '../shared/scorm-runtime.ts';

// Only this bundle and the minimal synchronous API run on the content hostname.
// It deliberately does not import Pear's client, sessions, agent bridge or native host.
const config = JSON.parse(document.getElementById('scorm-bootstrap')!.textContent!);
const status = document.getElementById('scorm-status')!, retry = document.getElementById('scorm-retry') as HTMLButtonElement;
type Pending = {state: Record<string, any>; finished: boolean; navigation?: string; sharedData?: Record<string, string>; request?: {sequence: number; revision: number; state: Record<string, any>; finished: boolean; navigation?: string; sharedData?: Record<string, string>}};
const queue: Pending[] = [];
let revision = config.revision, sequence = config.sequence, saving = false, failed = false, active = false, closing = false;
function readyToClose() {if (closing && !queue.length && !saving && !failed) parent.postMessage({kind: 'pear-scorm-engine-ready-to-close', launchId: config.launchId, sequence}, config.pearOrigin);}
function notify(message: string, acknowledged = false, refused = false) {
  status.textContent = message; retry.hidden = !failed;
  parent.postMessage({kind: 'pear-scorm-engine-status', launchId: config.launchId, sequence, acknowledged, refused, message}, config.pearOrigin);
}
async function save() {
  if (saving || failed || !queue.length) return;
  saving = true; notify('Saving package progress…');
  const pending = queue[0]!;
  pending.request ??= {sequence: sequence + 1, revision, state: pending.state, finished: pending.finished, ...(pending.navigation !== undefined ? {navigation: pending.navigation} : {}), ...(pending.sharedData !== undefined ? {sharedData: pending.sharedData} : {})};
  try {
    const request = config.kind === 'asset' ? {sequence: pending.request.sequence, revision: pending.request.revision, navigation: pending.request.navigation} : pending.request;
    const response = await fetch(config.endpoint + (config.kind === 'asset' ? '/advance' : '/checkpoint'), {method: 'POST', credentials: 'omit', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(request), signal: AbortSignal.timeout(10_000)});
    if (!response.ok) throw Error('Checkpoint rejected');
    const value = await response.json();
    if (value.launchId !== config.launchId || value.sequence !== pending.request.sequence || value.revision !== revision + 1) throw Error('Unexpected checkpoint acknowledgement');
    revision = value.revision; sequence = value.sequence; queue.shift();
    notify(pending.finished ? 'Package finished and saved by the server.' : 'Package progress saved by the server.', true);
  } catch {failed = true; notify('Package progress has not been acknowledged. Retry the same checkpoint or reopen to reconcile.');}
  finally {saving = false; if (!failed && queue.length) void save(); else readyToClose();}
}
function checkpoint(state: Record<string, any>, finished: boolean, navigation?: string, sharedData?: Record<string, string>) {
  const snapshot = JSON.parse(JSON.stringify(state));
  if (new TextEncoder().encode(JSON.stringify(config.standard === '1.2' ? snapshot : {state: snapshot, sharedData})).byteLength > (config.standard === '1.2' ? 128 * 1024 : scorm2004CheckpointBytes) || queue.length >= 16) {failed = true; notify('Package checkpoint queue is full. Retry or reopen to reconcile.'); return false;}
  queue.push({state: snapshot, finished, navigation, ...(sharedData && Object.keys(sharedData).length ? {sharedData: {...sharedData}} : {})});
  if (finished) active = false;
  void save(); return true;
}
const options = {state: config.state, checkpoint};
let commit: () => string;
if (config.kind === 'asset') {
  commit = () => 'true';
  for (const [id, navigation] of [['scorm-asset-continue', 'continue'], ['scorm-asset-end', 'exitAll']]) {
    const button = document.getElementById(id) as HTMLButtonElement; button.hidden = !config.assetNavigation.includes(navigation);
    button.onclick = () => {if (closing || failed || saving || queue.length) return; for (const other of document.querySelectorAll<HTMLButtonElement>('#scorm-asset-continue,#scorm-asset-end')) other.disabled = true; queue.push({state: {}, finished: true, navigation}); void save();};
  }
} else if (config.standard === '1.2') {
  const api = createSCORM12API(options); commit = () => api.LMSCommit('');
  Object.defineProperty(window, 'API', {value: Object.freeze({...api, LMSInitialize(argument: string) {const result = api.LMSInitialize(argument); if (result === 'true') active = true; return result;}}), writable: false, configurable: false});
} else {
  const api = createSCORM2004API({...options, edition: config.standard, navigation: config.navigation, sequencingTree: config.sequencingTree, sequencingSnapshot: config.sequencingSnapshot}); commit = () => api.Commit('');
  Object.defineProperty(window, 'API_1484_11', {value: Object.freeze({...api, Initialize(argument: string) {const result = api.Initialize(argument); if (result === 'true') active = true; return result;}}), writable: false, configurable: false});
}
retry.onclick = () => {failed = false; void save();};
window.addEventListener('message', event => {
  if (event.origin !== config.pearOrigin || event.source !== parent || event.data?.launchId !== config.launchId) return;
  if (event.data.kind === 'pear-scorm-engine-retry') {failed = false; void save();}
  if (event.data.kind === 'pear-scorm-engine-flush') {
    closing = true;
    // A local refusal must not acknowledge an empty flush and discard live changes.
    if (active && commit() !== 'true') {closing = false; failed = true; notify('Package progress has not been acknowledged. Keep the activity open, save again and retry before closing.', false, true); return;}
    readyToClose();
  }
});
setInterval(() => {if (active && !closing && !saving && !failed && !queue.length) commit();}, 15_000);
window.addEventListener('beforeunload', event => {if (queue.length || saving || failed) {event.preventDefault(); event.returnValue = '';}});
const frame = document.getElementById('scorm-sco') as HTMLIFrameElement;
frame.src = config.href;
notify('Package loaded. Progress will be saved at checkpoints.');
