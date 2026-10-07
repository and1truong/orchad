import {test, expect} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {sequencingPackage, sequencingManifest, collectionManifest, retryManifest} from '../scorm-sequencing-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) for (const action of ['retry', 'retryAll'] as const) test(edition + ' ' + action + ': authenticated shell automatically replaces a finished same-SCO launch with a fresh technical attempt', async ({page}) => {
  const f = await scormLearningFixture(undefined, sequencingPackage(edition, retryManifest(edition, action))); f.enroll();
  const origin = 'http://127.0.0.1:4344', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4345', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4345, host: '127.0.0.1'}); await app.listen({port: 4344, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await sco.getByRole('button', {name: 'Fail sequencing attempt', exact: true}).click();
    await expect.poll(() => f.db.prepare("SELECT count(*) n FROM scorm_sco_attempts WHERE sco_id='intro'").get()!.n).toBe(2);
    await expect(sco.getByText('Sequencing entry: ab-initio; bookmark:', {exact: true})).toBeVisible();
    expect(f.db.prepare("SELECT count(*) n FROM scorm_engine_launches WHERE closed=1 AND finished=1").get()!.n).toBe(1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_attempts').get()!.n).toBe(1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    await sco.getByRole('button', {name: 'Continue sequencing SCO', exact: true}).click(); await expect(sco.getByRole('heading', {name: 'Original sequencing practice', exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'End sequencing session', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    expect(f.db.prepare("SELECT reported_seconds FROM scorm_sco_attempts WHERE sco_id='intro' AND sco_attempt_number=1").get()!.reported_seconds).toBe(20);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) for (const profile of ['choice', 'flow-only', 'collections', 'hidden'] as const) test(edition + ' ' + profile + ': built sequencing player recovers lost ACK and delivers next SCO only through authenticated server navigation', async ({page}) => {
  const f = await scormLearningFixture(undefined, sequencingPackage(edition, profile === 'hidden' ? sequencingManifest(edition).replace('identifier="intro"', 'identifier="intro" isvisible="false"').replace('identifier="practice"', 'identifier="practice" isvisible="0"') : profile === 'collections' ? collectionManifest(edition) : profile === 'choice' ? sequencingManifest(edition) : sequencingManifest(edition).replace('choice="true"', 'choice="false"'))); f.enroll();
  const origin = 'http://127.0.0.1:4344', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4345', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4345, host: '127.0.0.1'}); await app.listen({port: 4344, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), runtime = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = runtime.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check();
    if (profile === 'hidden') await expect(player.getByRole('navigation', {name: 'SCORM activities'}).getByRole('button')).toHaveCount(0); else await expect(player.getByRole('button', {name: /Practice.*locked/})).toBeDisabled();
    await player.getByRole('button', {name: profile === 'hidden' ? 'Play or resume enrolled SCORM package' : /Introduction/}).click();
    await sco.getByRole('button', {name: 'Save sequencing progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
    await player.getByRole('button', {name: profile === 'hidden' ? 'Play or resume enrolled SCORM package' : /Introduction/}).click();
    await expect(sco.getByText('Sequencing entry: resume; bookmark: sequencing-page', {exact: true})).toBeVisible();
    let dropped = false;
    await page.route('**/launch/*/checkpoint', async route => {if (!dropped && route.request().postDataJSON().finished) {dropped = true; await route.fetch(); await route.abort();} else await route.continue();});
    await sco.getByRole('button', {name: 'Continue sequencing SCO', exact: true}).click();
    await expect(runtime.getByRole('status')).toContainText('not been acknowledged');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    await player.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click();
    await expect(sco.getByRole('heading', {name: 'Original sequencing practice', exact: true})).toBeVisible();
    await expect(sco.getByText('Sequencing entry: ab-initio; bookmark:', {exact: true})).toBeVisible();
    expect(f.db.prepare("SELECT reported_seconds FROM scorm_sco_attempts WHERE sco_id='intro'").get()!.reported_seconds).toBe(40);
    await sco.getByRole('button', {name: 'End sequencing session', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)); expect(proof.rollup.completion).toBe('completed'); expect(proof.rollup.success).toBe('passed');
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});

test('unbound practice follows authenticated next-SCO delivery without granting official learning', async ({page}) => {
  const f = await scormLearningFixture(undefined, sequencingPackage('2004-4'));
  const origin = 'http://127.0.0.1:4344', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4345', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4345, host: '127.0.0.1'}); await app.listen({port: 4344, host: '127.0.0.1'}); await page.goto(origin);
    await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'Imported packages', exact: true}).click();
    const player = page.getByRole('region', {name: 'SCORM engine packages', exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel("I consent to this engine package's separate reported tracking.", {exact: true}).check(); await player.getByRole('button', {name: 'Play or resume engine package', exact: true}).click();
    await sco.getByRole('button', {name: 'Continue sequencing SCO', exact: true}).click(); await expect(sco.getByRole('heading', {name: 'Original sequencing practice', exact: true})).toBeVisible();
    await sco.getByRole('button', {name: 'End sequencing session', exact: true}).click(); await expect(player.getByRole('status')).toContainText('finished and saved by the server');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0); expect(f.db.prepare('SELECT count(*) n FROM enrollments').get()!.n).toBe(0);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts WHERE finished=1').get()!.n).toBe(2);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
