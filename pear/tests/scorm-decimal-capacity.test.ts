import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scorm2004Engine} from '../src/shared/scorm2004-engine.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequencingManifest, sequencingPackage} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const exact = '0.5' + '0'.repeat(40), tiny = '0.' + '0'.repeat(19) + '1', maximum = '0.' + '1'.repeat(4094);
const above = '1.' + '0'.repeat(40) + '1', below = '-0.' + '0'.repeat(330) + '1';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': raw and facade decimal scalars preserve long fractions, capacity, finite arithmetic and exact integral ranges', () => {
    const Constructor = scorm2004Engine(edition);
    for (const api of [createSCORM2004API({edition}), new Constructor({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false})]) {
      assert.equal(api.Initialize(''), 'true');
      assert.equal(api.SetValue('cmi.objectives.0.id', 'urn:pear:decimal-objective'), 'true');
      assert.equal(api.SetValue('cmi.interactions.0.id', 'urn:pear:decimal-interaction'), 'true');
      for (const [path, value] of Object.entries({'cmi.progress_measure': tiny, 'cmi.score.scaled': '-' + tiny, 'cmi.score.raw': maximum, 'cmi.score.min': '-' + exact, 'cmi.score.max': exact, 'cmi.learner_preference.audio_level': exact, 'cmi.learner_preference.delivery_speed': exact, 'cmi.objectives.0.score.raw': exact, 'cmi.objectives.0.progress_measure': tiny, 'cmi.interactions.0.weighting': exact})) {
        assert.equal(api.SetValue(path, value), 'true', path); assert.equal(api.GetValue(path), value);
        for (const bad of [value + '\n', '0.' + '1'.repeat(4095), '9'.repeat(309), '1e-20', 'NaN', 'Infinity', '+0.5', '0 .5']) {
          assert.equal(api.SetValue(path, bad), 'false', path); assert.equal(api.GetLastError(), '406', path); assert.equal(api.GetValue(path), value);
        }
      }
      for (const [path, value] of [['cmi.score.scaled', above], ['cmi.score.scaled', '-' + above], ['cmi.progress_measure', above], ['cmi.progress_measure', below], ['cmi.objectives.0.progress_measure', below], ['cmi.learner_preference.audio_level', below], ['cmi.learner_preference.delivery_speed', below]]) {
        assert.equal(api.SetValue(path, value), 'false', path); assert.equal(api.GetLastError(), '407', path);
      }
      assert.equal(api.GetValue('cmi.progress_measure'), tiny); assert.equal(api.GetValue('cmi.score.scaled'), '-' + tiny);
    }
  });
  test(edition + ': long decimal host thresholds preload with strict type/range and valid authored XML bootstraps', async () => {
    const api = createSCORM2004API({edition, state: {completion_threshold: exact, scaled_passing_score: tiny}});
    assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue('cmi.completion_threshold'), exact); assert.equal(api.GetValue('cmi.scaled_passing_score'), tiny);
    assert.equal(api.SetValue('cmi.completion_threshold', '0.9'), 'false'); assert.equal(api.GetLastError(), '404'); assert.equal(api.GetValue('cmi.completion_threshold'), exact);
    for (const state of [{completion_threshold: above}, {completion_threshold: below}, {scaled_passing_score: above}, {scaled_passing_score: '-' + above}]) assert.throws(() => createSCORM2004API({edition, state}), /Out Of Range/);
    for (const state of [{completion_threshold: exact + '\n'}, {scaled_passing_score: tiny + '\n'}, {completion_threshold: '0.' + '1'.repeat(4095)}]) assert.throws(() => createSCORM2004API({edition, state}), /Type Mismatch/);
    const xml = sequencingManifest(edition).replace('>0.8<', '>' + tiny + '<').replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:completionThreshold>' + exact + '</runtime:completionThreshold>');
    const f = await scormLearningFixture(undefined, sequencingPackage(edition, xml));
    try {
      const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token);
      const runtime = createSCORM2004API({edition, state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot});
      assert.equal(runtime.Initialize(''), 'true'); assert.equal(runtime.GetValue('cmi.completion_threshold'), exact); assert.equal(runtime.GetValue('cmi.scaled_passing_score'), tiny); assert.equal(runtime.GetLastError(), '0');
    } finally {f.db.close();}
  });
  test(edition + ': long decimal typed replay preserves exact receipts and durable resume while invalid writes remain atomic', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pear-decimal-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, sequencingPackage(edition));
    let reopened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), launch = f.launch(binding);
      const request = sequenceCheckpoint(f, launch, {'cmi.score.raw': maximum, 'cmi.progress_measure': tiny, 'cmi.location': 'decimal-page', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(launch.token, request);
      assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const before = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), receipts = f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), audit = f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
      for (const bad of [maximum + '1', maximum + '\n', '9'.repeat(309)]) {
        const state = structuredClone(request.state); state.score.raw = bad;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: 2, revision: 1, state}), /data model|quota/);
        assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), before); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), receipts); assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n, audit);
      }
      const envelope = JSON.parse(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state as string); envelope.engine.adaptation = 'pear-uri-authority-v40';
      f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope));
      f.db.close(); reopened = fixture(path);
      const player = new SCORMPlayerService(reopened.db, new SCORMLearningBindings(reopened.db, reopened.service)); assert.deepEqual(player.checkpoint(launch.token, request), receipt);
      player.close(reopened.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const next = player.launch(reopened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: reopened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const b = player.bootstrap(next.token); assert.equal(b.state.score.raw, maximum); assert.equal(b.state.progress_measure, tiny); assert.equal(b.state.location, 'decimal-page'); assert.equal(b.state.entry, 'resume');
      assert.equal(reopened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0); assert.deepEqual(reopened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), receipts);
    } finally {reopened ? reopened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
