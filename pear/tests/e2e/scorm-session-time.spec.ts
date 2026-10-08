import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormTime} from '../../src/server/scorm-runtime-validation.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(edition + ': built learner corrects the current session time while earlier total stays fixed', async ({page}) => {
  const old = edition === '1.2', timeKey = old ? 'cmi.core.session_time' : 'cmi.session_time', totalKey = old ? 'cmi.core.total_time' : 'cmi.total_time';
  const values = [11.11, 30.03, 10.01, 0], format = (n: number) => old ? scormTime(n) : 'PT' + n + 'S';
  const invalid = old ? ['1:00:01', '12345:00:01', '00:00:01.123'] : ['P', 'PT', 'P1W', 'P1.5Y', 'P1H', 'P1DT', 'PT1.001S'];
  const latency = old ? '00:00:03.04' : 'PT3.04S';
  const script = `document.getElementById('entry').textContent='Initial total: '+get('${totalKey}');
    const validation=document.createElement('button');validation.textContent='Check timeinterval binding';validation.onclick=()=>{
      if(!set('cmi.interactions.0.id','urn:pear:duration')||!set('cmi.interactions.0.latency',${JSON.stringify(latency)}))throw Error('valid latency');
      for(const value of ${JSON.stringify(invalid)})for(const key of ['${timeKey}','cmi.interactions.0.latency']){
        if(set(key,value)||parent.${old ? 'API' : 'API_1484_11'}.${old ? 'LMSGetLastError' : 'GetLastError'}()!=='${old ? '405' : '406'}')throw Error('invalid timeinterval accepted');
      }document.getElementById('result').textContent='Timeinterval binding verified';};document.body.append(validation);
    for(const [n,time] of ${JSON.stringify(values.map(n => [n, format(n)]))}) {const button=document.createElement('button');button.textContent='Report '+n;
      button.onclick=()=>{if(!set('${old ? 'cmi.core.exit' : 'cmi.exit'}','suspend')||!set('${timeKey}',time)||!save())throw Error('time report');document.getElementById('result').textContent='Reported time: '+n;};document.body.append(button);}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4346', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4347', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4347, host: '127.0.0.1'}); await app.listen({port: 4346, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click(); await page.getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true});
    const sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    async function reportTime(n: number) {
      // Keep the containing frame visible across asynchronous ledger refreshes.
      await page.locator('iframe[title="Isolated SCORM engine player"]').scrollIntoViewIfNeeded();
      await sco.getByRole('button', {name: 'Report ' + n, exact: true}).click();
      await expect(sco.getByText('Reported time: ' + n, {exact: true})).toBeVisible();
    }
    await sco.getByRole('button', {name: 'Check timeinterval binding', exact: true}).click();
    await expect(sco.getByText('Timeinterval binding verified', {exact: true})).toBeVisible();
    await reportTime(11.11);
    await expect.poll(() => f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts').get()!.reported_seconds).toBe(11.11);
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Initial total: ' + format(11.11), {exact: true})).toBeVisible();
    for (const n of [30.03, 10.01, 0]) {
      await reportTime(n);
      await expect.poll(() => f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts').get()!.reported_seconds).toBe((1111 + Math.round(n * 100)) / 100);
      await expect(player.getByRole('status')).toContainText('saved by the server');
      expect(JSON.parse(String(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state)).interactions[0].latency).toBe(latency);
      const runtimeTotal = await sco.locator('body').evaluate((_body, key) => (parent as any)[key.startsWith('cmi.core') ? 'API' : 'API_1484_11'][key.startsWith('cmi.core') ? 'LMSGetValue' : 'GetValue'](key), totalKey);
      expect(runtimeTotal).toBe(format(11.11));
    }
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Initial total: ' + format(11.11), {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
