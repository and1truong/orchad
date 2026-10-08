import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';

// Execute the actual mounted component's polling effect with controlled native
// replies. Hooks/DOM are inert; the request/poll/response code is not replaced.
function polling() {
  const effects = [], snapshots = [], requests = []; let state = 0, tick, cleared = false;
  const document = {visibilityState: 'visible', getElementById() {return {};}};
  const react = {createElement: (type, props, ...children) => ({type, props, children}), useRef: current => ({current}), useEffect: effect => effects.push(effect), useState: initial => {const index = state++; return [initial, value => {if (index === 1) snapshots.push(value);}];}};
  const modules = {'react': react, 'react-dom/client': {createRoot: () => ({render: element => element.type()})}, '@tauri-apps/api/core': {invoke: (_command, args) => new Promise(resolve => requests.push({args, resolve}))}, '@tauri-apps/api/event': {listen() {}}, '@orchard/agent-client': {}, '../trusted-origin.txt?raw': 'http://127.0.0.1:4310', './style.css': {}};
  const code = transformSync(readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8'), {loader: 'tsx', format: 'cjs'}).code;
  runInNewContext(code, {require: name => {assert.ok(Object.hasOwn(modules, name), name); return modules[name];}, document, setInterval: callback => {tick = callback; return 1;}, clearInterval: () => {cleared = true;}});
  const cleanup = effects[0]();
  return {tick: () => tick(), snapshots, requests, document, cleanup, cleared: () => cleared};
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('visible sidebar applies a completed heartbeat while a newer poll remains in flight', async () => {
  const ui = polling(); ui.tick(); ui.tick();
  assert.deepEqual(ui.requests.map(r => r.args.request.action), ['heartbeat', 'heartbeat']);
  ui.requests[0].resolve({targets: [{targetId: 'first'}]}); await flush();
  assert.deepEqual(ui.snapshots, [{targets: [{targetId: 'first'}]}]);
  ui.requests[1].resolve({targets: [{targetId: 'second'}]}); await flush();
  assert.equal(ui.snapshots.at(-1).targets[0].targetId, 'second');
});
test('older replies cannot overwrite a newer snapshot; hidden sidebar stops issuing leases', async () => {
  const ui = polling(); ui.tick(); ui.tick();
  ui.requests[1].resolve({targets: [{targetId: 'newer'}]}); await flush();
  ui.requests[0].resolve({targets: [{targetId: 'older'}]}); await flush();
  assert.deepEqual(ui.snapshots, [{targets: [{targetId: 'newer'}]}]);
  ui.document.visibilityState = 'hidden'; ui.tick(); assert.equal(ui.requests.length, 2);
  ui.cleanup(); assert.equal(ui.cleared(), true);
});
