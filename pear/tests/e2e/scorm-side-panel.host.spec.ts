// Actual Chrome Side Panel context. No extension-page fallback is accepted.
import {test, expect, chromium} from '@playwright/test';
import {mkdtemp, cp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';
import {createApp} from '../../src/server/app.ts';
import {startMockGateway} from '../../../lime/fixtures/gateway.ts';
import {SCORM_STANDARDS} from '../../src/shared/scorm-engine.ts';
for (const edition of SCORM_STANDARDS) test(edition + ': actual Chrome Side Panel binds consent, revocation and account change during the SCORM journey', async ({}, testInfo) => {
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks')), binding = f.enroll();
  const origin = 'http://127.0.0.1:4346', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4347', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  const directory = await mkdtemp(join(tmpdir(), 'pear-side-panel-')), extension = join(directory, 'extension');
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined, gateway: Awaited<ReturnType<typeof startMockGateway>> | undefined;
  try {
    await cp(resolve('../lime/dist/extension'), extension, {recursive: true});
    const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8')); manifest.host_permissions = [origin + '/*', 'http://127.0.0.1:4348/*'];
    await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
    gateway = await startMockGateway(4348, true, {name: 'learning_get_lesson', arguments: JSON.stringify(binding)});
    await content!.listen({port: 4347, host: '127.0.0.1'}); await app.listen({port: 4346, host: '127.0.0.1'});
    // Only this temporary copy has a nonce-free, local test reporter and opener.
    await writeFile(join(extension, 'opener.html'), '<!doctype html><button id="open">Open actual Side Panel</button><script src="opener.js"></script>');
    await writeFile(join(extension, 'opener.js'), `chrome.windows.getCurrent().then(window=>{document.querySelector('#open').onclick=()=>chrome.sidePanel.open({windowId:window.id}).then(()=>document.body.dataset.opened='true',error=>document.body.dataset.error=error.message);});`);
    await writeFile(join(extension, 'reporter.js'), `const timer=setInterval(async()=>{if(document.querySelector('[aria-label="Target picker"]')){clearInterval(timer);const contexts=await chrome.runtime.getContexts({documentUrls:[location.href]});if(contexts.length===1&&contexts[0].contextType==='SIDE_PANEL')chrome.runtime.sendMessage({pearSidePanelFixture:true,href:location.href,title:document.title,documentId:contexts[0].documentId,contextType:contexts[0].contextType});}},50);`);
    const html = await readFile(join(extension, 'sidepanel.html'), 'utf8');
    await writeFile(join(extension, 'sidepanel.html'), html.replace('</body>', '<script src="reporter.js"></script></body>'));
    const workerSource = await readFile(join(extension, 'worker.js'), 'utf8');
    await writeFile(join(extension, 'worker.js'), workerSource + `\nglobalThis.pearSidePanelReports=[];chrome.runtime.onMessage.addListener((message,sender)=>{if(message?.pearSidePanelFixture===true)globalThis.pearSidePanelReports.push({documentId:sender.documentId,url:sender.url,...message});});`);
    context = await chromium.launchPersistentContext(join(directory, 'profile'), {channel: 'chromium', headless: false, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions-except=' + extension, '--load-extension=' + extension]});
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', {timeout: 10_000});
    const extensionId = new URL(worker.url()).hostname, panelURL = 'chrome-extension://' + extensionId + '/sidepanel.html';
    const page = await context.newPage(); await page.goto(origin);
    await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click(); await page.getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), sco = page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Licensed wrapper Initialize: true', {exact: true})).toBeVisible();
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const opener = await context.newPage(); await opener.goto('chrome-extension://' + extensionId + '/opener.html');
    await expect.poll(() => opener.locator('#open').evaluate(element => typeof (element as HTMLButtonElement).onclick)).toBe('function');
    await opener.getByRole('button', {name: 'Open actual Side Panel', exact: true}).click();
    await expect(opener.locator('body')).toHaveAttribute('data-opened', 'true');
    await expect.poll(() => worker.evaluate(async () => {
      const contexts = await chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']});
      return {contexts, reports: (globalThis as any).pearSidePanelReports};
    })).toMatchObject({contexts: [{contextType: 'SIDE_PANEL', documentUrl: panelURL}], reports: [{href: panelURL}]});
    const evidence = await worker.evaluate(async () => ({contexts: await chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']}), reports: (globalThis as any).pearSidePanelReports}));
    const session = await context.newCDPSession(opener), targets = (await session.send('Target.getTargets')).targetInfos.map(target => ({type: target.type, url: target.url}));
    await testInfo.attach('actual-side-panel-context', {body: JSON.stringify({browser: await opener.evaluate(() => navigator.userAgent), ...evidence, targets}, null, 2), contentType: 'application/json'});
    console.log(JSON.stringify({sidePanelContexts: evidence.contexts.length, mountedReports: evidence.reports.length, panelTargetTypes: targets.filter(target => target.url === panelURL).map(target => target.type)}));
    expect(evidence.contexts).toHaveLength(1); expect(evidence.reports).toHaveLength(1);
    expect(evidence.reports[0].contextType).toBe('SIDE_PANEL');
    expect(evidence.contexts[0].documentId).toBe(evidence.reports[0].documentId);
    // Drive the page Chrome created for the verified SIDE_PANEL; never navigate a tab to panelURL.
    await expect.poll(() => context!.pages().filter(page => page.url() === panelURL).length).toBe(1);
    const panel = context.pages().find(page => page.url() === panelURL)!;
    const pin = async (document: string) => {
      const option = panel.locator('select[aria-label="Target picker"] option[data-url^="' + origin + '"]'); await option.waitFor({state: 'attached'});
      await panel.getByLabel('Target picker').selectOption((await option.getAttribute('value'))!); await panel.getByRole('button', {name: 'Pin target', exact: true}).click();
      await expect(panel.getByText('Document: ' + document, {exact: false})).toBeVisible();
    };
    await pin('learning:demo:learner-a');
    await panel.getByLabel('Gateway endpoint').fill('http://127.0.0.1:4348'); await panel.getByLabel('Gateway token').fill('lime-fixture-token'); await panel.getByRole('button', {name: 'Load models', exact: true}).click();
    await panel.locator('select option', {hasText: 'mock-counter'}).waitFor({state: 'attached'});
    const read = panel.getByLabel('Allow read: learning_get_lesson', {exact: true}), send = panel.getByRole('button', {name: 'Send', exact: true});
    await read.check(); await panel.getByRole('button', {name: 'Consent to pinned target + model', exact: true}).click();
    await expect(panel.getByRole('button', {name: 'Consent granted', exact: true})).toBeVisible();
    await panel.getByLabel('Message', {exact: true}).fill('Read only the permitted lesson metadata.'); await send.click();
    await expect.poll(() => gateway!.requests.some(r => r.messages?.some((m: any) => m.role === 'tool'))).toBe(true);
    const request = gateway.requests.find(r => r.messages?.some((m: any) => m.role === 'tool')), result = JSON.parse(request.messages.find((m: any) => m.role === 'tool').content);
    expect(result.ok).toBe(true); expect(result.data.title).toBe('Package lesson');
    for (const key of ['scorm', 'token', 'state', 'suspend_data', 'runtime_state', 'answers', 'csrf']) expect(Object.hasOwn(result.data, key), key).toBe(false);
    await expect(send).toBeEnabled(); // the completed turn cannot race revocation
    const isolated = await sco.locator('body').evaluate(() => {try {void (top as any).agentBridgeV1; return false;} catch {return !(window as any).agentBridgeV1 && !(parent as any).agentBridgeV1 && !(window as any).__TAURI_INTERNALS__;}});
    expect(isolated).toBe(true); expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
    const beforeRevoke = gateway.requestCount;
    await read.uncheck(); await expect(send).toBeDisabled();
    await expect(panel.getByRole('button', {name: 'Consent to pinned target + model', exact: true})).toBeVisible();
    expect(gateway.requestCount).toBe(beforeRevoke);
    await read.check(); await panel.getByRole('button', {name: 'Consent to pinned target + model', exact: true}).click(); await expect(send).toBeEnabled();
    let original = ''; await page.route('**/launch/*/checkpoint', async route => {
      if (!original) {original = route.request().postData()!; expect((await route.fetch()).ok()).toBe(true); await route.abort();}
      else {expect(route.request().postData()).toBe(original); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click();
    const outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]');
    await expect(outer.getByRole('status')).toContainText('not been acknowledged');
    const revision = f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, receipts = f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n;
    await player.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(revision); expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(receipts); await page.unroute('**/launch/*/checkpoint');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Licensed entry: resume; bookmark: licensed-page', {exact: true})).toBeVisible();
    await page.locator('iframe[title="Isolated SCORM engine player"]').scrollIntoViewIfNeeded();
    await sco.getByRole('button', {name: 'Finish licensed content', exact: true}).click(); await expect(player.getByRole('status')).toContainText('completion accepted');
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(1); expect(f.db.prepare('SELECT count(*) n FROM certificates').get()!.n).toBe(0);
    // Same app tab, changed authenticated document. Old consent must deny before the gateway.
    await page.getByRole('button', {name: 'Sign out', exact: true}).click();
    await page.getByLabel('Account', {exact: true}).fill('learner-b'); await page.getByLabel('Password', {exact: true}).fill('learner-b-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await expect(page.getByRole('button', {name: 'Sign out', exact: true})).toBeVisible();
    const beforeRebind = gateway.requestCount;
    await panel.getByLabel('Message', {exact: true}).fill('The old consent must not read after an account change.'); await send.click();
    await expect(panel.locator('header .status')).toHaveText('error');
    await expect(panel.getByText(/STALE_CONTEXT/)).toBeVisible(); expect(gateway.requestCount).toBe(beforeRebind);
    await pin('learning:demo:learner-b'); await expect(send).toBeDisabled();
    await panel.getByRole('button', {name: 'Disconnect', exact: true}).click(); await expect(send).toBeDisabled(); await expect(panel.getByLabel('Gateway token')).toHaveValue('');
    const finalContexts = await worker.evaluate(() => chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']}));
    expect(finalContexts).toHaveLength(1); expect(finalContexts[0].documentId).toBe(evidence.contexts[0].documentId);
    await testInfo.attach('actual-side-panel-journey', {body: JSON.stringify({edition, contextType: finalContexts[0].contextType, sameDocument: true, permittedRead: result.ok, revokedBeforeGateway: gateway.requestCount === beforeRebind, proofs: 1, certificates: 0}), contentType: 'application/json'});
  } finally {await context?.close(); await gateway?.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close(); await rm(directory, {recursive: true, force: true});}
});
