import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built rejected collection writes survive lost ACK and close/resume', async ({page}) => {
  const script = `const api=parent.API_1484_11,prior=api.GetValue('cmi.comments_from_learner._count');
    for(const [key,value,error] of [
      ['cmi.comments_from_learner.'+prior+'.timestamp','2026-02-29','406'],
      ['cmi.comments_from_learner.'+prior+'.unknown','x','401'],
      ['cmi.interactions.0.timestamp','2026','408'],
      ['cmi.interactions.0.id','bad%','406'],
      ['cmi.interactions.0.correct_responses.0.pattern','a','408'],
      ['cmi.objectives.0.score.scaled','2','407']
    ]){if(api.SetValue(key,value)!=='false'||api.GetLastError()!==error)throw Error('rejected write '+key);
      if(api.GetValue('cmi.comments_from_learner._count')!==prior||api.GetValue('cmi.interactions._count')!=='0'||api.GetValue('cmi.objectives._count')!=='0')throw Error('failed write changed count');
    }
    if(api.GetValue('cmi.entry')==='resume'&&api.GetValue('cmi.comments_from_learner.0.comment')!=='Original own comment')throw Error('own comment resume');
    if(api.SetValue('cmi.comments_from_learner.0.comment','Original own comment')!=='true')throw Error('own comment write');
    document.getElementById('entry').textContent='Collection atomicity verified';`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4556', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4557', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4557, host: '127.0.0.1'}); await app.listen({port: 4556, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Collection atomicity verified', {exact: true})).toBeVisible();
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
    await player.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    expect(stored.comments_from_lms).toEqual({}); expect(stored.interactions).toEqual({}); expect(stored.objectives).toEqual({}); expect(Object.keys(stored.comments_from_learner)).toEqual(['0']); expect(stored.comments_from_learner[0].comment).toBe('Original own comment');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Collection atomicity verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
