import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {responseVectors} from './scorm-response-vectors.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': textual correct responses preserve values and reject malformed properties without changing records', () => {
    const api = createSCORM2004API({edition});
    assert.equal(api.Initialize(''), 'true');
    for (const [index, vector] of responseVectors.entries()) {
      const base = `cmi.interactions.${index}`;
      assert.equal(api.SetValue(base + '.id', 'urn:pear:response:' + index), 'true');
      assert.equal(api.SetValue(base + '.type', vector.type), 'true');
      for (const [patternIndex, pattern] of vector.patterns.entries()) {
        const key = base + `.correct_responses.${patternIndex}.pattern`;
        assert.equal(api.SetValue(key, pattern), 'true', pattern + ': ' + api.GetDiagnostic(''));
        assert.equal(api.GetValue(key), pattern);
      }
      const first = base + '.correct_responses.0.pattern', count = api.GetValue(base + '.correct_responses._count');
      for (const invalid of vector.invalid) {
        assert.equal(api.SetValue(first, invalid), 'false', invalid); assert.equal(api.GetLastError(), '406');
        assert.equal(api.GetValue(first), vector.patterns[0]);
        assert.equal(api.SetValue(base + `.correct_responses.${count}.pattern`, invalid), 'false');
        assert.equal(api.GetValue(base + '.correct_responses._count'), count);
      }
    }
    const key = 'cmi.interactions.0.correct_responses.0.pattern';
    const maximum = '{case_matters=true}{order_matters=false}' + Array(10).fill('{lang=vi-VN}' + '🙂'.repeat(250)).join('[,]');
    assert.equal(api.SetValue(key, maximum), 'true'); assert.equal(api.GetValue(key), maximum);
    assert.equal(api.SetValue(key, maximum + 'x'), 'false'); assert.equal(api.GetLastError(), '406');
    assert.equal(api.GetValue(key), maximum);
    assert.equal(api.SetValue('cmi.interactions.3.correct_responses.0.pattern', '{case_matters=invalid}bad'), 'false'); assert.equal(api.GetLastError(), '408');
  });

  test(edition + ': browser-equivalent state replays transactionally, retries exactly and resumes original response bytes', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding), bootstrap = f.player.bootstrap(launch.token);
      let state: any;
      const api = createSCORM2004API({edition, state: bootstrap.state, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true');
      for (const [index, vector] of responseVectors.entries()) {
        const base = `cmi.interactions.${index}`;
        assert.equal(api.SetValue(base + '.id', 'urn:pear:response:' + index), 'true'); assert.equal(api.SetValue(base + '.type', vector.type), 'true');
        for (const [n, pattern] of vector.patterns.entries()) assert.equal(api.SetValue(base + `.correct_responses.${n}.pattern`, pattern), 'true');
      }
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: 0, state, finished: false};
      const receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      for (const invalid of responseVectors[0].invalid) {
        const forged = structuredClone(state); forged.interactions[0].correct_responses[0].pattern = invalid;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, state: forged, sequence: 2, revision: 1}), /data model/);
      }
      assert.equal(f.player.status(f.service.principal('learner-a'), launch.launchId, 'session-learner-a').revision, 1);
      f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const resumed = f.player.bootstrap(f.launch(binding).token);
      for (const [index, vector] of responseVectors.entries()) for (const [n, pattern] of vector.patterns.entries()) assert.equal(resumed.state.interactions[index].correct_responses[n].pattern, pattern);
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {f.db.close();}
  });
}
