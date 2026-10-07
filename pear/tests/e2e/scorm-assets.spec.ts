import {test, expect} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {assetPackage} from '../scorm-assets-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
for (const standard of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(`${standard}: isolated asset has no SCORM API and lost advancement ACK cannot duplicate navigation or proof`, async ({page}) => {
  const f = await scormLearningFixture(undefined, assetPackage(standard)); f.enroll();
  const origin = 'http://127.0.0.1:4354', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4355', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4355, host: '127.0.0.1'}); await app.listen({port: 4354, host: '127.0.0.1'}); await page.goto(origin);
    await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click(); await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), runtime = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), activity = runtime.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(activity.getByText('Asset APIs: undefined / undefined', {exact: true})).toBeVisible();
    let dropped = false, original = '';
    await page.route('**/launch/*/advance', async route => {const request = route.request().postData()!; expect(Object.keys(JSON.parse(request)).sort()).toEqual(['navigation','revision','sequence']); if (!dropped) {original = request; dropped = true; await route.fetch(); await route.abort('failed');} else {expect(request).toBe(original); await route.continue();}});
    await runtime.getByRole('button', {name: 'Continue content', exact: true}).click(); await expect(runtime.getByRole('status')).toContainText('not been acknowledged'); expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n).toBe(1); expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    await runtime.getByRole('button', {name: 'Retry package checkpoint', exact: true}).click(); await expect(activity.getByRole('heading', {name: 'Original communicating practice', exact: true})).toBeVisible();
    await page.locator('iframe[title="Isolated SCORM engine player"]').scrollIntoViewIfNeeded(); await activity.getByRole('button', {name: 'Finish communicating practice', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)); expect(proof.scos.map((s: any) => s.scoId)).toEqual(['practice']); expect(proof.scos[0].seconds).toBe(20); expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n).toBe(2); expect(f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts WHERE sco_id=?').get('intro')!.reported_seconds).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
