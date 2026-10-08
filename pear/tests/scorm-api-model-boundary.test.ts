import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) {
  const old = edition === '1.2', identity = old ? 'cmi.core.student_id' : 'cmi.learner_id', location = old ? 'cmi.core.lesson_location' : 'cmi.location';
  const state = old ? {core: {student_id: 'trusted'}} : {learner_id: 'trusted'};
  const forbidden = ['cmi.initialized', 'cmi.jsonString', 'cmi.start_time', old ? 'cmi.core.initialized' : 'cmi.score.initialized', old ? 'cmi.core.jsonString' : 'cmi.score.jsonString', 'cmi', 'settings', '_settings.lmsCommitUrl', 'renderCMIToJSONObject', 'cmi.initialize', 'cmi.reset', 'cmi.toJSON', 'cmi.constructor', 'cmi.__proto__', 'cmi._initialized', 'cmi.score', 'cmi.objectives', 'cmi.interactions', old ? 'cmi.core' : 'adl', old ? 'cmi.core.score' : 'adl.nav', old ? 'cmi.core._student_id' : 'cmi.student_data._learner_id', old ? 'cmi.core.score._max' : 'cmi.score._scaled'];

  test(edition + ': GetValue exposes scalar model elements only; helpers/categories/private backing fields stay unreachable', () => {
    const api: any = old ? createSCORM12API({state}) : createSCORM2004API({edition, state});
    const init = old ? 'LMSInitialize' : 'Initialize', get = old ? 'LMSGetValue' : 'GetValue', error = old ? 'LMSGetLastError' : 'GetLastError';
    assert.equal(api[init](''), 'true');
    for (const key of forbidden) {assert.equal(api[get](key), '', key); assert.equal(api[error](), old && (key === 'cmi' || key.startsWith('cmi.')) ? '201' : '401', key);}
    assert.equal(api[get](identity), 'trusted'); assert.equal(api[error](), '0');
    assert.equal(api[get]('cmi.objectives._count'), '0'); assert.equal(api[error](), '0');
    assert.equal(typeof api[get](old ? 'cmi.core._children' : 'cmi._version'), 'string'); assert.equal(api[error](), '0');
  });

  test(edition + ': SetValue cannot replace engine/model objects, methods or private fields; public setters remain usable', () => {
    let saved: any; const checkpoint = (value: any) => {saved = value;};
    const api: any = old ? createSCORM12API({state, checkpoint}) : createSCORM2004API({edition, state, checkpoint});
    const init = old ? 'LMSInitialize' : 'Initialize', set = old ? 'LMSSetValue' : 'SetValue', get = old ? 'LMSGetValue' : 'GetValue', commit = old ? 'LMSCommit' : 'Commit', error = old ? 'LMSGetLastError' : 'GetLastError';
    api[init](''); api[set](location, 'original'); api[commit](''); const before = structuredClone(saved);
    for (const key of forbidden) {assert.equal(api[set](key, 'forged'), 'false', key); assert.equal(api[error](), old && (key === 'cmi' || key.startsWith('cmi.')) ? '201' : '401', key);}
    assert.equal(api[get](identity), 'trusted'); assert.equal(api[commit](''), 'true'); assert.deepEqual(saved, before);
    assert.equal(api[set](old ? 'cmi.core.session_time' : 'cmi.session_time', old ? '00:00:01' : 'PT1S'), 'true');
    assert.equal(api[set]('cmi.objectives.0.id', 'urn:pear:valid'), 'true'); assert.equal(api[set]('cmi.objectives.0.score.raw', '50'), 'true');
    assert.equal(api[set](identity, 'forged'), 'false'); assert.equal(api[error](), old ? '403' : '404'); assert.equal(api[get](identity), 'trusted');
    assert.equal(api[commit](''), 'true'); assert.equal(saved.objectives[0].score.raw, '50');
  });

  test(edition + ': denied private writes do not alter bound identity/state; forged backing-field checkpoints remain atomic', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let saved: any;
      const options = {state: b.state, checkpoint(value: any) {saved = value;}};
      const api: any = old ? createSCORM12API(options) : createSCORM2004API({...options, edition});
      const init = old ? 'LMSInitialize' : 'Initialize', set = old ? 'LMSSetValue' : 'SetValue', commit = old ? 'LMSCommit' : 'Commit';
      api[init](''); assert.equal(api[set](old ? 'cmi.core._student_id' : 'cmi.score._scaled', 'forged'), 'false'); assert.equal(api[commit](''), 'true');
      const request = {sequence: 1, revision: b.revision, state: saved, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const forged = structuredClone(saved); if (old) forged.core._student_id = 'forged'; else forged.score._scaled = 'forged';
      assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /Unsupported|Unknown/);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1);
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
}
