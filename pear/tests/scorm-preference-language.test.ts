import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

const capacity = 'x' + '-abcdefgh'.repeat(27) + '-abcde', key = 'cmi.learner_preference.language';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': preference language preserves multiple subcodes/case/private capacity and refuses malformed tags atomically', () => {
    const api = createSCORM2004API({edition}); assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '0'); assert.equal(capacity.length, 250);
    for (const value of ['vi-VN-x-demo', 'en-Latn-US', 'i-klingon', 'x-a-b-c-d-e-f-g-h', 'VI-vn-X-DEMO', capacity]) {
      assert.equal(api.SetValue(key, value), 'true', value); assert.equal(api.GetLastError(), '0'); assert.equal(api.GetValue(key), value);
      assert.equal(api.SetValue('cmi.comments_from_learner.0.comment', '{lang=' + value + '}Original text'), 'true');
    }
    for (const bad of ['en--US', 'en-', '-en', '1en-US', 'en-abcdefghi', 'en_US', 'es-ñ', 'en\n', capacity + 'a']) {assert.equal(api.SetValue(key, bad), 'false', bad); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(key), capacity); assert.equal(api.GetLastError(), '0');}
    assert.throws(() => createSCORM2004API({edition, state: {learner_preference: {language: 'en--US'}}}), /./);
    const loaded = createSCORM2004API({edition, state: {learner_preference: {language: capacity}}}); assert.equal(loaded.Initialize(''), 'true'); assert.equal(loaded.GetValue(key), capacity);
    assert.equal(api.SetValue(key, ''), 'true'); assert.equal(api.GetValue(key), ''); assert.equal(api.GetLastError(), '0');
  });
  test(edition + ': bound replay retains private language capacity/case and exact receipts; malformed forged language cannot change history', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); api.Initialize(''); assert.equal(api.SetValue(key, capacity), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: b.revision, state, finished: false}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt); assert.equal(f.player.bootstrap(launch.token).state.learner_preference.language, capacity);
      const forged = structuredClone(state); forged.learner_preference.language = 'en--US'; assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: b.revision + 1, state: forged}), /rejected/);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, b.revision + 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
}
test('1.2 language remains its independent plain characterstring binding', () => {const api = createSCORM12API(); assert.equal(api.LMSInitialize(''), 'true'); assert.equal(api.LMSSetValue('cmi.student_preference.language', 'en--US'), 'true'); assert.equal(api.LMSGetValue('cmi.student_preference.language'), 'en--US');});
