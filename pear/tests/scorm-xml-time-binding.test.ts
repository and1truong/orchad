import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingManifest, sequencingPackage, xmlTimeManifest} from './scorm-sequencing-fixture.ts';
import {durationKeys} from '../src/shared/scorm-duration.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const limitXML = (edition: '2004-2' | '2004-3' | '2004-4', attributes: string) => sequencingManifest(edition).replace('<p:title>Introduction</p:title><s:sequencing>', '<p:title>Introduction</p:title><s:sequencing><s:limitConditions ' + attributes + '/>');
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': XML dateTime/duration whitespace preserves canonical limits and immutable authored bytes', async () => {
    for (const attributes of ['beginTimeLimit="2000-02-29T24:00:00Z" endTimeLimit="2099-01-01T00:00:00+14:00"', 'beginTimeLimit="2000-01-01T00:00:00.12-14:00"', ...['PT0S', 'PT60S', 'P1DT2H3M4.05S', 'P3660D'].map(value => durationKeys.map(key => key + '="' + value + '"').join(' '))]) {
      const xml = limitXML(edition, attributes), authored = xmlTimeManifest(xml), bytes = sequencingPackage(edition, authored);
      const canonical = await inspectSCORMPackage(sequencingPackage(edition, xml)), parsed = await inspectSCORMPackage(bytes);
      assert.deepEqual(parsed.manifest, canonical.manifest); assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), authored); assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
      const unused = sequencingManifest(edition).replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="unused"><s:limitConditions ' + xmlTimeManifest(attributes) + '/></s:sequencing></s:sequencingCollection></p:manifest>');
      assert.equal((await inspectSCORMPackage(sequencingPackage(edition, unused))).manifest.standard, edition);
    }
  });
  test(edition + ': dateTime/duration normalization retains Gregorian/timezone/order/quota and used/unused invalid-value refusal', async () => {
    for (const key of ['beginTimeLimit', 'endTimeLimit', ...durationKeys]) {
      const duration = durationKeys.includes(key as typeof durationKeys[number]), valid = duration ? 'PT60S' : '2000-01-01T00:00:00Z';
      const invalid = duration ? ['-PT1S', 'P1M', 'P1Y', 'P1W', 'PT1.001S', 'P3661D', 'PT', 'PT1e2S', 'PT 60S'] : ['2000-02-30T00:00:00Z', '1900-02-29T00:00:00Z', '2000-01-01T24:00:00.01Z', '2000-01-01T00:00:00+14:01', '2000-01-01T00:00:00', '0000-01-01T00:00:00Z', '2000-01-01T00:00:00.1234Z', '2000-01-01 T00:00:00Z'];
      for (const value of ['', ' &#x9;&#xA; ', '&#xA0;' + valid, valid + '&#xFEFF;', valid + 'junk', ...invalid]) {
        const attributes = key + '="' + value + '"', base = sequencingManifest(edition);
        for (const xml of [limitXML(edition, attributes), base.replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="unused"><s:limitConditions ' + attributes + '/></s:sequencing></s:sequencingCollection></p:manifest>')]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml)), /Unsupported/);
      }
    }
    await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xmlTimeManifest(limitXML(edition, 'beginTimeLimit="2026-10-08T00:00:10Z" endTimeLimit="2026-10-08T00:00:00Z"')))), /Unsupported/);
  });
  test(edition + ': XML-authored calendar/duration limits preserve trusted clock, exact receipts and SQLite resume while expiry denies delivery', async t => {
    const start = Date.parse('2026-10-08T00:00:00Z'); t.mock.timers.enable({apis: ['Date'], now: start});
    const dir = mkdtempSync(join(tmpdir(), 'pear-xml-time-')), path = join(dir, 'db.sqlite');
    const xml = xmlTimeManifest(limitXML(edition, 'beginTimeLimit="2026-10-08T00:00:00Z" endTimeLimit="2026-10-08T00:00:15Z" ' + durationKeys.map(key => key + '="PT60S"').join(' ')));
    const f = await scormLearningFixture(path, sequencingPackage(edition, xml)); let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), first = f.launch(binding); assert.equal(f.player.bootstrap(first.token).state.max_time_allowed, 'PT60S');
      t.mock.timers.tick(2000); const request = sequenceCheckpoint(f, first, {'cmi.location': 'xml-time-page', 'cmi.completion_status': 'incomplete', 'cmi.session_time': 'PT999S', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(first.token, request);
      assert.deepEqual(f.player.checkpoint(first.token, request), receipt); f.player.close(f.service.principal('learner-a'), first.launchId, 'session-learner-a'); f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)); t.mock.timers.tick(5000); assert.throws(() => player.checkpoint(first.token, request), /Launch closed or expired/); assert.deepEqual(JSON.parse(opened.db.prepare('SELECT result FROM scorm_engine_checkpoints').get()!.result as string), receipt);
      const launch = () => player.launch(opened!.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: opened!.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const next = launch(), b = player.bootstrap(next.token), clock = JSON.parse(b.sequencingSnapshot!).pearDurationClock.rows.intro;
      assert.equal(b.state.location, 'xml-time-page'); assert.equal(b.state.entry, 'resume'); assert.equal(clock.absolute, 7000); assert.equal(clock.experienced, 2000); assert.equal(clock.attempt, 1);
      const launches = opened.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n, receipts = opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all();
      t.mock.timers.setTime(start + 15001); assert.throws(launch, /prerequisite|denies/);
      assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n, launches); assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(), receipts); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true}); t.mock.timers.reset();}
  });
}
