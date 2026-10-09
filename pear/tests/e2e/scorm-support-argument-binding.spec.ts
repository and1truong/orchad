import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(edition + ': built support lookups preserve errors through lost ACK and resume', async ({page}) => {
  const script = `{const old=${JSON.stringify(edition === '1.2')},api=old?parent.API:parent.API_1484_11,prefix=old?'LMS':'',read=k=>api[prefix+'GetValue'](k),error=()=>api[prefix+'GetLastError']();
    if(read(old?'cmi.core.exit':'cmi.exit')!==''||error()!==(old?'404':'405'))throw Error('refused read');
    const original=error(),unknown=['unknown','999','65536','403suffix','403\\n','0403','__proto__','constructor','toString',null,undefined,NaN,-1,[],{},Symbol('code'),{toString(){throw Error('untrusted coercion');}}];
    for(const value of unknown)for(const method of ['GetErrorString','GetDiagnostic'])if(api[prefix+method](value)!==''||error()!==original)throw Error('unsupported lookup');
    for(const method of ['GetErrorString','GetDiagnostic'])if(!api[prefix+method]('403')||api[prefix+method](403)!==api[prefix+method]('403')||error()!==original)throw Error('published lookup');
    if(api[prefix+'GetDiagnostic']('')!==api[prefix+'GetDiagnostic'](original)||error()!==original)throw Error('last diagnostic');
    document.getElementById('entry').textContent='Support lookups preserved';}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4706', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4707', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4707, host: '127.0.0.1'}); await app.listen({port: 4706, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    await expect(sco.getByText('Support lookups preserved', {exact: true})).toBeVisible();
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
    await expect(sco.getByText('Support lookups preserved', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
