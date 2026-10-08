import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

export const lmsComment = {comment: 'Trusted original comment', location: 'Original LMS location', timestamp: '2000-02-29T12:30:59.25Z'};
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': preloaded LMS comments initialize read-only, including invalid-value precedence and absent records', () => {
    let writes = 0;
    const api = createSCORM2004API({edition, state: {comments_from_lms: {0: lmsComment}}, checkpoint() {writes++;}});
    assert.equal(api.SetValue('cmi.comments_from_lms.0.comment', 'forged'), 'false'); assert.equal(api.GetLastError(), '132');
    assert.equal(api.Initialize(''), 'true');
    for (const [field, original] of Object.entries(lmsComment)) {
      assert.equal(api.GetValue('cmi.comments_from_lms.0.' + field), original);
      for (const value of [original, 'forged', '', '\ud800', '2026-02-29']) {
        assert.equal(api.SetValue('cmi.comments_from_lms.0.' + field, value), 'false'); assert.equal(api.GetLastError(), '404');
        assert.equal(api.GetValue('cmi.comments_from_lms.0.' + field), original);
      }
      assert.equal(api.SetValue('cmi.comments_from_lms.1.' + field, original), 'false'); assert.equal(api.GetLastError(), '404'); assert.equal(api.GetValue('cmi.comments_from_lms._count'), '1');
    }
    assert.equal(writes, 0); assert.equal(api.Commit(''), 'true'); assert.equal(writes, 1);
    assert.equal(api.Terminate(''), 'true'); assert.equal(api.SetValue('cmi.comments_from_lms.0.comment', 'forged'), 'false'); assert.equal(api.GetLastError(), '133');
  });

  test(edition + ': initialized preloaded nested collections retain writable fields, exact patterns and immutable identifiers', () => {
    const engine = new Scorm2004API({logLevel: 'NONE'});
    engine.loadFromJSON({exit: 'suspend', comments_from_lms: {0: lmsComment}, comments_from_learner: {0: {comment: 'Original learner comment', timestamp: '2026'}}, interactions: {0: {id: 'urn:pear:q', type: 'choice', learner_response: 'a', objectives: {0: {id: 'urn:pear:o'}}, correct_responses: {0: {pattern: 'a'}}}}, objectives: {0: {id: 'urn:pear:o', description: 'Original', score: {scaled: '0.5'}}}});
    assert.equal(engine.Initialize(''), 'true');
    for (const [key, value] of [['cmi.comments_from_learner.0.comment', 'updated'], ['cmi.comments_from_learner.0.timestamp', '2026-10-08'], ['cmi.interactions.0.correct_responses.0.pattern', 'b'], ['cmi.interactions.0.learner_response', 'b'], ['cmi.objectives.0.score.scaled', '0.75'], ['cmi.objectives.0.description', 'updated']]) {
      assert.equal(engine.SetValue(key, value), 'true', key + ': ' + engine.GetDiagnostic('')); assert.equal(engine.GetValue(key), value);
    }
    for (const key of ['cmi.interactions.0.id', 'cmi.objectives.0.id']) {assert.equal(engine.SetValue(key, 'different'), 'false'); assert.equal(engine.GetLastError(), '351');}
    engine.reset(); engine.loadFromJSON({comments_from_lms: {0: lmsComment}}); assert.equal(engine.Initialize(''), 'true');
    assert.equal(engine.SetValue('cmi.comments_from_lms.0.comment', 'forged'), 'false'); assert.equal(engine.GetLastError(), '404');
  });

  test(edition + ': browser API and server replay preserve trusted LMS comments across ACK/retry and resume; forged readonly state is atomic', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding), initial = f.player.bootstrap(launch.token).state;
      initial.comments_from_lms = {0: lmsComment}; f.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?').run(JSON.stringify(initial));
      let state: any; const api = createSCORM2004API({edition, state: f.player.bootstrap(launch.token).state, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true'); assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true');
      assert.equal(api.SetValue('cmi.comments_from_learner.0.comment', 'Original own comment'), 'true');
      for (const [field, original] of Object.entries(lmsComment)) {
        assert.equal(api.SetValue('cmi.comments_from_lms.0.' + field, 'forged'), 'false'); assert.equal(api.GetLastError(), '404'); assert.equal(api.GetValue('cmi.comments_from_lms.0.' + field), original);
      }
      assert.equal(api.Commit(''), 'true'); const request = {sequence: 1, revision: 0, state, finished: false};
      const receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      for (const field of Object.keys(lmsComment)) {
        const forged = structuredClone(state); forged.comments_from_lms[0][field] = 'forged';
        assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: 1, state: forged}), /Server-owned CMI/);
        assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      }
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const next = f.launch(binding);
      const resumed = createSCORM2004API({edition, state: f.player.bootstrap(next.token).state}); assert.equal(resumed.Initialize(''), 'true');
      for (const [field, original] of Object.entries(lmsComment)) {assert.equal(resumed.SetValue('cmi.comments_from_lms.0.' + field, 'forged'), 'false'); assert.equal(resumed.GetLastError(), '404'); assert.equal(resumed.GetValue('cmi.comments_from_lms.0.' + field), original);}
    } finally {f.db.close();}
  });
}
