import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
import {separatorVectors} from '../scorm-separator-vectors.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built synchronous API preserves bare punctuation through ACK/close/resume', async ({page}) => {
  const script = `const vectors=${JSON.stringify(separatorVectors)};const api=parent.API_1484_11;
    for(const [i,v] of vectors.entries()) {const base='cmi.interactions.'+i;
      if(api.GetValue('cmi.entry')==='resume'&&api.GetValue(base+'.learner_response')!==v.value)throw Error('durable resume');
      if(api.SetValue(base+'.id','urn:pear:separator:'+i)!=='true'||api.SetValue(base+'.type',v.type)!=='true')throw Error('dependency');
      if(api.SetValue(base+'.learner_response',v.value)!=='true')throw Error('valid response');
      if(api.SetValue(base+'.learner_response',v.invalid)!=='false'||api.GetLastError()!=='406'||api.GetValue(base+'.learner_response')!==v.value)throw Error('invalid response');
    }document.getElementById('entry').textContent='Response separators verified';`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4346', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4347', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4347, host: '127.0.0.1'}); await app.listen({port: 4346, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true});
    const sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Response separators verified', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    for (const [i, v] of separatorVectors.entries()) expect(stored.interactions[i].learner_response).toBe(v.value);
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Response separators verified', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
