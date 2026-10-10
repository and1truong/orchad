import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {sequencingPackage, sequencingManifest} from '../scorm-sequencing-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built SuspendAll overrides normal exit and resumes the trusted SCO', async ({page}) => {
  const script = `
    document.getElementById('end').onclick=()=>{
      for(const [key,value] of [['cmi.location','suspended-page'],['cmi.suspend_data','own-data'],['cmi.session_time','PT12S'],['cmi.completion_status','incomplete'],['cmi.exit','normal'],['adl.nav.request','suspendAll']])if(api.SetValue(key,value)!=='true')throw Error('SuspendAll write '+key);
      document.getElementById('result').textContent='SuspendAll: '+api.Terminate('');
    };`;
  const f = await scormLearningFixture(undefined, sequencingPackage(edition, sequencingManifest(edition), false, false, script)); f.enroll();
  const origin = 'http://127.0.0.1:4488', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4489', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4489, host: '127.0.0.1'}); await app.listen({port: 4488, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Sequencing entry: ab-initio; bookmark:', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'End sequencing session', exact: true}).click(); await expect(sco.getByText('SuspendAll: true', {exact: true})).toBeVisible(); await expect(player.getByRole('status')).toContainText('Other SCOs');
    const old = f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!, receipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    expect(old.finished).toBe(1); expect(old.reported_seconds).toBe(12);
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Sequencing entry: resume; bookmark: suspended-page', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n).toBe(1);
    const next = f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!;
    expect(next.runtime_state).toBe(old.runtime_state); expect(next.revision).toBe(old.revision); expect(next.reported_seconds).toBe(12);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(receipts); expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0); expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
