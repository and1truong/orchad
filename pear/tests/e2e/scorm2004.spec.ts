import {test, expect} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {scorm2004Package} from '../scorm2004-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built enrolled player exposes only 2004 API and durable resume/Terminate', async ({page}) => {
  const f = await scormLearningFixture(undefined, scorm2004Package(edition)); f.enroll();
  const origin = 'http://127.0.0.1:4342', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4343', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4343, host: '127.0.0.1'}); await app.listen({port: 4342, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), runtime = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = runtime.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check();
    await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('2004 API and Pear isolation verified')).toBeVisible();
    await sco.getByRole('button', {name: 'Save 2004 progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
    await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('2004 entry: resume; bookmark: original-2004-page; total: PT20S', {exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'Terminate 2004 SCO', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1);
    expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
