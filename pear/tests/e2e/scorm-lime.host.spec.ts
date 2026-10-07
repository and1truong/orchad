import {test, expect, chromium} from '@playwright/test';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {startMockGateway} from '../../../lime/fixtures/gateway.ts';
import {readFileSync} from 'node:fs';
import {mkdtemp, cp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
test.setTimeout(60_000);

test('actual unpacked Lime reads permitted SCORM lesson metadata while content remains outside host authority', async () => {
  const f = await scormLearningFixture(undefined, interopPackage('2004-4', 'pipwerks')), binding = f.enroll();
  const origin = 'http://127.0.0.1:4346', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4347', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  const dir = await mkdtemp(join(tmpdir(), 'scorm-lime-')), extension = join(dir, 'extension');
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined, gateway: Awaited<ReturnType<typeof startMockGateway>> | undefined;
  try {
    await cp(resolve('../lime/dist/extension'), extension, {recursive: true});
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8')); manifest.host_permissions = [origin + '/*', 'http://127.0.0.1:4348/*'];
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    gateway = await startMockGateway(4348, true, {name: 'learning_get_lesson', arguments: JSON.stringify(binding)});
    await content!.listen({port: 4347, host: '127.0.0.1'}); await app.listen({port: 4346, host: '127.0.0.1'});
    context = await chromium.launchPersistentContext(join(dir, 'profile'), {channel: 'chromium', headless: true, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions-except=' + extension, '--load-extension=' + extension]});
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', {timeout: 10_000}), id = new URL(worker.url()).hostname;
    const page = await context.newPage(); await page.goto(origin);
    await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click(); await page.getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Licensed wrapper Initialize: true', {exact: true})).toBeVisible();
    const panel = await context.newPage(); await panel.goto('chrome-extension://' + id + '/sidepanel.html');
    const option = panel.locator('select[aria-label="Target picker"] option[data-url^="' + origin + '"]'); await option.waitFor({state: 'attached'});
    await panel.getByLabel('Target picker').selectOption((await option.getAttribute('value'))!); await panel.getByRole('button', {name: 'Pin target', exact: true}).click();
    await expect(panel.getByText('Document: learning:demo:learner-a', {exact: false})).toBeVisible();
    await panel.getByLabel('Gateway endpoint').fill('http://127.0.0.1:4348'); await panel.getByLabel('Gateway token').fill('lime-fixture-token'); await panel.getByRole('button', {name: 'Load models', exact: true}).click();
    await panel.locator('select option', {hasText: 'mock-counter'}).waitFor({state: 'attached'});
    await panel.getByLabel('Allow read: learning_get_lesson', {exact: true}).check(); await panel.getByRole('button', {name: 'Consent to pinned target + model', exact: true}).click();
    await panel.getByLabel('Message', {exact: true}).fill('Read only the permitted lesson metadata.'); await panel.getByRole('button', {name: 'Send', exact: true}).click();
    await expect.poll(() => gateway!.requests.some(r => r.messages?.some((m: any) => m.role === 'tool'))).toBe(true);
    const request = gateway.requests.find(r => r.messages?.some((m: any) => m.role === 'tool')), result = JSON.parse(request.messages.find((m: any) => m.role === 'tool').content);
    expect(result.ok).toBe(true); expect(result.data.title).toBe('Package lesson');
    for (const key of ['scorm', 'token', 'state', 'suspend_data', 'runtime_state', 'answers', 'csrf']) expect(Object.hasOwn(result.data, key), key).toBe(false);
    const isolated = await sco.locator('body').evaluate(() => {try {void (top as any).agentBridgeV1; return false;} catch {return !(window as any).agentBridgeV1 && !(parent as any).agentBridgeV1 && !(window as any).__TAURI_INTERNALS__;}});
    expect(isolated).toBe(true); expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    await sco.getByRole('button', {name: 'Finish licensed content', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
  } finally {await context?.close(); await gateway?.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close(); await rm(dir, {recursive: true, force: true});}
});
