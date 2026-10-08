import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormTime} from '../src/server/scorm-runtime-validation.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {fixture} from './helpers.ts';
import type {SCORMStandard} from '../src/shared/scorm-engine.ts';

function report(player: SCORMPlayerService, token: string, edition: SCORMStandard, seconds: number, finished = false) {
  const b = player.bootstrap(token); let state: any;
  const old = edition === '1.2';
  const options = {state: b.state, checkpoint(value: any) {state = value;}};
  if (old) {
    const api = createSCORM12API(options); assert.equal(api.LMSInitialize(''), 'true');
    assert.equal(api.LMSSetValue('cmi.core.session_time', scormTime(seconds)), 'true');
    assert.equal(api.LMSSetValue('cmi.core.exit', 'suspend'), 'true');
    assert.equal(finished ? api.LMSFinish('') : api.LMSCommit(''), 'true');
  } else {
    const api = createSCORM2004API({...options, edition}); assert.equal(api.Initialize(''), 'true');
    assert.equal(api.SetValue('cmi.session_time', 'PT' + seconds + 'S'), 'true'); assert.equal(api.SetValue('cmi.exit', 'suspend'), 'true');
    assert.equal(finished ? api.Terminate('') : api.Commit(''), 'true');
  }
  return {sequence: b.sequence + 1, revision: b.revision, state, finished};
}

for (const edition of ['1.2', '2004-2', '2004-3', '2004-4'] as const) test(edition + ': last session-time replacement may decrease without changing earlier sessions or duplicating accepted time', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pear-session-time-')), path = join(directory, 'db.sqlite');
  const f = await scormLearningFixture(path, multiFilePackage(edition, singleSCOManifest(edition)));
  let reopened: ReturnType<typeof fixture> | undefined;
  try {
    const binding = f.enroll(), first = f.launch(binding);
    f.player.checkpoint(first.token, report(f.player, first.token, edition, 11.11, true));
    f.player.close(f.service.principal('learner-a'), first.launchId, 'session-learner-a');
    const launch = f.launch(binding), initial = f.player.bootstrap(launch.token), total = edition === '1.2' ? initial.state.core.total_time : initial.state.total_time;
    for (const seconds of [30.03, 10.01, 0, 0.03, 0.01, 20.02]) {
      const request = report(f.player, launch.token, edition, seconds), receipt = f.player.checkpoint(launch.token, request);
      assert.deepEqual(f.player.checkpoint(launch.token, request), receipt);
      assert.equal(f.player.status(f.service.principal('learner-a'), launch.launchId, 'session-learner-a').reported_seconds, (1111 + Math.round(seconds * 100)) / 100);
      const b = f.player.bootstrap(launch.token); assert.equal(edition === '1.2' ? b.state.core.total_time : b.state.total_time, total);
      if (request.sequence > 1) assert.throws(() => f.player.checkpoint(launch.token, {...request, sequence: request.sequence - 1}), /payload changed/);
    }
    const correction = report(f.player, launch.token, edition, 5.05);
    f.db.exec("CREATE TRIGGER reject_time BEFORE INSERT ON audit WHEN NEW.tool='runtime_scorm_engine_checkpoint' BEGIN SELECT RAISE(ABORT,'time rollback'); END");
    assert.throws(() => f.player.checkpoint(launch.token, correction), /time rollback/);
    assert.equal(f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts').get()!.reported_seconds, 31.13);
    f.db.exec('DROP TRIGGER reject_time');
    const receipt = f.player.checkpoint(launch.token, correction); f.db.close();
    reopened = fixture(path); const player = new SCORMPlayerService(reopened.db, new SCORMLearningBindings(reopened.db, reopened.service));
    assert.deepEqual(player.checkpoint(launch.token, correction), receipt);
    assert.equal(player.status(reopened.service.principal('learner-a'), launch.launchId, 'session-learner-a').reported_seconds, 16.16);
    player.checkpoint(launch.token, report(player, launch.token, edition, 0, true));
    player.close(reopened.service.principal('learner-a'), launch.launchId, 'session-learner-a');
    const next = player.launch(reopened.service.principal('learner-a'), 'session-learner-a', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, confirmed: true, revision: reopened.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
    const b = player.bootstrap(next.token); assert.equal(edition === '1.2' ? b.state.core.total_time : b.state.total_time, total);
    assert.equal(reopened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {if (f.db.isOpen) f.db.close(); reopened?.db.close(); rmSync(directory, {recursive: true, force: true});}
});

test('accumulated centisecond overflow is rejected transactionally', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', singleSCOManifest('2004-4')));
  try {
    const launch = f.launch(f.enroll());
    f.db.prepare('UPDATE scorm_sco_attempts SET reported_seconds=?').run(Number.MAX_SAFE_INTEGER / 100);
    assert.throws(() => f.player.checkpoint(launch.token, report(f.player, launch.token, '2004-4', 1)), /time quota/);
    assert.equal(f.db.prepare('SELECT sequence FROM scorm_engine_launches').get()!.sequence, 0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 0);
  } finally {f.db.close();}
});
