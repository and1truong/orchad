import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  for (const finished of [false, true]) test(edition + ': ' + (finished ? 'Terminate keeps suspended data and starts a fresh non-suspended SCO attempt' : 'interrupted unfinished sessions retain acknowledged state independently of exit hints'), async () => {
    for (const exit of ['normal', 'logout', 'time-out', '', 'suspend']) {
      const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
      try {
        const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
        const api = createSCORM2004API({edition, state: b.state, checkpoint(s) {state = s;}}); assert.equal(api.Initialize(''), 'true');
        for (const [key, value] of Object.entries({'cmi.location': 'original-bookmark', 'cmi.suspend_data': 'original-data', 'cmi.session_time': 'PT12S', 'cmi.exit': exit, 'cmi.completion_status': 'incomplete'})) assert.equal(api.SetValue(key, value), 'true', key);
        assert.equal(finished ? api.Terminate('') : api.Commit(''), 'true');
        const request = {sequence: 1, revision: b.revision, state, finished}, receipt = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
        const old = f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!;
        f.player.close(f.service.principal('learner-a'), launch.launchId, 'session-learner-a'); const next = f.launch(binding), boot = f.player.bootstrap(next.token);
        const fresh = finished && exit !== 'suspend';
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n, fresh ? 2 : 1, exit);
        const restored = createSCORM2004API({edition, state: boot.state}); assert.equal(restored.Initialize(''), 'true');
        for (const [field, value] of [['location', 'original-bookmark'], ['suspend_data', 'original-data']]) {assert.equal(restored.GetValue('cmi.' + field), fresh ? '' : value, exit); assert.equal(restored.GetLastError(), fresh ? '403' : '0');}
        assert.equal(boot.revision, fresh ? 0 : b.revision + 1); assert.equal(boot.state.total_time, fresh ? 'PT0S' : 'PT12S');
        assert.equal(boot.state.entry, fresh ? 'ab-initio' : exit === 'suspend' ? 'resume' : '');
        const retained = f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE sco_attempt_number=1').get()!;
        if (fresh) assert.deepEqual(retained, old);
        assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
        assert.throws(() => f.player.checkpoint(launch.token, request), /closed/);
      } finally {f.db.close();}
    }
  });
}
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': failed fresh launch preserves finished history and the exact accepted receipt before retry', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
  try {
    const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token); let state: any;
    const api = createSCORM2004API({edition, state: b.state, checkpoint(s) {state = s;}}); assert.equal(api.Initialize(''), 'true');
    assert.equal(api.SetValue('cmi.location', 'original-bookmark'), 'true'); assert.equal(api.SetValue('cmi.exit', 'normal'), 'true'); assert.equal(api.Terminate(''), 'true');
    const request = {sequence: 1, revision: b.revision, state, finished: true}, receipt = f.player.checkpoint(launch.token, request), old = f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!;
    f.db.exec("CREATE TRIGGER reject_fresh_launch BEFORE INSERT ON audit WHEN NEW.tool='human_scorm_engine_launch' BEGIN SELECT RAISE(ABORT,'fresh launch audit failed'); END");
    assert.throws(() => f.launch(binding), /fresh launch audit failed/); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').get(), old);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n, 1); assert.equal(f.db.prepare('SELECT closed FROM scorm_engine_launches').get()!.closed, 0);
    assert.deepEqual(f.player.checkpoint(launch.token, request), receipt); f.db.exec('DROP TRIGGER reject_fresh_launch');
    const next = f.player.bootstrap(f.launch(binding).token); assert.equal(next.revision, 0); assert.equal(next.state.location, undefined); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n, 2);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE sco_attempt_number=1').get(), old);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});
