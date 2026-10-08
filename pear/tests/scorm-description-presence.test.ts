import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': objective/interaction descriptions retain omitted and explicit empty presence through shared preload', () => {
    for (const api of [new Scorm2004API({logLevel: 'NONE'}), createSCORM2004API({edition})]) {
      assert.equal(api.Initialize(''), 'true');
      for (const family of ['objectives', 'interactions']) {
        const key = 'cmi.' + family + '.0.description';
        assert.equal(api.SetValue(key, ''), 'false'); assert.equal(api.GetLastError(), '408'); assert.equal(api.GetValue('cmi.' + family + '._count'), '0');
        assert.equal(api.SetValue('cmi.' + family + '.0.id', 'urn:pear:original'), 'true');
        assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '403');
        assert.equal(api.SetValue(key, '\ud800'), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '403');
        assert.equal(api.SetValue(key, ''), 'true'); assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '0');
        assert.equal(api.SetValue('cmi.' + family + '.1.id', 'urn:pear:unset'), 'true');
      }
    }
    const seed = {objectives: {0: {id: 'urn:pear:blank', description: ''}, 1: {id: 'urn:pear:unset'}}, interactions: {0: {id: 'urn:pear:blank', description: ''}, 1: {id: 'urn:pear:unset'}}};
    const shared = new Scorm2004API({logLevel: 'NONE'}); shared.loadFromJSON(seed);
    for (const api of [shared, createSCORM2004API({edition, state: seed})]) {
      assert.equal(api.Initialize(''), 'true');
      for (const family of ['objectives', 'interactions']) for (const row of [0, 1, 2]) {
        assert.equal(api.GetValue('cmi.' + family + '.' + row + '.description'), ''); assert.equal(api.GetLastError(), row === 0 ? '0' : row === 1 ? '403' : '301');
      }
    }
  });
  test(edition + ': description omission and supplied blanks persist through typed ACK/retry/close/resume with atomic refusal', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); assert.equal(api.Initialize(''), 'true');
      for (const family of ['objectives', 'interactions']) {
        assert.equal(api.SetValue('cmi.' + family + '.0.id', 'urn:pear:blank'), 'true'); assert.equal(api.SetValue('cmi.' + family + '.0.description', ''), 'true'); assert.equal(api.SetValue('cmi.' + family + '.1.id', 'urn:pear:unset'), 'true');
      }
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      for (const family of ['objectives', 'interactions']) {assert.equal(state[family][0].description, ''); assert.equal(Object.hasOwn(state[family][1], 'description'), false);}
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      for (const family of ['objectives', 'interactions']) {const forged = structuredClone(state); forged[family][1].description = '\ud800'; assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /data model|quota/);}
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
      for (const family of ['objectives', 'interactions']) {assert.equal(stored[family][0].description, ''); assert.equal(Object.hasOwn(stored[family][1], 'description'), false);}
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const resumed = createSCORM2004API({edition, state: f.player.bootstrap(f.launch(binding).token).state}); assert.equal(resumed.Initialize(''), 'true');
      for (const family of ['objectives', 'interactions']) for (const row of [0, 1]) {assert.equal(resumed.GetValue('cmi.' + family + '.' + row + '.description'), ''); assert.equal(resumed.GetLastError(), row === 0 ? '0' : '403');}
    } finally {f.db.close();}
  });
}
