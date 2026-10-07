import {test, expect} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {sequencingPackage} from '../scorm-sequencing-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

for (const enrolled of [false, true]) for (const winner of ['automatic', 'manual']) test(`${enrolled ? 'enrolled' : 'practice'}: ${winner} close owns the current launch during next-SCO delivery`, async ({page}) => {
  const f = await scormLearningFixture(undefined, sequencingPackage('2004-4')); if (enrolled) f.enroll();
  const origin = 'http://127.0.0.1:4344', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4345', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  let release!: () => void, reached!: () => void;
  const hold = new Promise<void>(r => {release = r;}), intercepted = new Promise<void>(r => {reached = r;});
  try {
    await content!.listen({port: 4345, host: '127.0.0.1'}); await app.listen({port: 4344, host: '127.0.0.1'}); await page.goto(origin);
    await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    if (enrolled) {
      await page.getByRole('button', {name: 'My learning', exact: true}).click();
      await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    } else await page.getByRole('button', {name: 'Imported packages', exact: true}).click();
    const player = enrolled ? page.getByLabel('Enrolled SCORM player', {exact: true}) : page.getByRole('region', {name: 'SCORM engine packages', exact: true});
    const sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    const close = player.getByRole('button', {name: enrolled ? 'Close SCO and choose another' : 'Close engine package', exact: true});
    await player.getByLabel(enrolled ? 'I consent to SCORM progress tracking for this enrollment.' : "I consent to this engine package's separate reported tracking.", {exact: true}).check();
    await player.getByRole('button', {name: enrolled ? /Introduction/ : 'Play or resume engine package'}).click();
    let captured = false;
    await page.route(winner === 'automatic' ? '**/api/scorm-engine/launches/*/close' : '**/launch/*/checkpoint', async route => {
      const capture = !captured && (winner === 'automatic' || route.request().postDataJSON().finished);
      if (!capture) {await route.continue(); return;}
      captured = true; const response = await route.fetch(); reached(); await hold; await route.fulfill({response});
    });
    await sco.getByRole('button', {name: 'Continue sequencing SCO', exact: true}).click(); await expect.poll(() => captured).toBe(true); await intercepted;
    if (winner === 'automatic') {await expect(close).toBeDisabled(); release();}
    else {
      await close.click(); await expect(close).toBeDisabled(); release();
      await expect(page.locator('iframe[title="Isolated SCORM engine player"]')).toHaveCount(0);
      expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n).toBe(1);
      await player.getByRole('button', {name: /Practice/}).click();
    }
    await expect(sco.getByRole('heading', {name: 'Original sequencing practice', exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'End sequencing session', exact: true}).click();
    await expect.poll(() => f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts WHERE finished=1').get()!.n).toBe(2);
    await expect(player.getByRole('status')).toContainText(enrolled ? 'completion accepted' : 'finished and saved by the server');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts WHERE finished=1').get()!.n).toBe(2);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(enrolled ? 1 : 0);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n).toBe(2);
  } finally {release(); await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
