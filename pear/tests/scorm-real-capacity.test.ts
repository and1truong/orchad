import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': real precision does not impose a ten-digit integral limit; typed ranges remain distinct', () => {
    const api = createSCORM2004API({edition}); assert.equal(api.Initialize(''), 'true');
    assert.equal(api.SetValue('cmi.objectives.0.id', 'urn:pear:wide-score'), 'true');
    assert.equal(api.SetValue('cmi.interactions.0.id', 'urn:pear:wide-weight'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.type', 'other'), 'true');
    for (const key of ['cmi.score.raw', 'cmi.score.min', 'cmi.score.max', 'cmi.objectives.0.score.raw', 'cmi.interactions.0.weighting', 'cmi.learner_preference.audio_level', 'cmi.learner_preference.delivery_speed']) {
      assert.equal(api.SetValue(key, '12345678901.125'), 'true', key); assert.equal(api.GetLastError(), '0'); assert.equal(api.GetValue(key), '12345678901.125');
      for (const bad of ['9'.repeat(309), '12345678901junk', '12345678901\n']) {assert.equal(api.SetValue(key, bad), 'false', key); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(key), '12345678901.125');}
    }
    const capacity = '0'.repeat(4095) + '1'; assert.equal(api.SetValue('cmi.score.raw', capacity), 'true'); assert.equal(api.GetValue('cmi.score.raw'), capacity);
    assert.equal(api.SetValue('cmi.score.raw', '0' + capacity), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue('cmi.score.raw'), capacity);
    for (const key of ['cmi.learner_preference.audio_level', 'cmi.learner_preference.delivery_speed']) {assert.equal(api.SetValue(key, '-1'), 'false'); assert.equal(api.GetLastError(), '407');}
    assert.equal(api.SetValue('cmi.score.raw', '-12345678901.125'), 'true'); assert.equal(api.GetValue('cmi.score.raw'), '-12345678901.125');
    assert.equal(api.SetValue('cmi.score.scaled', '12345678901'), 'false'); assert.equal(api.GetLastError(), '407');
    assert.equal(api.SetValue('cmi.progress_measure', '12345678901'), 'false'); assert.equal(api.GetLastError(), '407');
  });
  test(edition + ': wide real scalars survive pre-init loading and cannot preload non-finite values', () => {
    const api = createSCORM2004API({edition, state: {score: {raw: '12345678901.125'}}}); assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue('cmi.score.raw'), '12345678901.125');
    assert.throws(() => createSCORM2004API({edition, state: {score: {raw: '9'.repeat(309)}}}), /./);
  });
  test(edition + ': bound replay preserves wide real strings through exact receipts and refuses overflow atomically', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); api.Initialize('');
      assert.equal(api.SetValue('cmi.score.raw', '12345678901.125'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      assert.equal(f.player.bootstrap(launch.token).state.score.raw, '12345678901.125');
      const forged = structuredClone(state); forged.score.raw = '9'.repeat(309);
      assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /rejected/);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
}
