import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scorm2004Engine} from '../src/shared/scorm2004-engine.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const exact = '0.5' + '0'.repeat(40), maximum = '0.' + '1'.repeat(4094), key = 'cmi.interactions.0.result';
const invalid = [exact + '\n', exact + 'junk', '0.' + '1'.repeat(4095), '9'.repeat(309), 'NaN', 'Infinity', '1e-20', '+0.5', '0 .5', 'Correct', ''];
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': raw and facade interaction results admit long finite fractions with dependency/vocabulary/atomic refusal intact', () => {
    const Constructor = scorm2004Engine(edition);
    let state: any;
    const raw = new Constructor({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false}), facade = createSCORM2004API({edition, checkpoint(value) {state = value;}});
    for (const {api, read} of [{api: raw, read: () => raw.renderCMIToJSONObject().cmi}, {api: facade, read: () => {assert.equal(facade.Commit(''), 'true'); return state;}}]) {
      assert.equal(api.Initialize(''), 'true'); assert.equal(api.SetValue(key, exact), 'false'); assert.equal(api.GetLastError(), '408'); assert.equal(api.GetValue('cmi.interactions._count'), '0');
      assert.equal(api.SetValue('cmi.interactions.0.id', 'urn:pear:result-decimal'), 'true');
      for (const value of [exact, '-' + exact, maximum, 'correct', 'incorrect', 'unanticipated', 'neutral']) {
        assert.equal(api.SetValue(key, value), 'true'); assert.equal(api.GetValue(key), value); assert.equal(api.GetLastError(), '0');
        for (const bad of invalid) {const before = structuredClone(read()); assert.equal(api.SetValue(key, bad), 'false'); assert.equal(api.GetLastError(), '406'); assert.deepEqual(read(), before); assert.equal(api.GetValue(key), value); assert.equal(api.GetValue('cmi.interactions._count'), '1');}
      }
    }
  });
  test(edition + ': long numeric result preload retains exact authored text and rejects malformed/nonfinite/over-budget values', () => {
    for (const result of [exact, '-' + exact, maximum, 'correct']) {const api = createSCORM2004API({edition, state: {interactions: {0: {id: 'urn:pear:preloaded-result', result}}}}); assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue(key), result); assert.equal(api.GetLastError(), '0');}
    for (const result of invalid.filter(value => value !== '')) assert.throws(() => createSCORM2004API({edition, state: {interactions: {0: {id: 'urn:pear:preloaded-result', result}}}}), /Type Mismatch|invalid|rejected/i);
    const absent = createSCORM2004API({edition, state: {interactions: {0: {id: 'urn:pear:unset-result', result: ''}}}}); assert.equal(absent.Initialize(''), 'true'); assert.equal(absent.GetValue(key), ''); assert.equal(absent.GetLastError(), '403');
  });
  test(edition + ': long result typed replay and v41 SQLite resume preserve exact receipts while forged results remain atomic', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pear-result-decimal-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, sequencingPackage(edition)); let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), launch = f.launch(binding), request = sequenceCheckpoint(f, launch, {'cmi.interactions.0.id': 'urn:pear:result-decimal', [key]: exact, 'cmi.interactions.1.id': 'urn:pear:maximum-result', 'cmi.interactions.1.result': maximum, 'cmi.location': 'result-decimal-page', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(launch.token, request);
      assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const before = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), receipts = f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), audit = f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
      for (const result of invalid) {const state = structuredClone(request.state); state.interactions[0].result = result; assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: 1, state}), /data model|quota/); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), before); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), receipts); assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n, audit);}
      const envelope = JSON.parse(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state as string); envelope.engine.adaptation = 'pear-decimal-capacity-v41'; f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope)); f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)); assert.deepEqual(player.checkpoint(launch.token, request), receipt); player.close(opened.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const next = player.launch(opened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: opened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()}), b = player.bootstrap(next.token);
      assert.equal(b.state.interactions[0].result, exact); assert.equal(b.state.interactions[1].result, maximum); assert.equal(b.state.location, 'result-decimal-page'); assert.equal(b.state.entry, 'resume'); assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), receipts); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
