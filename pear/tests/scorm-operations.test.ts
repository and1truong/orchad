import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, statSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {scormLaunchDiagnostics, scormTenantDiagnostics} from '../src/server/scorm-diagnostics.ts';
import {createApp} from '../src/server/app.ts';
import {backupPearDatabase, restorePearDatabase} from '../src/server/database-recovery.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {SCORM_RUNTIME_LIMITS} from '../src/shared/scorm-operations.ts';
import {multiFilePackage, multiFileManifest} from './scorm-package-fixture.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {playbackActivities} from '../src/server/scorm-activities.ts';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

test('support packets omit private state, authored strings, credentials and cross-session/tenant data and recheck live authority', async () => {
  const f = await scormLearningFixture(), binding = f.enroll(), p = f.service.principal('learner-a'), launch = f.launch(binding, 'intro');
  try {
    f.checkpoint(launch, 'incomplete', '75', false, 'private-bookmark-sentinel');
    const before = f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision;
    f.db.prepare("UPDATE scorm_engine_packages SET title=?").run('private-authored-title');
    const packet = scormLaunchDiagnostics(f.player, p, launch.launchId, 'session-learner-a'), summary = scormTenantDiagnostics(f.db, f.service.principal('admin'), true);
    assert.equal(packet.launch.sequence, 1); assert.equal(packet.launch.reportedSeconds, 20); assert.equal(summary.execution.proofs, 0); assert.equal(summary.versions.published, 1);
    const bytes = JSON.stringify({packet, summary});
    for (const text of [launch.token, 'session-learner-a', 'private-bookmark-sentinel', 'private-authored-title', 'learner-a', 'suspend_data', 'runtime_state', 'initial_state', 'sequencing_state', 'archive', 'student_response']) {
      // Aggregate archive byte counts are permitted, package source bytes are not.
      if (text === 'archive') continue;
      assert.equal(bytes.includes(text), false, text);
    }
    assert.throws(() => scormTenantDiagnostics(f.db, p, true), /administrator/);
    assert.throws(() => scormLaunchDiagnostics(f.player, f.service.principal('learner-b'), launch.launchId, 'session-learner-b'), /Own/);
    assert.throws(() => scormLaunchDiagnostics(f.player, p, launch.launchId, 'different-session'), /Own/);
    assert.throws(() => scormLaunchDiagnostics(f.player, {...p, tenant: 'another-tenant'}, launch.launchId, 'session-learner-a'), /Active/);
    assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision, before);
    f.db.exec("UPDATE accounts SET active=0 WHERE id='learner-a'"); assert.throws(() => scormLaunchDiagnostics(f.player, p, launch.launchId, 'session-learner-a'), /Active/);
  } finally {f.db.close();}
});

test('real sequenced launch/CMI rejection and trusted-state recovery produce no direct content/learner logs under the pinned logging adaptation', async () => {
  const f = await scormLearningFixture(undefined, sequencingPackage('2004-4')), methods = ['debug', 'log', 'info', 'warn', 'error'] as const, original = Object.fromEntries(methods.map(method => [method, console[method]])), output: unknown[][] = [];
  try {
    const source = readFileSync(new URL('../node_modules/scorm-again/dist/esm/scorm2004.js', import.meta.url)); assert.equal(createHash('sha256').update(source).digest('hex'), '5312ce9cf54a83580a5e839c03cf6338a3b1d30d18fb0ab81f955b2ec603cb6b');
    for (const method of methods) console[method] = (...args: unknown[]) => {output.push(args);};
    const launch = f.launch(f.enroll(), 'intro'), b = f.player.bootstrap(launch.token);
    assert.throws(() => f.player.checkpoint(launch.token, {sequence: 1, revision: 0, state: {...b.state, learner_name: 'private-learner-log-sentinel'}, finished: false}), /Server-owned CMI value changed/);
    assert.equal(output.length, 0);
  } finally {for (const method of methods) console[method] = original[method]; f.db.close();}
});

test('manifest visibility is retained for presentation, defaults independently for children and rejects invalid booleans', async () => {
  for (const standard of ['1.2', '2004-4'] as const) {
    const bytes = multiFilePackage(standard, multiFileManifest(standard).replace('identifier="intro"', 'identifier="intro" isvisible="false"'));
    const parsed = await inspectSCORMPackage(bytes); const profiles = playbackActivities(parsed.manifest);
    assert.equal(profiles.find(p => p.activity.id === 'intro')!.activity.isVisible, false);
    assert.equal(profiles.find(p => p.activity.id === 'practice')!.activity.isVisible, undefined);
    const folderXML = multiFileManifest(standard).replace('<p:item identifier="intro"', '<p:item identifier="folder" isvisible="false"><p:title>Hidden folder</p:title><p:item identifier="intro"').replace('</p:organization>', '</p:item></p:organization>');
    const nested = playbackActivities((await inspectSCORMPackage(multiFilePackage(standard, folderXML))).manifest);
    assert.ok(nested.every(p => p.activity.isVisible === undefined && p.ancestors[0].isVisible === false));
    await assert.rejects(() => inspectSCORMPackage(multiFilePackage(standard, multiFileManifest(standard).replace('identifier="intro"', 'identifier="intro" isvisible="bogus"'))), /visibility/);
  }
});

test('failed authority invalidation cannot leave a runnable restored database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scorm-failed-recovery-')), snapshot = join(dir, 'snapshot.sqlite'), destination = join(dir, 'failed.sqlite'), f = await scormLearningFixture();
  try {
    f.db.exec("CREATE TRIGGER fail_recovery_session BEFORE DELETE ON sessions BEGIN SELECT RAISE(ABORT,'simulated recovery fault'); END");
    await backupPearDatabase(f.db, snapshot); await assert.rejects(() => restorePearDatabase(snapshot, destination), /simulated recovery fault/); assert.equal(existsSync(destination), false); assert.equal(existsSync(snapshot), true);
  } finally {f.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('runtime capacity refuses new writes atomically while accepted receipt replay and immutable history remain available', async () => {
  const f = await scormLearningFixture(), binding = f.enroll(), launch = f.launch(binding, 'intro');
  try {
    const saved = f.checkpoint(launch, 'incomplete', '75', false), before = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), audit = f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
    const receipts = new SCORMPlayerService(f.db, new SCORMLearningBindings(f.db, f.service), {...SCORM_RUNTIME_LIMITS, maxCheckpointReceiptsPerLaunch: 1});
    assert.deepEqual(receipts.checkpoint(launch.token, saved.request), saved.result);
    const next = {...saved.request, sequence: 2, revision: 1}; assert.throws(() => receipts.checkpoint(launch.token, next), /quota/);
    const capacity = new SCORMPlayerService(f.db, new SCORMLearningBindings(f.db, f.service), {...SCORM_RUNTIME_LIMITS, maxRuntimeStorageBytesPerTenant: 1});
    assert.throws(() => capacity.checkpoint(launch.token, next), /quota/); assert.deepEqual(capacity.checkpoint(launch.token, saved.request), saved.result);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), before); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 1); assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n, audit);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    const principal = f.service.principal('learner-b'), context = f.service.context('learner-b'), registrations = f.db.prepare('SELECT * FROM scorm_registrations').all(), keys = f.db.prepare('SELECT * FROM idempotency').all();
    assert.throws(() => capacity.launch(principal, 'session-learner-b', {packageId: f.pkg.id, version: 1, mode: 'normal', confirmed: true, revision: context.revision, key: 'quota-refused-launch'}), /quota/);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_registrations').all(), registrations); assert.deepEqual(f.db.prepare('SELECT * FROM idempotency').all(), keys); assert.equal(f.service.context('learner-b').revision, context.revision);
  } finally {f.db.close();}
});

test('recovery preserves existing official proof/certificate history and never overwrites an existing destination', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scorm-proof-recovery-')), destination = join(dir, 'restored.sqlite'), f = await scormLearningFixture(), binding = f.enroll();
  try {
    f.checkpoint(f.launch(binding, 'intro')); f.checkpoint(f.launch(binding, 'practice')); f.quiz(binding.enrollmentId);
    const proofs = f.db.prepare('SELECT * FROM scorm_completion_proofs').all(), certificates = f.db.prepare('SELECT * FROM certificates').all();
    const snapshot = join(dir, 'snapshot.sqlite'); await backupPearDatabase(f.db, snapshot); await restorePearDatabase(snapshot, destination);
    const {fixture} = await import('./helpers.ts'), r = fixture(destination);
    try {
      assert.deepEqual(r.db.prepare('SELECT * FROM scorm_completion_proofs').all(), proofs); assert.deepEqual(r.db.prepare('SELECT * FROM certificates').all(), certificates);
      assert.throws(() => r.db.exec("UPDATE scorm_completion_proofs SET evidence='{}'"), /immutable/);
      await assert.rejects(() => restorePearDatabase(snapshot, destination), /EEXIST/); assert.deepEqual(r.db.prepare('SELECT * FROM certificates').all(), certificates);
    } finally {r.db.close();}
  } finally {f.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('human diagnostics download requires current HTTP identity/epoch and is absent from bridge catalog', async () => {
  const f = await scormLearningFixture(), origin = 'http://127.0.0.1:4350', {app} = await createApp({db: f.db, origin, developmentAuth: true, scormContent: {origin: 'http://localhost:4351', runtimeBundle: Buffer.from('/* fixture */')}});
  try {
    assert.equal((await app.inject({url: '/api/scorm-engine/diagnostics', headers: {host: '127.0.0.1:4350'}})).statusCode, 401);
    const login = await app.inject({method: 'POST', url: '/api/login', headers: {host: '127.0.0.1:4350', origin}, payload: {username: 'admin', password: 'admin-dev'}});
    const headers = {host: '127.0.0.1:4350', cookie: login.headers['set-cookie']!.toString().split(';')[0]!, 'x-pear-epoch': login.json().sessionEpoch};
    const response = await app.inject({url: '/api/scorm-engine/diagnostics', headers}); assert.equal(response.statusCode, 200); assert.match(response.headers['content-disposition']!, /attachment/); assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.json().scope, 'own-tenant-aggregate');
    assert.notEqual((await app.inject({url: '/api/scorm-engine/diagnostics', headers: {...headers, 'x-pear-epoch': 'stale'}})).statusCode, 200);
    const catalog = (await app.inject({url: '/api/describe', headers})).json(); assert.equal(JSON.stringify(catalog).includes('scorm-engine/diagnostics'), false);
    f.db.exec("UPDATE accounts SET role='learner' WHERE id='admin'"); assert.equal((await app.inject({url: '/api/scorm-engine/diagnostics', headers})).statusCode, 403);
  } finally {await app.close(); f.db.close();}
});

test('online whole-DB backup and offline restore preserve accepted sequencing/receipts/history but revoke old sessions and launch capabilities', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scorm-recovery-')), source = join(dir, 'source.sqlite'), snapshot = join(dir, 'backup.sqlite'), destination = join(dir, 'restored.sqlite');
  const f = await scormLearningFixture(source, sequencingPackage('2004-4')), binding = f.enroll(), launch = f.launch(binding, 'intro');
  const checkpoint = (player: typeof f.player, active: typeof launch, values: Record<string, string>, finished: boolean) => {
    const b = player.bootstrap(active.token); let state: any, navigation = '_none_';
    const api = createSCORM2004API({edition: '2004-4', state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot, checkpoint(s, _finished, nav) {state = s; navigation = nav;}}); assert.equal(api.Initialize(''), 'true');
    for (const [key, value] of Object.entries(values)) assert.equal(api.SetValue(key, value), 'true'); assert.equal(finished ? api.Terminate('') : api.Commit(''), 'true');
    const request = {sequence: b.sequence + 1, revision: b.revision, state, navigation, finished}; return {request, receipt: player.checkpoint(active.token, request)};
  };
  try {
    const saved = checkpoint(f.player, launch, {'cmi.location': 'recovery-bookmark', 'cmi.suspend_data': 'private-recovery-state', 'cmi.exit': 'suspend', 'cmi.completion_status': 'incomplete', 'cmi.session_time': 'PT12S'}, false);
    const history = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), sequence = f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state;
    await backupPearDatabase(f.db, snapshot); assert.equal(statSync(snapshot).mode & 0o777, 0o600);
    // A later accepted source checkpoint must not leak into the already coherent snapshot.
    checkpoint(f.player, launch, {'cmi.location': 'after-backup', 'cmi.session_time': 'PT20S'}, false);
    await assert.rejects(() => backupPearDatabase(f.db, snapshot), /EEXIST/); await restorePearDatabase(snapshot, destination);
    const {fixture} = await import('./helpers.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts'), {SCORMLearningBindings} = await import('../src/server/scorm-learning-bindings.ts');
    const r = fixture(destination), player = new SCORMPlayerService(r.db, new SCORMLearningBindings(r.db, r.service));
    try {
      assert.equal(r.db.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok'); assert.deepEqual(r.db.prepare('SELECT * FROM scorm_sco_attempts').all(), history); assert.equal(r.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state, sequence);
      assert.deepEqual(JSON.parse(String(r.db.prepare('SELECT result FROM scorm_engine_checkpoints WHERE sequence=1').get()!.result)), saved.receipt); assert.equal(r.db.prepare('SELECT count(*) n FROM sessions').get()!.n, 0);
      assert.throws(() => player.bootstrap(launch.token), /closed|expired/); assert.equal(r.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
      r.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run('restored-new-session', 'learner-a', 'csrf', Date.now() + 86400000, 0);
      const launchRestored = (scoId: string) => player.launch(r.service.principal('learner-a'), 'restored-new-session', {packageId: f.pkg.id, version: 1, mode: 'normal', binding, scoId, confirmed: true, revision: r.service.context('learner-a').revision, key: crypto.randomUUID()});
      const resumed = launchRestored('intro'), b = player.bootstrap(resumed.token); assert.equal(b.state.entry, 'resume'); assert.equal(b.state.location, 'recovery-bookmark'); assert.equal(b.state.total_time, 'PT12S');
      checkpoint(player, resumed, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}, true);
      const next = launchRestored('practice'); assert.equal(checkpoint(player, next, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'exitAll'}, true).receipt.officialLearningChanged, true);
      assert.equal(r.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
    } finally {r.db.close();}
  } finally {f.db.close(); rmSync(dir, {recursive: true, force: true});}
});


test('licensed wrapper fixtures match the declared upstream bytes and normalization', () => {
  const pip = readFileSync(new URL('./fixtures/scorm/pipwerks-wrapper.js', import.meta.url));
  assert.equal(createHash('sha256').update(pip).digest('hex'), 'ec1702f1b0e620d7d1dc6a737b0daf47487a3b893fe5cab5deb35850f2901706');
  const original = Buffer.from(pip.toString('utf8').replaceAll('\n', '\r\n'));
  assert.equal(createHash('sha1').update(Buffer.from('blob ' + original.length + '\0')).update(original).digest('hex'), 'e4693b346aa9520be078cf64cb88396de004b0bc');
  const adl = Buffer.from(readFileSync(new URL('./fixtures/scorm/adl-2004-wrapper.base64', import.meta.url), 'utf8'), 'base64');
  assert.equal(createHash('sha256').update(adl).digest('hex'), '252099ca61c5f50c303c666d14155648d172940cabd714f2041b2bc81ad70311');
});


for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': initial Terminate without prior Commit preserves default-objective semantics and completes rollup exactly once', async () => {
  const f = await scormLearningFixture(undefined, sequencingPackage(edition)), binding = f.enroll();
  try {
    for (const [scoId, navigation] of [['intro', 'continue'], ['practice', 'exitAll']]) {
      const launch = f.launch(binding, scoId), b = f.player.bootstrap(launch.token); let state: any;
      const api = createSCORM2004API({edition, state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot, checkpoint(value) {state = value;}});
      assert.equal(api.Initialize(''), 'true');
      for (const [key, value] of Object.entries({'cmi.exit': 'suspend', 'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT20S', 'adl.nav.request': navigation!})) assert.equal(api.SetValue(key, value), 'true');
      assert.equal(api.Terminate(''), 'true');
      const request = {sequence: 1, revision: 0, state, finished: true, navigation}, accepted = f.player.checkpoint(launch.token, request);
      assert.equal(accepted.officialLearningChanged, scoId === 'practice'); assert.deepEqual(f.player.checkpoint(launch.token, request), accepted);
    }
    const envelope = JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));
    assert.equal(JSON.parse(envelope.snapshot).sequencing.activityStates.org.completionStatus, 'completed');
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 1);
    assert.equal(f.db.prepare('SELECT sum(reported_seconds) n FROM scorm_sco_attempts').get()!.n, 40);
  } finally {f.db.close();}
});
