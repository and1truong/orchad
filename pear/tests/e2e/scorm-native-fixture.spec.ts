import {test, expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Browser preflight verifies the native fixture driver itself. Real native evidence
// comes only from coconut/scripts/native-scorm-acceptance.mjs under Tauri/WebKit.
test('native SCORM fixture driver performs built UI save/reopen/finish before native CI', async ({page}) => {
  const nonce = randomUUID(), prefix = 'http://127.0.0.1:4310/native-scorm/' + nonce;
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/native-scorm-fixture.ts'], {env: {...process.env, PEAR_NATIVE_NONCE: nonce}, stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '', exited: number | null = null;
  child.stdout.on('data', chunk => {stdout += chunk;}); child.stderr.on('data', chunk => {stderr += chunk;}); child.on('exit', code => {exited = code;});
  const state = async () => {const response = await fetch(prefix + '/state'); expect(response.ok).toBe(true); return response.json();};
  try {
    await expect.poll(() => {if (exited !== null) throw Error(stderr.slice(-1000)); return stdout.includes('PEAR_NATIVE_FIXTURE_READY');}).toBe(true);
    await page.goto(prefix + '/bootstrap/learner-a');
    await expect.poll(async () => {const value = await state(); expect(value.driverErrors).toEqual([]); return value.probes.length >= 1 && value.checkpoints >= 1;}).toBe(true);
    const first = await state(); expect(first.proofs).toBe(0); expect(first.calls).toEqual([]); expect(first.probes[0].entry).toBe('ab-initio');
    await fetch(prefix + '/command', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'resume'})});
    await expect.poll(async () => {const value = await state(); expect(value.driverErrors).toEqual([]); return value.probes.length >= 2 && value.checkpoints >= 2;}).toBe(true);
    const second = await state(); expect(second.probes[1].entry).toBe('resume'); expect(second.probes[1].bookmark).toBe('licensed-page');
    await fetch(prefix + '/command', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'finish'})});
    await expect.poll(async () => (await state()).proofs).toBe(1); expect((await state()).certificates).toBe(0);
  } finally {
    await page.close(); child.kill('SIGTERM');
    if (exited === null) await new Promise<void>(resolve => {const timer = setTimeout(() => {child.kill('SIGKILL'); resolve();}, 5000); child.once('exit', () => {clearTimeout(timer); resolve();});});
  }
});
