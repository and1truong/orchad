import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(edition + ': built API refusals stay synchronous and retry after a throwing queue', async ({page}) => {
  const script = `{const old=${JSON.stringify(edition === '1.2')},api=old?parent.API:parent.API_1484_11,
    read=(k)=>old?api.LMSGetValue(k):api.GetValue(k),write=(k,v)=>old?api.LMSSetValue(k,v):api.SetValue(k,v),
    commit=()=>old?api.LMSCommit(''):api.Commit(''),end=()=>old?api.LMSFinish(''):api.Terminate(''),error=()=>old?api.LMSGetLastError():api.GetLastError(),
    key=old?'cmi.core.lesson_location':'cmi.location';
    const button=document.createElement('button');button.textContent='Verify API refusals';document.body.append(button);
    button.onclick=()=>{
      const before=read(key);
      if(read('')!==''||error()!==(old?'201':'301'))throw Error('empty get');
      if(write('','replacement')!=='false'||error()!==(old?'201':'351'))throw Error('empty set');
      if(read(key)!==before)throw Error('bookmark changed');
      const encoder=parent.TextEncoder;parent.TextEncoder=class {encode(){throw Error('queue encoding unavailable');}};
      try{
        if(commit()!=='false'||error()!==(old?'101':'391'))throw Error('commit exception binding');
        if(end()!=='false'||error()!==(old?'101':'111'))throw Error('finish exception binding');
      }finally{parent.TextEncoder=encoder;}
      if(read(key)!==before)throw Error('session not retryable');
      document.getElementById('entry').textContent='API refusal and queue recovery verified';
    };}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4956', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4957', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4957, host: '127.0.0.1'}); await app.listen({port: 4956, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    await sco.getByRole('button', {name: 'Verify API refusals', exact: true}).click();
    await expect(sco.getByText('API refusal and queue recovery verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts);
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
    expect(edition === '1.2' ? stored.core.lesson_location : stored.location).toBe('licensed-page');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Licensed entry: resume; bookmark: licensed-page', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
