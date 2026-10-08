import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {fixture} from './helpers.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {validTimestamps, invalidTimestamps} from './scorm-timestamp-vectors.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': timestamp binding validates calendar, precision and zones without changing interaction dependency precedence', () => {
    const api = createSCORM2004API({edition, state: {comments_from_lms: {0: {comment: 'Trusted', timestamp: '2000-02-29'}}}});
    assert.equal(api.Initialize(''), 'true');
    assert.equal(api.SetValue('cmi.interactions.0.timestamp', '2026-02-29'), 'false'); assert.equal(api.GetLastError(), '408');
    assert.equal(api.SetValue('cmi.interactions.0.id', 'urn:pear:timestamp'), 'true');
    for (const key of ['cmi.interactions.0.timestamp', 'cmi.comments_from_learner.0.timestamp']) {
      for (const value of validTimestamps) {assert.equal(api.SetValue(key, value), 'true', value); assert.equal(api.GetValue(key), value);}
      for (const value of invalidTimestamps) {
        assert.equal(api.SetValue(key, value), 'false', JSON.stringify(value)); assert.equal(api.GetLastError(), '406');
        assert.equal(api.GetValue(key), validTimestamps.at(-1));
      }
      // Existing compatibility canonicalization remains explicit and exact.
      assert.equal(api.SetValue(key, '2026-10-08T12:30:59Z'), 'true'); assert.equal(api.GetValue(key), '2026-10-08T12:30:59.00Z');
      for (let year = 1970; year <= 2038; year++) for (let month = 1; month <= 12; month++) {
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(), prefix = `${year}-${String(month).padStart(2, '0')}-`;
        const valid = prefix + lastDay;
        assert.equal(api.SetValue(key, valid), 'true', valid);
        assert.equal(api.SetValue(key, prefix + (lastDay + 1)), 'false'); assert.equal(api.GetLastError(), '406'); assert.equal(api.GetValue(key), valid);
      }
    }
  });

  test(edition + ': real engine load validates interaction, learner and LMS timestamps before initialization', () => {
    for (const collection of ['interactions', 'comments_from_learner', 'comments_from_lms']) {
      for (const value of validTimestamps) {
        const engine = new Scorm2004API({logLevel: 'NONE'});
        engine.loadFromJSON({[collection]: {0: {id: 'urn:pear:timestamp', timestamp: value}}});
        assert.equal(engine.Initialize(''), 'true'); assert.equal(engine.GetValue(`cmi.${collection}.0.timestamp`), value);
      }
      for (const value of invalidTimestamps.filter(value => value !== '')) {
        const engine = new Scorm2004API({logLevel: 'NONE'});
        assert.throws(() => engine.loadFromJSON({[collection]: {0: {id: 'urn:pear:timestamp', timestamp: value}}}), /Type Mismatch/);
      }
    }
  });

  test(edition + ': timestamps survive ACK/retry/SQLite reopen; forged and historical invalid state roll back atomically', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pear-timestamps-')), path = join(directory, 'db.sqlite');
    const manifest = singleSCOManifest(edition).replace('<p:manifest ', '<p:manifest xmlns:s="http://www.imsglobal.org/xsd/imsss" ').replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><s:sequencing><s:controlMode flow="true" choice="true"/></s:sequencing>');
    const f = await scormLearningFixture(path, multiFilePackage(edition, manifest)); let reopened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), launch = f.launch(binding), bootstrap = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: bootstrap.state, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true');
      for (const [i, value] of validTimestamps.entries()) {
        assert.equal(api.SetValue(`cmi.interactions.${i}.id`, 'urn:pear:timestamp:' + i), 'true');
        for (const collection of ['interactions', 'comments_from_learner']) assert.equal(api.SetValue(`cmi.${collection}.${i}.timestamp`, value), 'true');
      }
      assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true'); assert.equal(api.Commit(''), 'true');
      const request = {sequence: 1, revision: 0, state, finished: false}, receipt = f.player.checkpoint(launch.token, request);
      assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const checkUnchanged = () => {
        assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
        assert.deepEqual(JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string), state);
      };
      for (const value of invalidTimestamps.filter(value => value !== '')) for (const collection of ['interactions', 'comments_from_learner']) {
        const forged = structuredClone(state); forged[collection][0].timestamp = value;
        assert.throws(() => f.player.checkpoint(launch.token, {...request, state: forged, sequence: 2, revision: 1}), /data model/); checkUnchanged();
      }
      for (const collection of ['interactions', 'comments_from_learner', 'comments_from_lms']) {
        const legacy = structuredClone(state); legacy[collection] ??= {}; legacy[collection][0] ??= {}; legacy[collection][0].timestamp = '2026-02-29';
        f.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?').run(JSON.stringify(legacy));
        for (const candidate of [legacy, state]) assert.throws(() => f.player.checkpoint(launch.token, {...request, state: candidate, sequence: 2, revision: 1}), /Type Mismatch|data model/);
        f.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?').run(JSON.stringify(state)); checkUnchanged();
      }
      const envelope = JSON.parse(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state as string);
      envelope.engine.adaptation = 'pear-identifiers-v9'; f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope));
      f.db.close(); reopened = fixture(path);
      const player = new SCORMPlayerService(reopened.db, new SCORMLearningBindings(reopened.db, reopened.service));
      assert.deepEqual(player.checkpoint(launch.token, request), receipt);
      player.close(reopened.service.principal('learner-a'), launch.launchId, 'session-learner-a');
      const next = player.launch(reopened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: reopened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const resumed = player.bootstrap(next.token);
      for (const [i, value] of validTimestamps.entries()) for (const collection of ['interactions', 'comments_from_learner']) assert.equal(resumed.state[collection][i].timestamp, value);
    } finally {if (f.db.isOpen) f.db.close(); reopened?.db.close(); rmSync(directory, {recursive: true, force: true});}
  });
}
