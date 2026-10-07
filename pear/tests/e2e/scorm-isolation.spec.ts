import {test, expect} from '@playwright/test';
import Fastify from 'fastify';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {scorm2004Package} from '../scorm2004-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
test('built untrusted SCO cannot cross Pear/bridge authority or the documented browser network/navigation policy', async ({page}) => {
  const f = await scormLearningFixture(undefined, scorm2004Package('2004-4')); f.enroll();
  const origin = 'http://127.0.0.1:4346', sinkOrigin = 'http://127.0.0.1:4348', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4347', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  const sink = Fastify({logger: false}), calls: string[] = []; sink.addHook('onRequest', async req => {calls.push(req.url);}); sink.all('/*', async () => 'public synthetic fixture sink');
  try {
    await sink.listen({port: 4348, host: '127.0.0.1'}); await content!.listen({port: 4347, host: '127.0.0.1'}); await app.listen({port: 4346, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click(); await page.getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), wrapper = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = wrapper.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('2004 API and Pear isolation verified')).toBeVisible();
    const result = await sco.locator('body').evaluate(async (_body, config) => {
      const target = window.parent.parent, evidence: Record<string, any> = {}, violations: string[] = [];
      document.addEventListener('securitypolicyviolation', event => violations.push(event.effectiveDirective));
      for (const [name, fn] of Object.entries({cookies: () => target.document.cookie, storage: () => target.localStorage.length, bridge: () => (target as any).agentBridgeV1.getContext(), native: () => (target as any).__TAURI_INTERNALS__.invoke('host_request', {})})) {try {fn(); evidence[name] = false;} catch {evidence[name] = true;}}
      evidence.noOwnBridge = !(window as any).agentBridgeV1 && !(parent as any).agentBridgeV1 && !(window as any).__TAURI_INTERNALS__;
      for (const [name, fn] of Object.entries({fetch: () => fetch(config.sink + '/fetch'), xhr: () => {const x = new XMLHttpRequest(); x.open('GET', config.sink + '/xhr'); x.send();}, websocket: () => new WebSocket(config.sink.replace('http:', 'ws:') + '/ws'), worker: () => new Promise((resolve, reject) => {const worker = new Worker('../assets/player.js'); worker.onerror = () => {worker.terminate(); reject(new Error('Worker blocked'));}; worker.onmessage = () => {worker.terminate(); resolve('executed');}; setTimeout(() => {worker.terminate(); resolve('no denial evidence');}, 1000);})})) {try {await fn(); evidence[name] = 'attempted';} catch {evidence[name] = 'denied';}}
      try {evidence.beacon = navigator.sendBeacon(config.sink + '/beacon', 'public-fixture');} catch {evidence.beacon = false;}
      const image = new Image(); image.src = config.sink + '/image'; document.body.append(image);
      const style = document.createElement('style'); style.textContent = 'body{background-image:url(' + config.sink + '/css)}'; document.head.append(style);
      const frame = document.createElement('iframe'); frame.src = config.sink + '/frame'; document.body.append(frame);
      const form = document.createElement('form'); form.action = config.sink + '/form'; form.method = 'POST'; document.body.append(form); try {form.submit();} catch {}
      evidence.popup = window.open(config.sink + '/popup') === null;
      try {top!.location.href = config.sink + '/top'; evidence.top = false;} catch {evidence.top = true;}
      try {await navigator.serviceWorker.register('../assets/player.js'); evidence.serviceWorker = false;} catch {evidence.serviceWorker = true;}
      target.postMessage({kind: 'pear-scorm-engine-status', launchId: 'forged', sequence: 999, acknowledged: true, officialLearningChanged: true, nextScoId: 'practice'}, config.pear);
      const bootstrap = JSON.parse(parent.document.getElementById('scorm-bootstrap')!.textContent!);
      target.postMessage({kind: 'pear-scorm-engine-status', launchId: bootstrap.launchId, sequence: 999, acknowledged: true, officialLearningChanged: true}, config.pear);
      const response = await fetch(bootstrap.endpoint + '/checkpoint', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({sequence: 1, revision: 0, state: {}, finished: true, enrollmentId: 'forged'})});
      evidence.forgedEnvelope = response.status;
      await new Promise(resolve => setTimeout(resolve, 300)); evidence.workerCSP = violations.includes('worker-src'); return evidence;
    }, {sink: sinkOrigin, pear: origin});
    for (const name of ['cookies', 'storage', 'bridge', 'native', 'noOwnBridge', 'popup', 'top', 'serviceWorker']) expect(result[name], name).toBe(true);
    expect(result.fetch).toBe('denied'); expect(result.worker).toBe('denied'); expect(result.workerCSP).toBe(true); expect(result.forgedEnvelope).toBe(400);
    expect(calls).toEqual([]); expect(page.url()).toBe(origin + '/'); expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(0); expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    // Same-origin content can mutate the wrapper DOM, so test the runtime's own navigation too.
    await page.evaluate(() => {(window as any).__scormBlocked = []; document.addEventListener('securitypolicyviolation', event => (window as any).__scormBlocked.push(event.effectiveDirective));});
    await wrapper.locator('body').evaluate((_body, sink) => {location.href = sink + '/runtime-navigation';}, sinkOrigin);
    await page.waitForFunction(() => (window as any).__scormBlocked.includes('frame-src'));
    expect(calls).toEqual([]); expect(page.url()).toBe(origin + '/');
  } finally {await page.close(); sink.server.closeAllConnections(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await sink.close(); await app.close(); f.db.close();}
});
