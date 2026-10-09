import {test, expect} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
test.setTimeout(60_000);
import type {SCORMStandard} from '../../src/shared/scorm-engine.ts';
const cases: {standard: SCORMStandard; wrapper: 'pipwerks' | 'adl'}[] = [{standard: '1.2', wrapper: 'pipwerks'}, ...(['2004-2', '2004-3', '2004-4'] as const).map(standard => ({standard, wrapper: 'pipwerks' as const})), {standard: '2004-3', wrapper: 'adl'}];
for (const {standard, wrapper} of cases) test(standard + ': offline licensed ' + wrapper + ' API discovery/save/resume/finish on the built player', async ({page}) => {
  const f = await scormLearningFixture(undefined, interopPackage(standard, wrapper)); f.enroll();
  const origin = 'http://127.0.0.1:4346', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4347', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4347, host: '127.0.0.1'}); await app.listen({port: 4346, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check();
    await player.getByRole('button', {name: /Introduction/}).click(); await expect(sco.getByText('Licensed wrapper Initialize: true', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    if (standard === '2004-4') {
      const downloaded = page.waitForEvent('download'); await player.getByRole('button', {name: 'Download SCORM support details', exact: true}).click();
      const file = await downloaded, packet = JSON.parse(readFileSync((await file.path())!, 'utf8'));
      expect(packet.format).toBe('pear-scorm-support-v1'); expect(packet.launch.sequence).toBeGreaterThanOrEqual(1); expect(packet.launch.sequence).toBe(f.db.prepare('SELECT sequence FROM scorm_engine_launches WHERE id=?').get(packet.launch.id)!.sequence); expect(packet.package.standard).toBe('2004-4');
      const serialized = JSON.stringify(packet); for (const value of ['licensed-state', 'licensed-page', 'suspend_data', 'learner-a', 'runtime_state']) expect(serialized).not.toContain(value);
    }
    const close = player.getByRole('button', {name: 'Close SCO and choose another', exact: true});
    await close.scrollIntoViewIfNeeded(); await expect(close).toBeInViewport(); await close.click(); await expect(close).toHaveCount(0);
    await player.getByRole('button', {name: /Introduction/}).click(); await expect(sco.getByText('Licensed entry: resume; bookmark: licensed-page', {exact: true})).toBeVisible();
    // A resumed nested frame may be below the viewport after the shell action.
    // Bring its container into view before Chromium's inner-frame rAF stability check.
    await page.locator('iframe[title="Isolated SCORM engine player"]').scrollIntoViewIfNeeded();
    await sco.getByRole('button', {name: 'Finish licensed content', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
