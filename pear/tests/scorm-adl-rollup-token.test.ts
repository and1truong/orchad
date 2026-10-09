import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {adlManifest, sequencingManifest, sequencingPackage, xmlTokenManifest} from './scorm-sequencing-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const names = ['requiredForSatisfied', 'requiredForNotSatisfied', 'requiredForCompleted', 'requiredForIncomplete'];
const manifest = (edition: '2004-2' | '2004-3' | '2004-4', attrs: string) => adlManifest(edition).replace(/<a:rollupConsiderations[^>]*\/>/, '<a:rollupConsiderations ' + attrs + '/>');
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': all four ADL rollup token vocabularies normalize XML whitespace and retain defaults and original ZIP/hash', async () => {
    for (const value of ['always', 'ifAttempted', 'ifNotSkipped', 'ifNotSuspended']) {
      const attrs = names.map(name => name + '="' + value + '"').join(' '), xml = manifest(edition, attrs), authored = xmlTokenManifest(xml), bytes = sequencingPackage(edition, authored);
      const canonical = await inspectSCORMPackage(sequencingPackage(edition, xml)), parsed = await inspectSCORMPackage(bytes);
      assert.deepEqual(parsed.manifest, canonical.manifest); assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), authored); assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
      const unused = sequencingManifest(edition).replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="unused"><a:rollupConsiderations ' + xmlTokenManifest(attrs) + '/></s:sequencing></s:sequencingCollection></p:manifest>');
      assert.equal((await inspectSCORMPackage(sequencingPackage(edition, unused))).manifest.standard, edition);
    }
    const omitted = await inspectSCORMPackage(sequencingPackage(edition, manifest(edition, ''))), explicit = await inspectSCORMPackage(sequencingPackage(edition, manifest(edition, names.map(name => name + '="always"').join(' ') + ' measureSatisfactionIfActive="true"')));
    assert.deepEqual(omitted.manifest, explicit.manifest);
  });
  test(edition + ': ADL rollup tokens reject explicit blanks, non-XML/internal spaces, case and unknown values in used and unused groups', async () => {
    for (const name of names) for (const value of ['', ' &#x9;&#xA; ', '&#xA0;always', 'always&#xFEFF;', 'if Attempted', 'Always', 'unknown']) {
      const attrs = name + '="' + value + '"', unused = sequencingManifest(edition).replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="unused"><a:rollupConsiderations ' + attrs + '/></s:sequencing></s:sequencingCollection></p:manifest>');
      for (const xml of [manifest(edition, attrs), unused]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml)), /Unsupported/);
    }
  });
  test(edition + ': ADL token rollup survives exact retry, SQLite reopen and suspended resume with one authoritative proof', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pear-adl-token-')), path = join(dir, 'db.sqlite'), xml = xmlTokenManifest(adlManifest(edition).replace('<a:rollupConsiderations ', '<a:rollupConsiderations requiredForNotSatisfied="always" requiredForIncomplete="always" ')), f = await scormLearningFixture(path, sequencingPackage(edition, xml));
    let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), first = f.launch(binding), original = f.player.bootstrap(first.token), request = sequenceCheckpoint(f, first, {'cmi.location': 'adl-token-page', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(first.token, request);
      assert.deepEqual(f.player.checkpoint(first.token, request), receipt); f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)), live = {...f, ...opened, player};
      assert.deepEqual(player.checkpoint(first.token, request), receipt); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0); player.close(opened.service.principal('learner-a'), first.launchId, 'session-learner-a');
      const launch = () => player.launch(opened!.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: opened!.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const resumed = launch(), b = player.bootstrap(resumed.token); assert.equal(b.state.location, 'adl-token-page'); assert.equal(b.state.entry, 'resume'); assert.deepEqual(b.sequencingTree, original.sequencingTree);
      assert.equal(player.checkpoint(resumed.token, sequenceCheckpoint(live, resumed, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'})).officialLearningChanged, false);
      const next = launch(); assert.equal(next.scoId, 'practice'); const end = sequenceCheckpoint(live, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}), final = player.checkpoint(next.token, end);
      assert.equal(final.officialLearningChanged, true); assert.deepEqual(player.checkpoint(next.token, end), final); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1); assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 0);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
