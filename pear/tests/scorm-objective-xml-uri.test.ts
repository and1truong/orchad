import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingManifest, sequencingPackage} from './scorm-sequencing-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const wrap = (xml: string, names = ['objectiveID', 'targetObjectiveID', 'referencedObjective'], ws = ' &#x9;&#xD;&#xA; ') => xml.replace(/\b(objectiveID|targetObjectiveID|referencedObjective)="([^"]*)"/g, (match, name, id) => names.includes(name) ? name + '="' + ws + id + ws + '"' : match);
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': IMS objective anyURI XML whitespace binds canonical IDs/references/maps while retaining authored bytes and logical bounds', async () => {
    for (const names of [['objectiveID'], ['referencedObjective'], ['targetObjectiveID'], ['objectiveID', 'referencedObjective', 'targetObjectiveID']]) for (const ws of [' ', '&#x9;', '&#xD;', '&#xA;', ' \t\r\n ']) {
      const xml = sequencingManifest(edition), authored = wrap(xml, names, ws), bytes = sequencingPackage(edition, authored);
      const canonical = await inspectSCORMPackage(sequencingPackage(edition, xml)), parsed = await inspectSCORMPackage(bytes);
      assert.deepEqual(parsed.manifest, canonical.manifest); assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), authored); assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
    const id = 'urn:pear:' + 'x'.repeat(3991), xml = sequencingManifest(edition).replaceAll('objectiveID="primary"', 'objectiveID="' + id + '"').replaceAll('required-intro', id).replaceAll('shared-mastery', id);
    assert.deepEqual((await inspectSCORMPackage(sequencingPackage(edition, wrap(xml)))).manifest, (await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest);
  });
  test(edition + ': normalized required objective/map names retain blank/4001/duplicate refusal', async () => {
    const xml = sequencingManifest(edition);
    for (const value of ['', ' &#x9;&#xD;&#xA; ', 'urn:pear:' + 'x'.repeat(3992)]) {
      for (const [name, original] of [['objectiveID', 'primary'], ['targetObjectiveID', 'shared-mastery']]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml.replace(name + '="' + original + '"', name + '="' + value + '"'))), /Unsupported/);
    }
    await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml.replace('</s:primaryObjective>', '</s:primaryObjective><s:objective objectiveID=" &#x9;primary&#xD;&#xA; "/>'))), /Unsupported/);
    await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml.replace('</s:primaryObjective>', '<s:mapInfo targetObjectiveID=" &#x9;shared-mastery&#xA; "/></s:primaryObjective>'))), /Unsupported/);
    await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml.replace('referencedObjective="required-intro"', 'referencedObjective="urn:pear:' + 'x'.repeat(3992) + '"'))), /Unsupported/);
    // Non-XML whitespace is not silently trimmed, case/URI escapes stay exact.
    for (const value of ['&#xA0;primary', 'primary&#xFEFF;', 'URN:pear:Case%2F']) {
      const authored = xml.replace('objectiveID="primary"', 'objectiveID="' + value + '"');
      assert.deepEqual((await inspectSCORMPackage(sequencingPackage(edition, wrap(authored)))).manifest, (await inspectSCORMPackage(sequencingPackage(edition, authored))).manifest);
    }
  });
  test(edition + ': normalized objectives retain locked gate, exact receipts, SQLite suspend/resume and one official rollup proof', async () => {
   for (const system of [false, true]) {
    const dir = mkdtempSync(join(tmpdir(), 'pear-objective-xml-uri-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, sequencingPackage(edition, wrap(system ? sequencingManifest(edition).replace('a:objectivesGlobalToSystem="false"', '') : sequencingManifest(edition))));
    let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(); assert.throws(() => f.launch(binding, 'practice'), /prerequisites|denies/);
      const first = f.launch(binding), original = f.player.bootstrap(first.token), request = sequenceCheckpoint(f, first, {'cmi.location': 'objective-xml-page', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(first.token, request);
      assert.deepEqual(f.player.checkpoint(first.token, request), receipt); assert.equal(receipt.officialLearningChanged, false); f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)), live = {...f, ...opened, player};
      assert.deepEqual(player.checkpoint(first.token, request), receipt); player.close(opened.service.principal('learner-a'), first.launchId, 'session-learner-a');
      const launch = () => player.launch(opened!.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: opened!.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const resumed = launch(), b = player.bootstrap(resumed.token); assert.equal(b.state.entry, 'resume'); assert.equal(b.state.location, 'objective-xml-page'); assert.deepEqual(b.sequencingTree, original.sequencingTree);
      const nextReceipt = player.checkpoint(resumed.token, sequenceCheckpoint(live, resumed, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
      assert.equal(nextReceipt.officialLearningChanged, false); assert.equal(nextReceipt.nextScoId, 'practice');
      const objectiveRows = opened.db.prepare('SELECT * FROM scorm_system_objectives').all();
      assert.equal(objectiveRows.length, system ? 1 : 0);
      if (system) {assert.equal(objectiveRows[0].target_id, 'shared-mastery'); assert.equal(objectiveRows[0].learner, 'learner-a');}
      assert.throws(() => player.checkpoint(resumed.token, {...request, globalObjectiveMap: {[' shared-mastery ']: {satisfiedStatus: true}}}), /Exact checkpoint/);
      assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_system_objectives').all(), objectiveRows);
      const next = launch(); assert.equal(next.scoId, 'practice'); const end = sequenceCheckpoint(live, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}), final = player.checkpoint(next.token, end);
      assert.equal(final.officialLearningChanged, true); assert.deepEqual(player.checkpoint(next.token, end), final); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1); assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 0);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
   }
  });
}

const extension = '<a:objectives><a:objective objectiveID="primary"><a:mapInfo targetObjectiveID="shared-mastery" readRawScore="false" writeRawScore="true" writeCompletionStatus="true"/></a:objective></a:objectives>';
test('2004-4: ADL XML anyURI identifiers join canonical IMS objectives/maps without losing explicit permissions or authored bytes', async () => {
 const xml = sequencingManifest('2004-4').replace('</s:objectives></s:sequencing>', '</s:objectives>' + extension + '</s:sequencing>');
 for (const names of [['objectiveID'], ['targetObjectiveID'], ['objectiveID', 'targetObjectiveID']]) for (const ws of [' ', '&#x9;', '&#xD;', '&#xA;']) {
  const authored = xml.replace(extension, wrap(extension, names, ws)), bytes = sequencingPackage('2004-4', authored), parsed = await inspectSCORMPackage(bytes);
  assert.deepEqual(parsed.manifest, (await inspectSCORMPackage(sequencingPackage('2004-4', xml))).manifest); assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), authored); assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
 }
});
test('2004-4: ADL objective names retain duplicate/4000/blank/namespace/refusal after normalization', async () => {
 const xml = sequencingManifest('2004-4').replace('</s:objectives></s:sequencing>', '</s:objectives>' + extension + '</s:sequencing>');
 for(const value of ['', ' &#x9;&#xA; ', 'urn:pear:'+'x'.repeat(3992)]) for(const name of ['objectiveID', 'targetObjectiveID']) {
  const altered=extension.replace(name+'="'+(name==='objectiveID'?'primary':'shared-mastery')+'"',name+'="'+value+'"');
  await assert.rejects(inspectSCORMPackage(sequencingPackage('2004-4',xml.replace(extension,altered))),/Unsupported/);
 }
 const dup=extension.replace('</a:objective>','<a:mapInfo targetObjectiveID=" &#x9;shared-mastery&#xA; "/></a:objective>');
 await assert.rejects(inspectSCORMPackage(sequencingPackage('2004-4',xml.replace(extension,dup))),/Unsupported/);
 await assert.rejects(inspectSCORMPackage(sequencingPackage('2004-4',xml.replace(extension,extension.replace('</a:objectives>','<a:objective objectiveID=" &#x9;primary&#xA; "><a:mapInfo targetObjectiveID="other"/></a:objective></a:objectives>')))),/Unsupported/);
});
