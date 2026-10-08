import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

for (const edition of ['pear', '1.2', '2004-2', '2004-3', '2004-4']) test('real native fixture graceful IPC cleanup: ' + edition, async () => {
  const nonce = randomUUID(), scorm = edition !== 'pear';
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/' + (scorm ? 'native-scorm-fixture.ts' : 'native-fixture.ts')], {cwd: process.cwd(), env: {...process.env, PEAR_NATIVE_NONCE: nonce, PEAR_NATIVE_SCORM_EDITION: edition}, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  let output = '', errors = '', exited = false;
  child.stdout!.on('data', value => output += value); child.stderr!.on('data', value => errors += value);
  const exit = new Promise<number | null>((resolve, reject) => {child.once('error', reject); child.once('exit', code => {exited = true; resolve(code);});});
  try {
    const deadline = Date.now() + 30000;
    while (!output.includes('PEAR_NATIVE_FIXTURE_READY')) {assert.ok(!exited && Date.now() < deadline, errors); await sleep(50);}
    const response = await fetch('http://127.0.0.1:4310/' + (scorm ? 'native-scorm' : 'native-fixture') + '/' + nonce + '/state');
    assert.equal(response.status, 200); const state = await response.json();
    if (scorm) {assert.equal(state.edition, edition); assert.equal(state.proofs, 0); assert.equal(state.checkpoints, 0);} else assert.deepEqual(state.enrollments, []);
    child.send({kind: 'close'});
    const deadlineExit = Date.now() + 5000;
    while (!exited && Date.now() < deadlineExit) await sleep(50);
    assert.ok(exited, 'IPC close did not finish'); assert.equal(await exit, 0, errors);
  } finally {if (!exited) {child.kill('SIGKILL'); await exit;}}
});
