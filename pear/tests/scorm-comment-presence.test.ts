import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

// Original RTE 4.2.2/4.2.3 vectors: creating a record does not initialize its siblings.
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': shared/facade partial comments distinguish missing fields from supplied empty values', () => {
    const state = {comments_from_lms: {0: {location: ''}}};
    const shared = new Scorm2004API({logLevel: 'NONE'}); shared.loadFromJSON(state);
    for (const api of [createSCORM2004API({edition, state}), shared]) {
      assert.equal(api.Initialize(''), 'true');
      assert.equal(api.SetValue('cmi.comments_from_learner.0.location', ''), 'true');
      for (const family of ['comments_from_learner', 'comments_from_lms']) {
        const prefix = 'cmi.' + family + '.0.';
        assert.equal(api.GetValue(prefix + 'location'), ''); assert.equal(api.GetLastError(), '0');
        for (const field of ['comment', 'timestamp']) {assert.equal(api.GetValue(prefix + field), ''); assert.equal(api.GetLastError(), '403', prefix + field);}
        assert.equal(api.GetValue('cmi.' + family + '.1.comment'), ''); assert.equal(api.GetLastError(), '301');
      }
      for (const [field, bad] of [['comment', '\ud800'], ['timestamp', '2000-02-30T12:00:00Z']]) {
        assert.equal(api.SetValue('cmi.comments_from_learner.0.' + field, bad), 'false'); assert.equal(api.GetLastError(), '406');
        assert.equal(api.GetValue('cmi.comments_from_learner.0.' + field), ''); assert.equal(api.GetLastError(), '403');
      }
      for (const field of ['comment', 'location', 'timestamp']) {assert.equal(api.SetValue('cmi.comments_from_lms.0.' + field, ''), 'false'); assert.equal(api.GetLastError(), '404');}
      assert.equal(api.SetValue('cmi.comments_from_learner.0.comment', ''), 'true');
      assert.equal(api.GetValue('cmi.comments_from_learner.0.comment'), ''); assert.equal(api.GetLastError(), '0');
      assert.equal(api.SetValue('cmi.comments_from_learner.1.timestamp', '2000-02-29T12:00:00.00Z'), 'true');
      for (const field of ['comment', 'location']) {assert.equal(api.GetValue('cmi.comments_from_learner.1.' + field), ''); assert.equal(api.GetLastError(), '403');}
      assert.equal(api.GetValue('cmi.comments_from_learner._count'), '2'); assert.equal(api.GetValue('cmi.comments_from_lms._count'), '1');
    }
  });
  test(edition + ': omitted comment fields survive typed replay, exact retry and close/resume without rewriting explicit blanks', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); assert.equal(api.Initialize(''), 'true');
      assert.equal(api.SetValue('cmi.comments_from_learner.0.comment', ''), 'true'); assert.equal(api.SetValue('cmi.comments_from_learner.1.location', ''), 'true'); assert.equal(api.SetValue('cmi.comments_from_learner.2.timestamp', '2000-02-29T12:00:00.00Z'), 'true');
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      assert.deepEqual(state.comments_from_learner, {0: {comment: ''}, 1: {location: ''}, 2: {timestamp: '2000-02-29T12:00:00.00Z'}});
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const forged = structuredClone(state); forged.comments_from_learner[0].timestamp = '2000-02-30T12:00:00Z'; assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /data model|quota/);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string); assert.deepEqual(stored.comments_from_learner, state.comments_from_learner);
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const next = f.launch(binding), resumed = createSCORM2004API({edition, state: f.player.bootstrap(next.token).state}); assert.equal(resumed.Initialize(''), 'true');
      for (const [row, supplied] of [[0, 'comment'], [1, 'location'], [2, 'timestamp']] as const) for (const field of ['comment', 'location', 'timestamp']) {
        assert.equal(resumed.GetValue('cmi.comments_from_learner.' + row + '.' + field), field === supplied && field === 'timestamp' ? '2000-02-29T12:00:00.00Z' : ''); assert.equal(resumed.GetLastError(), field === supplied ? '0' : '403');
      }
      assert.equal(resumed.GetValue('cmi.comments_from_learner._count'), '3');
    } finally {f.db.close();}
  });
}
