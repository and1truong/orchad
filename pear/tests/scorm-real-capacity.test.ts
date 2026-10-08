import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': interaction result requires its ID before append and retains zero records on refusal', () => {
    for (const api of [createSCORM2004API({edition}), new Scorm2004API({logLevel: 'NONE'})]) {
      assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue('cmi.interactions._count'), '0');
      assert.equal(api.SetValue('cmi.interactions.0.result', 'correct'), 'false'); assert.equal(api.GetLastError(), '408');
      assert.equal(api.GetValue('cmi.interactions._count'), '0');
      assert.equal(api.SetValue('cmi.interactions.0.id', 'urn:pear:result'), 'true');
      assert.equal(api.SetValue('cmi.interactions.0.result', 'correct'), 'true'); assert.equal(api.GetValue('cmi.interactions.0.result'), 'correct');
    }
  });
  test(edition + ': numeric response endpoints follow the shared real envelope and bracketed range binding', () => {
    for (const api of [createSCORM2004API({edition}), new Scorm2004API({logLevel: 'NONE'})]) {
      api.Initialize(''); api.SetValue('cmi.interactions.0.id', 'urn:pear:numeric'); api.SetValue('cmi.interactions.0.type', 'numeric');
      const learner = 'cmi.interactions.0.learner_response', pattern = 'cmi.interactions.0.correct_responses.0.pattern';
      assert.equal(api.SetValue(learner, '12345678901.125'), 'true');
      for (const bad of ['9'.repeat(309), '0'.repeat(4097)]) {assert.equal(api.SetValue(learner, bad), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(learner), '12345678901.125');}
      for (const value of ['[:]', '[:]12345678901.125', '-12345678901.125[:]', '-12345678901.125[:]12345678901.125']) {assert.equal(api.SetValue(pattern, value), 'true'); assert.equal(api.GetValue(pattern), value);}
      for (const bad of ['12345678901.125', '9'.repeat(309) + '[:]', '[:]' + '9'.repeat(309), '0'.repeat(4097) + '[:]']) {assert.equal(api.SetValue(pattern, bad), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(pattern), '-12345678901.125[:]12345678901.125'); assert.equal(api.GetValue('cmi.interactions.0.correct_responses._count'), '1');}
      assert.equal(api.SetValue('cmi.interactions.0.correct_responses.1.pattern', '1[:]2'), 'false'); assert.equal(api.GetLastError(), '351'); assert.equal(api.GetValue('cmi.interactions.0.correct_responses._count'), '1');
      api.SetValue('cmi.interactions.1.id', 'urn:pear:performance'); api.SetValue('cmi.interactions.1.type', 'performance');
      const step = 'cmi.interactions.1.correct_responses.0.pattern';
      for (const value of ['step[.] literal text ', 'step[.][:]', 'step[.]12345678901[:]12345678999.5']) {assert.equal(api.SetValue(step, value), 'true'); assert.equal(api.GetValue(step), value);}
      for (const bad of ['step[.]' + '9'.repeat(309) + '[:]', 'step[.][:]' + '9'.repeat(309)]) {assert.equal(api.SetValue(step, bad), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(step), 'step[.]12345678901[:]12345678999.5');}
    }
  });
  test(edition + ': real precision does not impose a ten-digit integral limit; typed ranges remain distinct', () => {
    const api = createSCORM2004API({edition}); assert.equal(api.Initialize(''), 'true');
    assert.equal(api.SetValue('cmi.objectives.0.id', 'urn:pear:wide-score'), 'true');
    assert.equal(api.SetValue('cmi.interactions.0.id', 'urn:pear:wide-weight'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.type', 'numeric'), 'true');
    for (const key of ['cmi.score.raw', 'cmi.score.min', 'cmi.score.max', 'cmi.objectives.0.score.raw', 'cmi.interactions.0.weighting', 'cmi.learner_preference.audio_level', 'cmi.learner_preference.delivery_speed', 'cmi.interactions.0.result', 'cmi.interactions.0.learner_response']) {
      assert.equal(api.SetValue(key, '12345678901.125'), 'true', key); assert.equal(api.GetLastError(), '0'); assert.equal(api.GetValue(key), '12345678901.125');
      for (const bad of ['9'.repeat(309), '12345678901junk', '12345678901\n']) {assert.equal(api.SetValue(key, bad), 'false', key); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(key), '12345678901.125');}
    }
    const capacity = '0'.repeat(4095) + '1'; assert.equal(api.SetValue('cmi.score.raw', capacity), 'true'); assert.equal(api.GetValue('cmi.score.raw'), capacity);
    assert.equal(api.SetValue('cmi.score.raw', '0' + capacity), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue('cmi.score.raw'), capacity);
    assert.equal(api.SetValue('cmi.interactions.0.result', capacity), 'true'); assert.equal(api.GetValue('cmi.interactions.0.result'), capacity);
    assert.equal(api.SetValue('cmi.interactions.0.learner_response', capacity), 'true'); assert.equal(api.GetValue('cmi.interactions.0.learner_response'), capacity);
    assert.equal(api.SetValue('cmi.interactions.0.result', '0' + capacity), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue('cmi.interactions.0.result'), capacity);
    for (const engine of [api, new Scorm2004API({logLevel: 'NONE'})]) {
      if (engine !== api) {engine.Initialize(''); engine.SetValue('cmi.interactions.0.id', 'urn:pear:result');}
      for (const value of ['10000', '-12345678901.125', 'correct', 'incorrect', 'unanticipated', 'neutral']) {assert.equal(engine.SetValue('cmi.interactions.0.result', value), 'true'); assert.equal(engine.GetValue('cmi.interactions.0.result'), value);}
      for (const bad of ['9'.repeat(309), 'NaN', 'Infinity', 'correct\n', '12345678901junk']) {assert.equal(engine.SetValue('cmi.interactions.0.result', bad), 'false'); assert.equal(engine.GetLastError(), '406'); assert.equal(engine.GetValue('cmi.interactions.0.result'), 'neutral');}
    }
    for (const key of ['cmi.learner_preference.audio_level', 'cmi.learner_preference.delivery_speed']) {assert.equal(api.SetValue(key, '-1'), 'false'); assert.equal(api.GetLastError(), '407');}
    assert.equal(api.SetValue('cmi.score.raw', '-12345678901.125'), 'true'); assert.equal(api.GetValue('cmi.score.raw'), '-12345678901.125');
    assert.equal(api.SetValue('cmi.score.scaled', '12345678901'), 'false'); assert.equal(api.GetLastError(), '407');
    assert.equal(api.SetValue('cmi.progress_measure', '12345678901'), 'false'); assert.equal(api.GetLastError(), '407');
  });
  test(edition + ': wide real scalars survive pre-init loading and cannot preload non-finite values', () => {
    const api = createSCORM2004API({edition, state: {score: {raw: '12345678901.125'}, interactions: {0: {id: 'urn:pear:result', type: 'numeric', result: '12345678901.125', learner_response: '12345678901.125', correct_responses: {0: {pattern: '12345678901.125[:]12345678999.5'}}}}}}); assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue('cmi.score.raw'), '12345678901.125'); assert.equal(api.GetValue('cmi.interactions.0.result'), '12345678901.125'); assert.equal(api.GetValue('cmi.interactions.0.learner_response'), '12345678901.125');
    for (const fields of [{learner_response: '9'.repeat(309)}, {correct_responses: {0: {pattern: '9'.repeat(309) + '[:]'}}}]) assert.throws(() => createSCORM2004API({edition, state: {interactions: {0: {id: 'urn:pear:numeric', type: 'numeric', ...fields}}}}), /./);
    assert.throws(() => createSCORM2004API({edition, state: {score: {raw: '9'.repeat(309)}}}), /./);
    assert.throws(() => createSCORM2004API({edition, state: {interactions: {0: {id: 'urn:pear:result', result: '9'.repeat(309)}}}}), /./);
  });
  test(edition + ': bound replay preserves wide real strings through exact receipts and refuses overflow atomically', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); api.Initialize('');
      assert.equal(api.SetValue('cmi.score.raw', '12345678901.125'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.id', 'urn:pear:result'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.type', 'numeric'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.result', '12345678901.125'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.learner_response', '12345678901.125'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.correct_responses.0.pattern', '12345678901.125[:]12345678999.5'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      assert.equal(f.player.bootstrap(launch.token).state.score.raw, '12345678901.125');
      assert.equal(f.player.bootstrap(launch.token).state.interactions[0].result, '12345678901.125');
      const forged = structuredClone(state); forged.score.raw = '9'.repeat(309);
      assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /rejected/);
      const badResult = structuredClone(state); badResult.interactions[0].result = '9'.repeat(309);
      assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: badResult}), /rejected/);
      for (const fields of [{learner_response: '9'.repeat(309)}, {correct_responses: {0: {pattern: '9'.repeat(309) + '[:]'}}}, {correct_responses: {0: {pattern: '12345678901.125'}}}]) {const forgedResponse = structuredClone(state); Object.assign(forgedResponse.interactions[0], fields); assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forgedResponse}), /./);}
      assert.equal(f.player.bootstrap(launch.token).state.interactions[0].learner_response, '12345678901.125');
      const missingId = structuredClone(state); missingId.interactions[1] = {result: 'correct'};
      assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: missingId}), /./);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
}
