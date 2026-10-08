import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(edition + ': built synchronous support methods preserve error state and address requested diagnostics', async ({page}) => {
  const old = edition === '1.2', localError = old ? '405' : '406';
  const script = `const api=${old ? "{SetValue:parent.API.LMSSetValue,GetValue:parent.API.LMSGetValue,GetLastError:parent.API.LMSGetLastError,GetDiagnostic:parent.API.LMSGetDiagnostic,GetErrorString:parent.API.LMSGetErrorString}" : 'parent.API_1484_11'};
    function verify(){
      if(api.SetValue('cmi.suspend_data','\\ud800')!=='false'||api.GetLastError()!=='${localError}')throw Error('local error');
      const current=api.GetDiagnostic('');
      if(!current||api.GetDiagnostic('${localError}')!==current||api.GetDiagnostic('201')===current)throw Error('requested diagnostic');
      ${old ? '' : "for(const code of ['unknown','999','65536','406suffix','__proto__','constructor','toString'])if(api.GetDiagnostic(code)!==''||api.GetErrorString(code)!==''||api.GetLastError()!=='406')throw Error('unknown lookup');"}
      if(api.GetValue('cmi.unknown')!==''||api.GetLastError()!=='401')throw Error('engine error');
      if(!api.GetDiagnostic('')||api.GetDiagnostic('401')!==api.GetDiagnostic('')||api.GetLastError()!=='401')throw Error('engine diagnostic');
      if(api.SetValue('${old ? 'cmi.core.lesson_location' : 'cmi.location'}','diagnostic-page')!=='true'||api.GetLastError()!=='0')throw Error('recovery');
      document.getElementById('entry').textContent='Support methods verified';
    }verify();`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4348', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4349', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4349, host: '127.0.0.1'}); await app.listen({port: 4348, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true});
    const sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Support methods verified', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Support methods verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
