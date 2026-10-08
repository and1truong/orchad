import {test, expect} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {multiSCOPlayerPackage} from '../scorm-player-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

for (const hidden of [false, true]) test((hidden ? 'hidden ' : '') + 'built enrolled multi-SCO player requires durable Finish before quiz and preserves separate resume state', async ({page}) => {
  const f = await scormLearningFixture(undefined, multiSCOPlayerPackage(hidden)), binding = f.enroll();
  const origin = 'http://127.0.0.1:4340', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4341', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4341, host: '127.0.0.1'}); await app.listen({port: 4340, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), runtime = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = runtime.frameLocator('iframe[title="SCORM SCO"]');
    await expect(page.getByRole('button', {name: 'I have studied this lesson', exact: true})).toBeDisabled();
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check();
    if (hidden) await expect(player.getByRole('navigation', {name: 'SCORM activities'}).getByRole('button')).toHaveCount(0); else await expect(player.getByRole('button', {name: /Practice.*locked/})).toBeDisabled();
    await player.getByRole('button', {name: hidden ? 'Play or resume enrolled SCORM package' : /Introduction/}).click(); await expect(sco.getByRole('heading', {name: 'Original introduction SCO'})).toBeVisible();
    await sco.getByRole('button', {name: 'Save SCO progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
    await player.getByRole('button', {name: hidden ? 'Play or resume enrolled SCORM package' : /Introduction/}).click(); await expect(sco.getByText('SCO entry: resume; bookmark: intro-page', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'Finish SCO', exact: true}).click(); await expect(player.getByRole('status')).toContainText('Other SCOs');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
    await player.getByRole('button', {name: hidden ? 'Play or resume enrolled SCORM package' : /Practice.*not attempted/}).click(); await expect(sco.getByRole('heading', {name: 'Original practice SCO'})).toBeVisible();
    await expect(sco.getByText('SCO entry: ab-initio; bookmark:', {exact: true})).toBeVisible();
    if (hidden) {
      await sco.getByRole('button', {name: 'Finish below minimum score', exact: true}).click(); await expect(player.getByRole('status')).toContainText('Other SCOs');
      expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
      await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
      await player.getByRole('button', {name: 'Play or resume enrolled SCORM package', exact: true}).click();
      await expect(sco.getByRole('heading', {name: 'Original practice SCO'})).toBeVisible();
    }
    await sco.getByRole('button', {name: 'Finish SCO', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1);
    expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
    await page.getByRole('button', {name: 'Start assessment', exact: true}).click();
    await page.getByRole('radio', {name: /Tự giải thích rồi đối chiếu/}).check();
    await page.getByRole('button', {name: 'Confirm and submit my answers', exact: true}).click();
    await expect.poll(() => f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(1);
    expect(JSON.parse(String(f.db.prepare('SELECT completed_lessons FROM enrollments WHERE id=?').get(binding.enrollmentId)!.completed_lessons))).toEqual(['practice']);
    await page.screenshot({path: 'artifacts/scorm-enrolled-multi-sco' + (hidden ? '-hidden' : '') + '.png', fullPage: true});
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
