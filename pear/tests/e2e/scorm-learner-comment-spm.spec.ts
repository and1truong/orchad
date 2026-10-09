import {test, expect} from '@playwright/test';
import {learnerCommentScript,learnerCommentVerifyScript} from '../scorm-learner-comment-spm-vectors.ts';
import {scorm2004CheckpointBytes,scorm2004CheckpointLimit} from '../../src/shared/scorm2004-runtime.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built250 full Unicode learner comments remain exact through lost ACK, close/resume and Finish', async ({page}) => {
  const script = `const api=parent.API_1484_11,entry=document.getElementById('entry');
    const verify=()=>{${learnerCommentVerifyScript}};
    if(api.GetValue('cmi.entry')==='resume'){verify();entry.textContent='Comments resumed exactly';}
    else{entry.textContent='Comments ready';const button=document.createElement('button');button.textContent='Store mandatory comments';document.body.append(button);button.onclick=()=>{${learnerCommentScript}verify();if(api.Commit('')!=='true')throw Error('Comment Commit refused');entry.textContent='Comments queued';button.remove();};}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:5630', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:5631', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 5631, host: '127.0.0.1'}); await app.listen({port: 5630, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Comments ready', {exact: true})).toBeVisible();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    let dropped = false, original = '';
    await page.route('**/launch/*/checkpoint', async route => {
      const payload = route.request().postData()!;
      if (!dropped) {const state=JSON.parse(payload).state;expect(Buffer.byteLength(payload)).toBeGreaterThan(scorm2004CheckpointBytes);expect(Buffer.byteLength(payload)).toBeLessThan(scorm2004CheckpointLimit(state));expect(Object.keys(state.comments_from_learner)).toHaveLength(250);original = payload; dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();}
      else {expect(payload===original,'exact large checkpoint retry').toBe(true); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store mandatory comments', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('has not been acknowledged');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    const retry=player.getByRole('button', {name: 'Retry engine checkpoint', exact: true});await retry.scrollIntoViewIfNeeded();await expect(retry).toBeInViewport();await retry.click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    expect(Object.keys(stored.comments_from_learner)).toHaveLength(250);
    for(let i=0;i<250;i++)expect(stored.comments_from_learner[i]).toEqual({comment:'🙂'.repeat(4000),location:'page'+i,timestamp:'2020-02-29T12:00:00.00Z'});
    const close=player.getByRole('button', {name: 'Close SCO and choose another', exact: true});await close.scrollIntoViewIfNeeded();await expect(close).toBeInViewport();await close.click();await expect(close).toHaveCount(0); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Comments resumed exactly', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
    const frame=page.locator('iframe[title="Isolated SCORM engine player"]');await frame.scrollIntoViewIfNeeded();await expect(frame).toBeInViewport();await sco.getByRole('button',{name:'Finish licensed content',exact:true}).click();await expect(player.getByRole('status')).toContainText('completion accepted');expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
