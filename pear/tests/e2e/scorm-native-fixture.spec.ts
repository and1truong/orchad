// Supplemental Chromium check of the real fixture/fault driver, not native evidence.
import {test, expect} from '@playwright/test';
import {absentCollectionPaths} from '../scorm-collection-read-vectors.ts';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
for (const edition of ['1.2', '2004-2', '2004-3', '2004-4']) test(edition + ': native fixture driver loses ACK, retries exactly, resumes and finishes', async ({page}) => {
  const nonce = randomUUID(), origin = 'http://127.0.0.1:4310', prefix = origin + '/native-scorm/' + nonce;
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/native-scorm-fixture.ts'], {env: {...process.env, PEAR_NATIVE_NONCE: nonce, PEAR_NATIVE_SCORM_EDITION: edition}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let output = '', errors = '', exited = false;
  child.stdout!.on('data', value => output += value); child.stderr!.on('data', value => errors += value);
  const exit = new Promise<number | null>((resolve, reject) => {child.once('error', reject); child.once('exit', code => {exited = true; resolve(code);});});
  try {
    await expect.poll(() => output, {message: errors}).toContain('PEAR_NATIVE_FIXTURE_READY');
    const state = async () => (await fetch(prefix + '/state')).json();
    const command = async (action: string) => {expect((await fetch(prefix + '/command', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action})})).ok).toBe(true);};
    await page.goto(prefix + '/bootstrap/learner-a');
    await expect.poll(async () => {const s = await state(); return s.probes.length > 0 && s.droppedACK;}).toBe(true);
    const first = await state(); expect(first.driverErrors).toEqual([]); expect(first.proofs).toBe(0); expect(first.calls).toEqual([]); expect(first.pearCanaryCalls).toEqual([]); expect(first.probes[0].entry).toBe('ab-initio');
    for (const key of ['popupDenied', 'serviceWorkerDenied', 'egressDirectives', 'redirectDenied']) expect(first.probes[0][key], key + ': ' + JSON.stringify(first.probes[0].egressViolations)).toBe(true);
    await expect(page.frameLocator('iframe[title="Isolated SCORM engine player"]').getByRole('status')).toContainText('has not been acknowledged');
    await command('retry');
    await expect.poll(async () => {const s = await state(); return s.exactRetry && s.checkpoints >= 2;}).toBe(true);
    await command('resume');
    await expect.poll(async () => (await state()).probes.length).toBe(2);
    const resumed = await state(); expect(resumed.driverErrors).toEqual([]); expect(resumed.probes[1].entry).toBe('resume'); expect(resumed.probes[1].bookmark).toBe('licensed-page');
    for (const key of ['popupDenied', 'serviceWorkerDenied', 'egressDirectives', 'redirectDenied']) expect(resumed.probes[1][key], key).toBe(true);
    if(edition!=='1.2')for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.interactionReadErrors).toEqual(['type','timestamp','weighting','result','latency'].map(field=>({field,absentCode:'301',unsetCode:'403'})));
    if(edition!=='1.2')for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.collectionReadErrors).toEqual(absentCollectionPaths.map(path=>({path,code:'301'})));
    if(edition!=='1.2')for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.sequencingResponses).toEqual({count:'5',codes:['351','351','351'],preserved:true});
    if(edition!=='1.2')for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.reloadableCheckpoint).toEqual({typeAccepted:true,commitCode:'391',preserved:true});
    if(edition!=='1.2'){expect(first.probes[0].responseWriteCheckpoint).toEqual({committed:true,preserved:true});expect(resumed.probes[1].responseWriteCheckpoint).toEqual({resumed:true});await expect.poll(async()=>(await state()).responseWriteCheckpoints).toBeGreaterThan(0);}
    if(edition!=='1.2'){expect(resumed.probes[1].responseBindingCheckpoint).toEqual({committed:true,preserved:true});await expect.poll(async()=>(await state()).responseBindingCheckpoints).toBeGreaterThan(0);}
    if(edition!=='1.2'){expect(resumed.largestCheckpointBytes).toBeGreaterThan(544*1024);for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.checkpointCapacity).toEqual({count:'35',preserved:true});}
    expect(resumed.calls).toEqual([]); expect(resumed.pearCanaryCalls).toEqual([]);
    await command('finish'); await expect.poll(async () => (await state()).proofs).toBe(1);
    const finished = await state(); expect(finished.certificates).toBe(0); expect(finished.calls).toEqual([]); expect(finished.edition).toBe(edition);
    await command('navigate'); await expect.poll(async () => (await state()).navigationAttempts).toEqual(['player-script-pear']);
    await expect.poll(async () => (await state()).navigationViolations).toContain('frame-src');
    const denied=await state(); expect(denied.pearCanaryCalls).toEqual([]); expect(denied.calls).toEqual([]); expect(denied.proofs).toBe(1); expect(denied.certificates).toBe(0);
  } finally {
    await page.close(); if (child.connected) child.send({kind: 'close'});
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {expect(await exit, errors).toBe(0);} finally {clearTimeout(timeout); if (!exited) child.kill('SIGKILL');}
  }
});
