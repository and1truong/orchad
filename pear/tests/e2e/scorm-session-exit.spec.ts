import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built normal termination relaunches with fresh CMI while preserving finished history', async ({page}) => {
  const script = `const api=parent.API_1484_11;
    for(const field of ['location','suspend_data'])if(api.GetValue('cmi.'+field)!==''||api.GetLastError()!=='403')throw Error('non-suspended content returned '+field);
    if(api.GetValue('cmi.entry')!=='ab-initio'||api.GetValue('cmi.total_time')!=='PT0S')throw Error('fresh attempt defaults');
    document.getElementById('entry').textContent='Fresh content fields verified';
    document.getElementById('finish').onclick=()=>{
      for(const [key,value] of [['cmi.location','original-bookmark'],['cmi.suspend_data','original-data'],['cmi.session_time','PT12S'],['cmi.completion_status','incomplete'],['cmi.exit','normal']])if(api.SetValue(key,value)!=='true')throw Error('normal exit write '+key);
      document.getElementById('result').textContent='Normal exit: '+api.Terminate('');
    };`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4486', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4487', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4487, host: '127.0.0.1'}); await app.listen({port: 4486, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Fresh content fields verified', {exact: true})).toBeVisible(); await expect(player.getByRole('status')).toContainText('saved by the server');
    await sco.getByRole('button', {name: 'Finish licensed content', exact: true}).click(); await expect(sco.getByText('Normal exit: true', {exact: true})).toBeVisible(); await expect(player.getByRole('status')).toContainText('Other SCOs');
    const old = f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!, receipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    expect(old.finished).toBe(1); expect(old.reported_seconds).toBe(12);
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Fresh content fields verified', {exact: true})).toBeVisible(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n).toBe(2); expect(f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE sco_attempt_number=1').get()).toEqual(old);
    const next = f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE sco_attempt_number=2').get()!, state = JSON.parse(next.runtime_state as string);
    expect(next.reported_seconds).toBe(0); expect(next.finished).toBe(0); for (const field of ['location', 'suspend_data']) expect(Object.hasOwn(state, field)).toBe(false);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(receipts + 1); expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0); expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
