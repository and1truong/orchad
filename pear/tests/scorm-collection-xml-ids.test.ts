import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {collectionManifest, sequencingPackage} from './scorm-sequencing-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const wrap = (xml: string, names = ['ID', 'IDRef'], ws = ' &#x9;&#xD;&#xA; ') => xml.replace(/\b(ID|IDRef)="([^"]*)"/g, (match, name, id) => names.includes(name) ? name + '="' + ws + id + ws + '"' : match);
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': XML ID/IDREF whitespace resolves canonical manifest-local collections without altering bytes/hash/Unicode/logical bounds', async () => {
    for (const prefix of ['shared-', 'mục.tiêu-🦉-', 'C' + 'x'.repeat(3998)]) for (const names of [['ID'], ['IDRef'], ['ID', 'IDRef']]) for (const ws of [' ', '&#x9;', '&#xD;', '&#xA;', ' \t\r\n ']) {
      const xml = collectionManifest(edition).replace(/\b(ID|IDRef)="shared-(\d+)"/g, (_, name, n) => name + '="' + prefix + n + '"'), authored = wrap(xml, names, ws), bytes = sequencingPackage(edition, authored);
      const canonical = await inspectSCORMPackage(sequencingPackage(edition, xml)), parsed = await inspectSCORMPackage(bytes);
      assert.deepEqual(parsed.manifest, canonical.manifest); assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), authored); assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
    const xml = collectionManifest(edition).replace('<s:sequencing IDRef="shared-0"/>', '<s:sequencing IDRef="shared-0"><s:controlMode choice="false"/></s:sequencing>');
    assert.deepEqual((await inspectSCORMPackage(sequencingPackage(edition, wrap(xml)))).manifest, (await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest);
  });
  test(edition + ': XML collection IDs retain NCName/4000/duplicate/dangling/chained/unselected-definition refusal after normalization', async () => {
    const xml = collectionManifest(edition);
    for (const value of ['', ' &#x9;&#xA;&#xD; ', 'shared 0', 'shared&#x9;0', '&#xA0;shared-0', 'shared-0&#xFEFF;', '0start', 'prefix:name', 'C' + 'x'.repeat(4000)]) {
      await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml.replace('ID="shared-0"', 'ID="' + value + '"'))), /Unsupported/);
      await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml.replace('IDRef="shared-0"', 'IDRef="' + value + '"'))), /Unsupported/);
    }
    for (const ending of ['&#x2028;', '&#x2029;']) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml.replace('</s:sequencingCollection>', '<s:sequencing ID="unused' + ending + '"><s:controlMode/></s:sequencing></s:sequencingCollection>'))), /Unsupported/);
    for (const altered of [
      xml.replace('IDRef="shared-0"', 'IDRef=" &#x9;missing&#xA; "'),
      xml.replace('IDRef="shared-0"', 'IDRef="Shared-0"'),
      xml.replace('</s:sequencingCollection>', '<s:sequencing ID=" &#x9;shared-0&#xA; "><s:controlMode/></s:sequencing></s:sequencingCollection>'),
      xml.replace('ID="shared-0"', 'ID="shared-0" IDRef=" &#x9;shared-1&#xA; "'),
      xml.replace('</s:sequencingCollection>', '<s:sequencing ID=" &#x9;unused&#xA; "><s:controlMode bogus="true"/></s:sequencing></s:sequencingCollection>'),
    ]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, altered)), /Unsupported/);
  });
  test(edition + ': normalized collections retain locked objective gate, exact receipts, SQLite suspend/resume and one official rollup proof', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pear-collection-xml-id-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, sequencingPackage(edition, wrap(collectionManifest(edition))));
    let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(); assert.throws(() => f.launch(binding, 'practice'), /prerequisites|denies/);
      const first = f.launch(binding), original = f.player.bootstrap(first.token), request = sequenceCheckpoint(f, first, {'cmi.location': 'collection-xml-page', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(first.token, request);
      assert.deepEqual(f.player.checkpoint(first.token, request), receipt); assert.equal(receipt.officialLearningChanged, false); f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)), live = {...f, ...opened, player};
      assert.deepEqual(player.checkpoint(first.token, request), receipt); player.close(opened.service.principal('learner-a'), first.launchId, 'session-learner-a');
      const launch = () => player.launch(opened!.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: opened!.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const resumed = launch(), b = player.bootstrap(resumed.token); assert.equal(b.state.entry, 'resume'); assert.equal(b.state.location, 'collection-xml-page'); assert.deepEqual(b.sequencingTree, original.sequencingTree);
      const nextReceipt = player.checkpoint(resumed.token, sequenceCheckpoint(live, resumed, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
      assert.equal(nextReceipt.officialLearningChanged, false); assert.equal(nextReceipt.nextScoId, 'practice');
      const next = launch(); assert.equal(next.scoId, 'practice'); const end = sequenceCheckpoint(live, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}), final = player.checkpoint(next.token, end);
      assert.equal(final.officialLearningChanged, true); assert.deepEqual(player.checkpoint(next.token, end), final); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1); assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 0);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
