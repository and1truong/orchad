import {test, expect} from '@playwright/test';
import {fullResponseOriginsScript,fullResponseOriginsVerifyScript} from '../scorm-full-response-origins-vectors.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built2750 response origins and3500 typed writes preserve exact values through lost ACK, close/resume and Finish', async ({page}) => {
  const script = `const api=parent.API_1484_11,entry=document.getElementById('entry');
    const verify=()=>{${fullResponseOriginsVerifyScript}};
    if(api.GetValue('cmi.entry')==='resume'){verify();entry.textContent='Collection resumed exactly';}
    else{entry.textContent='Collection ready';const button=document.createElement('button');button.textContent='Store mandatory collection';document.body.append(button);button.onclick=()=>{${fullResponseOriginsScript}verify();if(api.Commit('')!=='true')throw Error('Collection Commit refused');entry.textContent='Collection queued';button.remove();};}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:5630', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:5631', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 5631, host: '127.0.0.1'}); await app.listen({port: 5630, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Collection ready', {exact: true})).toBeVisible();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    let dropped = false, original = '';
    await page.route('**/launch/*/checkpoint', async route => {
      const payload = route.request().postData()!;
      if (!dropped) {expect(Buffer.byteLength(payload)).toBeLessThan(2*1024*1024);expect(JSON.parse(payload).interactionWrites).toHaveLength(3500);expect(Object.keys(JSON.parse(payload).state.interactions)).toHaveLength(250);original = payload; dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();}
      else {expect(payload===original,'exact large checkpoint retry').toBe(true); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store mandatory collection', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('has not been acknowledged');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    const retry=player.getByRole('button', {name: 'Retry engine checkpoint', exact: true});await retry.scrollIntoViewIfNeeded();await expect(retry).toBeInViewport();await retry.click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    expect(Object.keys(stored.interactions)).toHaveLength(250);
    for(let i=0;i<250;i++){expect(stored.interactions[i].type).toBe('choice');expect(stored.interactions[i].learner_response).toBe('{lang=en}Original learner');expect(Object.keys(stored.interactions[i].correct_responses)).toHaveLength(10);for(let j=0;j<10;j++)expect(stored.interactions[i].correct_responses[j].pattern).toBe('{lang=en}Original pattern '+j);}
    const result=JSON.parse(f.db.prepare('SELECT result FROM scorm_engine_checkpoints ORDER BY rowid DESC LIMIT 1').get()!.result as string);expect(Object.keys(result.responseBindings)).toHaveLength(2750);for(const type of Object.values(result.responseBindings))expect(type).toBe('fill-in');
    const close=player.getByRole('button', {name: 'Close SCO and choose another', exact: true});await close.scrollIntoViewIfNeeded();await expect(close).toBeInViewport();await close.click();await expect(close).toHaveCount(0); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Collection resumed exactly', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
    const frame=page.locator('iframe[title="Isolated SCORM engine player"]');await frame.scrollIntoViewIfNeeded();await expect(frame).toBeInViewport();await sco.getByRole('button',{name:'Finish licensed content',exact:true}).click();await expect(player.getByRole('status')).toContainText('completion accepted');expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
