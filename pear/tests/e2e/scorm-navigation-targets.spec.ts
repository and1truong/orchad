import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {sequencingPackage} from '../scorm-sequencing-fixture.ts';
import {multiFileManifest} from '../scorm-package-fixture.ts';
import {inspectSCORMPackage} from '../../src/server/scorm-package-reader.ts';
import {zip} from '../scorm-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': authored target validity survives read-only refusal, lost ACK and real choice delivery', async ({page}) => {
  const target = 'Practice._hidden.initialized.jsonString.start_time.đ';
  const xml = multiFileManifest(edition).replace('identifier="practice"', 'identifier="' + target + '"').replace('<p:organization identifier="org">', '<p:organization identifier="org"><s:sequencing xmlns:s="http://www.imsglobal.org/xsd/imsss"><s:controlMode flow="true" choice="true"/></s:sequencing>');
  const pkg = await inspectSCORMPackage(sequencingPackage(edition, xml));
  const check = `if(location.pathname.endsWith('intro.html')){
    for(const kind of ${JSON.stringify(edition === '2004-4' ? ['choice', 'jump'] : ['choice'])}){
      const key='adl.nav.request_valid.'+kind+'.{target='+${JSON.stringify(target)}+'}';
      if(api.GetValue(key)!=='true'||api.GetLastError()!=='0')throw Error('authored target');
      if(api.SetValue(key,'false')!=='false'||api.GetLastError()!=='404')throw Error('read-only validity');
      if(api.GetValue(key)!=='true'||api.GetLastError()!=='0')throw Error('stale error');
      if(api.GetValue(key+'\\n')!=='false'||api.GetLastError()!=='301')throw Error('malformed delimiter');
      if(api.GetValue('adl.nav.request_valid.'+kind+'.{target=missing.activity}')!=='false'||api.GetLastError()!=='0')throw Error('unknown target');
    }
    document.getElementById('entry').textContent='Authored target validity verified';
  }`;
  const script = pkg.files.get('assets/player.js')!.toString().replace("document.getElementById('save').onclick=", check + "\ndocument.getElementById('save').onclick=").replace("finish('continue')", 'finish(' + JSON.stringify('{target=' + target + '}choice') + ')');
  const bytes = zip([...pkg.files].map(([name, data]) => ({name, data: name === 'assets/player.js' ? Buffer.from(script) : data, method: 8})));
  const f = await scormLearningFixture(undefined, bytes); f.enroll();
  const origin = 'http://127.0.0.1:4666', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4667', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4667, host: '127.0.0.1'}); await app.listen({port: 4666, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Authored target validity verified', {exact: true})).toBeVisible();
    let original = ''; await page.route('**/launch/*/checkpoint', async route => {
      if (!original) {original = route.request().postData()!; expect((await route.fetch()).ok()).toBe(true); await route.abort();}
      else {expect(route.request().postData()).toBe(original); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Save sequencing progress', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('not been acknowledged');
    const revision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    await player.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(revision); expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(1); await page.unroute('**/launch/*/checkpoint');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Authored target validity verified', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'Continue sequencing SCO', exact: true}).click(); await expect(sco.getByRole('heading', {name: 'Original sequencing practice', exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT sco_id FROM scorm_sco_attempts ORDER BY rowid DESC LIMIT 1').get()!.sco_id).toBe(target);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
