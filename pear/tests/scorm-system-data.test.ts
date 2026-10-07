import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sharedDataManifest} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {data} from './helpers.ts';

const globalManifest = () => sharedDataManifest().replace('runtime:sharedDataGlobalToSystem="false"', '');
async function readerPackage(f: Awaited<ReturnType<typeof scormLearningFixture>>) {
  const xml = globalManifest().replace('identifier="original-multi"', 'identifier="global-reader"').replaceAll('readSharedData="false" writeSharedData="true"', 'readSharedData="true" writeSharedData="false"');
  const admin = f.service.principal('admin'), job = f.packages.enqueue(admin, {filename: 'global-reader.zip', provenance: 'Self-authored global-reader fixture', version: 1, confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'global-reader-import'}, multiFilePackage('2004-4', xml));
  await f.packages.run(job.jobId); const pkg = f.packages.list(admin, true).items.find(p => p.sha256 !== f.pkg.sha256)!;
  assert.ok(pkg); f.packages.review(admin, {packageId: pkg.id, version: 1, sha256: pkg.sha256, action: 'publish', reason: 'Original global reader reviewed', confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'global-reader-publish'});
  data(f.call('editor', 'learning_update_course', {courseId: 'privacy-basics', course: f.course({...f.ref, packageId: pkg.id, sha256: pkg.sha256})}));
  data(f.call('editor', 'learning_publish_course', {courseId: 'privacy-basics'}));
  const binding = {enrollmentId: data(f.call('learner-a', 'learning_enroll', {courseId: 'privacy-basics'})).enrollmentId, lessonId: 'practice'};
  const launch = () => f.player.launch(f.service.principal('learner-a'), 'session-learner-a', {packageId: pkg.id, version: 1, binding, mode: 'normal', confirmed: true, revision: f.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
  return {pkg, binding, launch};
}
function api(f: Awaited<ReturnType<typeof scormLearningFixture>>, launch: ReturnType<typeof f.launch>) {
  const b = f.player.bootstrap(launch.token), runtime = createSCORM2004API({edition: '2004-4', state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot});
  assert.equal(runtime.Initialize(''), 'true'); return runtime;
}

test('default system shared data crosses authorized packages/enrollments for one learner; exact retry does not write twice', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest()));
  try {
    const binding = f.enroll(), first = f.launch(binding);
    const request = sequenceCheckpoint(f, first, {'adl.data.0.store': 'global-private-notes', 'cmi.session_time': 'PT20S'}, false);
    const receipt = f.player.checkpoint(first.token, request); assert.deepEqual(f.player.checkpoint(first.token, request), receipt);
    const row = f.db.prepare('SELECT * FROM scorm_system_data').get()!; assert.equal(row.revision, 1); assert.equal(row.store, 'global-private-notes'); assert.equal(row.learner, 'learner-a');
    const reader = await readerPackage(f), read = reader.launch(); assert.notEqual(read.registrationId, first.registrationId);
    assert.equal(api(f, read).GetValue('adl.data.0.store'), 'global-private-notes');
    const forged = sequenceCheckpoint(f, read, {}, false); assert.throws(() => f.player.checkpoint(read.token, {...forged, sharedData: {'urn:pear:shared-notes': 'forged'}}), /cannot write/);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_data').get(), row);
    const other = f.launch(undefined, undefined, 'normal', 'learner-b'); assert.ok(!f.player.bootstrap(other.token).sequencingSnapshot!.includes('global-private-notes'));
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});

test('unofficial system-mapped practice/preview cannot read or overwrite the official working stores', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest()));
  try {
    const first = f.launch(f.enroll()); f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'adl.data.0.store': 'official-registration-notes'}, false));
    const original = f.db.prepare('SELECT * FROM scorm_system_data').get();
    for (const mode of ['normal', 'preview'] as const) {
      const launch = f.launch(undefined, undefined, mode, mode === 'preview' ? 'admin' : 'learner-a');
      assert.ok(!f.player.bootstrap(launch.token).sequencingSnapshot!.includes('official-registration-notes'));
      f.player.checkpoint(launch.token, sequenceCheckpoint(f, launch, {'adl.data.0.store': 'unofficial-notes'}, false));
      assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_data').get(), original);
    }
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});

test('explicit writes from concurrent registrations are ordered; CMI-only commits and old receipts do not clobber a newer store', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest()));
  try {
    const first = f.launch(f.enroll()), original = sequenceCheckpoint(f, first, {'adl.data.0.store': 'first-writer'}, false);
    const receipt = f.player.checkpoint(first.token, original);
    data(f.call('editor', 'learning_update_course', {courseId: 'privacy-basics', course: f.course()})); data(f.call('editor', 'learning_publish_course', {courseId: 'privacy-basics'}));
    const binding = {enrollmentId: data(f.call('learner-a', 'learning_enroll', {courseId: 'privacy-basics'})).enrollmentId, lessonId: 'practice'}, second = f.launch(binding);
    f.player.checkpoint(second.token, sequenceCheckpoint(f, second, {'adl.data.0.store': 'second-writer'}, false));
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'cmi.location': 'new-location'}, false));
    assert.deepEqual(f.player.checkpoint(first.token, original), receipt);
    let row = f.db.prepare('SELECT * FROM scorm_system_data').get()!; assert.equal(row.store, 'second-writer'); assert.equal(row.revision, 2);
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'adl.data.0.store': 'explicit-first-writer'}, false));
    row = f.db.prepare('SELECT * FROM scorm_system_data').get()!; assert.equal(row.store, 'explicit-first-writer'); assert.equal(row.revision, 3);
    assert.equal(row.source_registration_id, first.registrationId);
    assert.throws(() => f.db.exec("UPDATE scorm_system_data SET learner='learner-b'"), /identity is immutable/);
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {f.db.close();}
});

test('system store capacity failure rolls back data, CMI/time, receipts, workspace and proof', async () => {
  const {scormRuntimeStorageBytes} = await import('../src/server/scorm-storage.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest()));
  try {
    const first = f.launch(f.enroll()), before = f.player.bootstrap(first.token), revision = f.service.context('learner-a', 'learning:demo:learner-a').revision;
    const request = sequenceCheckpoint(f, first, {'adl.data.0.store': 'bounded-store'.repeat(1000), 'cmi.session_time': 'PT20S'}, false);
    const player = new SCORMPlayerService(f.db, f.player.bindings, {...f.player.limits, maxRuntimeStorageBytesPerTenant: scormRuntimeStorageBytes(f.db, 'demo') + 1});
    assert.throws(() => player.checkpoint(first.token, request), /storage quota/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_system_data').get()!.n, 0);
    assert.equal(f.player.bootstrap(first.token).sequence, before.sequence); assert.equal(f.player.bootstrap(first.token).revision, before.revision);
    assert.equal(f.service.context('learner-a', 'learning:demo:learner-a').revision, revision);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 0); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});

test('system stores and receipts survive database/server reopen', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const {fixture} = await import('./helpers.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts'), {SCORMLearningBindings} = await import('../src/server/scorm-learning-bindings.ts'), {SCORMPackageService} = await import('../src/server/scorm-package-service.ts');
  const dir = mkdtempSync(join(tmpdir(), 'pear-system-data-')), path = join(dir, 'db.sqlite');
  const f = await scormLearningFixture(path, multiFilePackage('2004-4', globalManifest())), first = f.launch(f.enroll());
  f.db.close(); let opened = fixture(path), player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service));
  const restored = {...f, ...opened, player, packages: new SCORMPackageService(opened.db)};
  const request = sequenceCheckpoint(restored, first, {'adl.data.0.store': 'durable-system-store'}, false), receipt = player.checkpoint(first.token, request);
  opened.db.close(); opened = fixture(path); player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service));
  try {
    assert.deepEqual(player.checkpoint(first.token, request), receipt); assert.equal(opened.db.prepare('SELECT revision FROM scorm_system_data').get()!.revision, 1);
    const current = {...f, ...opened, player, packages: new SCORMPackageService(opened.db)}, reader = await readerPackage(current), launch = reader.launch();
    assert.equal(api(current, launch).GetValue('adl.data.0.store'), 'durable-system-store'); assert.equal(opened.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {opened.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('schema-49 migration preserves populated schema-48 local working data without creating system data or official proof', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const {openDatabase} = await import('../src/server/database.ts');
  const dir = mkdtempSync(join(tmpdir(), 'pear-system-migration-')), path = join(dir, 'db.sqlite');
  const f = await scormLearningFixture(path, multiFilePackage('2004-4', sharedDataManifest())), launch = f.launch(f.enroll());
  f.player.checkpoint(launch.token, sequenceCheckpoint(f, launch, {'adl.data.0.store': 'legacy-local-notes', 'cmi.location': 'legacy-bookmark', 'cmi.session_time': 'PT20S'}, false));
  const attempts = f.db.prepare('SELECT * FROM scorm_engine_attempts').all(), scos = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), resources = f.db.prepare('SELECT * FROM scorm_engine_resources ORDER BY path').all();
  f.db.exec('DROP TRIGGER scorm_system_data_identity; DROP TABLE scorm_system_objectives; DROP TABLE scorm_system_data; DELETE FROM schema_version WHERE version>=49'); f.db.close();
  const db = openDatabase(path);
  try {
    assert.equal(db.prepare('SELECT max(version) n FROM schema_version').get()!.n, 50);
    assert.deepEqual(db.prepare('SELECT * FROM scorm_engine_attempts').all(), attempts); assert.deepEqual(db.prepare('SELECT * FROM scorm_sco_attempts').all(), scos); assert.deepEqual(db.prepare('SELECT * FROM scorm_engine_resources ORDER BY path').all(), resources);
    assert.equal(db.prepare('SELECT count(*) n FROM scorm_system_data').get()!.n, 0); assert.equal(db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0); assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('revocation blocks new writes and receipt replay; aggregate diagnostics disclose no global values or target IDs', async () => {
  const {scormTenantDiagnostics} = await import('../src/server/scorm-diagnostics.ts');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest()));
  try {
    const first = f.launch(f.enroll()), request = sequenceCheckpoint(f, first, {'adl.data.0.store': 'private-system-value'}, false); f.player.checkpoint(first.token, request);
    const before = f.db.prepare('SELECT * FROM scorm_system_data').all(), next = sequenceCheckpoint(f, first, {'adl.data.0.store': 'revoked-write'}, false);
    const metadata = JSON.stringify(scormTenantDiagnostics(f.db, f.service.principal('admin'), true)); assert.ok(!metadata.includes('private-system-value')); assert.ok(!metadata.includes('urn:pear:shared-notes'));
    f.packages.review(f.service.principal('admin'), {packageId: f.pkg.id, version: 1, sha256: f.pkg.sha256, action: 'revoke', reason: 'Original security revocation counterexample', confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'system-data-revoke'});
    assert.throws(() => f.player.checkpoint(first.token, next), /execution is unavailable/); assert.throws(() => f.player.checkpoint(first.token, request), /execution is unavailable/);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_data').all(), before);
  } finally {f.db.close();}
});

test('whole-database backup restores a coherent system store while closing old capabilities', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const {fixture} = await import('./helpers.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts'), {SCORMLearningBindings} = await import('../src/server/scorm-learning-bindings.ts');
  const {backupPearDatabase, restorePearDatabase} = await import('../src/server/database-recovery.ts');
  const dir = mkdtempSync(join(tmpdir(), 'pear-system-backup-')), snapshot = join(dir, 'backup.sqlite'), destination = join(dir, 'restored.sqlite');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest()));
  try {
    const first = f.launch(f.enroll()); f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'adl.data.0.store': 'backed-up-store'}, false));
    const original = f.db.prepare('SELECT * FROM scorm_system_data').all(); await backupPearDatabase(f.db, snapshot);
    f.player.checkpoint(first.token, sequenceCheckpoint(f, first, {'adl.data.0.store': 'later-source-store'}, false)); await restorePearDatabase(snapshot, destination);
    const opened = fixture(destination), player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service));
    try {assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_system_data').all(), original); assert.equal(opened.db.prepare('SELECT count(*) n FROM sessions').get()!.n, 0); assert.throws(() => player.bootstrap(first.token), /closed|session|capability/);} finally {opened.db.close();}
  } finally {f.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('per-learner store-count refusal preserves all previously accepted stores and the pending launch sequence', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest()));
  try {
    const first = f.launch(f.enroll()), insert = f.db.prepare('INSERT INTO scorm_system_data VALUES(?,?,?,?,1,?,?)');
    f.db.exec('BEGIN'); for (let i = 0; i < 4096; i++) insert.run('demo', 'learner-a', 'urn:previous-store:' + i, '', first.registrationId, new Date().toISOString()); f.db.exec('COMMIT');
    const request = sequenceCheckpoint(f, first, {'adl.data.0.store': 'one-too-many'}, false);
    assert.throws(() => f.player.checkpoint(first.token, request), /store quota/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_system_data').get()!.n, 4096); assert.equal(f.db.prepare("SELECT 1 FROM scorm_system_data WHERE target_id='urn:pear:shared-notes'").get(), undefined); assert.equal(f.player.bootstrap(first.token).sequence, 0);
  } finally {f.db.close();}
});
