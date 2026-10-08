import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

import {separatorVectors} from './scorm-separator-vectors.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': only bracketed separators split learner records; rejected replacements cannot alter durable state', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pear-separators-')), path = join(directory, 'db.sqlite');
  const f = await scormLearningFixture(path, multiFilePackage(edition, singleSCOManifest(edition)));
  let reopened: ReturnType<typeof fixture> | undefined;
  try {
    const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
    const api = createSCORM2004API({edition, state: b.state, checkpoint(value) {state = value;}}); assert.equal(api.Initialize(''), 'true');
    for (const [i, v] of separatorVectors.entries()) {
      const key = `cmi.interactions.${i}`;
      assert.equal(api.SetValue(key + '.id', 'urn:pear:delimiter:' + i), 'true'); assert.equal(api.SetValue(key + '.type', v.type), 'true');
      assert.equal(api.SetValue(key + '.learner_response', v.value), 'true', v.value);
      assert.equal(api.SetValue(key + '.learner_response', v.invalid), 'false', v.invalid); assert.equal(api.GetLastError(), '406');
      assert.equal(api.GetValue(key + '.learner_response'), v.value);
    }
    assert.equal(api.SetValue('cmi.interactions.5.id', 'urn:pear:numeric'), 'true'); assert.equal(api.SetValue('cmi.interactions.5.type', 'numeric'), 'true');
    assert.equal(api.SetValue('cmi.interactions.5.correct_responses.0.pattern', '1[:]2'), 'true');
    assert.equal(api.SetValue('cmi.interactions.5.correct_responses.0.pattern', '1:2'), 'false'); assert.equal(api.GetLastError(), '406');
    assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
    const request = {sequence: 1, revision: 0, state, finished: false}, receipt = f.player.checkpoint(launch.token, request);
    assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
    for (const [i, v] of separatorVectors.entries()) {
      const forged = structuredClone(state); forged.interactions[i].learner_response = v.invalid;
      assert.throws(() => f.player.checkpoint(launch.token, {...request, state: forged, sequence: 2, revision: 1}), /data model/);
    }
    f.db.close(); reopened = fixture(path);
    const player = new SCORMPlayerService(reopened.db, new SCORMLearningBindings(reopened.db, reopened.service));
    assert.deepEqual(player.checkpoint(launch.token, request), receipt);
    player.close(reopened.service.principal('learner-a'), launch.launchId, 'session-learner-a');
    const next = player.launch(reopened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: reopened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
    const resumed = player.bootstrap(next.token);
    for (const [i, v] of separatorVectors.entries()) assert.equal(resumed.state.interactions[i].learner_response, v.value);
    assert.equal(reopened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {if (f.db.isOpen) f.db.close(); reopened?.db.close(); rmSync(directory, {recursive: true, force: true});}
});
