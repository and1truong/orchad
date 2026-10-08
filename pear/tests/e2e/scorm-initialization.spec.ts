import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
const lmsComment = {comment: 'Trusted original comment', location: 'Original LMS location', timestamp: '2000-02-29T12:30:59.25Z'};

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built preloaded read-only comments survive lost ACK and close/resume', async ({page}) => {
  const script = `const trusted=${JSON.stringify({'comment':'Trusted original comment','location':'Original LMS location','timestamp':'2000-02-29T12:30:59.25Z'})},api=parent.API_1484_11;
    for(const [field,value] of Object.entries(trusted)){const key='cmi.comments_from_lms.0.'+field;
      if(api.GetValue(key)!==value)throw Error('trusted comment preload');
      for(const bad of [value,'forged','','2026-02-29'])if(api.SetValue(key,bad)!=='false'||api.GetLastError()!=='404'||api.GetValue(key)!==value)throw Error('read-only comment '+field);
      if(api.SetValue('cmi.comments_from_lms.1.'+field,value)!=='false'||api.GetLastError()!=='404')throw Error('new LMS comment');
    }
    if(api.GetValue('cmi.comments_from_lms._count')!=='1')throw Error('LMS count changed');
    if(api.GetValue('cmi.entry')==='resume'&&api.GetValue('cmi.comments_from_learner.0.comment')!=='Original own comment')throw Error('own comment resume');
    if(api.SetValue('cmi.comments_from_learner.0.comment','Original own comment')!=='true')throw Error('own comment write');
    document.getElementById('entry').textContent='Read-only comments verified';`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); const binding = f.enroll(), initial = f.launch(binding), seed = f.player.bootstrap(initial.token).state; seed.comments_from_lms = {0: lmsComment}; f.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?').run(JSON.stringify(seed)); f.player.close(f.service.principal('learner-a'), initial.launchId, 'session-learner-a');
  const origin = 'http://127.0.0.1:4456', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4457', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4457, host: '127.0.0.1'}); await app.listen({port: 4456, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Read-only comments verified', {exact: true})).toBeVisible();
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
    expect(stored.comments_from_lms).toEqual({0: lmsComment}); expect(stored.comments_from_learner[0].comment).toBe('Original own comment');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Read-only comments verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
