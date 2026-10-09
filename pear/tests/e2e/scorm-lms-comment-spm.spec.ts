import {test, expect} from '@playwright/test';
import {learnerCommentScript,learnerCommentVerifyScript} from '../scorm-learner-comment-spm-vectors.ts';
import {seedLMSComments,lmsCommentVerifyScript,lmsCommentState} from '../scorm-lms-comment-spm-vectors.ts';
import {scorm2004CheckpointLimit} from '../../src/shared/scorm2004-runtime.ts';
import {interactionCollectionScript} from '../scorm-interaction-collection-vectors.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built100 LMS/250 full learner comments plus mandatory collection preserve mixed provenance through lost ACK, close/resume and Finish', async ({page}) => {
  const script = `const api=parent.API_1484_11,entry=document.getElementById('entry');
    const verify=()=>{${learnerCommentVerifyScript}${lmsCommentVerifyScript}if(api.GetValue('cmi.interactions._count')!=='250'||api.GetValue('cmi.objectives._count')!=='100')throw Error('Collection count mismatch');for(let i=0;i<250;i++){const base='cmi.interactions.'+i;if(api.GetValue(base+'.type')!=='choice'||api.GetValue(base+'.learner_response')!=='{lang=en}Original collection response')throw Error('Original response origin lost');for(let j=0;j<10;j++){if(api.GetValue(base+'.objectives.'+j+'.id')!=='urn:pear:collection-objective:'+i+':'+j||api.GetValue(base+'.correct_responses.'+j+'.pattern')!=='urn:pear:collection-choice:'+j)throw Error('Original nested member lost');}}for(let i=0;i<100;i++)if(api.GetValue('cmi.objectives.'+i+'.score.raw')!=='50')throw Error('Original objective score lost');};
    if(api.GetValue('cmi.entry')==='resume'){verify();entry.textContent='Collection resumed exactly';}
    else{entry.textContent='Collection ready';const button=document.createElement('button');button.textContent='Store mandatory collection';document.body.append(button);button.onclick=()=>{${interactionCollectionScript}${learnerCommentScript}verify();if(api.Commit('')!=='true')throw Error('Collection Commit refused');entry.textContent='Collection queued';button.remove();};}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:5620', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:5621', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  content!.addHook('onRequest',async req=>{const m=/^\/launch\/([^/]+)$/.exec(req.url);if(m)seedLMSComments(f,m[1]);});
  try {
    await content!.listen({port: 5621, host: '127.0.0.1'}); await app.listen({port: 5620, host: '127.0.0.1'});
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
      if (!dropped) {expect(Buffer.byteLength(payload)).toBeGreaterThan(6*1024*1024-100000);expect(Buffer.byteLength(payload)).toBeLessThan(scorm2004CheckpointLimit(JSON.parse(payload).state));expect(Object.keys(JSON.parse(payload).state.comments_from_lms)).toHaveLength(100);expect(Object.keys(JSON.parse(payload).state.comments_from_learner)).toHaveLength(250);expect(JSON.parse(payload).interactionWrites).toHaveLength(3500);expect(Object.keys(JSON.parse(payload).state.interactions)).toHaveLength(250);expect(Object.keys(JSON.parse(payload).state.objectives)).toHaveLength(100);original = payload; dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();}
      else {expect(payload===original,'exact large checkpoint retry').toBe(true); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store mandatory collection', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('has not been acknowledged');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    const retry=player.getByRole('button', {name: 'Retry engine checkpoint', exact: true});await retry.scrollIntoViewIfNeeded();await expect(retry).toBeInViewport();await retry.click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    expect(stored.comments_from_lms).toEqual(lmsCommentState());expect(Object.keys(stored.comments_from_learner)).toHaveLength(250);for(let i=0;i<250;i++)expect(stored.comments_from_learner[i]).toEqual({comment:'🙂'.repeat(4000),location:'page'+i,timestamp:'2020-02-29T12:00:00.00Z'});expect(Object.keys(stored.interactions)).toHaveLength(250);expect(Object.keys(stored.objectives)).toHaveLength(100);
    for(let i=0;i<250;i++){expect(stored.interactions[i].learner_response).toBe('{lang=en}Original collection response');expect(Object.keys(stored.interactions[i].objectives)).toHaveLength(10);expect(Object.keys(stored.interactions[i].correct_responses)).toHaveLength(10);}
    const result=JSON.parse(f.db.prepare('SELECT result FROM scorm_engine_checkpoints ORDER BY rowid DESC LIMIT 1').get()!.result as string);expect(Object.keys(result.responseBindings)).toHaveLength(250);for(const type of Object.values(result.responseBindings))expect(type).toBe('fill-in');
    const close=player.getByRole('button', {name: 'Close SCO and choose another', exact: true});await close.scrollIntoViewIfNeeded();await expect(close).toBeInViewport();await close.click();await expect(close).toHaveCount(0); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Collection resumed exactly', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
    const frame=page.locator('iframe[title="Isolated SCORM engine player"]');await frame.scrollIntoViewIfNeeded();await expect(frame).toBeInViewport();await sco.getByRole('button',{name:'Finish licensed content',exact:true}).click();await expect(player.getByRole('status')).toContainText('completion accepted');expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1);expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
