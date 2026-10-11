import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingManifest, sequencingPackage, selectionManifest, xmlTokenManifest} from './scorm-sequencing-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const ruleConditions = ['satisfied', 'objectiveStatusKnown', 'objectiveMeasureKnown', 'objectiveMeasureGreaterThan', 'objectiveMeasureLessThan', 'completed', 'activityProgressKnown', 'attempted', 'attemptLimitExceeded', 'always'];
const rollupConditions = ['satisfied', 'objectiveStatusKnown', 'objectiveMeasureKnown', 'completed', 'progressKnown', 'attempted', 'attemptLimitExceeded', 'notAttempted', 'always'];
const rule = (kind: string, action: string, combination = 'all') => '<s:' + kind + '><s:ruleConditions conditionCombination="' + combination + '">' + ruleConditions.map(condition => '<s:ruleCondition condition="' + condition + '" operator="noOp"/>').join('') + '</s:ruleConditions><s:ruleAction action="' + action + '"/></s:' + kind + '>';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': XML rule token vocabularies normalize whitespace and retain immutable authored bytes', async () => {
    for (const combination of ['all', 'any']) {
      const rules = [['preConditionRule', ['skip', 'disabled', 'hiddenFromChoice', 'stopForwardTraversal']], ['postConditionRule', ['exitParent', 'exitAll', 'continue', 'previous', 'retry', 'retryAll']], ['exitConditionRule', ['exit']]] as const;
      const xml = sequencingManifest(edition).replace('<s:controlMode ', '<s:sequencingRules>' + rules.flatMap(([kind, actions]) => actions.map(action => rule(kind, action, combination))).join('') + '</s:sequencingRules><s:controlMode ');
      const authored = xmlTokenManifest(xml), bytes = sequencingPackage(edition, authored);
      const canonical = await inspectSCORMPackage(sequencingPackage(edition, xml)), parsed = await inspectSCORMPackage(bytes);
      assert.deepEqual(parsed.manifest, canonical.manifest);
      assert.equal(parsed.files.get('imsmanifest.xml')?.toString(), authored); assert.equal(parsed.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
  });
  test(edition + ': rollup and selection tokens preserve every currently supported enumeration and defaults', async () => {
    const rootRollup = '<s:rollupRules>' + ['all', 'any', 'none', 'atLeastCount', 'atLeastPercent'].flatMap(set => ['satisfied', 'notSatisfied', 'completed', 'incomplete'].map(action => '<s:rollupRule childActivitySet="' + set + '"><s:rollupConditions conditionCombination="any">' + rollupConditions.flatMap(condition => ['noOp', 'not'].map(operator => '<s:rollupCondition condition="' + condition + '" operator="' + operator + '"/>')).join('') + '</s:rollupConditions><s:rollupAction action="' + action + '"/></s:rollupRule>')).join('') + '</s:rollupRules>';
    const xml = sequencingManifest(edition).replace(/<s:rollupRules>.*?<\/s:rollupRules>/, rootRollup);
    assert.deepEqual((await inspectSCORMPackage(sequencingPackage(edition, xmlTokenManifest(xml)))).manifest, (await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest);
    for (const selection of ['never', 'once', 'onEachNewAttempt']) for (const randomization of ['never', 'once', 'onEachNewAttempt']) {
      const xml = selectionManifest(edition, selection, randomization);
      assert.deepEqual((await inspectSCORMPackage(sequencingPackage(edition, xmlTokenManifest(xml)))).manifest, (await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest);
    }
    const defaults = sequencingManifest(edition).replace(' conditionCombination="any"', '').replaceAll(' operator="not"', '').replaceAll(' childActivitySet="all"', '').replace('<s:controlMode ', '<s:randomizationControls/><s:controlMode ');
    const parsed = (await inspectSCORMPackage(sequencingPackage(edition, defaults))).manifest;
    assert.equal(parsed.activities[1].sequencing?.sequencingRules.preConditionRules[0].conditionCombination, 'all');
    assert.equal(parsed.activities[1].sequencing?.sequencingRules.preConditionRules[0].conditions[0].operator, undefined);
    assert.equal(parsed.sequencing?.rollupRules.rules[0].consideration, 'all'); assert.equal(parsed.sequencing?.sequencingControls.selectionTiming, 'never');
  });
  test(edition + ': recognized XML tokens reject empty, Unicode/internal spaces and unknown values in used and unused groups', async () => {
    const snippets = ['<s:sequencingRules>' + rule('preConditionRule', 'skip') + '</s:sequencingRules>', '<s:rollupRules><s:rollupRule childActivitySet="all"><s:rollupConditions conditionCombination="all"><s:rollupCondition condition="completed" operator="noOp"/></s:rollupConditions><s:rollupAction action="completed"/></s:rollupRule></s:rollupRules>', '<s:randomizationControls selectionTiming="once" randomizationTiming="once"/>'];
    for (const snippet of snippets) for (const match of new Map([...snippet.matchAll(/(conditionCombination|condition|operator|action|childActivitySet|selectionTiming|randomizationTiming)="([^"]+)"/g)].map(m => [m[1], m])).values()) {
      const [original, name, value] = match;
      for (const bad of ['', ' &#x9;&#xA; ', '&#xA0;' + value, value + '&#xFEFF;', value[0] + ' ' + value.slice(1), value.toUpperCase(), 'unknown']) {
        const invalid = snippet.replace(original, name + '="' + bad + '"'), base = sequencingManifest(edition);
        for (const xml of [base.replace('<p:title>Introduction</p:title><s:sequencing>', '<p:title>Introduction</p:title><s:sequencing>' + invalid), base.replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="unused">' + invalid + '</s:sequencing></s:sequencingCollection></p:manifest>')]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml)), /Unsupported/);
      }
    }
    const validUnused = sequencingManifest(edition).replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="unused">' + xmlTokenManifest(snippets[0]) + '</s:sequencing></s:sequencingCollection></p:manifest>');
    assert.equal((await inspectSCORMPackage(sequencingPackage(edition, validUnused))).manifest.standard, edition);
  });
  test(edition + ': authored token rules survive exact receipts, SQLite reopen, suspend/resume and authoritative rollup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pear-xml-token-')), path = join(dir, 'db.sqlite'), xml = xmlTokenManifest(sequencingManifest(edition)), f = await scormLearningFixture(path, sequencingPackage(edition, xml));
    let opened: ReturnType<typeof fixture> | undefined;
    try {
      const binding = f.enroll(), first = f.launch(binding), original = f.player.bootstrap(first.token);
      const request = sequenceCheckpoint(f, first, {'cmi.location': 'xml-token-bookmark', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(first.token, request);
      assert.deepEqual(f.player.checkpoint(first.token, request), receipt); f.db.close(); opened = fixture(path);
      const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)), live = {...f, ...opened, player};
      assert.deepEqual(player.checkpoint(first.token, request), receipt); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      player.close(opened.service.principal('learner-a'), first.launchId, 'session-learner-a');
      const launch = () => player.launch(opened!.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: opened!.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
      const resumed = launch(), b = player.bootstrap(resumed.token); assert.equal(b.state.location, 'xml-token-bookmark'); assert.equal(b.state.entry, 'resume'); assert.deepEqual(b.sequencingTree, original.sequencingTree);
      assert.equal(player.checkpoint(resumed.token, sequenceCheckpoint(live, resumed, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'})).officialLearningChanged, false);
      const next = launch(); assert.equal(next.scoId, 'practice'); const end = sequenceCheckpoint(live, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}), final = player.checkpoint(next.token, end);
      assert.equal(final.officialLearningChanged, true); assert.deepEqual(player.checkpoint(next.token, end), final); assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1); assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n, 0);
    } finally {opened ? opened.db.close() : f.db.close(); rmSync(dir, {recursive: true, force: true});}
  });
}
