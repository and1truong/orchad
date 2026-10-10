import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

// Original ADL RTE4.2.2/4.2.14 vectors: an empty opaque location is a value.
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': shared/facade empty locations clear values and restore supplied empties without weakening read-only or Unicode bounds', () => {
    for (const api of [createSCORM2004API({edition}), new Scorm2004API({logLevel: 'NONE'})]) {
      assert.equal(api.Initialize(''), 'true');
      assert.equal(api.GetValue('cmi.location'), ''); assert.equal(api.GetLastError(), '403');
      for (const [key, limit] of [['cmi.location', 1000], ['cmi.comments_from_learner.0.location', 250]] as const) {
        assert.equal(api.SetValue(key, 'Original location'), 'true');
        assert.equal(api.SetValue(key, ''), 'true', key); assert.equal(api.GetLastError(), '0');
        assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '0');
        for (const bad of ['🙂'.repeat(limit + 1), '\ud800']) {assert.equal(api.SetValue(key, bad), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '0');}
      }
      assert.equal(api.GetValue('cmi.comments_from_learner._count'), '1');
    }
    const state = {location: '', comments_from_learner: {0: {location: ''}}, comments_from_lms: {0: {comment: 'Trusted comment', location: ''}}};
    const shared = new Scorm2004API({logLevel: 'NONE'}); shared.loadFromJSON(state);
    for (const api of [createSCORM2004API({edition, state}), shared]) {
      assert.equal(api.Initialize(''), 'true');
      for (const key of ['cmi.location', 'cmi.comments_from_learner.0.location', 'cmi.comments_from_lms.0.location']) {assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '0', key);}
      assert.equal(api.GetValue('cmi.comments_from_learner._count'), '1');
      assert.equal(api.SetValue('cmi.comments_from_lms.0.location', ''), 'false'); assert.equal(api.GetLastError(), '404');
      assert.equal(api.SetValue('cmi.comments_from_lms.1.location', ''), 'false'); assert.equal(api.GetLastError(), '404'); assert.equal(api.GetValue('cmi.comments_from_lms._count'), '1');
    }
  });
  test(edition + ': cleared locations persist through typed replay, exact retry and close/resume; malformed replay preserves history', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); api.Initialize('');
      for (const key of ['cmi.location', 'cmi.comments_from_learner.0.location']) {assert.equal(api.SetValue(key, 'Original location'), 'true'); assert.equal(api.SetValue(key, ''), 'true');}
      assert.equal(api.SetValue('cmi.comments_from_learner.1.comment', ''), 'true');
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      for (const bad of ['🙂'.repeat(1001), '\ud800']) assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: {...state, location: bad}}), /data model|quota/);
      for (const bad of ['🙂'.repeat(251), '\ud800']) {const forged = structuredClone(state); forged.comments_from_learner[0].location = bad; assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /data model|quota/);}
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const next = f.launch(binding), resumed = createSCORM2004API({edition, state: f.player.bootstrap(next.token).state}); assert.equal(resumed.Initialize(''), 'true');
      for (const key of ['cmi.location', 'cmi.comments_from_learner.0.location']) {assert.equal(resumed.GetValue(key), ''); assert.equal(resumed.GetLastError(), '0', key);}
      assert.equal(resumed.GetValue('cmi.comments_from_learner._count'), '2'); assert.equal(resumed.GetValue('cmi.comments_from_learner.1.comment'), ''); assert.equal(resumed.GetLastError(), '0');
    } finally {f.db.close();}
  });
}
