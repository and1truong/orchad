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
import {scorm2004Engine} from '../src/shared/scorm2004-engine.ts';
import {loadResponseState} from '../src/shared/scorm-response-bindings.ts';

import {validAuthorityReferences, invalidAuthorityReferences, validLegacyAuthorityReferences, invalidLegacyAuthorityReferences} from './scorm-uri-authority-vectors.ts';

test('legacy and contemporary URI validators remain isolated during bound-response preload, interleaved writes and reset', () => {
  const value = 'custom://host:abc/', state = {interactions: {0: {id: value, type: 'numeric', learner_response: value, correct_responses: {0: {pattern: value}}}}};
  const bindings = {'cmi.interactions.0.learner_response': 'choice', 'cmi.interactions.0.correct_responses.0.pattern': 'choice'};
  const options = {logLevel: 'NONE' as const, autocommit: false, lmsCommitUrl: false as const};
  const legacy = new (scorm2004Engine('2004-2'))(options), modern = new (scorm2004Engine('2004-4'))(options);
  loadResponseState(legacy, state, bindings);
  assert.throws(() => loadResponseState(modern, state, bindings));
  assert.equal(legacy.Initialize(''), 'true'); assert.equal(legacy.GetValue('cmi.interactions.0.learner_response'), value);
  assert.equal(legacy.GetValue('cmi.interactions.0.correct_responses.0.pattern'), value);
  assert.equal(modern.Initialize(''), 'true');
  assert.equal(modern.SetValue('cmi.interactions.0.id', value), 'false'); assert.equal(modern.GetLastError(), '406');
  assert.equal(legacy.SetValue('cmi.interactions.0.type', 'choice'), 'true');
  assert.equal(legacy.SetValue('cmi.interactions.0.learner_response', value), 'true');
  legacy.reset(); modern.reset();
  for (const runtime of [modern, legacy]) assert.equal(runtime.Initialize(''), 'true');
  assert.equal(legacy.SetValue('cmi.interactions.0.id', value), 'true');
  assert.equal(modern.SetValue('cmi.interactions.0.id', value), 'false'); assert.equal(modern.GetLastError(), '406');
});

test('all URI response families use the selected edition grammar and retain valid values on malformed replacement', () => {
  for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
    const api = createSCORM2004API({edition}); assert.equal(api.Initialize(''), 'true');
    const uri = edition === '2004-2' ? 'custom://host:abc/answer' : 'custom://[2001:DB8::1]:999999/answer', invalid = 'custom://host/path[part]';
    for (const [i, type] of ['choice', 'matching', 'sequencing', 'likert', 'performance'].entries()) {
      const base = `cmi.interactions.${i}`;
      assert.equal(api.SetValue(base + '.id', 'urn:pear:uri-family-' + i), 'true');
      assert.equal(api.SetValue(base + '.type', type), 'true');
      const compose = (value: string) => type === 'matching' ? value + '[.]' + uri : type === 'performance' ? value + '[.]text' : value;
      for (const suffix of ['.learner_response', '.correct_responses.0.pattern']) {
        assert.equal(api.SetValue(base + suffix, compose(uri)), 'true', edition + ':' + type);
        assert.equal(api.SetValue(base + suffix, compose(invalid)), 'false'); assert.equal(api.GetLastError(), '406');
        assert.equal(api.GetValue(base + suffix), compose(uri));
      }
    }
  }
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': URI components, authority and IP literals preserve authored bytes across typed setters', () => {
    const valid = edition === '2004-2' ? validLegacyAuthorityReferences : validAuthorityReferences, invalid = edition === '2004-2' ? invalidLegacyAuthorityReferences : invalidAuthorityReferences;
    const api = createSCORM2004API({edition}); assert.equal(api.Initialize(''), 'true');
    for (const [i, value] of valid.entries()) {
      const base = `cmi.interactions.${i}`;
      for (const key of [`cmi.objectives.${i}.id`, base + '.id', base + '.objectives.0.id']) {
        assert.equal(api.SetValue(key, value), 'true', value); assert.equal(api.GetValue(key), value);
      }
      assert.equal(api.SetValue(base + '.type', 'likert'), 'true');
      for (const suffix of ['.learner_response', '.correct_responses.0.pattern']) {
        assert.equal(api.SetValue(base + suffix, value), 'true', value);
        for (const bad of invalid) {
          assert.equal(api.SetValue(base + suffix, bad), 'false', JSON.stringify(bad));
          assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(base + suffix), value);
        }
      }
    }
    const next = valid.length;
    for (const bad of invalid) for (const key of [`cmi.objectives.${next}.id`, `cmi.interactions.${next}.id`, 'cmi.interactions.0.objectives.1.id']) {
      assert.equal(api.SetValue(key, bad), 'false', JSON.stringify(bad)); assert.equal(api.GetLastError(), '406');
    }
    assert.equal(api.GetValue('cmi.interactions._count'), String(next));
    assert.equal(api.GetValue('cmi.objectives._count'), String(next));
    assert.equal(api.GetValue('cmi.interactions.0.objectives._count'), '1');
  });
  test(edition + ': full-capacity IPv6 URI choice state survives durable ACK/retry/reopen; forged and invalid legacy state is atomic', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pear-identifiers-')), path = join(directory, 'db.sqlite');
    const manifest = singleSCOManifest(edition).replace('<p:manifest ', '<p:manifest xmlns:s="http://www.imsglobal.org/xsd/imsss" ').replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><s:sequencing><s:controlMode flow="true" choice="true"/></s:sequencing>');
    const f = await scormLearningFixture(path, multiFilePackage(edition, manifest));
    let reopened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), launch = f.launch(binding), bootstrap = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: bootstrap.state, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true');
      const prefix = edition === '2004-2' ? 'custom://registry:alpha@name:part/' : 'http://[2001:DB8::1]:999999/', id = prefix + 'a'.repeat(4000 - prefix.length), choice = Array.from({length: 36}, (_, i) => String(i).padStart(2, '0') + 'a'.repeat(3998)).join('[,]');
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
      for (const invalid of [...(edition === '2004-2' ? invalidLegacyAuthorityReferences : invalidAuthorityReferences), 'a'.repeat(4001)]) {
        const forged = structuredClone(state); forged.interactions[0].learner_response = invalid;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, state: forged, sequence: 2, revision: 1}), /data model|quota/); checkUnchanged();
      }
      const legacy = structuredClone(state); legacy.interactions[0].id = 'http://host[invalid]/';
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
