import {test, expect} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {sequencingPackage, sequencingManifest, collectionManifest, retryManifest, weightedManifest, adlManifest, calendarManifest, sharedDataManifest, systemSharedDataManifest, selectionManifest, xmlBooleanManifest, xmlNumericManifest, xmlTokenManifest, xmlObjectiveIdsManifest, xmlCollectionIdsManifest, xmlTimeManifest, xmlSharedTargetManifest} from '../scorm-sequencing-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) for (const action of ['retry', 'retryAll'] as const) test(edition + ' ' + action + ': authenticated shell automatically replaces a finished same-SCO launch with a fresh technical attempt', async ({page}) => {
  const f = await scormLearningFixture(undefined, sequencingPackage(edition, xmlTokenManifest(retryManifest(edition, action)))); f.enroll();
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
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) for (const profile of (edition === '2004-4' ? ['choice', 'flow-only', 'collections', 'hidden', 'weighted', 'adl', 'calendar', 'duration', 'unicode', 'interaction-records', 'shared', 'system-shared', 'system-objectives'] : ['choice', 'flow-only', 'collections', 'hidden', 'adl', 'calendar', 'duration', 'unicode', 'interaction-records', 'system-objectives'])) test(edition + ' ' + profile + ': built sequencing player recovers lost ACK and delivers next SCO only through authenticated server navigation', async ({page}) => {
  const f = await scormLearningFixture(undefined, sequencingPackage(edition, profile === 'system-objectives' ? xmlObjectiveIdsManifest(sequencingManifest(edition).replace('a:objectivesGlobalToSystem="false"', '')) : profile === 'system-shared' ? xmlSharedTargetManifest(systemSharedDataManifest()) : profile === 'shared' ? xmlSharedTargetManifest(sharedDataManifest()) : profile === 'calendar' ? xmlTimeManifest(calendarManifest(edition)) : profile === 'duration' ? xmlTimeManifest(sequencingManifest(edition).replaceAll('<p:title>Introduction</p:title><s:sequencing>', '<p:title>Introduction</p:title><s:sequencing><s:limitConditions attemptAbsoluteDurationLimit="PT60S" attemptExperiencedDurationLimit="PT60S" activityAbsoluteDurationLimit="PT60S" activityExperiencedDurationLimit="PT60S"/>')) : profile === 'adl' ? xmlTokenManifest(adlManifest(edition)) : profile === 'weighted' ? xmlTokenManifest(xmlNumericManifest(weightedManifest().replaceAll('minProgressMeasure="0.5"', 'minProgressMeasure="0.00000000000000000001"'))) : profile === 'hidden' ? sequencingManifest(edition).replace('identifier="intro"', 'identifier="intro" isvisible="false"').replace('identifier="practice"', 'identifier="practice" isvisible="0"') : profile === 'collections' ? xmlCollectionIdsManifest(collectionManifest(edition)) : profile === 'choice' ? xmlTokenManifest(xmlBooleanManifest(xmlNumericManifest(sequencingManifest(edition).replaceAll('>0.8<', '>0.00000000000000000001<')))) : sequencingManifest(edition).replace('choice="true"', 'choice="false"'), profile === 'unicode', profile === 'interaction-records')); f.enroll();
  const origin = 'http://127.0.0.1:4344', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4345', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  let releaseScript: (() => void) | undefined;
  if (edition === '2004-3' && profile === 'collections') {
    const ready = new Promise<void>(resolve => {releaseScript = resolve;});
    await page.route('**/assets/player.js', async route => {await ready; await route.continue();});
  }
  try {
    await content!.listen({port: 4345, host: '127.0.0.1'}); await app.listen({port: 4344, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), runtime = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = runtime.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check();
    if (profile === 'hidden') await expect(player.getByRole('navigation', {name: 'SCORM activities'}).getByRole('button')).toHaveCount(0); else await expect(player.getByRole('button', {name: /Practice.*locked/})).toBeDisabled();
    await player.getByRole('button', {name: profile === 'hidden' ? 'Play or resume enrolled SCORM package' : /Introduction/}).click();
    if (releaseScript) {await expect(sco.getByRole('button', {name: 'Save sequencing progress', exact: true})).toBeDisabled(); releaseScript();}
    await sco.getByRole('button', {name: 'Save sequencing progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click();
    await player.getByRole('button', {name: profile === 'hidden' ? 'Play or resume enrolled SCORM package' : /Introduction/}).click();
    await expect(sco.getByText('Sequencing entry: resume; bookmark: sequencing-page', {exact: true})).toBeVisible();
    if (profile === 'unicode') await expect(sco.getByText('Unicode suspend characters: '+(edition === '2004-2' ? 4000 : 64000), {exact:true})).toBeVisible();
    if (profile === 'unicode') await expect(sco.getByText('Localized comment characters: 4000', {exact:true})).toBeVisible();
    if (profile === 'interaction-records') await expect(sco.getByText('Performance records: 250; correct sets: 1', {exact:true})).toBeVisible();
    let dropped = false;
    await page.route('**/launch/*/checkpoint', async route => {if (!dropped && route.request().postDataJSON().finished) {dropped = true; await route.fetch(); await route.abort();} else await route.continue();});
    await sco.getByRole('button', {name: 'Continue sequencing SCO', exact: true}).click();
    await expect(runtime.getByRole('status')).toContainText('not been acknowledged');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    const retry = player.getByRole('button', {name: 'Retry engine checkpoint', exact: true});
    await retry.scrollIntoViewIfNeeded(); await expect(retry).toBeInViewport(); await retry.click();
    await expect(sco.getByRole('heading', {name: 'Original sequencing practice', exact: true})).toBeVisible();
    await expect(sco.getByText('Sequencing entry: ab-initio; bookmark:', {exact: true})).toBeVisible();
    if (profile === 'shared' || profile === 'system-shared') await expect(sco.getByText('Shared notes: authored-shared-notes', {exact: true})).toBeVisible();
    expect(f.db.prepare("SELECT reported_seconds FROM scorm_sco_attempts WHERE sco_id='intro'").get()!.reported_seconds).toBe(40);
    await sco.getByRole('button', {name: 'End sequencing session', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    if (profile === 'unicode') expect(JSON.parse(String(f.db.prepare("SELECT runtime_state FROM scorm_sco_attempts WHERE sco_id='intro'").get()!.runtime_state)).suspend_data).toBe('🙂'.repeat(edition === '2004-2' ? 4000 : 64000));
    if (profile === 'unicode') {const state=JSON.parse(String(f.db.prepare("SELECT runtime_state FROM scorm_sco_attempts WHERE sco_id='intro'").get()!.runtime_state));expect(state.comments_from_learner[0].comment).toBe('{lang=vi-VN-x-demo}'+'🙂'.repeat(3997)+'e\u0301\n');expect(state.interactions[0].learner_response).toBe(state.comments_from_learner[0].comment);}
    if (profile === 'duration') {const clock = JSON.parse(JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state)).snapshot).pearDurationClock.rows.intro; expect(clock.absolute).toBeGreaterThan(0); expect(clock.experienced).toBeGreaterThan(0); expect(clock.experienced).toBeLessThanOrEqual(clock.absolute); expect(clock.attempt).toBe(1); expect(clock.absolute).toBeLessThan(60000);}
    if (profile === 'system-objectives') {const objective = f.db.prepare('SELECT * FROM scorm_system_objectives').get()!; expect(objective.target_id).toBe('shared-mastery'); expect(objective.learner).toBe('learner-a'); expect(objective.revision).toBe(1); expect(JSON.parse(String(objective.state)).normalizedMeasure).toBe(0.9);}
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)); expect(proof.rollup.completion).toBe('completed'); expect(proof.rollup.success).toBe('passed'); if (profile === 'weighted') expect(proof.rollup.completionMeasure).toBe(0.625); if (profile === 'system-shared') {const store = f.db.prepare('SELECT * FROM scorm_system_data').get()!; expect(store.store).toBe('authored-shared-notes'); expect(store.learner).toBe('learner-a'); expect(store.revision).toBe(2);}
  } finally {releaseScript?.(); await page.unrouteAll({behavior: 'wait'}); await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
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

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ' selected pool: built player resumes the original host decision and lost ACK cannot duplicate selected proof', async ({page}) => {
  const f = await scormLearningFixture(undefined, sequencingPackage(edition, xmlTokenManifest(xmlNumericManifest(selectionManifest(edition))))); f.enroll();
  const origin = 'http://127.0.0.1:4344', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4345', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4345, host: '127.0.0.1'}); await app.listen({port: 4344, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click(); await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), runtime = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = runtime.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: 'Play or resume enrolled SCORM package', exact: true}).click();
    await expect(sco.getByRole('heading', {name: /^Original sequencing (introduction|practice)$/})).toBeVisible();
    await sco.getByRole('button', {name: 'Save sequencing progress', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    const saved = JSON.parse(JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state)).snapshot), selected = saved.currentActivityId, plan = saved.sequencing.activityStates.org.selectionRandomizationState;
    expect(plan.selectedChildIds).toEqual([selected]); await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: 'Play or resume enrolled SCORM package', exact: true}).click();
    await expect(sco.getByText('Sequencing entry: resume; bookmark: sequencing-page', {exact: true})).toBeVisible();
    let dropped = false; await page.route('**/launch/*/checkpoint', async route => {if (!dropped && route.request().postDataJSON().finished) {dropped = true; await route.fetch(); await route.abort();} else await route.continue();});
    await sco.getByRole('button', {name: 'End sequencing session', exact: true}).click(); await expect(runtime.getByRole('status')).toContainText('not been acknowledged');
    const accepted = String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence); const retry = player.getByRole('button', {name: 'Retry engine checkpoint', exact: true});
    await retry.scrollIntoViewIfNeeded(); await expect(retry).toBeInViewport(); await retry.click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1); expect(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)).toBe(accepted);
    const proof = JSON.parse(accepted); expect(proof.scos.map((s: any) => s.scoId)).toEqual([selected]); expect(proof.selection[0].selectedChildren).toEqual(plan.selectedChildIds); expect(proof.scos[0].seconds).toBe(40); expect(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n).toBe(1);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
