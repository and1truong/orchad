import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
const types = ['choice', 'matching', 'sequencing', 'performance', 'fill-in', 'long-fill-in', 'other'];
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': valid empty learner responses restore as supplied values while omitted responses remain uninitialized', () => {
    for (const api of [createSCORM2004API({edition}), new Scorm2004API({logLevel: 'NONE'})]) {
      assert.equal(api.Initialize(''), 'true');
      for (const [row, type] of types.entries()) {
        const key = 'cmi.interactions.' + row; assert.equal(api.SetValue(key + '.id', 'urn:pear:' + type), 'true'); assert.equal(api.SetValue(key + '.type', type), 'true');
        assert.equal(api.GetValue(key + '.learner_response'), ''); assert.equal(api.GetLastError(), '403');
        assert.equal(api.SetValue(key + '.learner_response', ''), 'true', type); assert.equal(api.GetValue(key + '.learner_response'), ''); assert.equal(api.GetLastError(), '0');
      }
    }
    const seed = {interactions: Object.fromEntries([...types.map((type, row) => [row, {learner_response: '', type, id: 'urn:pear:' + type}]), [types.length, {id: 'urn:pear:unset', type: 'choice'}]])};
    const shared = new Scorm2004API({logLevel: 'NONE'}); shared.loadFromJSON(seed);
    const legacy = new Scorm2004API({logLevel: 'NONE'});
    legacy.loadFromJSON({interactions: {0: {id: 'urn:pear:numeric', type: 'numeric', learner_response: ''}}});
    assert.equal(legacy.Initialize(''), 'true'); assert.equal(legacy.GetValue('cmi.interactions.0.learner_response'), ''); assert.equal(legacy.GetLastError(), '403');
    assert.equal(legacy.SetValue('cmi.interactions.0.learner_response', ''), 'false'); assert.equal(legacy.GetLastError(), '406');
    for (const api of [shared, createSCORM2004API({edition, state: seed})]) {
      assert.equal(api.Initialize(''), 'true');
      for (let row = 0; row <= types.length; row++) {assert.equal(api.GetValue('cmi.interactions.' + row + '.learner_response'), ''); assert.equal(api.GetLastError(), row === types.length ? '403' : '0');}
    }
  });
  test(edition + ': supplied zero-record responses and omitted response presence survive typed durable retry/resume', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); assert.equal(api.Initialize(''), 'true');
      for (const [row, type] of types.entries()) {const key = 'cmi.interactions.' + row; assert.equal(api.SetValue(key + '.id', 'urn:pear:' + type), 'true'); assert.equal(api.SetValue(key + '.type', type), 'true'); assert.equal(api.SetValue(key + '.learner_response', ''), 'true');}
      const missing = 'cmi.interactions.' + types.length; assert.equal(api.SetValue(missing + '.id', 'urn:pear:unset'), 'true'); assert.equal(api.SetValue(missing + '.type', 'choice'), 'true');
      assert.equal(api.SetValue(missing + '.learner_response', '\ud800'), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(missing + '.learner_response'), ''); assert.equal(api.GetLastError(), '403');
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true'); assert.equal(Object.hasOwn(state.interactions[types.length], 'learner_response'), false);
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const forged = structuredClone(state); forged.interactions[types.length].learner_response = '\ud800'; assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /data model|quota/);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string); assert.equal(Object.hasOwn(stored.interactions[types.length], 'learner_response'), false);
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const resumed = createSCORM2004API({edition, state: f.player.bootstrap(f.launch(binding).token).state}); assert.equal(resumed.Initialize(''), 'true');
      for (let row = 0; row <= types.length; row++) {assert.equal(resumed.GetValue('cmi.interactions.' + row + '.learner_response'), ''); assert.equal(resumed.GetLastError(), row === types.length ? '403' : '0');}
      assert.equal(resumed.GetValue('cmi.interactions._count'), String(types.length + 1));
    } finally {f.db.close();}
  });
}
