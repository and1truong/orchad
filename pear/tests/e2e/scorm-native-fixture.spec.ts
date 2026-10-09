// Supplemental Chromium check of the real fixture/fault driver, not native evidence.
import {test, expect} from '@playwright/test';
import {absentCollectionPaths} from '../scorm-collection-read-vectors.ts';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const profiles = [...['1.2', '2004-2', '2004-3', '2004-4'].map(edition => ({edition, collectionSPM: false, commentSPM: false})), ...['2004-2', '2004-3', '2004-4'].map(edition => ({edition, collectionSPM: true, commentSPM: false})), ...['2004-2', '2004-3', '2004-4'].map(edition => ({edition, collectionSPM: true, commentSPM: true}))];
for (const {edition, collectionSPM, commentSPM} of profiles) test(edition + (commentSPM ? ' full-comment collection SPM' : collectionSPM ? ' collection SPM' : '') + ': native fixture driver loses ACK, retries exactly, resumes and finishes', async ({page}) => {
  const nonce = randomUUID(), origin = 'http://127.0.0.1:4310', prefix = origin + '/native-scorm/' + nonce;
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/native-scorm-fixture.ts'], {env: {...process.env, PEAR_NATIVE_NONCE: nonce, PEAR_NATIVE_SCORM_EDITION: edition, PEAR_NATIVE_SCORM_COLLECTION_SPM: collectionSPM ? '1' : '0', PEAR_NATIVE_SCORM_COMMENT_SPM: commentSPM ? '1' : '0'}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
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
    if(commentSPM)await expect(page.frameLocator('iframe[title="Isolated SCORM engine player"]').frameLocator('iframe[title="SCORM SCO"]').locator('#entry')).toContainText('Licensed entry: resume; bookmark: licensed-page');
    await expect.poll(async () => (await state()).probes.length).toBe(2);
    const resumed = await state(); expect(resumed.driverErrors).toEqual([]); expect(resumed.probes[1].entry).toBe('resume'); expect(resumed.probes[1].bookmark).toBe('licensed-page');
    for (const key of ['popupDenied', 'serviceWorkerDenied', 'egressDirectives', 'redirectDenied']) expect(resumed.probes[1][key], key).toBe(true);
    if(edition==='2004-4'&&!collectionSPM){for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.sharedTargetID).toEqual({resumed:true,idCode:'404',id:'urn:pear:native-shared-target',preserved:true});expect(resumed.sharedTargetStored).toBe(true);}
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.interactionReadErrors).toEqual(['type','timestamp','weighting','result','latency'].map(field=>({field,absentCode:'301',unsetCode:'403'})));
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.collectionReadErrors).toEqual(absentCollectionPaths.map(path=>({path,code:'301'})));
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.sequencingResponses).toEqual({count:'5',codes:['351','351','351'],preserved:true});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.reloadableCheckpoint).toEqual({typeAccepted:true,commitCode:'391',preserved:true});
    if(edition!=='1.2'&&!collectionSPM){expect(first.probes[0].typeHistory).toEqual({writes:5000,preserved:true});expect(first.probes[0].responseHistory).toEqual({writes:10000,preserved:true});expect(resumed.largestInteractionJournal).toBeGreaterThan(0);expect(resumed.largestInteractionJournal).toBeLessThanOrEqual(12);}
    if(edition!=='1.2'&&!collectionSPM){expect(first.probes[0].responseWriteCheckpoint).toEqual({committed:true,preserved:true});expect(resumed.probes[1].responseWriteCheckpoint).toEqual({resumed:true});await expect.poll(async()=>(await state()).responseWriteCheckpoints).toBeGreaterThan(0);}
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.uriAuthority).toEqual({resumed:true,preserved:true,codes:edition==='2004-2'?['406','406','406','406','406']:['406','406','406'],count:'2'});
    if(edition!=='1.2'&&!collectionSPM){expect(resumed.probes[1].responseBindingCheckpoint).toEqual({committed:true,preserved:true});await expect.poll(async()=>(await state()).responseBindingCheckpoints).toBeGreaterThan(0);}
    if(edition!=='1.2'&&!collectionSPM){expect(resumed.largestCheckpointBytes).toBeGreaterThan(544*1024);for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.checkpointCapacity).toEqual({count:'35',preserved:true});}
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.decimalCapacity).toEqual({resumed:true,preserved:true,codes:['406','406','407','407']});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.languageRegistry).toEqual({resumed:true,preserved:true,codes:Array(10).fill('406')});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.ianaLanguage).toEqual({resumed:true,preserved:true,codes:Array(4).fill('406')});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.reservedCountry).toEqual({resumed:true,preserved:true,codes:Array(42).fill('406')});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.countryRegistry).toEqual({resumed:true,accepted:260,preserved:true,codes:Array(4).fill('406')});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.countryCharacters).toEqual({resumed:true,preserved:true,codes:Array(620).fill('406')});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.ianaSubcodes).toEqual({resumed:true,accepted:709,preserved:true,codes:Array(8).fill('406')});
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.resultDecimal).toEqual({resumed:true,preserved:true,codes:['406','406','406','406']});
    if(collectionSPM){
      for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.collectionSPM).toEqual({interactions:250,objectives:100,nestedObjectives:2500,patterns:2500,preserved:true});
      for(const value of [first,resumed]){expect(value.collectionSPM).toBe(true);expect(value.collectionStored).toEqual({interactions:250,objectives:100,origins:250,preserved:true,...(commentSPM?{comments:{count:250,preserved:true}}:{})});expect(value.proofs).toBe(0);expect(value.certificates).toBe(0);}
      expect(resumed.largestInteractionJournal).toBe(3500);expect(resumed.responseBindingCheckpoints).toBeGreaterThan(0);expect(resumed.responseWriteCheckpoints).toBeGreaterThan(0);if(commentSPM){expect(resumed.largestCheckpointBytes).toBeGreaterThan(2*1024*1024);expect(resumed.largestCheckpointBytes).toBeLessThan(resumed.largestCheckpointLimit);}else{expect(resumed.largestCheckpointBytes).toBeGreaterThan(544*1024);expect(resumed.largestCheckpointBytes).toBeLessThan(2*1024*1024);}
    }
    if(edition!=='1.2'&&!collectionSPM)for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.singletonLanguage).toEqual({resumed:true,preserved:true,codes:Array(26).fill(edition==='2004-2'?'406':'0')});
    if(commentSPM){expect(Number.isFinite(resumed.largestCheckpointLimit)).toBe(true);for(const probe of [first.probes[0],resumed.probes[1]])expect(probe.learnerCommentSPM).toEqual({comments:250,charactersPerComment:4000,preserved:true});}
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
