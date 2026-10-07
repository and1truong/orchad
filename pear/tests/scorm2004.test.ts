import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSCORM2004API, scorm2004Seconds} from '../src/shared/scorm2004-runtime.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import type {SCORM2004Edition} from '../src/shared/scorm2004-runtime.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {data, fixture} from './helpers.ts';

function snapshot(f: Awaited<ReturnType<typeof scormLearningFixture>>, launch: ReturnType<typeof f.launch>, values: Record<string, string>, finished = false) {
  const b = f.player.bootstrap(launch.token); let state: any, navigation = '_none_';
  const api = createSCORM2004API({edition: b.standard as SCORM2004Edition, state: b.state, checkpoint(s, _done, nav) {state = s; navigation = nav;}});
  assert.equal(api.Initialize(''), 'true');
  for (const [key, value] of Object.entries(values)) assert.equal(api.SetValue(key, value), 'true', key + ': ' + api.GetDiagnostic(''));
  assert.equal(finished ? api.Terminate('') : api.Commit(''), 'true');
  return {sequence: b.sequence + 1, revision: b.revision, state, finished, navigation};
}
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': API methods/errors, real interactions/objectives/comments, edition SPM and retryable termination', () => {
    let available = false;
    const api = createSCORM2004API({edition, state: {learner_id: 'original', learner_name: 'Original learner', entry: 'ab-initio', total_time: 'PT0S'}, checkpoint() {return available;}});
    assert.equal(Object.keys(api).length, 8);
    assert.equal(api.GetValue('cmi.location'), ''); assert.equal(api.GetLastError(), '122');
    assert.equal(api.SetValue('cmi.location', 'x'), 'false'); assert.equal(api.GetLastError(), '132');
    assert.equal(api.Commit(''), 'false'); assert.equal(api.GetLastError(), '142');
    assert.equal(api.Terminate(''), 'false'); assert.equal(api.GetLastError(), '112');
    assert.equal(api.Initialize('invalid'), 'false'); assert.equal(api.GetLastError(), '201');
    assert.equal(api.Initialize(''), 'true'); assert.equal(api.Initialize(''), 'false'); assert.equal(api.GetLastError(), '103');
    assert.equal(api.GetValue('cmi._version'), '1.0'); assert.equal(api.GetValue('cmi.entry'), 'ab-initio');
    assert.equal(api.SetValue('cmi.learner_id', 'forged'), 'false'); assert.equal(api.GetLastError(), '404');
    assert.equal(api.SetValue('cmi.score.scaled', '1.1'), 'false');
    assert.equal(api.SetValue('cmi.interactions.0.type', 'choice'), 'false'); assert.equal(api.GetLastError(), '408');
    for (const [key, value] of Object.entries({'cmi.interactions.0.id': 'q', 'cmi.interactions.0.type': 'choice', 'cmi.interactions.0.learner_response': 'answer', 'cmi.interactions.0.result': 'correct', 'cmi.objectives.0.id': 'o', 'cmi.objectives.0.success_status': 'passed', 'cmi.comments_from_learner.0.comment': 'Original comment', 'cmi.comments_from_learner.0.location': 'page', 'cmi.comments_from_learner.0.timestamp': '2026-10-07T12:00:00Z'})) assert.equal(api.SetValue(key, value), 'true', key);
    const limit = edition === '2004-2' ? 4000 : 64000;
    assert.equal(api.SetValue('cmi.suspend_data', 'x'.repeat(limit)), 'true'); assert.equal(api.SetValue('cmi.suspend_data', 'x'.repeat(limit + 1)), 'false');
    assert.equal(api.SetValue('adl.data.0.store', 'x'), 'false'); assert.equal(api.GetLastError(), '401');
    assert.equal(api.SetValue('adl.nav.request', 'continue'), 'false');
    assert.equal(api.Terminate(''), 'false'); assert.equal(api.GetLastError(), '111');
    available = true; assert.equal(api.Terminate(''), 'true');
    assert.equal(api.GetValue('cmi.location'), ''); assert.equal(api.GetLastError(), '123');
    assert.equal(api.Commit(''), 'false'); assert.equal(api.GetLastError(), '143');
    assert.equal(api.Terminate(''), 'false'); assert.equal(api.GetLastError(), '113');
    assert.equal(api.Initialize(''), 'false'); assert.equal(api.GetLastError(), '104');
  });
  test(edition + ': authoritative checkpoint, receipts, resume/time, separate success/completion and official proof', async () => {
    const f = await scormLearningFixture(undefined, multiFilePackage(edition, singleSCOManifest(edition)));
    try {
      const binding = f.enroll(), launch = f.launch(binding);
      assert.equal(launch.standard, edition);
      const request = snapshot(f, launch, {'cmi.location': 'page-2', 'cmi.suspend_data': 'đ'.repeat(edition === '2004-2' ? 4000 : 64000), 'cmi.exit': 'suspend', 'cmi.session_time': 'PT1M0.25S', 'cmi.score.scaled': '.9', 'cmi.score.raw': '9', 'cmi.score.min': '0', 'cmi.score.max': '10', 'cmi.completion_status': 'incomplete', 'cmi.success_status': 'passed', 'cmi.interactions.0.id': 'q', 'cmi.interactions.0.type': 'choice', 'cmi.interactions.0.learner_response': 'original-answer', 'cmi.objectives.0.id': 'o', 'cmi.objectives.0.success_status': 'passed', 'cmi.comments_from_learner.0.comment': 'Original note', 'adl.nav.request': 'suspendAll'});
      for (const changed of [{...request.state, learner_id: 'learner-b'}, {...request.state, mode: 'browse'}, {...request.state, total_time: 'PT99H'}, {...request.state, completion_threshold: '0'}, {...request.state, unknown: {}}, {...request.state, score: {scaled: '2'}}, {...request.state, session_time: 'PT1.234S'}]) assert.throws(() => f.player.checkpoint(launch.token, {...request, state: changed}));
      f.db.exec("CREATE TRIGGER reject_2004 BEFORE INSERT ON audit WHEN NEW.tool='runtime_scorm_engine_checkpoint' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
      assert.throws(() => f.player.checkpoint(launch.token, request), /audit failed/); assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()?.revision, 0);
      f.db.exec('DROP TRIGGER reject_2004');
      const saved = f.player.checkpoint(launch.token, request); assert.deepEqual(f.player.checkpoint(launch.token, request), saved);
      assert.throws(() => f.player.checkpoint(launch.token, {...request, navigation: 'exit'}), /payload changed/);
      assert.equal(f.player.bootstrap(launch.token).navigation, 'suspendAll');
      const finish = snapshot(f, launch, {}, true); assert.equal(f.player.checkpoint(launch.token, finish).officialLearningChanged, false);
      assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_completion_proofs').get()?.n, 0);
      const next = f.launch(binding), b = f.player.bootstrap(next.token);
      assert.equal(b.state.entry, 'resume'); assert.equal(b.state.total_time, 'PT60.25S'); assert.equal(b.state.session_time, 'PT0S');
      assert.equal(b.state.interactions['0'].learner_response, 'original-answer'); assert.equal(b.state.objectives['0'].success_status, 'passed'); assert.equal(b.state.comments_from_learner['0'].comment, 'Original note');
      assert.equal(b.state.suspend_data.length, edition === '2004-2' ? 4000 : 64000);
      const passed = snapshot(f, next, {'cmi.completion_status': 'completed', 'cmi.session_time': 'PT10S'}, true);
      const accepted = f.player.checkpoint(next.token, passed); assert.equal(accepted.officialLearningChanged, true);
      assert.deepEqual(f.player.checkpoint(next.token, passed), accepted);
      const evidence = JSON.parse((f.db.prepare('SELECT evidence FROM scorm_completion_proofs').get() as any).evidence);
      assert.equal(evidence.scos[0].score, 90); assert.equal(evidence.scos[0].seconds, 70.25);
      assert.equal(f.db.prepare('SELECT count(*) AS n FROM certificates').get()?.n, 0); f.quiz(binding.enrollmentId);
      assert.equal(f.db.prepare('SELECT count(*) AS n FROM certificates').get()?.n, 1);
    } finally {f.db.close();}
  });
}
test('SCORM 2004 completion threshold CAM mapping and exit/time binding reject unsupported edition semantics', async () => {
  const edition = '2004-4', xml = singleSCOManifest(edition).replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:dataFromLMS> original launch </runtime:dataFromLMS><runtime:completionThreshold completedByMeasure="true" minProgressMeasure="0.8"/>');
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, xml));
  try {
    const binding = f.enroll(), launch = f.launch(binding), b = f.player.bootstrap(launch.token);
    assert.equal(b.state.launch_data, ' original launch '); assert.equal(b.state.completion_threshold, '0.8');
    f.player.checkpoint(launch.token, snapshot(f, launch, {'cmi.progress_measure': '.7', 'cmi.success_status': 'passed', 'cmi.score.scaled': '.9', 'cmi.completion_status': 'completed'}, true));
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_completion_proofs').get()?.n, 0);
    const next = f.launch(binding); assert.equal(f.player.checkpoint(next.token, snapshot(f, next, {'cmi.progress_measure': '.9'}, true)).officialLearningChanged, true);
    await assert.rejects(inspectSCORMPackage(multiFilePackage('2004-3', xml.replace('2004 4th Edition', '2004 3rd Edition'))), /4th edition/);
  } finally {f.db.close();}
  assert.equal(scorm2004Seconds('P1DT2H3M4.05S'), 93784.05);
  for (const duration of ['P', 'PT', 'P1W', 'P1DT', 'P1H', 'PT1,5S', 'PT1.234S', '-PT1S', 'PT999999999999999999S']) assert.throws(() => scorm2004Seconds(duration));
});
test('SCORM 2004 accepted state and receipts survive SQLite reopening and preview cannot project official completion', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pear-scorm2004-')), path = join(dir, 'db.sqlite');
  let f = await scormLearningFixture(path, multiFilePackage('2004-3', singleSCOManifest('2004-3')));
  const binding = f.enroll(), launch = f.launch(binding), request = snapshot(f, launch, {'cmi.exit': 'suspend', 'cmi.location': 'durable', 'cmi.session_time': 'PT25S'}), saved = f.player.checkpoint(launch.token, request);
  f.db.close();
  const reopened = fixture(path);
  try {
    const player = new SCORMPlayerService(reopened.db, new SCORMLearningBindings(reopened.db, reopened.service));
    assert.deepEqual(player.checkpoint(launch.token, request), saved); assert.equal(player.bootstrap(launch.token).state.location, 'durable');
    const p = reopened.service.principal('admin'), preview = player.launch(p, 'session-admin', {packageId: f.pkg.id, version: 1, mode: 'preview', confirmed: true, revision: reopened.service.context('admin', 'learning:demo:admin').revision, key: crypto.randomUUID()});
    const b = player.bootstrap(preview.token); assert.equal(b.state.credit, 'no-credit'); assert.equal(b.state.mode, 'browse');
    let state: any; const api = createSCORM2004API({edition: '2004-3', state: b.state, checkpoint(s) {state = s;}});
    api.Initialize(''); api.SetValue('cmi.completion_status', 'completed'); api.SetValue('cmi.success_status', 'passed'); api.Terminate('');
    assert.equal(player.checkpoint(preview.token, {state, finished: true, sequence: 1, revision: 0}).officialLearningChanged, false);
    assert.equal(reopened.db.prepare('SELECT count(*) AS n FROM scorm_completion_proofs').get()?.n, 0);
  } finally {reopened.db.close(); rmSync(dir, {recursive: true, force: true});}
});
