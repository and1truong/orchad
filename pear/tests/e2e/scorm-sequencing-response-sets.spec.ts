import {test, expect} from '@playwright/test';
import {sequencingResponsePatterns as patterns} from '../scorm-sequencing-response-vectors.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built ordered response arrays survive duplicate refusal, lost ACK and close/resume', async ({page}) => {
  const script = `const patterns=${JSON.stringify(patterns)},api=parent.API_1484_11,base='cmi.interactions.0',resume=api.GetValue('cmi.entry')==='resume';
    if(!resume){if(api.SetValue(base+'.id','urn:pear:ordered')!=='true'||api.SetValue(base+'.type','sequencing')!=='true')throw Error('dependency');for(const [n,p] of patterns.entries())if(api.SetValue(base+'.correct_responses.'+n+'.pattern',p)!=='true')throw Error('valid ordered pattern');}
    for(const [n,p] of [[1,patterns[0]],[patterns.length,patterns[0]],[patterns.length,'']])if(api.SetValue(base+'.correct_responses.'+n+'.pattern',p)!=='false'||api.GetLastError()!=='351')throw Error('duplicate refused');
    for(const [n,p] of patterns.entries())if(api.GetValue(base+'.correct_responses.'+n+'.pattern')!==p||api.GetLastError()!=='0')throw Error('exact ordered pattern');
    if(api.GetValue(base+'.correct_responses._count')!==String(patterns.length))throw Error('count rollback');
    document.getElementById('entry').textContent='Ordered response arrays verified';`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:5500', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:5501', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 5501, host: '127.0.0.1'}); await app.listen({port: 5500, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Ordered response arrays verified', {exact: true})).toBeVisible();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    let dropped = false, original = '';
    await page.route('**/launch/*/checkpoint', async route => {
      const payload = route.request().postData()!;
      if (!dropped) {original = payload; dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();}
      else {expect(payload).toBe(original); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('has not been acknowledged');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    const retry=player.getByRole('button', {name: 'Retry engine checkpoint', exact: true});await retry.scrollIntoViewIfNeeded();await expect(retry).toBeInViewport();await retry.click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    for(const [n,p] of patterns.entries())expect(stored.interactions[0].correct_responses[n].pattern).toBe(p);expect(Object.keys(stored.interactions[0].correct_responses)).toHaveLength(patterns.length);
    const close=player.getByRole('button', {name: 'Close SCO and choose another', exact: true});await close.scrollIntoViewIfNeeded();await expect(close).toBeInViewport();await close.click();await expect(close).toHaveCount(0); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Ordered response arrays verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
