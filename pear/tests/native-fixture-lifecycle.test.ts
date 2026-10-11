import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {connect} from 'node:net';

const profiles = [...['pear', '1.2', '2004-2', '2004-3', '2004-4'].map(edition => ({edition, collectionSPM: false, commentSPM: false})), ...['2004-2', '2004-3', '2004-4'].map(edition => ({edition, collectionSPM: true, commentSPM: false})), ...['2004-2', '2004-3', '2004-4'].map(edition => ({edition, collectionSPM: true, commentSPM: true}))];
for (const {edition, collectionSPM, commentSPM} of profiles) test('real native fixture graceful IPC cleanup: ' + edition + (commentSPM ? ' full-comment collection SPM' : collectionSPM ? ' collection SPM' : ''), async () => {
  const nonce = randomUUID(), scorm = edition !== 'pear';
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/' + (scorm ? 'native-scorm-fixture.ts' : 'native-fixture.ts')], {cwd: process.cwd(), env: {...process.env, PEAR_NATIVE_NONCE: nonce, PEAR_NATIVE_SCORM_EDITION: edition, PEAR_NATIVE_SCORM_COLLECTION_SPM: collectionSPM ? '1' : '0', PEAR_NATIVE_SCORM_COMMENT_SPM: commentSPM ? '1' : '0'}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let output = '', errors = '', exited = false;
  child.stdout!.on('data', value => output += value); child.stderr!.on('data', value => errors += value);
  const exit = new Promise<number | null>((resolve, reject) => {child.once('error', reject); child.once('exit', () => {exited = true;}); child.once('close', resolve);});
  let pending: ReturnType<typeof connect> | undefined;
  try {
    const deadline = Date.now() + 30000;
    while (!output.includes('PEAR_NATIVE_FIXTURE_READY')) {assert.ok(!exited && Date.now() < deadline, errors); await sleep(50);}
    const response = await fetch('http://127.0.0.1:4310/' + (scorm ? 'native-scorm' : 'native-fixture') + '/' + nonce + '/state');
    assert.equal(response.status, 200); const state = await response.json();
    if (scorm) {assert.equal(state.edition, edition); assert.equal(state.collectionSPM, collectionSPM); assert.equal(state.commentSPM, commentSPM); assert.equal(state.proofs, 0); assert.equal(state.checkpoints, 0);} else assert.deepEqual(state.enrollments, []);
    // A WebView may retain an unfinished HTTP request while the app is quitting.
    pending = connect(4310, '127.0.0.1'); pending.on('error', () => {});
    await new Promise<void>(resolve => pending!.once('connect', resolve));
    pending.write('GET /health HTTP/1.1\r\nHost: 127.0.0.1:4310\r\n');
    await sleep(50);
    child.send({kind: 'close'});
    const deadlineExit = Date.now() + 5000;
    while (!exited && Date.now() < deadlineExit) await sleep(50);
    assert.ok(exited, 'IPC close did not finish'); assert.equal(await exit, 0, errors);
    if (scorm) {
      const phases = ['received', 'connections-closed', 'sink-closed', 'app-closed', 'database-closed', 'cleanup-complete'];
      assert.deepEqual(output.match(/PEAR_NATIVE_FIXTURE_CLOSE:[a-z-]+/g), phases.map(phase => 'PEAR_NATIVE_FIXTURE_CLOSE:' + phase));
      const times = Array.from(output.matchAll(/PEAR_NATIVE_FIXTURE_CLOSE:([a-z-]+) elapsedMs=(\d+\.\d{3})/g), match => ({phase: match[1], elapsed: Number(match[2])}));
      assert.deepEqual(times.map(t => t.phase), phases);
      const databaseClose = Array.from(output.matchAll(/PEAR_NATIVE_FIXTURE_CLOSE:database-closed elapsedMs=\d+\.\d{3} databaseCloseMs=(\d+\.\d{3})/g));
      assert.equal(databaseClose.length, 1);
      const databaseCloseMs = Number(databaseClose[0][1]);
      assert.ok(Number.isFinite(databaseCloseMs) && databaseCloseMs >= 0 && databaseCloseMs <= times[4].elapsed - times[3].elapsed + 0.002, 'Direct database close excludes preceding phase write overhead');
      assert.ok(times.every((t, i) => Number.isFinite(t.elapsed) && t.elapsed >= (times[i - 1]?.elapsed ?? 0) && t.elapsed < 5000), 'Complete monotonic cleanup timings within the existing deadline');
    }
  } finally {pending?.destroy(); if (!exited) {child.kill('SIGKILL'); await exit;}}
});
