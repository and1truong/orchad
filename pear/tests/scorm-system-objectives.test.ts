import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sequencingManifest} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {data} from './helpers.ts';
import {createSCORM2004API, type SCORM2004Edition} from '../src/shared/scorm2004-runtime.ts';

const globalManifest = (edition: SCORM2004Edition) => sequencingManifest(edition).replace('a:objectivesGlobalToSystem="false"', '');
async function readerPackage(f: Awaited<ReturnType<typeof scormLearningFixture>>, edition: SCORM2004Edition, source = globalManifest(edition)) {
  const xml = source.replace('identifier="original-multi"', 'identifier="system-objective-reader"').replaceAll('writeSatisfiedStatus="true" writeNormalizedMeasure="true"', 'writeSatisfiedStatus="false" writeNormalizedMeasure="false"');
  const admin = f.service.principal('admin'), job = f.packages.enqueue(admin, {filename: 'system-reader.zip', provenance: 'Original system objective reader', version: 1, confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'system-reader-import'}, multiFilePackage(edition, xml));
  await f.packages.run(job.jobId); const pkg = f.packages.list(admin, true).items.find(p => p.sha256 !== f.pkg.sha256)!; assert.ok(pkg);
  f.packages.review(admin, {packageId: pkg.id, version: 1, sha256: pkg.sha256, action: 'publish', reason: 'Original system objective reader reviewed', confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'system-reader-publish'});
  data(f.call('editor', 'learning_update_course', {courseId: 'privacy-basics', course: f.course({...f.ref, packageId: pkg.id, sha256: pkg.sha256})})); data(f.call('editor', 'learning_publish_course', {courseId: 'privacy-basics'}));
  const binding = {enrollmentId: data(f.call('learner-a', 'learning_enroll', {courseId: 'privacy-basics'})).enrollmentId, lessonId: 'practice'};
  const launch = (scoId = 'practice') => f.player.launch(f.service.principal('learner-a'), 'session-learner-a', {packageId: pkg.id, version: 1, binding, scoId, mode: 'normal', confirmed: true, revision: f.service.context('learner-a', 'learning:demo:learner-a').revision, key: crypto.randomUUID()});
  return {binding, pkg, launch};
}
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(`${edition}: default system objectives cross authorized packages and gate delivery without supplying course proof`, async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage(edition, globalManifest(edition)));
  try {
    const writer = f.launch(f.enroll(), 'intro'), reader = await readerPackage(f, edition);
    assert.throws(() => reader.launch(), /denies|prerequisite|deliver/);
    const commit = sequenceCheckpoint(f, writer, {'cmi.score.scaled': '0.9', 'cmi.completion_status': 'completed'}, false); f.player.checkpoint(writer.token, commit);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_system_objectives').get()!.n, 0); assert.throws(() => reader.launch(), /denies|prerequisite|deliver/);
    const request = sequenceCheckpoint(f, writer, {'cmi.score.scaled': '0.9', 'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'adl.nav.request': 'continue'}), receipt = f.player.checkpoint(writer.token, request);
    const row = f.db.prepare('SELECT * FROM scorm_system_objectives').get()!, stored = JSON.parse(String(row.state));
    assert.equal(stored.satisfiedStatus, true); assert.equal(stored.normalizedMeasure, 0.9); assert.equal(row.revision, 1);
    assert.deepEqual(f.player.checkpoint(writer.token, request), receipt); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_objectives').get(), row);
    const launch = reader.launch(); assert.notEqual(launch.registrationId, writer.registrationId);
    const b = f.player.bootstrap(launch.token), api = createSCORM2004API({edition, state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot}); assert.equal(api.Initialize(''), 'true');
    assert.equal(api.GetValue('cmi.objectives.0.success_status'), 'passed');
    f.player.checkpoint(launch.token, sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.success_status': 'passed', 'cmi.score.scaled': '0.95'}));
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_objectives').get(), row); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
    assert.equal(f.player.context(f.service.principal('learner-a'), reader.binding).completed, false);
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {f.db.close();}
});

test('unofficial practice/preview and other learners cannot consume or change official system objective state', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest('2004-4')));
  try {
    const writer = f.launch(f.enroll(), 'intro'); f.player.checkpoint(writer.token, sequenceCheckpoint(f, writer, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
    const row = f.db.prepare('SELECT * FROM scorm_system_objectives').get();
    for (const [mode, learner] of [['normal', 'learner-a'], ['preview', 'admin'], ['normal', 'learner-b']] as const) {
      assert.throws(() => f.launch(undefined, 'practice', mode, learner), /prerequisite|denies/);
      const launch = f.launch(undefined, 'intro', mode, learner); f.player.checkpoint(launch.token, sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.95', 'adl.nav.request': 'continue'}));
      assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_objectives').get(), row);
    }
  } finally {f.db.close();}
});

test('newer cross-registration objective fields survive old receipts and readonly CMI commits', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest('2004-4')));
  try {
    const first = f.launch(f.enroll(), 'intro'), request = sequenceCheckpoint(f, first, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}), receipt = f.player.checkpoint(first.token, request);
    data(f.call('editor', 'learning_update_course', {courseId: 'privacy-basics', course: f.course()})); data(f.call('editor', 'learning_publish_course', {courseId: 'privacy-basics'}));
    const binding = {enrollmentId: data(f.call('learner-a', 'learning_enroll', {courseId: 'privacy-basics'})).enrollmentId, lessonId: 'practice'}, second = f.launch(binding, 'intro');
    f.player.checkpoint(second.token, sequenceCheckpoint(f, second, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.4', 'adl.nav.request': 'exitAll'}));
    const row = f.db.prepare('SELECT * FROM scorm_system_objectives').get()!; assert.equal(JSON.parse(String(row.state)).normalizedMeasure, 0.4); assert.equal(row.revision, 2);
    assert.deepEqual(f.player.checkpoint(first.token, request), receipt);
    const practice = f.launch(f.enroll(), 'practice');
    f.player.checkpoint(practice.token, sequenceCheckpoint(f, practice, {'cmi.location': 'fresh-reader-location'}, false));
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_objectives').get(), row);
    const forged = sequenceCheckpoint(f, practice, {'cmi.objectives.1.id': 'shared-mastery', 'cmi.objectives.1.success_status': 'passed', 'cmi.objectives.1.score.scaled': '0.99'}, false);
    f.player.checkpoint(practice.token, forged); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_objectives').get(), row);
    assert.throws(() => f.player.checkpoint(practice.token, {...forged, sequence: forged.sequence + 1, globalObjectiveMap: {}}), /Exact checkpoint/);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0);
  } finally {f.db.close();}
});

test('objective persistence failure atomically rolls back time, sequencing, receipt and workspace', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest('2004-4')));
  try {
    const launch = f.launch(f.enroll(), 'intro'), before = f.db.prepare('SELECT * FROM scorm_engine_attempts').all(), rows = f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), revision = f.service.context('learner-a', 'learning:demo:learner-a').revision;
    const request = sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'cmi.session_time': 'PT20S', 'adl.nav.request': 'continue'});
    f.db.exec("CREATE TRIGGER reject_objective BEFORE INSERT ON scorm_system_objectives BEGIN SELECT RAISE(ABORT,'objective fixture'); END;");
    assert.throws(() => f.player.checkpoint(launch.token, request), /objective fixture/);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_attempts').all(), before); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(), rows);
    assert.equal(f.service.context('learner-a', 'learning:demo:learner-a').revision, revision); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n, 0);
    f.db.exec('DROP TRIGGER reject_objective'); f.player.checkpoint(launch.token, request); assert.equal(f.db.prepare('SELECT revision FROM scorm_system_objectives').get()!.revision, 1);
  } finally {f.db.close();}
});

test('system objective capacity is included in the tenant quota and diagnostics reveal only aggregate bytes', async () => {
  const {scormRuntimeStorageBytes} = await import('../src/server/scorm-storage.ts'), {scormTenantDiagnostics} = await import('../src/server/scorm-diagnostics.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest('2004-4')));
  try {
    const launch = f.launch(f.enroll(), 'intro'), bytes = scormRuntimeStorageBytes(f.db, 'demo'), request = sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'});
    const player = new SCORMPlayerService(f.db, f.player.bindings, {...f.player.limits, maxRuntimeStorageBytesPerTenant: bytes + 1});
    assert.throws(() => player.checkpoint(launch.token, request), /storage quota/); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_system_objectives').get()!.n, 0); assert.equal(f.player.bootstrap(launch.token).sequence, 0);
    f.player.checkpoint(launch.token, request); assert.ok(scormRuntimeStorageBytes(f.db, 'demo') > bytes);
    assert.ok(!JSON.stringify(scormTenantDiagnostics(f.db, f.service.principal('admin'), true)).includes('shared-mastery'));
    assert.throws(() => f.db.exec("UPDATE scorm_system_objectives SET learner='learner-b'"), /identity is immutable/);
  } finally {f.db.close();}
});

test('fourth-edition ADL score fields persist separately and unreadable backing copies are absent from bootstrap', async () => {
  const extension = '<a:objectives><a:objective objectiveID="primary"><a:mapInfo targetObjectiveID="shared-mastery" readRawScore="false" writeRawScore="true" writeMinScore="true" writeMaxScore="true"/></a:objective></a:objectives>';
  const xml = globalManifest('2004-4').replace('</s:objectives></s:sequencing>', '</s:objectives>' + extension + '</s:sequencing>');
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', xml));
  try {
    const writer = f.launch(f.enroll(), 'intro'); f.player.checkpoint(writer.token, sequenceCheckpoint(f, writer, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'cmi.score.raw': '973.827', 'cmi.score.min': '0', 'cmi.score.max': '1000', 'adl.nav.request': 'continue'}));
    const row = f.db.prepare('SELECT * FROM scorm_system_objectives').get()!, state = JSON.parse(String(row.state)); assert.equal(state.rawScore, '973.827'); assert.equal(state.minScore, '0'); assert.equal(state.maxScore, '1000');
    const readerXml = xml.replaceAll('writeRawScore="true"', 'writeRawScore="false"').replaceAll('writeMinScore="true"', 'writeMinScore="false"').replaceAll('writeMaxScore="true"', 'writeMaxScore="false"').replace('<s:sequencingRules>', '<a:objectives><a:objective objectiveID="required-intro"><a:mapInfo targetObjectiveID="shared-mastery" readRawScore="true" readMinScore="true" readMaxScore="true"/></a:objective></a:objectives><s:sequencingRules>');
    const reader = await readerPackage(f, '2004-4', readerXml), intro = reader.launch('intro'), hidden = f.player.bootstrap(intro.token); const leaks: string[] = []; const walk = (v: any, path = '') => {if (typeof v === 'string' && v.startsWith('{')) {try {walk(JSON.parse(v), path); return;} catch {}} if (v === '973.827') leaks.push(path); if (v && typeof v === 'object') for (const [k, child] of Object.entries(v)) walk(child, path + '.' + k);}; walk(hidden); assert.deepEqual(leaks, []);
    const practice = reader.launch(), b = f.player.bootstrap(practice.token), api = createSCORM2004API({edition: '2004-4', state: b.state, sequencingTree: b.sequencingTree, sequencingSnapshot: b.sequencingSnapshot}); assert.equal(api.Initialize(''), 'true');
    assert.equal(api.GetValue('cmi.objectives.0.score.raw'), '973.827'); assert.equal(api.GetValue('cmi.objectives.0.score.max'), '1000');
    f.player.checkpoint(practice.token, sequenceCheckpoint(f, practice, {'cmi.location': 'reader-raw-score'}, false)); assert.deepEqual(f.db.prepare('SELECT * FROM scorm_system_objectives').get(), row);
  } finally {f.db.close();}
});

test('system objectives survive actual database/server reopen; revocation still blocks receipt replay', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path');
  const {fixture} = await import('./helpers.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts'), {SCORMLearningBindings} = await import('../src/server/scorm-learning-bindings.ts'), {SCORMPackageService} = await import('../src/server/scorm-package-service.ts');
  const dir = mkdtempSync(join(tmpdir(), 'pear-system-objectives-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, multiFilePackage('2004-4', globalManifest('2004-4'))), writer = f.launch(f.enroll(), 'intro');
  const request = sequenceCheckpoint(f, writer, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}), receipt = f.player.checkpoint(writer.token, request), row = f.db.prepare('SELECT * FROM scorm_system_objectives').get(); f.db.close();
  const opened = fixture(path), player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service));
  try {
    assert.deepEqual(player.checkpoint(writer.token, request), receipt); assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_system_objectives').get(), row);
    const current = {...f, ...opened, player, packages: new SCORMPackageService(opened.db)}, reader = await readerPackage(current, '2004-4'); assert.ok(reader.launch());
    const admin = opened.service.principal('admin'); current.packages.review(admin, {packageId: f.pkg.id, version: 1, sha256: f.pkg.sha256, action: 'revoke', reason: 'Security revocation fixture', confirmed: true, revision: opened.service.context('admin', 'library:demo').revision, key: 'revoke-system-objectives'});
    assert.throws(() => player.checkpoint(writer.token, request), /execution is unavailable/); assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_system_objectives').get(), row);
  } finally {opened.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('schema-50 upgrade preserves populated registration-local objective history without inventing system state', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path'), {openDatabase} = await import('../src/server/database.ts');
  const dir = mkdtempSync(join(tmpdir(), 'pear-objective-migration-')), path = join(dir, 'db.sqlite'), f = await scormLearningFixture(path, multiFilePackage('2004-4', sequencingManifest()));
  const launch = f.launch(f.enroll(), 'intro'); f.player.checkpoint(launch.token, sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
  const attempts = f.db.prepare('SELECT * FROM scorm_engine_attempts').all(), rows = f.db.prepare('SELECT * FROM scorm_sco_attempts').all();
  f.db.exec('DROP TABLE scorm_system_objectives; DELETE FROM schema_version WHERE version=50'); f.db.close(); const db = openDatabase(path);
  try {assert.equal(db.prepare('SELECT max(version) n FROM schema_version').get()!.n, 50); assert.deepEqual(db.prepare('SELECT * FROM scorm_engine_attempts').all(), attempts); assert.deepEqual(db.prepare('SELECT * FROM scorm_sco_attempts').all(), rows); assert.equal(db.prepare('SELECT count(*) n FROM scorm_system_objectives').get()!.n, 0); assert.equal(db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n, 0); assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);} finally {db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('whole-database backup retains coherent global objectives and offline restore revokes capabilities', async () => {
  const {mkdtempSync, rmSync} = await import('node:fs'), {tmpdir} = await import('node:os'), {join} = await import('node:path'), {fixture} = await import('./helpers.ts');
  const {backupPearDatabase, restorePearDatabase} = await import('../src/server/database-recovery.ts'), {SCORMPlayerService} = await import('../src/server/scorm-player-service.ts'), {SCORMLearningBindings} = await import('../src/server/scorm-learning-bindings.ts');
  const dir = mkdtempSync(join(tmpdir(), 'pear-objective-backup-')), snapshot = join(dir, 'backup.sqlite'), destination = join(dir, 'restored.sqlite'), f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest('2004-4')));
  try {
    const launch = f.launch(f.enroll(), 'intro'); f.player.checkpoint(launch.token, sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'}));
    const row = f.db.prepare('SELECT * FROM scorm_system_objectives').get(), attempt = f.db.prepare('SELECT * FROM scorm_engine_attempts').get(); await backupPearDatabase(f.db, snapshot);
    f.db.exec("UPDATE scorm_system_objectives SET state='{}',revision=revision+1"); await restorePearDatabase(snapshot, destination); const opened = fixture(destination);
    try {assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_system_objectives').get(), row); assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_attempts').get(), attempt); const player = new SCORMPlayerService(opened.db, new SCORMLearningBindings(opened.db, opened.service)); assert.throws(() => player.bootstrap(launch.token), /closed|session|capability/);} finally {opened.db.close();}
  } finally {f.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('system objective count limit rolls back all tracking and preserves prior accepted entries', async () => {
  const f = await scormLearningFixture(undefined, multiFilePackage('2004-4', globalManifest('2004-4')));
  try {
    const launch = f.launch(f.enroll(), 'intro'), insert = f.db.prepare('INSERT INTO scorm_system_objectives VALUES(?,?,?,?,1,?,?)');
    f.db.exec('BEGIN'); for (let i = 0; i < 4096; i++) insert.run('demo', 'learner-a', 'urn:previous-objective:' + i, '{}', launch.registrationId, new Date().toISOString()); f.db.exec('COMMIT');
    const request = sequenceCheckpoint(f, launch, {'cmi.completion_status': 'completed', 'cmi.score.scaled': '0.9', 'adl.nav.request': 'continue'});
    assert.throws(() => f.player.checkpoint(launch.token, request), /objective count quota/); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_system_objectives').get()!.n, 4096); assert.equal(f.player.bootstrap(launch.token).sequence, 0);
  } finally {f.db.close();}
});
