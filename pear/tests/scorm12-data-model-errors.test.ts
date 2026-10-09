import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm12API from 'scorm-again/scorm12';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';

for (const facade of [false, true]) test('1.2 ' + (facade ? 'content facade' : 'shared engine') + ': invalid CMI names use 201; outside models and typed access retain distinct errors', () => {
  const api: any = facade ? createSCORM12API() : new Scorm12API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false});
  assert.equal(api.LMSInitialize(''), 'true');
  assert.equal(api.LMSSetValue('cmi.core.lesson_location', 'Original'), 'true');
  for (const key of ['cmi.core.zip_code', 'cmi.core.score.zip_code', 'cmi.unknown', 'cmi.objectives.0.zip_code']) {
    assert.equal(api.LMSGetValue(key), ''); assert.equal(api.LMSGetLastError(), '201', key);
    assert.equal(api.LMSSetValue(key, 'forged'), 'false'); assert.equal(api.LMSGetLastError(), '201', key);
    assert.equal(api.LMSGetValue('cmi.objectives._count'), '0'); assert.equal(api.LMSGetValue('cmi.core.lesson_location'), 'Original');
  }
  for (const key of ['xyz.score.result', 'other.field']) {assert.equal(api.LMSGetValue(key), ''); assert.equal(api.LMSGetLastError(), '401'); assert.equal(api.LMSSetValue(key, 'forged'), 'false'); assert.equal(api.LMSGetLastError(), '401');}
  assert.equal(api.LMSSetValue('cmi.core.student_id', 'forged'), 'false'); assert.equal(api.LMSGetLastError(), '403');
  assert.equal(api.LMSGetValue('cmi.core.exit'), ''); assert.equal(api.LMSGetLastError(), '404');
  assert.equal(api.LMSGetValue('cmi.core.student_id._children'), ''); assert.equal(api.LMSGetLastError(), '202');
  assert.equal(api.LMSGetValue('cmi.core._count'), ''); assert.equal(api.LMSGetLastError(), '203');
  assert.equal(api.LMSSetValue('cmi.core._children', 'forged'), 'false'); assert.equal(api.LMSGetLastError(), '402');
  assert.equal(api.LMSSetValue('cmi.core.lesson_location', 'Recovered'), 'true'); assert.equal(api.LMSGetLastError(), '0');
});

test('1.2: invalid CMI refusal is atomic through bound checkpoint, exact receipts and resume', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('1.2', singleSCOManifest('1.2')));
  try {
    const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let saved: any;
    const api = createSCORM12API({state: b.state, checkpoint(value) {saved = value;}}); api.LMSInitialize('');
    for (const key of ['cmi.core.zip_code', 'cmi.objectives.0.zip_code']) {assert.equal(api.LMSSetValue(key, 'forged'), 'false'); assert.equal(api.LMSGetLastError(), '201');}
    api.LMSSetValue('cmi.core.lesson_location', 'Original'); api.LMSCommit('');
    const request = {sequence: 1, revision: b.revision, state: saved, finished: false}, receipt = f.player.checkpoint(launch.token, request);
    assert.deepEqual(f.player.checkpoint(launch.token, request), receipt); assert.equal(f.player.bootstrap(launch.token).state.core.lesson_location, 'Original');
    assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});
