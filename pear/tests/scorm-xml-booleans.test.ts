import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingManifest, sequencingPackage, collectionManifest, adlManifest, weightedManifest, sharedDataManifest, xmlBooleanManifest} from './scorm-sequencing-fixture.ts';
import {multiFileManifest, multiFilePackage} from './scorm-package-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  for (const [value, expected] of [[' true ', true], ['&#x9;1&#xA;', true], ['&#xD;false&#x20;', false], [' 0 ', false]] as const) test(edition + ': XML boolean ' + value + ' decodes without changing source bytes', async () => {
    const xml = sequencingManifest(edition).replace('choice="true"', 'choice="' + value + '"'), bytes = sequencingPackage(edition, xml);
    const parsed = await inspectSCORMPackage(bytes);
    assert.equal(parsed.manifest.sequencing?.sequencingControls.choice, expected);
    assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), xml);
    assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
  });
  test(edition + ': sequencing groups, objective scope and collection inheritance retain canonical semantics', async () => {
    for (const xml of [sequencingManifest(edition), collectionManifest(edition), adlManifest(edition), sequencingManifest(edition).replace('<s:controlMode ', '<s:deliveryControls tracked="true" completionSetByContent="false" objectiveSetByContent="true"/><s:randomizationControls reorderChildren="false"/><s:controlMode ')]) {
      const canonical = await inspectSCORMPackage(sequencingPackage(edition, xml)), authored = xmlBooleanManifest(xml);
      const normalized = await inspectSCORMPackage(sequencingPackage(edition, authored));
      assert.deepEqual(normalized.manifest, canonical.manifest);
      assert.equal(normalized.manifest.objectivesGlobalToSystem, false);
      assert.equal(normalized.files.get('imsmanifest.xml')?.toString(), authored);
    }
  });
  test(edition + ': XML booleans reject internal/non-XML spaces and malformed values even in unused definitions', async () => {
    for (const value of ['t rue', 'true false', 'True', '+1', '2', '', ' &#x9;&#xA; ', '&#xA0;true', 'true&#xA0;', '&#xFEFF;1', 'false&#x2003;']) {
      const base = sequencingManifest(edition);
      for (const xml of [base.replace('choice="true"', 'choice="' + value + '"'), base.replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="unused"><s:deliveryControls tracked="' + value + '"/></s:sequencing></s:sequencingCollection></p:manifest>'), base.replace('</p:organizations>', '<p:organization identifier="unused" a:objectivesGlobalToSystem="' + value + '"><p:title>Unused</p:title></p:organization></p:organizations>')]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml)), /Unsupported|objective scope/);
    }
  });
  test(edition + ': authored XML boolean controls survive exact checkpoint retry and database reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pear-xml-boolean-')), path = join(dir, 'db.sqlite');
    const xml = xmlBooleanManifest(sequencingManifest(edition)), bytes = sequencingPackage(edition, xml), f = await scormLearningFixture(path, bytes);
    let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), first = f.launch(binding), before = f.player.bootstrap(first.token);
      const request = sequenceCheckpoint(f, first, {'cmi.location': 'xml-boolean-bookmark', 'cmi.session_time': 'PT12S'}, false), receipt = f.player.checkpoint(first.token, request);
      assert.deepEqual(f.player.checkpoint(first.token, request), receipt);
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service));
      assert.deepEqual(player.checkpoint(first.token, request), receipt);
      const state = player.bootstrap(first.token);
      assert.deepEqual(state.sequencingTree, before.sequencingTree);
      assert.equal(state.state.location, 'xml-boolean-bookmark');
      assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
      assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {if (opened) opened.db.close(); else f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(edition + ': activity visibility normalizes only XML boolean whitespace', async () => {
  const xml = multiFileManifest(edition).replace('identifier="intro"', 'identifier="intro" isvisible=" &#x9;0&#xA; "');
  assert.equal((await inspectSCORMPackage(multiFilePackage(edition, xml))).manifest.activities[0].isVisible, false);
  await assert.rejects(inspectSCORMPackage(multiFilePackage(edition, xml.replace(' &#x9;0&#xA; ', '&#xA0;0'))), /visibility/);
});
test('fourth-edition completion weights and shared-data scopes/permissions retain canonical semantics', async () => {
  for (const xml of [weightedManifest(), sharedDataManifest()]) {
    const base = await inspectSCORMPackage(multiFilePackage('2004-4', xml));
    const parsed = await inspectSCORMPackage(multiFilePackage('2004-4', xmlBooleanManifest(xml)));
    assert.deepEqual(parsed.manifest, base.manifest);
  }
});
