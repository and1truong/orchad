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
const emptyAbsolute = ['custom:', 'custom:#fragment', 'S.c+1:', 'S.c+1:#'];
const nonempty = ['custom:a', 'custom:/', 'custom://', 'custom:?query', 'custom:%23', 'Custom:a#part', '#part', '?query'];
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': raw/facade distinguish RFC2396 nonempty absolute part and RFC3986 path-empty with URI leaf/collection/error preservation', () => {
    const raw = new (scorm2004Engine(edition))({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false}); let state: any;
    const facade = createSCORM2004API({edition, checkpoint(value) {state = value;}});
    for (const {api, read} of [{api: raw, read: () => raw.renderCMIToJSONObject().cmi}, {api: facade, read: () => {assert.equal(facade.Commit(''), 'true'); return state;}}]) {
      assert.equal(api.Initialize(''), 'true');
      const accepted = edition === '2004-2' ? nonempty : [...nonempty, ...emptyAbsolute];
      for (const [i, value] of accepted.entries()) {
        const base = 'cmi.interactions.' + i;
        for (const key of ['cmi.objectives.' + i + '.id', base + '.id', base + '.objectives.0.id']) {assert.equal(api.SetValue(key, value), 'true', value); assert.equal(api.GetValue(key), value);}
        assert.equal(api.SetValue(base + '.type', 'likert'), 'true');
        for (const suffix of ['.learner_response', '.correct_responses.0.pattern']) {assert.equal(api.SetValue(base + suffix, value), 'true'); assert.equal(api.GetValue(base + suffix), value);}
      }
      if (edition === '2004-2') {
        const emptyPattern = 'cmi.interactions.' + accepted.length;
        assert.equal(api.SetValue(emptyPattern + '.id', 'urn:pear:empty-pattern'), 'true');
        assert.equal(api.SetValue(emptyPattern + '.type', 'likert'), 'true');
        for (const value of emptyAbsolute) for (const key of ['cmi.objectives.' + accepted.length + '.id', 'cmi.interactions.' + (accepted.length + 1) + '.id', 'cmi.interactions.0.objectives.1.id', 'cmi.interactions.0.learner_response', emptyPattern + '.correct_responses.0.pattern', 'cmi.interactions.0.correct_responses.0.pattern']) {
          const before = structuredClone(read()); assert.equal(api.SetValue(key, value), 'false', key + ':' + value); assert.equal(api.GetLastError(), '406'); assert.deepEqual(read(), before);
        }
      }
    }
  });
  test(edition + ': strict preload preserves edition-specific absolute URI spelling and cannot load a refused legacy URI', () => {
    for (const value of [...nonempty, ...emptyAbsolute]) for (const candidate of [
      {objectives: {0: {id: value}}},
      {interactions: {0: {id: value}}},
      {interactions: {0: {id: 'urn:pear:preload', objectives: {0: {id: value}}}}},
      {interactions: {0: {id: 'urn:pear:preload', type: 'likert', learner_response: value}}},
      {interactions: {0: {id: 'urn:pear:preload', type: 'likert', correct_responses: {0: {pattern: value}}}}},
    ]) {
      if (edition === '2004-2' && emptyAbsolute.includes(value)) assert.throws(() => createSCORM2004API({edition, state: candidate}), /Type Mismatch|invalid|rejected/i);
      else {let loaded: any; const api = createSCORM2004API({edition, state: candidate, checkpoint(s) {loaded = s;}}); assert.equal(api.Initialize(''), 'true'); assert.equal(api.Commit(''), 'true'); assert.ok(JSON.stringify(loaded).includes(value));}
    }
  });
  test(edition + ': typed URI refusal/v42 SQLite receipt replay/resume preserve original identifiers and unofficial/official separation', async () => {
    const value = edition === '2004-2' ? 'custom:%23' : 'custom:#fragment', dir = mkdtempSync(join(tmpdir(), 'pear-legacy-absolute-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, sequencingPackage(edition)); let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), launch = f.launch(binding), request = sequenceCheckpoint(f, launch, {'cmi.interactions.0.id': value, 'cmi.interactions.0.type': 'likert', 'cmi.interactions.0.learner_response': value, 'cmi.interactions.0.correct_responses.0.pattern': value, 'cmi.location': 'legacy-absolute-page', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(launch.token, request);
      assert.deepEqual(f.player.checkpoint(launch.token, request), receipt); assert.equal(receipt.officialLearningChanged, false);
      const rows = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), receipts = f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), audit = f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
      for (const bad of edition === '2004-2' ? emptyAbsolute : ['custom://host/path[part]']) for (const key of ['id', 'learner_response', 'pattern']) {
        const state = structuredClone(request.state);
        if (key === 'pattern') state.interactions[0].correct_responses[0].pattern = bad; else state.interactions[0][key] = bad;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: 1, state}), /data model|quota/); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), rows); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), receipts); assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n, audit);
      }
      const envelope = JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state)); envelope.engine.adaptation = 'pear-interaction-result-decimal-v42'; f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope)); f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)); assert.deepEqual(player.checkpoint(launch.token, request), receipt); player.close(opened.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const resumed = player.launch(opened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: opened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()}), b = player.bootstrap(resumed.token);
      assert.equal(b.state.entry, 'resume'); assert.equal(b.state.location, 'legacy-absolute-page'); assert.equal(b.state.interactions[0].id, value); assert.equal(b.state.interactions[0].learner_response, value); assert.equal(b.state.interactions[0].correct_responses[0].pattern, value); assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), receipts); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0); assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 0);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
