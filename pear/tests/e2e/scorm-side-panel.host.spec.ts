// Actual Chrome Side Panel context. No extension-page fallback is accepted.
import {test, expect, chromium} from '@playwright/test';
import {mkdtemp, cp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
test('actual Chrome Side Panel opens by user gesture and mounts the Lime UI', async ({}, testInfo) => {
  const directory = await mkdtemp(join(tmpdir(), 'pear-side-panel-')), extension = join(directory, 'extension');
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await cp(resolve('../lime/dist/extension'), extension, {recursive: true});
    // Only this temporary copy has a nonce-free, local test reporter and opener.
    await writeFile(join(extension, 'opener.html'), '<!doctype html><button id="open">Open actual Side Panel</button><script src="opener.js"></script>');
    await writeFile(join(extension, 'opener.js'), `chrome.windows.getCurrent().then(window=>{document.querySelector('#open').onclick=()=>chrome.sidePanel.open({windowId:window.id}).then(()=>document.body.dataset.opened='true',error=>document.body.dataset.error=error.message);});`);
    await writeFile(join(extension, 'reporter.js'), `const timer=setInterval(()=>{if(document.querySelector('[aria-label="Target picker"]')){clearInterval(timer);chrome.runtime.sendMessage({pearSidePanelFixture:true,href:location.href,title:document.title});}},50);`);
    const html = await readFile(join(extension, 'sidepanel.html'), 'utf8');
    await writeFile(join(extension, 'sidepanel.html'), html.replace('</body>', '<script src="reporter.js"></script></body>'));
    const workerSource = await readFile(join(extension, 'worker.js'), 'utf8');
    await writeFile(join(extension, 'worker.js'), workerSource + `\nglobalThis.pearSidePanelReports=[];chrome.runtime.onMessage.addListener((message,sender)=>{if(message?.pearSidePanelFixture===true)globalThis.pearSidePanelReports.push({documentId:sender.documentId,url:sender.url,...message});});`);
    context = await chromium.launchPersistentContext(join(directory, 'profile'), {channel: 'chromium', headless: false, ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions-except=' + extension, '--load-extension=' + extension]});
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', {timeout: 10_000});
    const extensionId = new URL(worker.url()).hostname, panelURL = 'chrome-extension://' + extensionId + '/sidepanel.html';
    const opener = await context.newPage(); await opener.goto('chrome-extension://' + extensionId + '/opener.html');
    await opener.getByRole('button', {name: 'Open actual Side Panel', exact: true}).click();
    await expect(opener.locator('body')).toHaveAttribute('data-opened', 'true');
    await expect.poll(() => worker.evaluate(async () => {
      const contexts = await chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']});
      return {contexts, reports: (globalThis as any).pearSidePanelReports};
    })).toMatchObject({contexts: [{contextType: 'SIDE_PANEL', documentUrl: panelURL}], reports: [{href: panelURL}]});
    const evidence = await worker.evaluate(async () => ({contexts: await chrome.runtime.getContexts({contextTypes: ['SIDE_PANEL']}), reports: (globalThis as any).pearSidePanelReports}));
    expect(evidence.contexts[0].documentId).toBe(evidence.reports[0].documentId);
    const session = await context.newCDPSession(opener), targets = (await session.send('Target.getTargets')).targetInfos.map(target => ({type: target.type, url: target.url}));
    await testInfo.attach('actual-side-panel-context', {body: JSON.stringify({browser: await opener.evaluate(() => navigator.userAgent), ...evidence, targets}, null, 2), contentType: 'application/json'});
  } finally {await context?.close(); await rm(directory, {recursive: true, force: true});}
});
