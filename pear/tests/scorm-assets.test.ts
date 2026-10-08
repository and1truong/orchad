import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assetManifest, assetPackage} from './scorm-assets-fixture.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
for (const standard of ['1.2', '2004-2', '2004-3', '2004-4'] as const) {
  test(`${standard}: noncommunicating asset advances durably without CMI or score evidence`, async () => {
    const f = await scormLearningFixture(undefined, assetPackage(standard));
    try {
      const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token);
      assert.equal(b.kind, 'asset'); assert.deepEqual(b.state, {}); assert.equal(b.sequencingTree, undefined); assert.equal(b.sequencingSnapshot, undefined); assert.ok(b.assetNavigation?.includes('continue'));
      const request = {sequence: b.sequence + 1, revision: b.revision, navigation: 'continue'};
      for (const extra of [{state: {score: 100}}, {finished: true}, {sharedData: {'forged': 'x'}}, {sequencingSnapshot: '{}'}, {session_time: 'PT5H'}]) assert.throws(() => f.player.advanceAsset(launch.token, {...request, ...extra}), /Exact checkpoint/);
      assert.throws(() => f.player.checkpoint(launch.token, {...request, state: {}, finished: true}), /Exact communicating/);
      const receipt = f.player.advanceAsset(launch.token, request); assert.equal(receipt.nextScoId, 'practice'); assert.equal(receipt.officialLearningChanged, false); assert.deepEqual(f.player.advanceAsset(launch.token, request), receipt);
      assert.throws(() => f.player.advanceAsset(launch.token, {...request, navigation: 'exitAll'}), /payload changed/);
      assert.equal(f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts WHERE sco_id=?').get('intro')!.reported_seconds, 0); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      const next = f.launch(binding), nextB = f.player.bootstrap(next.token); assert.equal(nextB.kind, 'sco'); assert.equal(nextB.href.split('?')[0], 'lessons/practice.html');
      assert.throws(() => f.player.advanceAsset(next.token, {sequence: 1, revision: 0, navigation: 'exitAll'}), /Exact communicating/);
      if (standard === '1.2') f.checkpoint(next); else f.player.checkpoint(next.token, sequenceCheckpoint(f, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT20S', 'adl.nav.request': 'exitAll'}));
      const proof = JSON.parse(String(f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get()!.evidence)); assert.deepEqual(proof.scos.map((s: any) => s.scoId), ['practice']); assert.equal(proof.scos[0].seconds, 20); assert.equal(f.player.context(f.service.principal('learner-a'), binding).completed, true);
    } finally {f.db.close();}
  });
  test(`${standard}: asset-only navigation never produces an empty official proof`, async () => {
    const f = await scormLearningFixture(undefined, assetPackage(standard, assetManifest(standard, true)));
    try {const binding = f.enroll(), first = f.launch(binding), b = f.player.bootstrap(first.token); f.player.advanceAsset(first.token, {sequence: 1, revision: b.revision, navigation: 'continue'}); const second = f.launch(binding), next = f.player.bootstrap(second.token); assert.equal(next.kind, 'asset'); f.player.advanceAsset(second.token, {sequence: 1, revision: next.revision, navigation: 'exitAll'}); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0); assert.equal(f.player.context(f.service.principal('learner-a'), binding).completed, false);} finally {f.db.close();}
  });
}

test('asset advancement rolls back atomically and old receipts still require live authority', async () => {
  const f = await scormLearningFixture(undefined, assetPackage('2004-4'));
  try {
    const first = f.launch(f.enroll()), b = f.player.bootstrap(first.token), request = {sequence: 1, revision: b.revision, navigation: 'continue'};
    f.db.exec("CREATE TRIGGER asset_audit_failure BEFORE INSERT ON audit WHEN NEW.tool='runtime_scorm_engine_checkpoint' BEGIN SELECT RAISE(ABORT,'asset audit failure'); END");
    assert.throws(() => f.player.advanceAsset(first.token, request), /asset audit failure/); assert.equal(f.db.prepare('SELECT sequence FROM scorm_engine_launches').get()!.sequence, 0); assert.equal(f.db.prepare('SELECT finished FROM scorm_sco_attempts').get()!.finished, 0); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 0);
    f.db.exec('DROP TRIGGER asset_audit_failure'); const result = f.player.advanceAsset(first.token, request); assert.equal(result.nextScoId, 'practice');
    f.db.prepare('UPDATE sessions SET expires=0 WHERE token_hash=?').run('session-learner-a'); assert.throws(() => f.player.advanceAsset(first.token, request), /session|Session|capability|Capability/);
  } finally {f.db.close();}
});

test('asset navigation presentation follows ADL hiding and flow validity; no implicit content tracking override', async () => {
  const base = assetManifest('2004-4').replace('<p:manifest ', '<p:manifest xmlns:n="http://www.adlnet.org/xsd/adlnav_v1p3" ');
  for (const xml of [base.replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><n:presentation><n:navigationInterface><n:hideLMSUI>continue</n:hideLMSUI></n:navigationInterface></n:presentation>'), base.replace('flow="true"', 'flow="false"')]) {
    const f = await scormLearningFixture(undefined, assetPackage('2004-4', xml));
    try {const launch = f.launch(f.enroll()), b = f.player.bootstrap(launch.token); assert.equal(b.assetNavigation?.includes('continue'), false); assert.ok(b.assetNavigation?.includes('exitAll'));} finally {f.db.close();}
  }
  const f = await scormLearningFixture(undefined, assetPackage('2004-4', assetManifest('2004-4').replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><s:sequencing><s:deliveryControls completionSetByContent="true" objectiveSetByContent="true"/></s:sequencing>')));
  try {const binding = f.enroll(), first = f.launch(binding); f.player.advanceAsset(first.token, {sequence: 1, revision: 0, navigation: 'continue'}); const second = f.launch(binding); f.player.checkpoint(second.token, sequenceCheckpoint(f, second, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'})); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);} finally {f.db.close();}
});
