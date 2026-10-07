import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFileManifest, multiFilePackage} from './scorm-package-fixture.ts';
import {createSCORM2004API, type SCORM2004Edition} from '../src/shared/scorm2004-runtime.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingTree} from '../src/server/scorm-sequencing.ts';
import {sequencingManifest, collectionManifest, retryManifest, weightedManifest, adlManifest, calendarManifest} from './scorm-sequencing-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': calendar limits use the host clock and survive trusted reconstruction', async t => {
  const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
  const xml = sequencingManifest(edition).replace('<s:controlMode flow="true" choice="true" forwardOnly="true"/>', '<s:controlMode flow="true" choice="true" forwardOnly="true"/><s:limitConditions beginTimeLimit="2024-02-29T24:00:00+02:00" endTimeLimit="2024-03-01T00:00:01+02:00"/>');
  const tree: Record<string, any> = sequencingTree((await inspectSCORMPackage(multiFilePackage(edition, xml))).manifest);
  assert.equal(tree.beginTimeLimit, '2024-02-29T22:00:00.000Z'); assert.equal(tree.endTimeLimit, '2024-02-29T22:00:01.000Z');
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2024-02-29T21:59:59.999Z')});
  const early = sequencingRuntime(tree); assert.equal(early.processNavigationRequest('start'), false);
  t.mock.timers.setTime(Date.parse(tree.beginTimeLimit));
  const atBegin = sequencingRuntime(tree); assert.equal(atBegin.processNavigationRequest('start'), true);
  const resumed = sequencingRuntime(tree, atBegin.serializeSequencingState());
  assert.equal(resumed.getSequencingState()!.rootActivity.beginTimeLimit, tree.beginTimeLimit);
  assert.equal(resumed.processNavigationRequest('exitAll'), true);
  t.mock.timers.setTime(Date.parse(tree.endTimeLimit));
  const atEnd = sequencingRuntime(tree); assert.equal(atEnd.processNavigationRequest('start'), true);
  t.mock.timers.setTime(Date.parse(tree.endTimeLimit) + 1);
  const late = sequencingRuntime(tree); assert.equal(late.processNavigationRequest('start'), false);
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': server rechecks calendar delivery and rolls back a client-valid request after expiration', async t => {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2024-03-01T00:00:00Z')});
  const xml = calendarManifest(edition, '2024-03-01T00:00:01Z', '2024-03-01T00:00:02Z');
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, xml));
  try {
    const binding = f.enroll();
    assert.throws(() => f.launch(binding), /Sequencing denies|prerequisites/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n, 0);
    t.mock.timers.setTime(Date.parse('2024-03-01T00:00:01Z'));
    const first = f.launch(binding), before = f.player.bootstrap(first.token);
    const request = sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT20S', 'adl.nav.request': 'continue'});
    t.mock.timers.setTime(Date.parse('2024-03-01T00:00:02.001Z'));
    assert.throws(() => f.player.checkpoint(first.token, request), /Sequencing denied|navigation/);
    const after = f.player.bootstrap(first.token); assert.equal(after.revision, before.revision); assert.equal(after.sequence, before.sequence); assert.equal(after.state.total_time, before.state.total_time);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    t.mock.timers.setTime(Date.parse('2024-03-01T00:00:02Z'));
    assert.equal(f.player.checkpoint(first.token, request).officialLearningChanged, false);
    const next = f.launch(binding); assert.equal(next.scoId, 'practice');
    const end = sequenceCheckpoint(f, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'});
    assert.equal(f.player.checkpoint(next.token, end).officialLearningChanged, true);
  } finally {f.db.close();}
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': untracked activities cannot violate a calendar delivery limit', async () => {
  const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
  for (const [begin, end] of [['2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z'], ['2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z']]) {
    const xml = calendarManifest(edition, begin, end).replace('<s:limitConditions ', '<s:deliveryControls tracked="false"/><s:limitConditions ');
    const manifest = (await inspectSCORMPackage(multiFilePackage(edition, xml))).manifest;
    assert.equal(manifest.sequencing!.beginTimeLimit, begin.replace('Z', '.000Z'));
    const tree: Record<string, any> = sequencingTree(manifest); assert.equal(tree.beginTimeLimit, undefined); assert.equal(tree.endTimeLimit, undefined);
    assert.equal(sequencingRuntime(tree).processNavigationRequest('start'), true);
  }
});

test('calendar limit profile rejects malformed/ambiguous dates and impossible intervals in collected or unselected trees', async () => {
  for (const value of ['2023-02-29T00:00:00Z', '1900-02-29T00:00:00Z', '0000-01-01T00:00:00Z', '2024-04-31T00:00:00Z', '2024-13-01T00:00:00Z', '2024-01-01T24:00:01Z', '2024-01-01T00:00:60Z', '2024-01-01T00:00:00+14:01', '2024-01-01T00:00:00+15:00', '2024-01-01T00:00:00', '2024-01-01', '']) {
    const bad = sequencingManifest().replace('<s:controlMode flow="true" choice="true" forwardOnly="true"/>', `<s:controlMode flow="true" choice="true" forwardOnly="true"/><s:limitConditions beginTimeLimit="${value}"/>`);
    await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-4', bad)), /Unsupported/);
  }
  const reversed = '<s:limitConditions beginTimeLimit="2024-01-02T00:00:00Z" endTimeLimit="2024-01-01T00:00:00Z"/>';
  for (const xml of [collectionManifest().replace('<s:sequencing ID="shared-0">', '<s:sequencing ID="shared-0">' + reversed), sequencingManifest().replace('</p:organizations>', '<p:organization identifier="unused"><p:title>Unused</p:title><s:sequencing>' + reversed + '</s:sequencing></p:organization></p:organizations>')]) await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-4', xml)), /Unsupported/);
  const inherited = collectionManifest().replace('<s:sequencing ID="shared-0">', '<s:sequencing ID="shared-0"><s:limitConditions beginTimeLimit="2024-01-01T00:00:00Z"/>').replace('<s:sequencing IDRef="shared-0"/>', '<s:sequencing IDRef="shared-0"><s:limitConditions endTimeLimit="2099-01-01T00:00:00Z"/></s:sequencing>');
  const merged: Record<string, any> = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', inherited))).manifest);
  assert.equal(merged.beginTimeLimit, undefined); assert.equal(merged.endTimeLimit, '2099-01-01T00:00:00.000Z');
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': ADL presentation and rollup settings retain content-requested navigation and required SCO evidence', async () => {
  const xml = adlManifest(edition), f = await scormLearningFixture(undefined, multiFilePackage(edition, xml));
  try {
    const binding = f.enroll(), first = f.launch(binding), b = f.player.bootstrap(first.token);
    assert.deepEqual(b.sequencingTree!.children[0].hideLmsUi, ['continue', 'exit']);
    const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
    const engine = sequencingRuntime(b.sequencingTree!, b.sequencingSnapshot);
    assert.deepEqual(engine.getSequencingState()!.currentActivity.hideLmsUi, ['continue', 'exit']);
    const considerations = engine.getSequencingState()!.rootActivity.children[1].rollupConsiderations;
    assert.equal(considerations.requiredForCompleted, 'ifAttempted'); assert.equal(considerations.requiredForSatisfied, 'ifNotSkipped');
    assert.equal(considerations.requiredForIncomplete, 'always'); assert.equal(considerations.measureSatisfactionIfActive, false);
    assert.equal(f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'})).officialLearningChanged, false);
    const next = f.launch(binding); assert.equal(next.scoId, 'practice');
    assert.equal(f.player.checkpoint(next.token, sequenceCheckpoint(f, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})).officialLearningChanged, true);
  } finally {f.db.close();}
});

test('fourth-edition ADL objective maps share raw scores without replacing IMS objective maps or their gates', async () => {
  const firstMap = '<a:objectives><a:objective objectiveID="primary"><a:mapInfo targetObjectiveID="shared-mastery" writeRawScore="true" writeMinScore="true" writeMaxScore="true" writeCompletionStatus="true" writeProgressMeasure="true"/></a:objective></a:objectives>';
  const secondMap = '<a:objectives><a:objective objectiveID="required-intro"><a:mapInfo targetObjectiveID="shared-mastery"/></a:objective></a:objectives>';
  const xml = adlManifest().replace('</s:primaryObjective></s:objectives></s:sequencing>', '</s:primaryObjective></s:objectives>' + firstMap + '</s:sequencing>').replace('</s:sequencingRules><a:rollupConsiderations', '</s:sequencingRules>' + secondMap + '<a:rollupConsiderations');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const binding = f.enroll(), first = f.launch(binding);
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.progress_measure': '0.8', 'cmi.score.scaled': '0.9', 'cmi.score.raw': '90', 'cmi.score.min': '0', 'cmi.score.max': '100', 'adl.nav.request': 'continue'}));
    const next = f.launch(binding), b = f.player.bootstrap(next.token);
    const api = createSCORM2004API({edition: '2004-4', state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot}); assert.equal(api.Initialize(''), 'true');
    const index = Array.from({length: Number(api.GetValue('cmi.objectives._count'))}, (_, i) => i).find(i => api.GetValue(`cmi.objectives.${i}.id`) === 'required-intro');
    assert.notEqual(index, undefined);
    assert.equal(api.GetValue(`cmi.objectives.${index}.score.raw`), '90'); assert.equal(api.GetValue(`cmi.objectives.${index}.score.min`), '0'); assert.equal(api.GetValue(`cmi.objectives.${index}.score.max`), '100');
    assert.equal(api.GetValue(`cmi.objectives.${index}.completion_status`), 'completed'); assert.equal(api.GetValue(`cmi.objectives.${index}.progress_measure`), '0.8');
    assert.equal(f.player.checkpoint(next.token, sequenceCheckpoint(f, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})).officialLearningChanged, true);
  } finally {f.db.close();}
});

test('ADL extensions reject misplaced, malformed, unknown, duplicate and wrong-edition semantics', async () => {
  const xml = adlManifest();
  for (const bad of [
    xml.replace('requiredForCompleted="ifAttempted"', 'requiredForCompleted="unknown"'), xml.replace('measureSatisfactionIfActive="false"', 'measureSatisfactionIfActive="maybe"'),
    xml.replace('<a:rollupConsiderations ', '<a:rollupConsiderations bogus="true" '), xml.replace('</s:sequencingRules><a:rollupConsiderations', '</s:sequencingRules><a:rollupConsiderations/><a:rollupConsiderations'),
    xml.replace('<n:hideLMSUI>continue', '<n:hideLMSUI>choice'), xml.replace('<n:presentation>', '<n:presentation bogus="true">'),
    xml.replace('<n:navigationInterface>', '<n:hideLMSUI>continue</n:hideLMSUI><n:navigationInterface>'),
    xml.replace('</p:manifest>', '<a:rollupConsiderations/></p:manifest>'),
    xml.replace('<a:constrainedChoiceConsiderations', '<s:constrainedChoiceConsiderations'),
    xml.replace('<s:mapInfo targetObjectiveID=', '<s:mapInfo readProgressMeasure="true" targetObjectiveID='),
    xml.replace('</s:sequencingRules><a:rollupConsiderations', '</s:sequencingRules><a:objectives><a:objective objectiveID="missing"><a:mapInfo targetObjectiveID="other"/></a:objective></a:objectives><a:rollupConsiderations'),
    xml.replace('</p:organizations>', '<p:organization identifier="unused"><p:title>Unused</p:title><s:sequencing><a:unknown/></s:sequencing></p:organization></p:organizations>'),
  ]) await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-4', bad)), /Unsupported|misplaced/);
  await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-2', adlManifest('2004-2').replace('>exit<', '>suspendAll<'))), /Unsupported/);
  await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-3', xml.replace('2004 4th Edition', '2004 3rd Edition').replace('</s:sequencingRules><a:rollupConsiderations', '</s:sequencingRules><a:objectives><a:objective objectiveID="required-intro"><a:mapInfo targetObjectiveID="scores"/></a:objective></a:objectives><a:rollupConsiderations'))), /Unsupported/);
});

test('objective scope validates every organization, including empty attributes and conflicting namespace values', async () => {
  for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
    const xml = adlManifest(edition);
    for (const attrs of ['a:objectivesGlobalToSystem="maybe"', 'a:objectivesGlobalToSystem=""', 'objectivesGlobalToSystem="maybe"', 'a:objectivesGlobalToSystem="true" objectivesGlobalToSystem="false"']) {
      const bad = xml.replace('</p:organizations>', `<p:organization identifier="unused" ${attrs}><p:title>Unused</p:title></p:organization></p:organizations>`);
      await assert.rejects(inspectSCORMPackage(multiFilePackage(edition, bad)), /Invalid SCORM package: (invalid|conflicting) objective scope/);
    }
    for (const value of ['true', 'false', '1', '0']) {
      const valid = xml.replace('</p:organizations>', `<p:organization identifier="unused" a:objectivesGlobalToSystem="${value}"><p:title>Unused</p:title></p:organization></p:organizations>`);
      assert.equal((await inspectSCORMPackage(multiFilePackage(edition, valid))).manifest.objectivesGlobalToSystem, false);
    }
  }
});

test('ADL collection groups override independently and objective extensions can bind to inline IMS objectives', async () => {
  const xml = collectionManifest().replace('<s:sequencing ID="shared-0">', '<s:sequencing ID="shared-0"><a:rollupConsiderations requiredForCompleted="ifNotSuspended"/>').replace('<s:sequencing IDRef="shared-0"/>', '<s:sequencing IDRef="shared-0"><a:rollupConsiderations requiredForSatisfied="ifAttempted"/></s:sequencing>');
  const tree: Record<string, any> = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', xml))).manifest);
  assert.equal(tree.rollupConsiderations.requiredForCompleted, 'always'); assert.equal(tree.rollupConsiderations.requiredForSatisfied, 'ifAttempted');
  assert.equal(tree.sequencingControls.flow, true); assert.equal(tree.rollupRules.rules.length, 2);
  const objective = '<a:objectives><a:objective objectiveID="primary"><a:mapInfo targetObjectiveID="shared-mastery" writeRawScore="true"/></a:objective></a:objectives>';
  const bound = sequencingManifest().replace('<p:title>Introduction</p:title><s:sequencing>', '<p:title>Introduction</p:title><s:sequencing IDRef="scores">').replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="scores">' + objective + '</s:sequencing></s:sequencingCollection></p:manifest>');
  const resolved = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', bound))).manifest);
  assert.equal(resolved.children[0].primaryObjective.mapInfo[0].writeRawScore, true);
  assert.equal(resolved.children[0].primaryObjective.mapInfo[0].writeSatisfiedStatus, true);
});

test('fourth-edition weighted completion survives engine reconstruction and appears in immutable official rollup evidence', async () => {
  const xml = weightedManifest();
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const binding = f.enroll(), first = f.launch(binding);
    assert.equal(f.player.bootstrap(first.token).state.completion_threshold, '0.5');
    const request = sequenceCheckpoint(f, first, {'cmi.progress_measure': '0.5', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'});
    assert.equal(f.player.checkpoint(first.token, request).officialLearningChanged, false);
    const envelope = JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));
    const states = JSON.parse(envelope.snapshot).sequencing.activityStates;
    const tree = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', xml))).manifest);
    assert.equal(tree.children[0].completionThreshold.progressWeight, 0.75); assert.equal(tree.children[1].completionThreshold.progressWeight, 0.25);
    assert.equal(states.org.attemptCompletionAmount, 0.375); assert.equal(states.org.attemptCompletionAmountStatus, true);
    const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
    const engine = sequencingRuntime(tree, envelope.snapshot);
    assert.equal(engine.getSequencingState()!.rootActivity.children[0].progressWeight, 0.75);
    assert.equal(engine.getSequencingState()!.rootActivity.attemptCompletionAmount, 0.375);
    const next = f.launch(binding); assert.equal(next.scoId, 'practice');
    assert.equal(f.player.checkpoint(next.token, sequenceCheckpoint(f, next, {'cmi.progress_measure': '1', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})).officialLearningChanged, true);
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence));
    assert.equal(proof.rollup.completionMeasure, 0.625);
  } finally {f.db.close();}
});

test('fourth-edition weight is independent of completedByMeasure and rejects invalid or earlier-edition attributes', async () => {
  const xml = weightedManifest().replaceAll('completedByMeasure="true"', 'completedByMeasure="false"');
  const parsed = await inspectSCORMPackage(multiFilePackage('2004-4', xml));
  assert.deepEqual(parsed.manifest.activities[0].completionMeasure, {completedByMeasure: false, minProgressMeasure: 0.5, progressWeight: 0.75});
  assert.equal(parsed.manifest.activities[0].completionThreshold, undefined);
  const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
  const engine = sequencingRuntime(sequencingTree(parsed.manifest)); engine.processNavigationRequest('start'); engine.Initialize('');
  assert.equal(engine.GetValue('cmi.completion_threshold'), '');
  assert.equal(engine.getSequencingState()!.currentActivity.progressWeight, 0.75);
  for (const weight of ['-0.1', '1.01', 'NaN', 'Infinity', '']) await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-4', xml.replace('progressWeight="0.75"', `progressWeight="${weight}"`))), /threshold/);
  for (const [marker, edition] of [['2004 2nd Edition', '2004-2'], ['2004 3rd Edition', '2004-3']] as const) await assert.rejects(inspectSCORMPackage(multiFilePackage(edition, xml.replace('2004 4th Edition', marker))), /4th edition/);
});

test('zero completion weight does not remove a SCO from the published per-SCO completion policy', async () => {
  const xml = sequencingManifest().replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:completionThreshold completedByMeasure="true" minProgressMeasure="0.8" progressWeight="0"/>').replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><runtime:completionThreshold completedByMeasure="true" minProgressMeasure="0.8" progressWeight="1"/>');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const binding = f.enroll(), first = f.launch(binding);
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.progress_measure': '0.2', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
    const next = f.launch(binding);
    assert.equal(f.player.checkpoint(next.token, sequenceCheckpoint(f, next, {'cmi.progress_measure': '1', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})).officialLearningChanged, false);
    const states = JSON.parse(JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state)).snapshot).sequencing.activityStates;
    assert.equal(states.org.attemptCompletionAmount, 1); assert.equal(states.intro.completionStatus, 'incomplete');
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': hidden SCOs retain flow, current delivery, choice validity and completion obligations', async () => {
  const xml = sequencingManifest(edition).replace('identifier="intro"', 'identifier="intro" isvisible="false"').replace('identifier="practice"', 'identifier="practice" isvisible="0"');
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, xml));
  try {
    const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
    const choiceXML = multiFileManifest(edition).replace('identifier="practice"', 'identifier="practice" isvisible="false"');
    const engine = sequencingRuntime(sequencingTree((await inspectSCORMPackage(multiFilePackage(edition, choiceXML))).manifest));
    assert.equal(engine.processNavigationRequest('start'), true); assert.equal(engine.processNavigationRequest('choice', 'practice'), true);
    const binding = f.enroll(), context = f.player.context(f.service.principal('learner-a'), binding);
    assert.equal(context.activities.length, 2); assert.ok(context.activities.every(a => !a.visible));
    assert.throws(() => f.launch(binding, 'practice'), /prerequisites|denies/);
    const first = f.launch(binding); assert.equal(first.scoId, 'intro');
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    const next = f.launch(binding); assert.equal(next.scoId, 'practice');
    const reopened = f.launch(binding, 'practice'); assert.equal(reopened.scoId, 'practice');
    assert.equal(f.player.checkpoint(reopened.token, sequenceCheckpoint(f, reopened, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.7', 'adl.nav.request': 'exitAll'})).officialLearningChanged, false);
    const retry = f.launch(binding); assert.equal(retry.scoId, 'practice');
    assert.equal(f.player.checkpoint(retry.token, sequenceCheckpoint(f, retry, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})).officialLearningChanged, true);
  } finally {f.db.close();}
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) for (const action of ['retry', 'retryAll'] as const) test(edition + ': ' + action + ' redelivers the same SCO in a new technical attempt without rewriting history or granting proof', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, retryManifest(edition, action)));
  try {
    const binding = f.enroll(), first = f.launch(binding, 'intro');
    const failed = sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.4', 'cmi.location': 'failed-page', 'cmi.suspend_data': 'old-private-data', 'cmi.session_time': 'PT12S', 'adl.nav.request': 'exit'});
    const result = f.player.checkpoint(first.token, failed);
    assert.equal(result.officialLearningChanged, false); assert.equal(result.nextScoId, 'intro');
    assert.deepEqual(f.player.checkpoint(first.token, failed), result);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    const saved = f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE sco_id=?').get('intro') as any;
    assert.equal(saved.sco_attempt_number, 1); assert.equal(saved.reported_seconds, 12); assert.equal(saved.finished, 1);
    const second = f.launch(binding, 'intro'), b = f.player.bootstrap(second.token);
    assert.equal(b.state.entry, 'ab-initio'); assert.equal(b.state.total_time, 'PT0S');
    assert.ok(!b.state.location); assert.ok(!b.state.suspend_data);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_attempts').get()!.n, 1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n, 2);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE sco_id=? AND sco_attempt_number=1').get('intro'), saved);
    assert.throws(() => f.player.checkpoint(first.token, failed), /closed/);
    f.player.checkpoint(second.token, sequenceCheckpoint(f, second, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT5S', 'adl.nav.request': 'continue'}));
    const practice = f.launch(binding, 'practice');
    assert.equal(f.player.checkpoint(practice.token, sequenceCheckpoint(f, practice, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})).officialLearningChanged, true);
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence));
    assert.equal(proof.scos.find((s: any) => s.scoId === 'intro').seconds, 5);
  } finally {f.db.close();}
});

test('retryAll from a later SCO restarts root flow and preserves both earlier SCO histories', async () => {
  const rule = '<s:postConditionRule><s:ruleConditions><s:ruleCondition condition="completed" operator="not"/></s:ruleConditions><s:ruleAction action="retryAll"/></s:postConditionRule>';
  const xml = sequencingManifest().replace('</s:preConditionRule></s:sequencingRules>', '</s:preConditionRule>' + rule + '</s:sequencingRules>');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const binding = f.enroll(), intro = f.launch(binding, 'intro');
    f.player.checkpoint(intro.token, sequenceCheckpoint(f, intro, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'cmi.location': 'earlier-intro', 'cmi.session_time': 'PT7S', 'adl.nav.request': 'continue'}));
    const practice = f.launch(binding, 'practice');
    const result = f.player.checkpoint(practice.token, sequenceCheckpoint(f, practice, {'cmi.completion_status': 'incomplete', 'cmi.location': 'failed-practice', 'cmi.session_time': 'PT9S', 'adl.nav.request': 'exit'}));
    assert.equal(result.nextScoId, 'intro'); assert.equal(result.officialLearningChanged, false);
    const restarted = f.launch(binding, 'intro'), state = f.player.bootstrap(restarted.token).state;
    assert.ok(!state.location); assert.equal(state.total_time, 'PT0S'); assert.equal(state.entry, 'ab-initio');
    const history = f.db.prepare('SELECT sco_id,sco_attempt_number,reported_seconds,runtime_state FROM scorm_sco_attempts ORDER BY sco_id,sco_attempt_number').all() as any[];
    assert.equal(history.length, 3); assert.equal(JSON.parse(history[0].runtime_state).location, 'earlier-intro'); assert.equal(history[0].reported_seconds, 7);
    assert.equal(JSON.parse(history[2].runtime_state).location, 'failed-practice'); assert.equal(history[2].reported_seconds, 9);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_attempts').get()!.n, 1);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});

test('post-condition retry obeys attempt limits and Commit never starts the retry', async () => {
  const xml = retryManifest().replace('attemptLimit="3"', 'attemptLimit="2"');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const binding = f.enroll(), first = f.launch(binding, 'intro');
    const values = {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.4', 'cmi.session_time': 'PT3S', 'adl.nav.request': 'exit'};
    const commit = f.player.checkpoint(first.token, sequenceCheckpoint(f, first, values, false));
    assert.equal(commit.finished, false); assert.equal(commit.nextScoId, null);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n, 1);
    assert.equal(f.player.checkpoint(first.token, sequenceCheckpoint(f, first, values)).nextScoId, 'intro');
    const second = f.launch(binding, 'intro');
    const pending = sequenceCheckpoint(f, second, values, false);
    assert.throws(() => f.player.checkpoint(second.token, {...pending, finished: true}), /denies/);
    assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts WHERE sco_attempt_number=2').get()!.revision, 0);
    const result = f.player.checkpoint(second.token, sequenceCheckpoint(f, second, {...values, 'adl.nav.request': 'exitAll'}));
    assert.equal(result.officialLearningChanged, false);
    assert.throws(() => f.launch(binding, 'intro'), /prerequisites|denies/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n, 2);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': manifest-local collections retain objective gates, durable delivery and official rollup', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, collectionManifest(edition)));
  try {
    const binding = f.enroll(); assert.throws(() => f.launch(binding, 'practice'), /prerequisites|denies/);
    const first = f.launch(binding, 'intro');
    const request = sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT10S', 'adl.nav.request': 'continue'});
    assert.equal(f.player.checkpoint(first.token, request).officialLearningChanged, false);
    assert.equal(f.player.status(f.service.principal('learner-a'), first.launchId, 'session-learner-a').nextScoId, 'practice');
    const second = f.launch(binding, 'practice');
    assert.equal(f.player.checkpoint(second.token, sequenceCheckpoint(f, second, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})).officialLearningChanged, true);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
  } finally {f.db.close();}
});

test('collection overrides replace whole XML groups and retain independent groups without aliasing', async () => {
  const xml = collectionManifest().replace('<s:sequencing IDRef="shared-0"/>', '<s:sequencing IDRef="shared-0"><s:controlMode choice="false"/></s:sequencing>');
  const pkg = await inspectSCORMPackage(multiFilePackage('2004-4', xml));
  const tree: Record<string, any> = sequencingTree(pkg.manifest);
  assert.deepEqual(tree.sequencingControls, {choice: false, choiceExit: true, flow: false, forwardOnly: false, useCurrentAttemptObjectiveInfo: true, useCurrentAttemptProgressInfo: true});
  assert.equal(tree.rollupRules.rules.length, 2);
  // A controlMode replacement must reset omitted flow/forwardOnly to defaults.
  const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
  const engine = sequencingRuntime(tree);
  assert.equal(engine.getSequencingState()!.rootActivity.sequencingControls.flow, false);
  assert.equal(engine.getSequencingState()!.rootActivity.sequencingControls.forwardOnly, false);
  const objectiveXML = collectionManifest().replace('<s:sequencing IDRef="shared-1"/>', '<s:sequencing IDRef="shared-1"><s:objectives><s:primaryObjective objectiveID="replacement"/></s:objectives></s:sequencing>');
  const replaced = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', objectiveXML))).manifest);
  assert.equal(replaced.children[0].primaryObjective.objectiveID, 'replacement');
  assert.deepEqual(replaced.children[0].primaryObjective.mapInfo, []);
  assert.equal(replaced.children[1].objectives[0].mapInfo[0].targetObjectiveID, 'shared-mastery');
});

test('collections reject dangling, chained, duplicate, misplaced and malformed definitions, including unused ones', async () => {
  const original = collectionManifest();
  const cases = [
    original.replace('IDRef="shared-0"', 'IDRef="missing"'), original.replace('IDRef="shared-0"', 'IDRef=""'),
    original.replace('ID="shared-0"', 'ID="shared-0" IDRef="shared-1"'),
    original.replace('ID="shared-1"', 'ID="shared-0"'), original.replace('ID="shared-0"', 'ID="org"'),
    original.replace('</p:organizations>', '<p:organization identifier="shared-0"><p:title>Unselected</p:title></p:organization></p:organizations>'),
    original.replace('</p:organizations>', '<p:organization identifier="unselected"><p:title>Unselected</p:title><p:item identifier="shared-1"><p:title>Collision</p:title></p:item></p:organization></p:organizations>'),
    original.replace('ID="shared-0"', 'ID="bad identifier"'), original.replace('ID="shared-0"', ''),
    original.replace('IDRef="shared-0"', 'ID="inline-id"'),
    original.replace('<s:sequencingCollection>', '<s:sequencingCollection bogus="true">'),
    original.replace('</s:sequencingCollection>', '<s:sequencing ID="unused"><s:controlMode bogus="true"/></s:sequencing></s:sequencingCollection>'),
    original.replace('</p:manifest>', '<s:sequencingCollection><s:sequencing ID="other"/></s:sequencingCollection></p:manifest>'),
    original.replace('<s:sequencingCollection>', '<p:item identifier="misplaced"><s:sequencingCollection>').replace('</s:sequencingCollection>', '</s:sequencingCollection></p:item>'),
  ];
  for (const xml of cases) await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-4', xml)), /Unsupported|misplaced|duplicate/);
  const unicode = original.replaceAll('shared-0', 'tập-hợp');
  assert.ok((sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', unicode))).manifest) as Record<string, any>).sequencingControls.flow);
});

test('an empty inline limitConditions replaces a collected attempt limit with the no-limit default', async () => {
  const xml = collectionManifest().replace('<s:sequencing ID="shared-1">', '<s:sequencing ID="shared-1"><s:limitConditions attemptLimit="1"/>').replace('<s:sequencing IDRef="shared-1"/>', '<s:sequencing IDRef="shared-1"><s:limitConditions/></s:sequencing>');
  const tree = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', xml))).manifest);
  assert.equal(tree.children[0].attemptLimit, undefined);
  const {sequencingRuntime} = await import('../src/shared/scorm-sequencing-runtime.ts');
  const engine = sequencingRuntime(tree);
  assert.equal(engine.getSequencingState()!.rootActivity.children[0].attemptLimit, null);
  assert.equal(engine.processNavigationRequest('start'), true);
  engine.Initialize(''); assert.equal(engine.SetValue('adl.nav.request', 'exit'), 'true'); engine.Terminate('');
  assert.equal(engine.processNavigationRequest('choice', 'intro'), true);
  assert.equal(engine.getSequencingState()!.currentActivity.attemptCount, 2);
});
export function sequenceCheckpoint(f: Awaited<ReturnType<typeof scormLearningFixture>>, launch: ReturnType<typeof f.launch>, values: Record<string, string>, finished = true) {
  const b = f.player.bootstrap(launch.token); let state: any, navigation = '_none_';
  const api = createSCORM2004API({edition: b.standard as SCORM2004Edition, state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot, checkpoint(s, _finished, nav) {state = s; navigation = nav;}});
  assert.equal(api.Initialize(''), 'true');
  for (const [key, value] of Object.entries(values)) assert.equal(api.SetValue(key, value), 'true', key + ': ' + api.GetDiagnostic(''));
  assert.equal(finished ? api.Terminate('') : api.Commit(''), 'true', api.GetDiagnostic(''));
  return {state, navigation, finished, sequence: b.sequence + 1, revision: b.revision};
}
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': objective maps gate direct choices; Terminate drives durable flow/rollup and preserves SCO isolation', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, sequencingManifest(edition)));
  try {
    const binding = f.enroll(), c = f.player.context(f.service.principal('learner-a'), binding);
    assert.equal(c.activities.find(a => a.id === 'intro')?.available, true); assert.equal(c.activities.find(a => a.id === 'practice')?.available, false);
    assert.throws(() => f.launch(binding, 'practice'), /prerequisites|denies/);
    const first = f.launch(binding, 'intro'), b = f.player.bootstrap(first.token);
    assert.equal(b.state.scaled_passing_score, '0.8'); assert.ok(b.sequencingSnapshot);
    const interim = sequenceCheckpoint(f, first, {'cmi.location': 'intro-checkpoint', 'cmi.exit': 'suspend', 'cmi.completion_status': 'incomplete', 'cmi.score.scaled': '0.4', 'cmi.session_time': 'PT20S'}, false);
    f.player.checkpoint(first.token, interim);
    assert.equal(f.player.context(f.service.principal('learner-a'), binding).activities.find(a => a.id === 'practice')?.available, false);
    const request = sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT30S', 'adl.nav.request': 'continue'});
    const result = f.player.checkpoint(first.token, request); assert.equal(result.officialLearningChanged, false); assert.deepEqual(f.player.checkpoint(first.token, request), result);
    const snapshot = JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));
    assert.equal(snapshot.sha256, f.pkg.sha256); assert.equal(JSON.parse(snapshot.snapshot).currentActivityId, 'practice');
    const next = f.launch(binding, 'practice'), nextState = f.player.bootstrap(next.token).state;
    assert.equal(nextState.location, undefined); assert.equal(nextState.total_time, 'PT0S'); assert.equal(nextState.entry, 'ab-initio');
    const done = sequenceCheckpoint(f, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT15S', 'adl.nav.request': 'exitAll'});
    const accepted = f.player.checkpoint(next.token, done); assert.equal(accepted.officialLearningChanged, true);
    const envelope = JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state)), states = JSON.parse(envelope.snapshot).sequencing.activityStates;
    assert.equal(states.org.completionStatus, 'completed'); assert.equal(states.intro.completionStatus, 'completed'); assert.equal(states.practice.completionStatus, 'completed');
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
  } finally {f.db.close();}
});
test('unsupported sequencing rules, misplaced elements, collection references and system-global mappings fail closed', async () => {
  for (const xml of [sequencingManifest().replace('action="disabled"', 'action="retry"'), sequencingManifest().replace('objectivesGlobalToSystem="false"', 'objectivesGlobalToSystem="true"'), sequencingManifest().replace('<s:controlMode ', '<s:controlMode bogus="true" '), sequencingManifest().replace('referencedObjective="required-intro"', 'referencedObjective="unknown"')]) {
    try {const pkg = await inspectSCORMPackage(multiFilePackage('2004-4', xml)); assert.throws(() => sequencingTree(pkg.manifest));} catch(e) {assert.match(String(e), /Unsupported|unknown|System-global/);}
  }
});
test('forbidden runtime navigation and client snapshots cannot grant progress; audit rollback preserves sequence and time', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', sequencingManifest()));
  try {
    const binding = f.enroll(), launch = f.launch(binding, 'intro');
    const request = sequenceCheckpoint(f, launch, {'cmi.completion_status': 'incomplete', 'cmi.score.scaled': '0.4', 'cmi.session_time': 'PT20S'}, false);
    const before = f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state;
    assert.throws(() => f.player.checkpoint(launch.token, {...request, finished: true, navigation: '{target=practice}choice'}), /denies/);
    assert.throws(() => f.player.checkpoint(launch.token, {...request, finished: true, navigation: 'previous'}), /denies/);
    assert.throws(() => f.player.checkpoint(launch.token, {...request, sequencingSnapshot: '{}'}), /Exact checkpoint/);
    assert.equal(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state, before);
    assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, 0);
    f.db.exec("CREATE TRIGGER reject_sequence BEFORE INSERT ON audit WHEN NEW.tool='runtime_scorm_engine_checkpoint' BEGIN SELECT RAISE(ABORT,'sequence audit failed'); END");
    assert.throws(() => f.player.checkpoint(launch.token, request), /sequence audit failed/); assert.equal(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state, before);
    f.db.exec('DROP TRIGGER reject_sequence'); f.player.checkpoint(launch.token, request);
    const replacement = f.launch(binding, 'intro'); assert.throws(() => f.player.checkpoint(launch.token, request), /closed/);
    assert.equal(f.player.bootstrap(replacement.token).state.location, '');
    const next = sequenceCheckpoint(f, replacement, {'cmi.session_time': 'PT5S'}, false); f.player.checkpoint(replacement.token, next);
    assert.equal(f.player.status(f.service.principal('learner-a'), replacement.launchId, 'session-learner-a').reported_seconds, 25);
    assert.throws(() => f.player.checkpoint(replacement.token, {...next, sequence: 3}), /revision|session/);
  } finally {f.db.close();}
});
test('suspendAll resumes the same SCO from a durable engine snapshot; identity mismatches fail closed', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-3', sequencingManifest('2004-3')));
  try {
    const binding = f.enroll(), launch = f.launch(binding, 'intro');
    const request = sequenceCheckpoint(f, launch, {'cmi.location': 'suspended-page', 'cmi.suspend_data': 'own-data', 'cmi.exit': 'suspend', 'cmi.completion_status': 'incomplete', 'cmi.session_time': 'PT12S', 'adl.nav.request': 'suspendAll'});
    const receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
    const previous = String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state);
    const envelope = JSON.parse(previous); assert.equal(JSON.parse(envelope.snapshot).sequencing.suspendedActivity, 'intro');
    f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify({...envelope, sha256: '0'.repeat(64)}));
    assert.throws(() => f.player.context(f.service.principal('learner-a'), binding), /identity/);
    f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(previous);
    const resumed = f.launch(binding, 'intro'), b = f.player.bootstrap(resumed.token);
    assert.equal(b.state.entry, 'resume'); assert.equal(b.state.location, 'suspended-page'); assert.equal(b.state.suspend_data, 'own-data'); assert.equal(b.state.total_time, 'PT12S');
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n, 1);
    const finished = sequenceCheckpoint(f, resumed, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'});
    f.player.checkpoint(resumed.token, finished);
    assert.equal(f.player.status(f.service.principal('learner-a'), resumed.launchId, 'session-learner-a').nextScoId, 'practice');
  } finally {f.db.close();}
});
test('technical SCO retries retain history and enforce manifest attempt limit independently of learner retakes', async () => {
  const xml = sequencingManifest().replace('<s:objectives><s:primaryObjective', '<s:limitConditions attemptLimit="2"/><s:objectives><s:primaryObjective');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const binding = f.enroll(), first = f.launch(binding, 'intro');
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.4', 'cmi.location': 'failed-attempt', 'cmi.session_time': 'PT10S', 'adl.nav.request': 'exit'}));
    const second = f.launch(binding, 'intro'), b = f.player.bootstrap(second.token);
    assert.equal(b.state.entry, 'ab-initio'); assert.equal(b.state.location, undefined); assert.equal(b.state.total_time, 'PT0S');
    f.player.checkpoint(second.token, sequenceCheckpoint(f, second, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.4', 'cmi.session_time': 'PT5S', 'adl.nav.request': 'exit'}));
    assert.throws(() => f.launch(binding, 'intro'), /prerequisites|denies/);
    const history = f.db.prepare('SELECT * FROM scorm_sco_attempts ORDER BY sco_attempt_number').all() as any[];
    assert.equal(history.length, 2); assert.equal(history[0].reported_seconds, 10); assert.equal(history[1].reported_seconds, 5);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_attempts').get()!.n, 1);
  } finally {f.db.close();}
});
test('accepted sequencing receipts/objectives survive a real database and server reopen', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const {fixture} = await import('./helpers.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts'), {SCORMLearningBindings} = await import('../src/server/scorm-learning-bindings.ts');
  const directory = mkdtempSync(join(tmpdir(), 'pear-sequencing-')), path = join(directory, 'db.sqlite');
  const f = await scormLearningFixture(path, multiFilePackage('2004-4', sequencingManifest())), binding = f.enroll(), first = f.launch(binding, 'intro');
  const request = sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT21S', 'adl.nav.request': 'continue'}), receipt = f.player.checkpoint(first.token, request);
  f.db.close(); const opened = fixture(path), player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service));
  try {
    assert.deepEqual(player.checkpoint(first.token, request), receipt);
    assert.equal(player.context(opened.service.principal('learner-a'), binding).activities.find(a => a.id === 'practice')?.available, true);
    const second = player.launch(opened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, binding, scoId: 'practice', mode: 'normal', confirmed: true, revision: opened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
    assert.equal(player.bootstrap(second.token).state.entry, 'ab-initio');
    const reopened = {...f, ...opened, player}, done = sequenceCheckpoint(reopened, second, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'});
    assert.equal(player.checkpoint(second.token, done).officialLearningChanged, true);
    assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
  } finally {opened.db.close(); rmSync(directory, {recursive: true, force: true});}
});
