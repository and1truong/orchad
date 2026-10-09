import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built preference language survive lost ACK and close/resume', async ({page}) => {
  const capacity = 'x' + '-abcdefgh'.repeat(27) + '-abcde';
  const script = `{const api=parent.API_1484_11,key='cmi.learner_preference.language',capacity=${JSON.stringify(capacity)},get=()=>api.GetValue(key),set=v=>api.SetValue(key,v),error=()=>api.GetLastError();
    for(const value of ['vi-VN-x-demo','en-Latn-US','i-klingon','VI-vn-X-DEMO',capacity]){
      if(set(value)!=='true'||get()!==value||error()!=='0')throw Error('valid language '+value);
    }
    for(const bad of ['en--US','en-','1en-US','en-abcdefghi','en_US',capacity+'a']){
      if(set(bad)!=='false'||error()!=='406'||get()!==capacity||error()!=='0')throw Error('malformed language '+bad);
    }
    if(set('')!=='true'||get()!==''||error()!=='0'||set(capacity)!=='true')throw Error('clear language');
    document.getElementById('entry').textContent='Preference language preserved';}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4696', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4697', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4697, host: '127.0.0.1'}); await app.listen({port: 4696, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Preference language preserved', {exact: true})).toBeVisible();
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
    expect(stored.learner_preference.language).toBe(capacity); expect(stored.completion_status).toBe('incomplete');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Preference language preserved', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
