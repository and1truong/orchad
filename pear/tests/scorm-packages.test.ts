import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {zip} from './scorm-fixture.ts';
import {multiFilePackage, multiFileManifest} from './scorm-package-fixture.ts';
import {inspectSCORMPackage, readSCORMPackage, packageURI, packagePath} from '../src/server/scorm-package-reader.ts';
import {SCORMPackageService, scormResourceMime} from '../src/server/scorm-package-service.ts';
import {SCORM_STANDARDS} from '../src/shared/scorm-engine.ts';
import {createApp} from '../src/server/app.ts';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const origin = 'http://127.0.0.1:4314';
async function login(app: any, user: string) {
  const response = await app.inject({method: 'POST', url: '/api/login', headers: {host: '127.0.0.1:4314', origin}, payload: {username: user, password: user + '-dev'}});
  assert.equal(response.statusCode, 200); const value = response.json();
  return {host: '127.0.0.1:4314', origin, cookie: String(response.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': value.csrf, 'x-pear-epoch': value.sessionEpoch};
}
function packagesFixture() {
  const f = fixture(), packages = new SCORMPackageService(f.db), p = f.service.principal('admin');
  const enqueue = (extra: any = {}, bytes = multiFilePackage()) => packages.enqueue(p, {filename: 'original.zip', provenance: 'Self-authored test content', version: 1, confirmed: true, key: crypto.randomUUID(), revision: f.service.context('admin', 'library:demo').revision, ...extra}, bytes);
  return {...f, packages, p, enqueue};
}

test('namespace-aware multi-file packages preserve asset paths, entity text, dependencies and exact edition', async () => {
  for (const standard of SCORM_STANDARDS) {
    const value = await inspectSCORMPackage(multiFilePackage(standard));
    assert.equal(value.manifest.standard, standard);
    assert.equal(value.manifest.title, 'Original multi & file package');
    assert.equal(value.manifest.resources[0]!.href, 'lessons/intro.html');
    assert.deepEqual(value.manifest.resources[0]!.dependencies, ['shared']);
    assert.equal(value.manifest.activities[1]!.parameters, '?mode=practice');
    assert.equal(value.files.size, 5);
  }
  assert.equal(packageURI('lessons/', '../assets/player.js').path, 'assets/player.js');
  for (const path of ['../file', '/file', 'a/../b', 'a\\b', 'a//b', 'a?x', 'a\u0000b']) assert.throws(() => packagePath(path));
  for (const uri of ['../../outside', 'https://outside.test/a', '//outside.test/a', '%2foutside', 'file://private']) assert.throws(() => packageURI('lessons/', uri));
});

test('ZIP validation rejects traversal, symlink, ambiguity, CRC corruption and oversized resources', async () => {
  for (const entries of [
    [{name: '../escape', data: Buffer.from('no')}],
    [{name: 'same', data: Buffer.from('one')}, {name: 'same', data: Buffer.from('two')}],
    [{name: 'link', data: Buffer.from('target'), external: (0o120777 << 16) >>> 0}],
    [{name: 'large', data: Buffer.alloc(16 * 1024 * 1024 + 1), method: 8}],
  ]) await assert.rejects(readSCORMPackage(zip(entries)));
  const corrupt = zip([{name: 'safe', data: Buffer.from('original')}]); corrupt[30 + 4] ^= 1;
  await assert.rejects(readSCORMPackage(corrupt), /CRC/);
});

test('manifest refuses DTD/XXE, wrong namespace/edition, missing dependencies and missing SCO assets', async () => {
  const xml = multiFileManifest();
  for (const bad of [
    xml.replace('<p:manifest', '<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]><p:manifest'),
    xml.replace('imscp_rootv1p1p2', 'wrong'),
    xml.replace('<p:schemaversion>1.2</p:schemaversion>', '<p:schemaversion>2004</p:schemaversion>'),
    xml.replace('identifierref="shared"', 'identifierref="unknown"'),
    xml.replace('href="intro.html"', 'href="missing.html"'),
    xml.replace('identifier="practice"', 'identifier="intro"'),
  ]) await assert.rejects(inspectSCORMPackage(multiFilePackage('1.2', bad)));
});

test('import jobs quarantine exact archives; reviewed publish, immutable versions, export and revoke retain scope', async () => {
  const f = packagesFixture();
  try {
    const bytes = multiFilePackage(), job = f.enqueue({}, bytes);
    await f.packages.run(job.jobId);
    const ready = f.packages.job(f.p, job.jobId);
    assert.equal(ready.status, 'ready');
    assert.match(ready.warnings[0], /not a malware scan/);
    assert.equal(f.packages.list(f.service.principal('learner-a')).total, 0);
    const row = f.packages.list(f.p, true).items[0]!;
    const review = (action: string, extra: any = {}) => f.packages.review(f.p, {packageId: row.id, version: 1, sha256: row.sha256, action, reason: 'Reviewed exact executable source and rights', confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: crypto.randomUUID(), ...extra});
    assert.throws(() => review('publish', {sha256: 'wrong'}), /hash/);
    review('publish');
    assert.equal(f.packages.list(f.service.principal('learner-a')).total, 1);
    assert.deepEqual(f.packages.export(f.p, row.id, 1).bytes, bytes);
    assert.throws(() => f.packages.export(f.service.principal('learner-a'), row.id, 1), /administrator/);
    assert.throws(() => f.packages.job(f.service.principal('editor'), job.jobId), /Own/);
    const second = f.enqueue({packageId: row.id, version: 2}); await f.packages.run(second.jobId);
    assert.equal(f.packages.job(f.p, second.jobId).status, 'ready');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_versions WHERE package_id=?').get(row.id)?.n, 2);
    assert.deepEqual(f.packages.export(f.p, row.id, 1).bytes, bytes);
    review('retire'); assert.equal(f.packages.list(f.service.principal('learner-a')).total, 0);
    review('revoke'); assert.equal(f.packages.list(f.p, true).items.find(x => x.version === 1).state, 'revoked');
    assert.equal(scormResourceMime('assets/player.js'), 'text/javascript; charset=utf-8');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM certificates').get()?.n, 0);
  } finally {await f.packages.drain(); f.db.close();}
});

test('failed jobs and revoked import authorization cannot publish content; audit rollback does not create package/job', async () => {
  const f = packagesFixture();
  try {
    const bad = f.enqueue({}, Buffer.from('not ZIP')); await f.packages.run(bad.jobId);
    assert.equal(f.packages.job(f.p, bad.jobId).status, 'failed');
    const changed = f.enqueue(); f.db.exec("UPDATE accounts SET auth_version=auth_version+1 WHERE id='admin'"); await f.packages.run(changed.jobId);
    assert.equal(f.db.prepare('SELECT status FROM scorm_import_jobs WHERE id=?').get(changed.jobId)?.status, 'failed');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_packages').get()?.n, 0);
    const p = f.service.principal('admin');
    f.db.exec("CREATE TRIGGER reject_engine_audit BEFORE INSERT ON audit WHEN NEW.tool='human_scorm_engine_import' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
    assert.throws(() => f.packages.enqueue(p, {filename: 'original.zip', provenance: 'Self-authored', version: 1, confirmed: true, revision: f.service.context('admin', 'library:demo').revision, key: 'audit'}, multiFilePackage()), /audit failed/);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_import_jobs').get()?.n, 2);
  } finally {await f.packages.drain(); f.db.close();}
});

test('actual HTTP imports enforce session epoch, CSRF, live content role and production disablement', async () => {
  const f = fixture(), {app} = await createApp({db: f.db, origin, developmentAuth: true});
  try {
    const admin = await login(app, 'admin'), learner = await login(app, 'learner-a');
    const q = new URLSearchParams({filename: 'original.zip', provenance: 'Self-authored test fixture', version: '1', confirmed: 'true', revision: '0', key: 'http-package'});
    const inject = (headers: any) => app.inject({url: '/api/scorm-engine/import?' + q, method: 'POST', headers: {...headers, 'content-type': 'application/zip'}, payload: multiFilePackage()});
    assert.equal((await inject({...admin, 'x-csrf-token': 'wrong'})).statusCode, 403);
    assert.equal((await inject({...admin, 'x-pear-epoch': 'wrong'})).statusCode, 409);
    assert.equal((await inject(learner)).statusCode, 403);
    const result = await inject(admin); assert.equal(result.statusCode, 202);
    const deadline = Date.now() + 2000;
    let status = 'queued';
    while (['queued', 'running'].includes(status) && Date.now() < deadline) {
      const job = await app.inject({url: '/api/scorm-engine/jobs/' + result.json().jobId, headers: admin});
      status = job.json().status;
      if (['queued', 'running'].includes(status)) await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(status, 'ready');
    assert.equal((await app.inject({url: '/api/scorm-engine/packages?author=true', headers: learner})).statusCode, 403);
    const built = await createApp({db: f.db, origin});
    try {
      const response = await built.app.inject({url: '/api/scorm-engine/review', method: 'POST', headers: admin, payload: {}});
      assert.equal(response.statusCode, 403);
      assert.match(response.json().error.message, /loopback development/);
    } finally {await built.app.close();}
  } finally {await app.close(); f.db.close();}
});

test('queued and interrupted import jobs survive SQLite reopen; finalization audit failure rolls back resources', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pear-engine-import-')), path = join(directory, 'engine.sqlite');
  let f = fixture(path), packages = new SCORMPackageService(f.db);
  const enqueue = () => packages.enqueue(f.service.principal('admin'), {filename: 'original.zip', provenance: 'Original restart fixture', version: 1, confirmed: true, key: crypto.randomUUID(), revision: f.service.context('admin', 'library:demo').revision}, multiFilePackage());
  try {
    const queued = enqueue(), interrupted = enqueue();
    f.db.prepare("UPDATE scorm_import_jobs SET status='running' WHERE id=?").run(interrupted.jobId);
    f.db.close(); f = fixture(path); packages = new SCORMPackageService(f.db);
    await Promise.all([packages.run(queued.jobId), packages.run(interrupted.jobId)]);
    assert.equal(packages.job(f.service.principal('admin'), queued.jobId).status, 'ready');
    assert.equal(packages.job(f.service.principal('admin'), interrupted.jobId).status, 'ready');
    const failed = enqueue();
    f.db.exec("CREATE TRIGGER reject_engine_finalize BEFORE INSERT ON audit WHEN NEW.tool='system_scorm_engine_import_validated' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
    await packages.run(failed.jobId);
    assert.equal(packages.job(f.service.principal('admin'), failed.jobId).status, 'failed');
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_packages').get()?.n, 2);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM scorm_engine_resources').get()?.n, 10);
    assert.equal(f.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {await packages.drain(); f.db.close(); rmSync(directory, {recursive: true, force: true});}
});
