import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingManifest, sequencingPackage, weightedManifest, collectionManifest, xmlNumericManifest} from './scorm-sequencing-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
const above = '1.' + '0'.repeat(40) + '1', belowZero = '-0.' + '0'.repeat(330) + '1';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': nonnegative XML integers accept whitespace/sign/leading zeros and refuse decimal syntax', async () => {
    for (const [value, expected] of [[' &#x9;+0003&#xD; ', 3], [' -000 ', 0], ['10000', 10000]] as const) {
      const xml = sequencingManifest(edition).replace('<s:controlMode ', '<s:limitConditions attemptLimit="' + value + '"/><s:controlMode ');
      assert.equal((await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest.sequencing?.attemptLimit, expected);
    }
    for (const value of ['3.0', '3.', '.0', '-1', '10001', '1e2', '', ' &#x9; ', '&#xA0;3', '3&#xFEFF;', '1 0']) {
      const xml = sequencingManifest(edition).replace('<s:controlMode ', '<s:limitConditions attemptLimit="' + value + '"/><s:controlMode ');
      await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml)), /Unsupported/);
    }
    const xml = sequencingManifest(edition).replace('<s:controlMode ', '<s:randomizationControls selectCount=" &#x9;+0001&#xA; "/><s:controlMode ').replace('<s:rollupRule childActivitySet="all">', '<s:rollupRule childActivitySet="all" minimumCount=" &#x9;+0002&#xA; ">');
    const parsed = (await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest.sequencing!;
    assert.equal(parsed.sequencingControls.selectCount, 1); assert.equal(parsed.rollupRules.rules[0].minimumCount, 2);
    for (const bad of [xml.replace('+0001', '1.0'), xml.replace('+0001', '2049'), xml.replace('+0002', '2.0')]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, bad)), /Unsupported/);
  });
  test(edition + ': decimal text and rule thresholds use only XML whitespace and exact unit bounds', async () => {
    for (const [value, expected] of [[' &#x9;+000.8&#xD; ', 0.8], ['-1.0000', -1], ['+1.', 1], ['-.000', 0]] as const) {
      const xml = sequencingManifest(edition).replace('>0.8</s:minNormalizedMeasure>', '>' + value + '</s:minNormalizedMeasure>').replace('<s:ruleCondition condition="satisfied"', '<s:ruleCondition condition="satisfied" measureThreshold="' + value + '"');
      const parsed = (await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest;
      assert.equal(parsed.activities[0].sequencing?.primaryObjective.minNormalizedMeasure, expected);
      assert.equal(parsed.activities[1].sequencing?.sequencingRules.preConditionRules[0].conditions[1].parameters.threshold, expected);
    }
    for (const value of [above, '-' + above, '&#xA0;0.8', '0.8&#x2003;', '0 .8', 'NaN', '1e-1', '', '.']) {
      const base = sequencingManifest(edition);
      for (const xml of [base.replace('>0.8</s:minNormalizedMeasure>', '>' + value + '</s:minNormalizedMeasure>'), base.replace('<s:ruleCondition condition="satisfied"', '<s:ruleCondition condition="satisfied" measureThreshold="' + value + '"')]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml)), /Unsupported/);
    }
  });
  test(edition + ': rollup percentages/weights refuse values rounded across an exact boundary in used and unused groups', async () => {
    for (const value of [above, belowZero, '&#xA0;0.5', '0.5&#xFEFF;']) {
      const base = sequencingManifest(edition);
      for (const xml of [base.replace('<s:rollupRules>', '<s:rollupRules objectiveMeasureWeight="' + value + '">'), base.replace('<s:rollupRule childActivitySet="all">', '<s:rollupRule childActivitySet="all" minimumPercent="' + value + '">'), collectionManifest(edition).replace('<s:sequencing ID="shared-0">', '<s:sequencing ID="shared-0"><s:rollupRules objectiveMeasureWeight="' + value + '"/>')]) await assert.rejects(inspectSCORMPackage(sequencingPackage(edition, xml)), /Unsupported/);
    }
    const xml = sequencingManifest(edition).replace('<s:rollupRules>', '<s:rollupRules objectiveMeasureWeight=" &#x9;+000.75&#xA; ">').replace('<s:rollupRule childActivitySet="all">', '<s:rollupRule childActivitySet="all" minimumPercent=" &#x9;.5&#xA; ">');
    const parsed = (await inspectSCORMPackage(sequencingPackage(edition, xml))).manifest.sequencing!;
    assert.equal(parsed.sequencingControls.objectiveMeasureWeight, 0.75); assert.equal(parsed.rollupRules.rules[0].minimumPercent, 0.5);
  });
  test(edition + ': host scaled passing score remains decimal text for small signed XML measures', async () => {
    for (const value of ['+000.0000001', '-000.0000001']) {
      const f = await scormLearningFixture(undefined, sequencingPackage(edition, sequencingManifest(edition).replace('>0.8<', '>' + value + '<')));
      try {
        const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token);
        const api = createSCORM2004API({edition, state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot});
        assert.equal(api.Initialize(''), 'true'); assert.equal(Number(api.GetValue('cmi.scaled_passing_score')), Number(value)); assert.equal(api.GetLastError(), '0');
      } finally {f.db.close();}
    }
  });
  test(edition + ': normalized numeric imports preserve authored bytes, durable ACK retry, resume and authoritative rollup', async () => {
    const xml = xmlNumericManifest(edition === '2004-4' ? weightedManifest() : sequencingManifest(edition)), bytes = sequencingPackage(edition, xml);
    assert.equal((await inspectSCORMPackage(bytes)).files.get('imsmanifest.xml')?.toString(), xml);
    const f = await scormLearningFixture(undefined, bytes);
    try {
      const binding = f.enroll(), first = f.launch(binding), bootstrap = f.player.bootstrap(first.token);
      const api = createSCORM2004API({edition, state: bootstrap.state, sequencingTree: bootstrap.sequencingTree, sequencingSnapshot: bootstrap.sequencingSnapshot});
      assert.equal(api.Initialize(''), 'true'); assert.equal(Number(api.GetValue('cmi.scaled_passing_score')), 0.8); assert.equal(api.GetLastError(), '0');
      if (edition === '2004-4') {assert.equal(Number(api.GetValue('cmi.completion_threshold')), 0.5); assert.equal(api.GetLastError(), '0');}
      const saved = sequenceCheckpoint(f, first, {'cmi.location': 'numeric-binding-page', 'cmi.exit': 'suspend'}, false), receipt = f.player.checkpoint(first.token, saved);
      assert.deepEqual(f.player.checkpoint(first.token, saved), receipt); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1);
      const resumed = f.launch(binding, 'intro'); assert.equal(f.player.bootstrap(resumed.token).state.location, 'numeric-binding-page');
      const end = sequenceCheckpoint(f, resumed, {'cmi.completion_status': 'completed', 'cmi.progress_measure': '1', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'});
      assert.equal(f.player.checkpoint(resumed.token, end).officialLearningChanged, false);
      const next = f.launch(binding); assert.equal(next.scoId, 'practice');
      const result = f.player.checkpoint(next.token, sequenceCheckpoint(f, next, {'cmi.completion_status': 'completed', 'cmi.progress_measure': '1', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}));
      assert.equal(result.officialLearningChanged, true); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
    } finally {f.db.close();}
  });
}
for (const source of ['attribute', 'text'] as const) test('fourth-edition completion ' + source + ': full XML decimal lexical forms and exact unit interval', async () => {
  const make = (value: string) => source === 'attribute' ? weightedManifest().replace('minProgressMeasure="0.5"', 'minProgressMeasure="' + value + '"') : sequencingManifest().replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:completionThreshold>' + value + '</runtime:completionThreshold>');
  for (const value of [' &#x9;+000.50&#xD; ', '.5', '1.', '-0', '+1.000', '+000.0000001']) {
    const activity = (await inspectSCORMPackage(sequencingPackage('2004-4', make(value)))).manifest.activities[0];
    assert.ok(Number(activity.completionThreshold) === Number(value.replace(/&#x[0-9A-Fa-f]+;/g, '')));
    const api = createSCORM2004API({edition: '2004-4', state: {completion_threshold: activity.completionThreshold}});
    assert.equal(api.Initialize(''), 'true'); assert.equal(api.GetValue('cmi.completion_threshold'), activity.completionThreshold); assert.equal(api.GetLastError(), '0');
  }
  for (const value of [above, belowZero, '&#xA0;0.5', '0.5&#xFEFF;', '1e-1', 'NaN', '1 0', '.']) await assert.rejects(inspectSCORMPackage(sequencingPackage('2004-4', make(value))), /threshold/);
});
