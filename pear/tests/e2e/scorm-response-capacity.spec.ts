import {test, expect} from '@playwright/test';
import {responseCapacityVector} from '../scorm-response-capacity-vectors.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) for(const type of ['choice','performance'] as const) test(edition + ': built '+type+' capacity survives large HTTP checkpoint, lost ACK and close/resume', async ({page}) => {
  const vector=responseCapacityVector(type);
  const script = `const v=${JSON.stringify(vector)},api=parent.API_1484_11,base='cmi.interactions.0',resume=api.GetValue('cmi.entry')==='resume';
    if(!resume){if(api.SetValue(base+'.id','urn:pear:capacity')!=='true'||api.SetValue(base+'.type',v.type)!=='true')throw Error('dependency');for(const [n,p] of v.patterns.entries())if(api.SetValue(base+'.correct_responses.'+n+'.pattern',p)!=='true')throw Error('valid capacity pattern');if(api.SetValue(base+'.learner_response',v.learner)!=='true')throw Error('learner capacity');if('${edition}'!=='2004-2'&&api.SetValue('cmi.suspend_data',v.suspend)!=='true')throw Error('suspend capacity');}
    for(const [n,p] of v.patterns.entries())if(api.GetValue(base+'.correct_responses.'+n+'.pattern')!==p||api.GetLastError()!=='0')throw Error('exact capacity pattern');
    if(api.GetValue(base+'.learner_response')!==v.learner||api.GetValue(base+'.correct_responses._count')!==String(v.patterns.length))throw Error('exact capacity response');
    document.getElementById('entry').textContent='Response capacity verified';`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:5520', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:5521', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 5521, host: '127.0.0.1'}); await app.listen({port: 5520, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Response capacity verified', {exact: true})).toBeVisible();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    let dropped = false, original = '';
    await page.route('**/launch/*/checkpoint', async route => {
      const payload = route.request().postData()!;
      if (!dropped) {expect(Buffer.byteLength(payload)).toBeGreaterThan(544*1024);original = payload; dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();}
      else {expect(payload===original,'exact large checkpoint retry').toBe(true); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('has not been acknowledged');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    const retry=player.getByRole('button', {name: 'Retry engine checkpoint', exact: true});await retry.scrollIntoViewIfNeeded();await expect(retry).toBeInViewport();await retry.click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    for(const [n,p] of vector.patterns.entries())expect(stored.interactions[0].correct_responses[n].pattern===p,'exact pattern'+n).toBe(true);expect(Object.keys(stored.interactions[0].correct_responses)).toHaveLength(vector.patterns.length);expect(stored.interactions[0].learner_response===vector.learner).toBe(true);
    const close=player.getByRole('button', {name: 'Close SCO and choose another', exact: true});await close.scrollIntoViewIfNeeded();await expect(close).toBeInViewport();await close.click();await expect(close).toHaveCount(0); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Response capacity verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
