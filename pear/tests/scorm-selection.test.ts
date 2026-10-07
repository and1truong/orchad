import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectionManifest, collectionManifest} from './scorm-sequencing-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingTree} from '../src/server/scorm-sequencing.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(`${edition}: trusted selection survives resume/receipt retry and requires only selected SCO proof`, async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, selectionManifest(edition)));
  try {
    const binding = f.enroll(), context = () => f.player.context(f.service.principal('learner-a'), binding);
    for (let i = 0; i < 8; i++) {assert.equal(context().activities.filter(a => a.available).length, 2); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_registrations').get()!.n, 0);}
    const first = f.launch(binding), b = f.player.bootstrap(first.token), plan = JSON.parse(b.sequencingSnapshot!).sequencing.activityStates.org.selectionRandomizationState;
    assert.equal(plan.selectionCountStatus, true); assert.equal(plan.selectedChildIds.length, 1); assert.equal(plan.selectedChildIds[0], b.sequencingSnapshot && JSON.parse(b.sequencingSnapshot).currentActivityId);
    const other = ['intro', 'practice'].find(id => id !== plan.selectedChildIds[0])!; assert.equal(context().activities.find(a => a.id === other)!.available, false);
    assert.throws(() => f.launch(binding, other), /prerequisite|denies/);
    const request = sequenceCheckpoint(f, first, {'cmi.location': 'selected-bookmark', 'cmi.session_time': 'PT20S'}, false), receipt = f.player.checkpoint(first.token, request);
    assert.deepEqual(f.player.checkpoint(first.token, request), receipt);
    const resumed = f.launch(binding), state = f.player.bootstrap(resumed.token); assert.equal(state.state.location, 'selected-bookmark');
    assert.deepEqual(JSON.parse(state.sequencingSnapshot!).sequencing.activityStates.org.selectionRandomizationState, plan);
    f.player.checkpoint(resumed.token, sequenceCheckpoint(f, resumed, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}));
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)); assert.equal(proof.scos.length, 1); assert.equal(proof.scos[0].scoId, plan.selectedChildIds[0]); assert.equal(proof.rollup.completion, 'completed'); assert.deepEqual(proof.selection[0].selectedChildren, plan.selectedChildIds);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts WHERE sco_id=?').get(other)!.n, 0); assert.equal(context().completed, true);
  } finally {f.db.close();}
});

test('selection on each new root attempt can select a previously excluded child; once preserves the original selection', async t => {
  for (const timing of ['once', 'onEachNewAttempt']) {
    const xml = selectionManifest('2004-4', timing, 'never', 1, false).replaceAll('</s:sequencing></p:item>', '<s:sequencingRules><s:postConditionRule><s:ruleConditions><s:ruleCondition condition="satisfied" operator="not"/></s:ruleConditions><s:ruleAction action="retryAll"/></s:postConditionRule></s:sequencingRules></s:sequencing></p:item>');
    const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
    const random = t.mock.method(Math, 'random', () => 0);
    try {
      const binding = f.enroll(), first = f.launch(binding), initial = f.player.bootstrap(first.token); assert.equal(JSON.parse(initial.sequencingSnapshot!).currentActivityId, 'intro');
      random.mock.mockImplementation(() => 0.999);
      const receipt = f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.success_status': 'failed', 'cmi.score.scaled': '0.4', 'adl.nav.request': 'exit'}));
      const next = f.launch(binding), b = f.player.bootstrap(next.token), plan = JSON.parse(b.sequencingSnapshot!).sequencing.activityStates.org.selectionRandomizationState;
      assert.equal(plan.selectedChildIds[0], timing === 'once' ? 'intro' : 'practice', JSON.stringify({timing, receipt, plan, root: JSON.parse(b.sequencingSnapshot!).sequencing.activityStates.org.attemptCount})); assert.equal(receipt.nextScoId, plan.selectedChildIds[0]); assert.equal(b.state.entry, 'ab-initio');
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    } finally {random.mock.restore(); f.db.close();}
  }
});

test('zero selection is valid but delivers no SCO and creates no registration/proof; never ignores count', async () => {
  for (const timing of ['once', 'never']) {
    const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', selectionManifest('2004-4', timing, 'never', 0, false)));
    try {const binding = f.enroll(); if (timing === 'once') {assert.throws(() => f.launch(binding), /denies|deliver/); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_registrations').get()!.n, 0);} else {const launch = f.launch(binding); assert.equal(JSON.parse(f.player.bootstrap(launch.token).sequencingSnapshot!).currentActivityId, 'intro');} assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);} finally {f.db.close();}
  }
});

test('selection groups replace collection defaults; malformed/unselected definitions are refused', async () => {
  const control = '<s:randomizationControls selectionTiming="once" selectCount="1" reorderChildren="true" randomizationTiming="once"/>';
  const xml = collectionManifest().replace('<s:sequencing ID="shared-0">', '<s:sequencing ID="shared-0">' + control).replace('<s:sequencing IDRef="shared-0"/>', '<s:sequencing IDRef="shared-0"><s:randomizationControls/></s:sequencing>');
  const tree: Record<string, any> = sequencingTree((await inspectSCORMPackage(multiFilePackage('2004-4', xml))).manifest); assert.equal(tree.sequencingControls.selectCount, null); assert.equal(tree.sequencingControls.selectionTiming, 'never'); assert.equal(tree.sequencingControls.randomizeChildren, false);
  for (const invalid of ['selectionTiming="sometimes"', 'randomizationTiming=""', 'selectCount="-1"', 'selectCount="0.5"', 'selectCount="1.0"', 'selectCount="2049"', 'reorderChildren="yes"', 'selectionCountStatus="true"']) {
    const bad = selectionManifest().replace('</p:organizations>', `<p:organization identifier="unused"><p:title>Unused</p:title><s:sequencing><s:randomizationControls ${invalid}/></s:sequencing></p:organization></p:organizations>`);
    await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-4', bad)), /Unsupported|malformed/);
  }
});

test('randomization once preserves order on root retry; each-new-attempt shuffles before choosing delivery exactly once', async t => {
  const rule = '<s:sequencingRules><s:postConditionRule><s:ruleConditions><s:ruleCondition condition="satisfied" operator="not"/></s:ruleConditions><s:ruleAction action="retryAll"/></s:postConditionRule></s:sequencingRules>';
  for (const timing of ['once', 'onEachNewAttempt']) {
    const xml = selectionManifest('2004-4', 'never', timing, 2, true).replace('</s:objectives></s:sequencing>', '</s:objectives>' + rule + '</s:sequencing>').replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><s:sequencing>' + rule + '</s:sequencing>');
    const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml)), random = t.mock.method(Math, 'random', () => 0);
    try {
      const binding = f.enroll(), first = f.launch(binding), initial = JSON.parse(f.player.bootstrap(first.token).sequencingSnapshot!); assert.equal(initial.currentActivityId, 'practice'); assert.deepEqual(initial.sequencing.activityStates.org.selectionRandomizationState.childOrder, ['practice', 'intro']);
      const receipt = f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.success_status': 'failed', 'cmi.score.scaled': '0.4', 'adl.nav.request': 'exit'}));
      const next = f.launch(binding), b = JSON.parse(f.player.bootstrap(next.token).sequencingSnapshot!); assert.equal(b.currentActivityId, timing === 'once' ? 'practice' : 'intro'); assert.equal(receipt.nextScoId, b.currentActivityId); assert.equal(b.sequencing.activityStates.org.attemptCount, 2);
    } finally {random.mock.restore(); f.db.close();}
  }
});

test('selection count at or above the pool size and hidden presentation keep every SCO required for proof', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', selectionManifest('2004-4', 'once', 'never', 20, false).replace('identifier="practice"', 'identifier="practice" isvisible="false"')));
  try {
    const binding = f.enroll(), first = f.launch(binding); f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0); const next = f.launch(binding); f.player.checkpoint(next.token, sequenceCheckpoint(f, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}));
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)); assert.equal(proof.scos.length, 2);
  } finally {f.db.close();}
});

test('selected nested folders exclude only their unselected subtree from durable evidence', async () => {
  const xml = selectionManifest().replace('<p:item identifier="intro"', '<p:item identifier="intro-folder"><p:title>Intro group</p:title><p:item identifier="intro"').replace('</s:sequencing></p:item>', '</s:sequencing></p:item></p:item>').replace('<p:item identifier="practice"', '<p:item identifier="practice-folder"><p:title>Practice group</p:title><p:item identifier="practice"').replace('<p:title>Practice</p:title></p:item>', '<p:title>Practice</p:title></p:item></p:item>');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const launch = f.launch(f.enroll()), b = JSON.parse(f.player.bootstrap(launch.token).sequencingSnapshot!); assert.equal(b.sequencing.activityStates.org.selectionRandomizationState.selectedChildIds.length, 1);
    f.player.checkpoint(launch.token, sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}));
    const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)); assert.equal(proof.scos.length, 1); assert.equal(proof.scos[0].scoId, b.currentActivityId);
  } finally {f.db.close();}
});

test('unknown behavior adaptation snapshots are refused; legacy pinned-engine snapshots retain compatibility', async () => {
  const {trustedSequencing} = await import('../src/server/scorm-sequencing.ts');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', selectionManifest()));
  try {
    const launch = f.launch(f.enroll()), row = f.db.prepare('SELECT * FROM scorm_engine_attempts').get()!, envelope = JSON.parse(String(row.sequencing_state)), scope = {attemptId: String(row.id), sha256: f.pkg.sha256};
    const manifest = (await inspectSCORMPackage(multiFilePackage('2004-4', selectionManifest()))).manifest;
    envelope.engine.adaptation = 'unknown-engine-patch'; assert.throws(() => trustedSequencing(manifest, JSON.stringify(envelope), scope), /identity changed/);
    delete envelope.engine.adaptation; assert.ok(trustedSequencing(manifest, JSON.stringify(envelope), scope)); assert.ok(launch.token);
  } finally {f.db.close();}
});

test('selected pool/order and exact receipts survive actual database/server reopen', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path'), {fixture} = await import('./helpers.ts');
  const {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts'), {SCORMLearningBindings} = await import('../src/server/scorm-learning-bindings.ts');
  const dir = mkdtempSync(join(tmpdir(), 'pear-selection-reopen-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, multiFilePackage('2004-4', selectionManifest())), binding = f.enroll(), launch = f.launch(binding);
  const initial = f.player.bootstrap(launch.token), request = sequenceCheckpoint(f, launch, {'cmi.location': 'durable-selected-bookmark'}, false), receipt = f.player.checkpoint(launch.token, request); f.db.close();
  const opened = fixture(path), player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service));
  try {
    assert.deepEqual(player.checkpoint(launch.token, request), receipt); const b = player.bootstrap(launch.token); assert.equal(b.state.location, 'durable-selected-bookmark');
    assert.deepEqual(JSON.parse(b.sequencingSnapshot!).sequencing.activityStates.org.selectionRandomizationState, JSON.parse(initial.sequencingSnapshot!).sequencing.activityStates.org.selectionRandomizationState);
    const selected = JSON.parse(b.sequencingSnapshot!).currentActivityId, other = ['intro', 'practice'].find(id => id !== selected)!; assert.equal(player.context(opened.service.principal('learner-a'), binding).activities.find(a => a.id === other)!.available, false);
    assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {opened.db.close(); rmSync(dir, {recursive: true, force: true});}
});


test('explicit fresh choices cannot reroll a host pool, including a retake carrying a snapshot', async t => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', selectionManifest()));
  const random = t.mock.method(Math, 'random', () => 0);
  try {
    const binding = f.enroll();
    for (let i = 0; i < 8; i++) assert.throws(() => f.launch(binding, 'practice'), /Start the package flow/);
    assert.equal(random.mock.callCount(), 0); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_registrations').get()!.n, 0);
    const context = f.player.context(f.service.principal('learner-a'), binding); assert.equal(context.activities.find(a => a.id === 'practice')!.choiceAvailable, false);
    const first = f.launch(binding), b = f.player.bootstrap(first.token); assert.equal(JSON.parse(b.sequencingSnapshot!).currentActivityId, 'intro');
    random.mock.mockImplementation(() => 0.999);
    for (let i = 0; i < 8; i++) assert.throws(() => f.launch(binding, 'practice'), /prerequisite|denies/);
    const original = JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state)); assert.deepEqual(JSON.parse(original.snapshot).sequencing.activityStates.org.selectionRandomizationState.selectedChildIds, ['intro']);
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.completion_status': 'incomplete', 'cmi.success_status': 'failed', 'cmi.score.scaled': '0.2', 'adl.nav.request': 'exitAll'}));
    const current = f.player.context(f.service.principal('learner-a'), binding);
    f.player.retake(f.service.principal('learner-a'), {registrationId: current.registrationId!, attemptId: current.attemptId!, confirmed: true, revision: f.service.context('learner-a','learning:demo:learner-a').revision, key: 'selection-retake'});
    for (let i = 0; i < 8; i++) assert.throws(() => f.launch(binding, 'intro'), /Start the package flow/);
    const next = f.launch(binding), nextB = f.player.bootstrap(next.token); assert.equal(JSON.parse(nextB.sequencingSnapshot!).currentActivityId, 'practice');
  } finally {random.mock.restore(); f.db.close();}
});
