import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import Scorm12API from 'scorm-again/scorm12';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

const invalidIndices = ['0junk', '0e1', '0x0', '0 ', '0\n', '0\r', '0\u2028', '0\u2029', '+0', '-0', ' 0', '0,0'];
const state = {comments_from_learner: {0: {comment: 'Original'}}, objectives: {0: {id: 'urn:pear:o', score: {raw: '50'}}}, interactions: {0: {id: 'urn:pear:q', type: 'choice', correct_responses: {0: {pattern: 'a'}}, objectives: {0: {id: 'urn:pear:nested'}}}}};

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': malformed full indices cannot read or overwrite top-level or nested records', () => {
    const engine = new Scorm2004API({logLevel: 'NONE'}); engine.loadFromJSON(state); engine.Initialize('');
    const before = structuredClone(engine.renderCMIToJSONObject().cmi);
    for (const index of invalidIndices) for (const [key, value] of [
      [`cmi.comments_from_learner.${index}.comment`, 'replacement'],
      [`cmi.objectives.${index}.score.raw`, '75'],
      [`cmi.interactions.${index}.learner_response`, 'b'],
      [`cmi.interactions.0.correct_responses.${index}.pattern`, 'b'],
      [`cmi.interactions.0.objectives.${index}.id`, 'urn:pear:replacement'],
    ]) {
      assert.equal(engine.GetValue(key), '', key); assert.equal(engine.GetLastError(), '401', key);
      assert.equal(engine.SetValue(key, value), 'false', key); assert.equal(engine.GetLastError(), '401', key);
      assert.deepEqual(engine.renderCMIToJSONObject().cmi, before, key);
    }
    assert.equal(engine.SetValue('cmi.objectives.0.score.raw', '75'), 'true'); assert.equal(engine.GetValue('cmi.objectives.0.score.raw'), '75');
    assert.equal(engine.SetValue('cmi.comments_from_learner.1.comment', 'Next'), 'true'); assert.equal(engine.GetValue('cmi.comments_from_learner._count'), '2');
    assert.equal(engine.SetValue('cmi.comments_from_learner.3.comment', 'Gap'), 'false'); assert.equal(engine.GetLastError(), '351');
    assert.equal(engine.SetValue('cmi.comments_from_learner._count', '5'), 'false'); assert.equal(engine.GetLastError(), '404');
  });

  test(edition + ': exact decimal and large out-of-capacity indices keep packed-array behavior', () => {
    const api = createSCORM2004API({edition}); api.Initialize('');
    assert.equal(api.SetValue('cmi.comments_from_learner.0.comment', 'Original'), 'true');
    assert.equal(api.GetValue('cmi.comments_from_learner.00.comment'), 'Original');
    for (const index of ['2', '9007199254740993', '9'.repeat(400)]) {
      assert.equal(api.SetValue('cmi.comments_from_learner.' + index + '.comment', 'Gap'), 'false'); assert.equal(api.GetLastError(), '351');
      assert.equal(api.GetValue('cmi.comments_from_learner._count'), '1');
    }
  });

  test(edition + ': malformed-index refusal preserves bound checkpoints, retry and resumed records', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding); let saved: any;
      const api = createSCORM2004API({edition, state: f.player.bootstrap(launch.token).state, checkpoint(value) {saved = value;}});
      api.Initialize(''); api.SetValue('cmi.comments_from_learner.0.comment', 'Original'); api.SetValue('cmi.exit', 'suspend');
      for (const index of invalidIndices) {assert.equal(api.SetValue('cmi.comments_from_learner.' + index + '.comment', 'Forged'), 'false'); assert.equal(api.GetLastError(), '401');}
      assert.equal(api.Commit(''), 'true'); const request = {sequence: 1, revision: 0, state: saved, finished: false};
      const receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
      assert.equal(stored.comments_from_learner[0].comment, 'Original'); assert.deepEqual(Object.keys(stored.comments_from_learner), ['0']);
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const resumed = createSCORM2004API({edition, state: f.player.bootstrap(f.launch(binding).token).state}); resumed.Initialize('');
      assert.equal(resumed.GetValue('cmi.comments_from_learner.0.comment'), 'Original'); assert.equal(resumed.GetValue('cmi.comments_from_learner._count'), '1');
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
}

test('1.2: malformed indices cannot alias readable objectives or write-only interactions', () => {
  const engine = new Scorm12API({logLevel: 'NONE'}); engine.LMSInitialize('');
  engine.LMSSetValue('cmi.objectives.0.id', 'urn:pear:o'); engine.LMSSetValue('cmi.objectives.0.score.raw', '50');
  engine.LMSSetValue('cmi.interactions.0.id', 'urn:pear:q'); engine.LMSSetValue('cmi.interactions.0.type', 'choice');
  const before = structuredClone(engine.renderCMIToJSONObject().cmi);
  for (const index of invalidIndices) for (const [key, value] of [[`cmi.objectives.${index}.score.raw`, '75'], [`cmi.interactions.${index}.type`, 'true-false']]) {
    assert.equal(engine.LMSSetValue(key, value), 'false', key); assert.equal(engine.LMSGetLastError(), '401', key);
    assert.deepEqual(engine.renderCMIToJSONObject().cmi, before, key);
    if (key.startsWith('cmi.objectives')) {assert.equal(engine.LMSGetValue(key), ''); assert.equal(engine.LMSGetLastError(), '401');}
  }
  assert.equal(engine.LMSSetValue('cmi.objectives.1.id', 'urn:pear:next'), 'true'); assert.equal(engine.LMSGetValue('cmi.objectives._count'), '2');
});

test('1.2: public facade preserves only valid objectives through malformed-index refusal and checkpoint/resume', () => {
  let saved: any;
  const api = createSCORM12API({checkpoint(value) {saved = value;}}); api.LMSInitialize(''); api.LMSSetValue('cmi.objectives.0.id', 'urn:pear:o'); api.LMSSetValue('cmi.objectives.0.score.raw', '50');
  for (const index of invalidIndices) {assert.equal(api.LMSSetValue('cmi.objectives.' + index + '.score.raw', '75'), 'false'); assert.equal(api.LMSGetLastError(), '401');}
  assert.equal(api.LMSCommit(''), 'true'); assert.equal(saved.objectives[0].score.raw, '50'); assert.deepEqual(Object.keys(saved.objectives), ['0']);
  const resumed = createSCORM12API({state: saved}); resumed.LMSInitialize(''); assert.equal(resumed.LMSGetValue('cmi.objectives.0.score.raw'), '50'); assert.equal(resumed.LMSGetValue('cmi.objectives._count'), '1');
});
