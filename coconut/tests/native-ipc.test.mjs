import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const key = 'synthetic-invoke-key-only', source = readFileSync(new URL('../src-tauri/src/native-ipc.js', import.meta.url), 'utf8').replace('__INVOKE_KEY__', JSON.stringify(key));
function install(subframe) {
  const messages = [], window = {__TAURI_INTERNALS__: {}, ipc: {postMessage(message) {messages.push(JSON.parse(message));}}};
  window.top = subframe ? {} : window;
  runInNewContext(source, {window});
  return {window, messages, post: window.__TAURI_INTERNALS__.postMessage};
}
test('actual native IPC initializer denies iframe commands synchronously without emitting a request/key', async () => {
  const {window, messages, post} = install(true);
  for (const cmd of ['host_request', 'guest_reply', 'plugin:event|listen']) {
    await assert.rejects(Promise.resolve().then(() => post({cmd, callback: 1, error: 2, payload: {request: {action: 'heartbeat'}}})), /forbidden in subframes/);
    assert.equal(messages.length, 0);
  }
  assert.equal(post.toString().includes(key), false);
  assert.throws(() => {window.__TAURI_INTERNALS__.postMessage = () => {};}, TypeError);
});
test('top-frame Coconut JSON requests preserve callbacks, payload and private native key with postMessage response mode', () => {
  const {messages, post} = install(false), payload = {id: 'reply', result: {ok: true, data: {label: 'Unicode 🐱', nested: [1, false, null]}}, documentNonce: 'nonce'};
  post({cmd: 'guest_reply', callback: 123, error: 456, payload, options: {customProtocolIpcBlocked: false}});
  assert.deepEqual(messages, [{cmd: 'guest_reply', callback: 123, error: 456, payload, options: {customProtocolIpcBlocked: true}, __TAURI_INVOKE_KEY__: key}]);
  assert.equal(post.toString().includes(key), false);
});
