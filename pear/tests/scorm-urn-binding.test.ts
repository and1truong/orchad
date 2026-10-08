import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {validURNs, invalidURNs} from './scorm-urn-vectors.ts';
import {validSchemeReferences, invalidSchemeReferences} from './scorm-uri-scheme-vectors.ts';
import {validFragmentReferences, invalidFragmentReferences} from './scorm-uri-fragment-vectors.ts';
const valid=[...validURNs,...validSchemeReferences,...validFragmentReferences],invalid=[...invalidURNs,...invalidSchemeReferences,...invalidFragmentReferences];
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': shared URN/scheme/relative-path binding retains exact case/escapes and refuses invalid typed records', () => {
    for (const facade of [false, true]) {
      let saved: any; const api: any = facade ? createSCORM2004API({edition, checkpoint(value) {saved = structuredClone(value);}}) : new Scorm2004API({logLevel: 'NONE'});
      assert.equal(api.Initialize(''), 'true');
      for (const [i, value] of valid.entries()) {
        const base = `cmi.interactions.${i}`;
        for (const key of [`cmi.objectives.${i}.id`, base + '.id', base + '.objectives.0.id']) assert.equal(api.SetValue(key, value), 'true', value);
        assert.equal(api.SetValue(base + '.type', 'likert'), 'true');
        for (const suffix of ['.learner_response', '.correct_responses.0.pattern']) {
          assert.equal(api.SetValue(base + suffix, value), 'true');
          for (const bad of invalid) {assert.equal(api.SetValue(base + suffix, bad), 'false', bad); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(base + suffix), value);}
        }
      }
      const snapshot = () => {if (!facade) return api.renderCMIToJSONObject().cmi; assert.equal(api.Commit(''), 'true'); return saved;};
      const before = structuredClone(snapshot());
      for (const bad of invalid) for (const key of [`cmi.objectives.${valid.length}.id`, `cmi.interactions.${valid.length}.id`, 'cmi.interactions.0.objectives.1.id']) {assert.equal(api.SetValue(key, bad), 'false', key + ': ' + bad); assert.equal(api.GetLastError(), '406');}
      assert.deepEqual(snapshot(), before);
    }
  });
  test(edition + ': forged and invalid legacy URI references fail atomically without changing accepted receipts/proof', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true'); assert.equal(api.SetValue('cmi.interactions.0.id', valid[1]), 'true');
      assert.equal(api.SetValue('cmi.interactions.0.type', 'likert'), 'true'); assert.equal(api.SetValue('cmi.interactions.0.learner_response', valid[1]), 'true');
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: 0, state, finished: false}, receipt = f.player.checkpoint(launch.token, request);
      for (const bad of invalid) {
        const forged = structuredClone(state); forged.interactions[0].learner_response = bad;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: 1, state: forged}), /data model/);
        const legacy = structuredClone(state); legacy.interactions[0].id = bad;
        assert.throws(() => createSCORM2004API({edition, state: legacy}), /Type Mismatch/);
        assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
        assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      }
    } finally {f.db.close();}
  });
}
