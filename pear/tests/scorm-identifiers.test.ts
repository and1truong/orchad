import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {fixture} from './helpers.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {validIdentifiers, invalidIdentifiers} from './scorm-identifier-vectors.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': URI lexical binding preserves exact identifiers and rejects invalid percent/characters in all typed paths', () => {
    const api = createSCORM2004API({edition}); assert.equal(api.Initialize(''), 'true');
    for (const [i, value] of validIdentifiers.entries()) {
      const interaction = `cmi.interactions.${i}`;
      assert.equal(api.SetValue(`cmi.objectives.${i}.id`, value), 'true', value);
      assert.equal(api.SetValue(interaction + '.id', value), 'true', value);
      assert.equal(api.SetValue(interaction + '.objectives.0.id', value), 'true', value);
      assert.equal(api.SetValue(interaction + '.type', 'likert'), 'true');
      for (const suffix of ['.learner_response', '.correct_responses.0.pattern']) {
        assert.equal(api.SetValue(interaction + suffix, value), 'true', value);
        for (const invalid of [...invalidIdentifiers, 'a'.repeat(251)]) {
          assert.equal(api.SetValue(interaction + suffix, invalid), 'false', JSON.stringify(invalid));
          assert.equal(api.GetLastError(), '406');
          assert.equal(api.GetValue(interaction + suffix), value);
        }
      }
      assert.equal(api.GetValue(interaction + '.id'), value);
    }
    for (const invalid of [...invalidIdentifiers, 'a'.repeat(4001)]) {
      for (const key of ['cmi.objectives.6.id', 'cmi.interactions.6.id', 'cmi.interactions.0.objectives.1.id']) {
        assert.equal(api.SetValue(key, invalid), 'false', key + ': ' + JSON.stringify(invalid));
        assert.equal(api.GetLastError(), '406');
      }
    }
    assert.equal(api.SetValue('cmi.interactions.0.id', 'different'), 'true'); assert.equal(api.GetLastError(), '0');
    assert.equal(api.GetValue('cmi.interactions.0.id'), 'different');
    assert.equal(api.GetValue('cmi.interactions.0.learner_response'), validIdentifiers[0]);
    assert.equal(api.GetValue('cmi.interactions.0.correct_responses.0.pattern'), validIdentifiers[0]);
    // Rejected identifiers must not create record 6 or advance the next index.
    assert.equal(api.GetValue('cmi.interactions._count'), '6');
    assert.equal(api.SetValue('cmi.interactions.7.learner_response', '%GG'), 'false'); assert.equal(api.GetLastError(), '351');
    assert.equal(api.SetValue('cmi.interactions.6.learner_response', '%GG'), 'false'); assert.equal(api.GetLastError(), '408');
    assert.equal(api.GetValue('cmi.interactions._count'), '6');
    assert.equal(api.SetValue('cmi.interactions.6.id', 'urn:pear:matching'), 'true');
    assert.equal(api.SetValue('cmi.interactions.6.type', 'matching'), 'true');
    assert.equal(api.SetValue('cmi.interactions.6.correct_responses.0.pattern', 'left\\.[.]right'), 'false'); assert.equal(api.GetLastError(), '406');
  });

  test(edition + ': full-capacity URI choice state survives durable ACK/retry/reopen; forged and invalid legacy state is atomic', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pear-identifiers-')), path = join(directory, 'db.sqlite');
    const manifest = singleSCOManifest(edition).replace('<p:manifest ', '<p:manifest xmlns:s="http://www.imsglobal.org/xsd/imsss" ').replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><s:sequencing><s:controlMode flow="true" choice="true"/></s:sequencing>');
    const f = await scormLearningFixture(path, multiFilePackage(edition, manifest));
    let reopened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), launch = f.launch(binding), bootstrap = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: bootstrap.state, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true');
      const id = 'urn:pear:' + 'a'.repeat(3991), choice = Array.from({length: 36}, (_, i) => String(i).padStart(2, '0') + 'a'.repeat(3998)).join('[,]');
      for (const key of ['cmi.objectives.0.id', 'cmi.interactions.0.id', 'cmi.interactions.0.objectives.0.id']) assert.equal(api.SetValue(key, id), 'true');
      assert.equal(api.SetValue('cmi.interactions.0.type', 'choice'), 'true');
      for (const suffix of ['learner_response', 'correct_responses.0.pattern']) assert.equal(api.SetValue('cmi.interactions.0.' + suffix, choice), 'true');
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: 0, state, finished: false}, receipt = f.player.checkpoint(launch.token, request);
      assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const envelope = JSON.parse(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state as string);
      envelope.engine.adaptation = 'pear-separators-v8';
      f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope));
      const checkUnchanged = () => {
        assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      };
      for (const invalid of ['a b', 'answer%GG', 'a'.repeat(4001)]) {
        const forged = structuredClone(state); forged.interactions[0].learner_response = invalid;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, state: forged, sequence: 2, revision: 1}), /data model|quota/); checkUnchanged();
      }
      const legacy = structuredClone(state); legacy.interactions[0].id = 'historically invalid id';
      f.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?').run(JSON.stringify(legacy));
      for (const candidate of [legacy, {...legacy, interactions: {}}]) {
        assert.throws(() => f.player.checkpoint(launch.token, {...request, state: candidate, sequence: 2, revision: 1}), /Type Mismatch|data model/); checkUnchanged();
      }
      f.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?').run(JSON.stringify(state));
      f.db.close(); reopened = fixture(path);
      const player = new SCORMPlayerService(reopened.db, new SCORMLearningBindings(reopened.db, reopened.service));
      assert.deepEqual(player.checkpoint(launch.token, request), receipt);
      player.close(reopened.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const next = player.launch(reopened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: reopened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const resumed = player.bootstrap(next.token);
      assert.equal(resumed.state.objectives[0].id, id);
      assert.equal(resumed.state.interactions[0].id, id);
      assert.equal(resumed.state.interactions[0].objectives[0].id, id);
      assert.equal(resumed.state.interactions[0].learner_response, choice);
      assert.equal(resumed.state.interactions[0].correct_responses[0].pattern, choice);
    } finally {if (f.db.isOpen) f.db.close(); reopened?.db.close(); rmSync(directory, {recursive: true, force: true});}
  });
}
