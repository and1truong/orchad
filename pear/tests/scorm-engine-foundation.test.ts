import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Scorm2004API from 'scorm-again/scorm2004';
import {fixture} from './helpers.ts';
import {scormFixture} from './scorm-fixture.ts';
import {openDatabase} from '../src/server/database.ts';
import {SCORMEngineStore} from '../src/server/scorm-engine-store.ts';
import {createSCORMContentHost, contentHostOrigins} from '../src/server/scorm-content-host.ts';
import {SCORM_ENGINE, scormStandard} from '../src/shared/scorm-engine.ts';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';

function engineFixture(path?: string) {
  const f = fixture(path), store = new SCORMEngineStore(f.db);
  f.db.prepare('INSERT INTO scorm_engine_packages VALUES(?,?,?,?,?)').run('pkg', 'demo', 'admin', 'Engine fixture', '2026-10-07T00:00:00Z');
  for (const version of [1, 2]) f.db.prepare(`INSERT INTO scorm_engine_versions(package_id,tenant,version,standard,sha256,archive,manifest,state,created_at)
    VALUES('pkg','demo',?,'1.2',?,?,?,'published',?)`).run(version, String(version).repeat(64), Buffer.from('fixture'), JSON.stringify({standard: '1.2'}), '2026-10-07T00:00:00Z');
  const register = (user = 'learner-a', extra: any = {}) => store.register(f.service.principal(user), {
    packageId: 'pkg', version: 1, mode: 'normal', confirmed: true, key: crypto.randomUUID(),
    revision: f.service.context(user, 'learning:demo:' + user).revision, ...extra,
  });
  return {...f, store, register};
}

test('registration pins exact version, isolates learner/preview, and never creates official completion', () => {
  const f = engineFixture();
  try {
    const a = f.register(), same = f.register(), other = f.register('learner-b'), v2 = f.register('learner-a', {version: 2});
    assert.equal(a.registrationId, same.registrationId);
    assert.equal(a.attemptId, same.attemptId);
    assert.notEqual(a.registrationId, other.registrationId);
    assert.notEqual(a.registrationId, v2.registrationId);
    assert.equal(f.store.registration(f.service.principal('learner-a'), a.registrationId).version, 1);
    assert.throws(() => f.store.registration(f.service.principal('learner-b'), a.registrationId), /Own/);
    assert.throws(() => f.register('learner-a', {mode: 'preview'}), /administrator/);
    const preview = f.register('admin', {mode: 'preview'});
    assert.equal(f.store.registration(f.service.principal('admin'), preview.registrationId).mode, 'preview');
    assert.equal(a.officialLearningChanged, false);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM enrollments').get()?.n, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM certificates').get()?.n, 0);
  } finally {f.db.close();}
});

test('registration validates live permissions before replay and commits audit/idempotency atomically', () => {
  const f = engineFixture();
  try {
    const p = f.service.principal('learner-a');
    const args = {packageId: 'pkg', version: 1, mode: 'normal' as const, confirmed: true, revision: 0, key: 'once'};
    const result = f.store.register(p, args);
    assert.deepEqual(f.store.register(p, {...args, revision: 999}), result);
    assert.throws(() => f.store.register(p, {...args, version: 2}), /changed/);
    assert.throws(() => f.store.register(p, {...args, key: 'stale'}), /context changed/);
    f.db.exec("UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'");
    assert.throws(() => f.store.register(p, args), /Active/);
    f.db.exec("CREATE TRIGGER reject_registration_audit BEFORE INSERT ON audit WHEN NEW.tool='human_scorm_register' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    assert.throws(() => f.register('learner-b'), /audit unavailable/);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM scorm_registrations WHERE learner='learner-b'").get()?.n, 0);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_attempts').get()?.n, 1);
  } finally {f.db.close();}
});

test('tenant foreign keys and immutable package snapshots reject cross-tenant references/rewrites', () => {
  const f = engineFixture();
  try {
    assert.throws(() => f.db.prepare('INSERT INTO scorm_registrations(id,tenant,learner,package_id,version,mode,created_at) VALUES(?,?,?,?,?,?,?)').run('bad', 'other', 'outsider', 'pkg', 1, 'normal', 'now'), /FOREIGN KEY/);
    assert.throws(() => f.db.exec("UPDATE scorm_engine_versions SET sha256='x' WHERE package_id='pkg'"), /immutable/);
    f.db.prepare('INSERT INTO scorm_engine_resources VALUES(?,?,?,?,?,?)').run('pkg', 1, 'demo', 'sco/index.html', Buffer.from('hello'), 'text/html');
    assert.throws(() => f.db.exec("UPDATE scorm_engine_resources SET bytes=X'00'"), /immutable/);
    const a = f.register();
    f.db.exec("UPDATE scorm_engine_versions SET state='retired' WHERE package_id='pkg' AND version=1");
    assert.equal(f.store.registration(f.service.principal('learner-a'), a.registrationId).package_state, 'retired');
    assert.throws(() => f.register('learner-b'), /Published/);
    f.db.exec("UPDATE scorm_engine_versions SET state='revoked' WHERE package_id='pkg' AND version=1");
    assert.throws(() => f.store.registration(f.service.principal('learner-a'), a.registrationId), /unavailable/);
  } finally {f.db.close();}
});

test('populated v42 migration/reopen preserves legacy package status without official projection', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pear-scorm-foundation-')), path = join(dir, 'pear.sqlite');
  const legacy = scormFixture(path);
  try {
    legacy.publish();
    const launch = legacy.start();
    const before = legacy.db.prepare('SELECT * FROM scorm_records').get();
    // The legacy fixture uses openDatabase, so rewind only the new empty schema to simulate populated v42.
    legacy.db.exec('DROP TABLE scorm_completion_proofs; DROP TABLE scorm_learning_bindings; DROP INDEX scorm_enrollment_tenant; DROP INDEX scorm_item_enrollment_tenant; DROP TABLE scorm_engine_checkpoints; DROP TABLE scorm_engine_launches; DROP TABLE scorm_import_jobs; DROP TABLE scorm_sco_attempts; DROP TABLE scorm_engine_attempts; DROP TABLE scorm_registrations; DROP TABLE scorm_engine_resources; DROP TABLE scorm_engine_versions; DROP TABLE scorm_engine_packages; DROP INDEX accounts_id_tenant; DELETE FROM schema_version WHERE version>=43');
    legacy.db.close();
    const db = openDatabase(path);
    assert.deepEqual(db.prepare('SELECT * FROM scorm_records').get(), before);
    assert.equal(db.prepare('SELECT id FROM scorm_records').get()?.id, launch.recordId);
    assert.equal(db.prepare('SELECT count(*) AS n FROM scorm_registrations').get()?.n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_version WHERE version=43').get()?.n, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.close();
    const reopened = openDatabase(path);
    assert.equal(reopened.prepare('SELECT count(*) AS n FROM schema_version WHERE version=43').get()?.n, 1);
    reopened.close();
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('content host requires different cookie hostname, exact Host, and rejects application credentials', async () => {
  assert.throws(() => contentHostOrigins('http://localhost:4314', 'http://localhost:4315'), /hostname/);
  assert.throws(() => contentHostOrigins('https://pear.test', 'http://content.test'), /HTTPS/);
  const app = createSCORMContentHost({pearOrigin: 'http://127.0.0.1:4314', contentOrigin: 'http://localhost:4315'});
  try {
    const health = await app.inject({url: '/health', headers: {host: 'localhost:4315'}});
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().runtimeEnabled, false);
    assert.equal(health.headers['access-control-allow-origin'], undefined);
    assert.match(String(health.headers['content-security-policy']), /default-src 'none'/);
    assert.equal((await app.inject({url: '/health', headers: {host: 'attacker.test'}})).statusCode, 403);
    assert.equal((await app.inject({url: '/health', headers: {host: 'localhost:4315', cookie: 'pear_session=secret'}})).statusCode, 403);
    assert.equal((await app.inject({url: '/health', headers: {host: 'localhost:4315', authorization: 'Bearer secret'}})).statusCode, 403);
    assert.equal((await app.inject({url: '/api/bridge/invoke', method: 'POST', headers: {host: 'localhost:4315'}})).statusCode, 403);
  } finally {await app.close();}
});

test('pinned real 1.2 runtime supports synchronous string methods, interactions and resume preload', () => {
  const checkpoints: any[] = [];
  const api = createSCORM12API({state: {core: {student_id: 'registration-1', lesson_location: 'step-3', entry: 'resume'}, suspend_data: 'saved-state'}, checkpoint: (state, finished) => checkpoints.push({state, finished})});
  assert.equal(api.LMSSetValue('cmi.core.lesson_status', 'completed'), 'false');
  assert.equal(api.LMSGetLastError(), '301');
  assert.equal(api.LMSInitialize(''), 'true');
  assert.equal(api.LMSGetValue('cmi.core.entry'), 'resume');
  assert.equal(api.LMSGetValue('cmi.suspend_data'), 'saved-state');
  assert.equal(api.LMSSetValue('cmi.core.student_id', 'someone-else'), 'false');
  assert.equal(api.LMSSetValue('cmi.interactions.0.id', 'question-1'), 'true');
  assert.equal(api.LMSSetValue('cmi.interactions.0.type', 'choice'), 'true');
  assert.equal(api.LMSSetValue('cmi.interactions.0.student_response', 'a'), 'true');
  assert.equal(api.LMSSetValue('cmi.core.lesson_status', 'completed'), 'true');
  assert.equal(api.LMSCommit(''), 'true');
  assert.equal(api.LMSFinish(''), 'true');
  assert.equal(api.LMSSetValue('cmi.core.lesson_status', 'failed'), 'false');
  assert.equal(api.LMSGetLastError(), '301');
  assert.equal(checkpoints.length, 2);
  assert.equal(checkpoints[0].state.core.lesson_status, 'completed');
  assert.equal(checkpoints[1].finished, true);
  assert.equal('loadFromJSON' in api, false);
});

test('real 2004 runtime separates success/completion and validates API values; editions remain integration TODO', () => {
  const api = new Scorm2004API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false});
  api.loadFromJSON({learner_id: 'registration-2', entry: 'ab-initio'});
  assert.equal(api.Initialize(''), 'true');
  assert.equal(api.SetValue('cmi.completion_status', 'completed'), 'true');
  assert.equal(api.SetValue('cmi.success_status', 'failed'), 'true');
  assert.equal(api.GetValue('cmi.completion_status'), 'completed');
  assert.equal(api.GetValue('cmi.success_status'), 'failed');
  assert.equal(api.SetValue('cmi.score.scaled', '2'), 'false');
  assert.equal(api.SetValue('cmi.learner_id', 'other'), 'false');
  assert.equal(api.Commit(''), 'true');
  assert.equal(api.Terminate(''), 'true');
  for (const standard of ['1.2', '2004-2', '2004-3', '2004-4']) assert.equal(scormStandard(standard), standard);
  assert.throws(() => scormStandard('2004'), /edition/);
  const installed = JSON.parse(readFileSync(new URL('../node_modules/scorm-again/package.json', import.meta.url), 'utf8'));
  assert.equal(installed.version, SCORM_ENGINE.version);
});
