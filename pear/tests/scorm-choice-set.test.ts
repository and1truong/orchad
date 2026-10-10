import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

// ADL RTE4.2.9.1: choice patterns are unique sets; order is insignificant.
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': shared/facade choice sets reject reordered duplicates on append and replacement without normalizing authored order', () => {
    for (const api of [createSCORM2004API({edition}), new Scorm2004API({logLevel: 'NONE'})]) {
      assert.equal(api.Initialize(''), 'true'); api.SetValue('cmi.interactions.0.id', 'urn:pear:choice'); api.SetValue('cmi.interactions.0.type', 'choice');
      const base = 'cmi.interactions.0.correct_responses.', first = base + '0.pattern', second = base + '1.pattern';
      assert.equal(api.SetValue(first, 'answer,one[,]answer%2Ctwo'), 'true');
      assert.equal(api.SetValue(second, 'answer%2Ctwo[,]answer,one'), 'false'); assert.equal(api.GetLastError(), '351'); assert.equal(api.GetValue(base + '_count'), '1'); assert.equal(api.GetValue(first), 'answer,one[,]answer%2Ctwo');
      assert.equal(api.SetValue(second, 'different'), 'true');
      for (const duplicate of ['answer,one[,]answer%2Ctwo', 'answer%2Ctwo[,]answer,one']) {assert.equal(api.SetValue(second, duplicate), 'false'); assert.equal(api.GetLastError(), '351'); assert.equal(api.GetValue(second), 'different'); assert.equal(api.GetValue(base + '_count'), '2');}
      assert.equal(api.SetValue(first, 'answer%2Ctwo[,]answer,one'), 'true'); assert.equal(api.GetValue(first), 'answer%2Ctwo[,]answer,one');
      assert.equal(api.SetValue(second, 'answer,one[,]answer,one'), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(second), 'different');
      assert.equal(api.SetValue(base + '2.pattern', ''), 'true'); assert.equal(api.SetValue(base + '3.pattern', ''), 'false'); assert.equal(api.GetLastError(), '351'); assert.equal(api.GetValue(base + '_count'), '3');
      api.SetValue('cmi.interactions.1.id', 'urn:pear:matching'); api.SetValue('cmi.interactions.1.type', 'matching');
      for (const n of [0, 1]) assert.equal(api.SetValue('cmi.interactions.1.correct_responses.' + n + '.pattern', 'a[.]b[,]a[.]b'), 'true');
    }
    const state = {interactions: {0: {id: 'urn:pear:choice', type: 'choice', correct_responses: {0: {pattern: 'a[,]b'}, 1: {pattern: 'b[,]a'}}}}};
    assert.throws(() => createSCORM2004API({edition, state}), /./);
    assert.throws(() => new Scorm2004API({logLevel: 'NONE'}).loadFromJSON(state), /./);
  });
  test(edition + ': typed replay rejects reordered duplicate sets atomically and resumes exact legal order after ACK/retry', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); api.Initialize(''); api.SetValue('cmi.interactions.0.id', 'urn:pear:choice'); api.SetValue('cmi.interactions.0.type', 'choice');
      assert.equal(api.SetValue('cmi.interactions.0.correct_responses.0.pattern', 'b[,]a'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.correct_responses.1.pattern', 'c'), 'true'); assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      for (const n of [1, 2]) {const forged = structuredClone(state); forged.interactions[0].correct_responses[n] = {pattern: 'a[,]b'}; assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /data model/);}
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const resumed = f.player.bootstrap(f.launch(binding).token);
      assert.equal(resumed.state.interactions[0].correct_responses[0].pattern, 'b[,]a'); assert.equal(resumed.state.interactions[0].correct_responses[1].pattern, 'c'); assert.equal(Object.keys(resumed.state.interactions[0].correct_responses).length, 2);
    } finally {f.db.close();}
  });
}
