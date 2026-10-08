import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

const rejected = [
  ['cmi.comments_from_learner.0.timestamp', '2026-02-29', '406'],
  ['cmi.comments_from_learner.0.location', 'x'.repeat(251), '406'],
  ['cmi.comments_from_learner.0.unknown', 'x', '401'],
  ['cmi.interactions.0.timestamp', '2026', '408'],
  ['cmi.interactions.0.id', 'bad%', '406'],
  ['cmi.interactions.0.type', 'choice', '408'],
  ['cmi.interactions.0.correct_responses.0.pattern', 'a', '408'],
  ['cmi.objectives.0.score.scaled', '2', '407'],
  ['cmi.objectives.0.id', 'bad%', '406'],
  ['cmi.objectives.0.unknown', 'x', '401'],
] as const;

test('shared 2004 rollback preserves errors and state without Array.prototype.toReversed', () => {
  const engine = new Scorm2004API({logLevel: 'NONE'}); engine.Initialize('');
  const before = structuredClone(engine.renderCMIToJSONObject().cmi);
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'toReversed')!;
  try {
    Object.defineProperty(Array.prototype, 'toReversed', {value: undefined});
    for (const [key, value, error] of rejected) {
      assert.equal(engine.SetValue(key, value), 'false'); assert.equal(engine.GetLastError(), error, key);
      assert.deepEqual(engine.renderCMIToJSONObject().cmi, before, key);
    }
    assert.equal(engine.SetValue('cmi.interactions.0.id', 'urn:pear:q'), 'true');
  } finally {Object.defineProperty(Array.prototype, 'toReversed', descriptor);}
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': rejected first collection writes preserve the entire CMI state and exact error', () => {
    for (const [key, value, error] of rejected) {
      let state: any;
      const api = createSCORM2004API({edition, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true'); assert.equal(api.Commit(''), 'true');
      const before = structuredClone(state);
      assert.equal(api.SetValue(key, value), 'false', key); assert.equal(api.GetLastError(), error, key);
      for (const collection of ['comments_from_learner', 'interactions', 'objectives']) assert.equal(api.GetValue('cmi.' + collection + '._count'), '0', key);
      assert.equal(api.Commit(''), 'true'); assert.deepEqual(state, before, key);
    }
  });

  test(edition + ': existing records and nested collection counts survive failed append, duplicates and retry', () => {
    const engine = new Scorm2004API({logLevel: 'NONE'});
    engine.loadFromJSON({comments_from_learner: {0: {comment: 'Original'}}, interactions: {0: {id: 'urn:pear:q', type: 'choice'}}, objectives: {0: {id: 'urn:pear:o', score: {scaled: '0.5'}}}});
    assert.equal(engine.Initialize(''), 'true');
    const before = structuredClone(engine.renderCMIToJSONObject().cmi);
    for (const [key, value, error] of [
      ['cmi.comments_from_learner.1.timestamp', '2026-02-29', '406'],
      ['cmi.interactions.1.id', 'bad%', '406'],
      ['cmi.objectives.1.id', 'urn:pear:o', '351'],
      ['cmi.interactions.0.correct_responses.0.pattern', 'a[,]a', '406'],
      ['cmi.interactions.0.objectives.0.id', 'bad%', '406'],
      ['cmi.interactions.0.objectives.0.unknown', 'x', '401'],
      ['cmi.objectives.0.score.scaled', '2', '407'],
    ]) {
      for (let retry = 0; retry < 2; retry++) {
        assert.equal(engine.SetValue(key, value), 'false', key); assert.equal(engine.GetLastError(), error, key);
        assert.deepEqual(engine.renderCMIToJSONObject().cmi, before, key);
      }
    }
    for (const [key, value] of [['cmi.comments_from_learner.1.timestamp', '2026'], ['cmi.interactions.1.id', 'urn:pear:q:next'], ['cmi.objectives.1.id', 'urn:pear:o:next'], ['cmi.interactions.0.correct_responses.0.pattern', 'a'], ['cmi.interactions.0.objectives.0.id', 'urn:pear:nested']]) assert.equal(engine.SetValue(key, value), 'true', key);
    for (const collection of ['comments_from_learner', 'interactions', 'objectives']) assert.equal(engine.GetValue('cmi.' + collection + '._count'), '2');
    for (const collection of ['objectives', 'correct_responses']) assert.equal(engine.GetValue('cmi.interactions.0.' + collection + '._count'), '1');
  });

  test(edition + ': trusted preload refuses invalid append without retaining an empty record', () => {
    const engine = new Scorm2004API({logLevel: 'NONE'});
    engine.loadFromJSON({comments_from_learner: {0: {comment: 'Original'}}});
    const before = structuredClone(engine.renderCMIToJSONObject().cmi);
    assert.throws(() => engine.loadFromJSON({comments_from_learner: {1: {timestamp: '2026-02-29'}}}), /Type Mismatch/);
    assert.deepEqual(engine.renderCMIToJSONObject().cmi, before);
    engine.loadFromJSON({comments_from_learner: {1: {timestamp: '2026'}}});
    assert.equal(engine.Initialize(''), 'true'); assert.equal(engine.GetValue('cmi.comments_from_learner._count'), '2');
  });

  test(edition + ': checkpoints persist only successful records across exact receipt retry and resume', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding); let state: any;
      const api = createSCORM2004API({edition, state: f.player.bootstrap(launch.token).state, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true');
      for (const [key, value, error] of rejected) {assert.equal(api.SetValue(key, value), 'false'); assert.equal(api.GetLastError(), error);}
      assert.equal(api.SetValue('cmi.comments_from_learner.0.comment', 'Only successful comment'), 'true');
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: 0, state, finished: false};
      const receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
      const saved = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
      assert.deepEqual(saved.comments_from_learner, {0: {comment: 'Only successful comment', location: '', timestamp: ''}});
      assert.deepEqual(saved.interactions, {}); assert.deepEqual(saved.objectives, {});
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const resumed = createSCORM2004API({edition, state: f.player.bootstrap(f.launch(binding).token).state});
      assert.equal(resumed.Initialize(''), 'true'); assert.equal(resumed.GetValue('cmi.comments_from_learner._count'), '1');
      assert.equal(resumed.GetValue('cmi.interactions._count'), '0'); assert.equal(resumed.GetValue('cmi.objectives._count'), '0');
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
}
