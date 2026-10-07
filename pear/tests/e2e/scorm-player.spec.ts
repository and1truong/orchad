import {test, expect} from '@playwright/test';
import {createApp} from '../../src/server/app.ts';
import {fixture} from '../helpers.ts';
import {singleSCOPackage} from '../scorm-player-fixture.ts';
import {SCORMPackageService} from '../../src/server/scorm-package-service.ts';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

test('built single-SCO engine isolates Pear, durably retries outages/lost ACK and resumes the original attempt', async ({page}) => {
  const f = fixture(), packages = new SCORMPackageService(f.db), admin = f.service.principal('admin');
  const job = packages.enqueue(admin, {filename: 'original-player.zip', provenance: 'Self-authored browser fixture', version: 1, confirmed: true, key: 'browser-import', revision: 0}, singleSCOPackage());
  await packages.run(job.jobId); const pkg = packages.list(admin, true).items[0]!;
  packages.review(admin, {packageId: pkg.id, version: 1, sha256: pkg.sha256, action: 'publish', reason: 'Reviewed all four source files', confirmed: true, key: 'browser-publish', revision: f.service.context('admin', 'library:demo').revision});
  const origin = 'http://127.0.0.1:4338', contentOrigin = 'http://localhost:4339';
  const {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: contentOrigin, runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4339, host: '127.0.0.1'}); await app.listen({port: 4338, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    const panel = page.getByRole('region', {name: 'SCORM engine packages', exact: true});
    async function launch() {
      await page.getByRole('button', {name: 'Imported packages', exact: true}).click();
      await panel.getByLabel("I consent to this engine package's separate reported tracking.", {exact: true}).check();
      await panel.getByRole('button', {name: 'Play or resume engine package', exact: true}).click();
    }
    await launch();
    const runtime = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = runtime.frameLocator('iframe[title="SCORM SCO"]');
    await expect(sco.getByText('Engine entry: ab-initio', {exact: true})).toBeVisible();
    await expect(sco.getByText('Pear cookies and bridge are isolated', {exact: true})).toBeVisible();
    const workerDenied = await sco.locator('body').evaluate(async () => {
      try {await navigator.serviceWorker.register('../assets/player.js'); return false;} catch {return true;}
    });
    expect(workerDenied).toBe(true);
    expect(await sco.locator('body').evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
    await expect(sco.getByRole('heading', {name: 'Original engine SCO'})).toHaveCSS('color', 'rgb(17, 34, 51)');
    await sco.getByRole('button', {name: 'Save engine progress', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('saved by the server');
    const saved = () => f.db.prepare('SELECT * FROM scorm_sco_attempts').get() as any;
    expect(saved().revision).toBe(1); expect(saved().reported_seconds).toBe(60);
    expect(JSON.parse(saved().runtime_state).interactions['0'].student_response).toBe('a');
    await page.evaluate(() => window.postMessage({kind: 'pear-scorm-engine-status', launchId: 'forged', sequence: 999, acknowledged: true}, '*'));
    expect(saved().revision).toBe(1);

    let interrupted = false;
    await page.route('**/launch/*/checkpoint', async route => {if (!interrupted) {interrupted = true; await route.abort();} else await route.continue();});
    await sco.getByRole('button', {name: 'Save engine progress', exact: true}).click();
    await expect(runtime.getByRole('status')).toContainText('has not been acknowledged');
    expect(saved().revision).toBe(1);
    await panel.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click();
    await expect.poll(() => saved().revision).toBe(2); expect(saved().reported_seconds).toBe(60);
    await page.unroute('**/launch/*/checkpoint');

    let lost = false;
    await page.route('**/launch/*/checkpoint', async route => {if (!lost) {lost = true; await route.fetch(); await route.abort();} else await route.continue();});
    await sco.getByRole('button', {name: 'Finish engine SCO', exact: true}).click();
    await expect(runtime.getByRole('status')).toContainText('has not been acknowledged');
    expect(saved().revision).toBe(3); expect(saved().reported_seconds).toBe(60);
    await panel.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('finished and saved by the server');
    expect(saved().revision).toBe(3); await page.unroute('**/launch/*/checkpoint');
    await panel.getByRole('button', {name: 'Close engine package', exact: true}).click();
    await expect(panel.locator('iframe')).toHaveCount(0);

    await page.reload(); await launch();
    await expect(sco.getByText('Engine entry: resume', {exact: true})).toBeVisible();
    await expect(sco.getByText('Engine resume: page-2; original-engine-resume; total: 00:01:00', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_attempts').get()!.n).toBe(1);
    for (const table of ['enrollments', 'attempts', 'certificates', 'study_totals']) expect(f.db.prepare('SELECT count(*) AS n FROM ' + table).get()!.n).toBe(0);
    await page.screenshot({path: 'artifacts/scorm-engine-durable-resume.png', fullPage: true});
    const resourceURL = await sco.locator('body').evaluate(() => location.href);
    await page.getByRole('button', {name: 'Sign out', exact: true}).click();
    const denied = await content!.inject({url: new URL(resourceURL).pathname, headers: {host: 'localhost:4339'}}); expect(denied.statusCode).toBe(401);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
