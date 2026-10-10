import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sequencingManifest} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
for (const edition of ['2004-2','2004-3','2004-4'] as const) test(edition + ': trusted SuspendAll overrides normal/empty exit entry on exact retry and reopen', async () => {
  for (const exit of ['normal', '']) {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, sequencingManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding, 'intro');
      const request = sequenceCheckpoint(f, launch, {'cmi.location':'suspended-page', 'cmi.suspend_data':'own-data', 'cmi.exit':exit, 'cmi.completion_status':'incomplete', 'cmi.session_time':'PT12S', 'adl.nav.request':'suspendAll'});
      const receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      const before = f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!;
      const envelope = JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));
      assert.equal(JSON.parse(envelope.snapshot).sequencing.suspendedActivity, 'intro');
      const resumed = f.launch(binding, 'intro'), boot = f.player.bootstrap(resumed.token);
      assert.equal(boot.state.entry, 'resume'); assert.equal(boot.state.location, 'suspended-page'); assert.equal(boot.state.suspend_data, 'own-data'); assert.equal(boot.state.total_time, 'PT12S');
      assert.equal(boot.revision, before.revision); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n, 1);
      const stored = f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!; assert.equal(stored.runtime_state, before.runtime_state); assert.equal(stored.reported_seconds, before.reported_seconds);
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      assert.throws(() => f.player.checkpoint(launch.token, request), /closed/);
    } finally {f.db.close();}
  }
});
