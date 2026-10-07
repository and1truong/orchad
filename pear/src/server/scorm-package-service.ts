import type {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import type {Principal} from '../shared/model.ts';
import {SCORMEngineStore} from './scorm-engine-store.ts';
import {inspectSCORMPackage, packageLimits} from './scorm-package-reader.ts';
import {reject, boundedPage, DomainError} from './errors.ts';
import {tokenHash} from './integration-credentials.ts';

export function scormResourceMime(path: string) {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', vtt: 'text/vtt', pdf: 'application/pdf', txt: 'text/plain; charset=utf-8'};
  return types[ext] ?? 'application/octet-stream';
}

export class SCORMPackageService {
  readonly store: SCORMEngineStore;
  private running = new Map<string, Promise<void>>();
  constructor(readonly db: DatabaseSync) {this.store = new SCORMEngineStore(db);}

  private transaction<T>(fn: () => T) {this.db.exec('BEGIN IMMEDIATE'); try {const result = fn(); this.db.exec('COMMIT'); return result;} catch (e) {this.db.exec('ROLLBACK'); throw e;}}
  private mutation(p: Principal, a: any, action: string, payload: object) {
    this.store.live(p, true);
    if (!a || a.confirmed !== true || !Number.isSafeInteger(a.revision) || a.revision < 0 || typeof a.key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(a.key)) reject('INVALID_ARGUMENT', 'Reviewed package action required');
    const doc = 'library:' + p.tenant, fingerprint = tokenHash(JSON.stringify({action, ...payload}));
    const old = this.db.prepare('SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?').get(p.id, doc, a.key) as any;
    if (old && old.payload !== fingerprint) reject('IDEMPOTENCY_CONFLICT', 'Package action changed');
    if (!old && (this.db.prepare('SELECT revision FROM workspaces WHERE id=?').get(doc) as any)?.revision !== a.revision) reject('STALE_CONTEXT', 'Package library changed');
    return {doc, fingerprint, old: old ? JSON.parse(old.result) : null};
  }
  private receipt(p: Principal, a: any, mutation: {doc: string; fingerprint: string}, action: string, payload: object, result: object) {
    this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(mutation.doc);
    this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant, p.id, mutation.doc, action, JSON.stringify(payload), new Date().toISOString());
    this.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(p.id, mutation.doc, a.key, mutation.fingerprint, JSON.stringify(result));
  }
  private storedBytes(tenant: string) {
    const row = this.db.prepare(`SELECT
      (SELECT COALESCE(SUM(length(bytes)),0) FROM assets WHERE tenant=?) +
      (SELECT COALESCE(SUM(length(bytes)+length(CAST(html AS BLOB))),0) FROM scorm_packages WHERE tenant=?) +
      (SELECT COALESCE(SUM(length(archive)),0) FROM scorm_engine_versions WHERE tenant=?) +
      (SELECT COALESCE(SUM(length(bytes)),0) FROM scorm_engine_resources WHERE tenant=?) +
      (SELECT COALESCE(SUM(length(archive)),0) FROM scorm_import_jobs WHERE tenant=?) AS n`).get(tenant, tenant, tenant, tenant, tenant) as any;
    return Number(row.n);
  }

  enqueue(p: Principal, a: any, bytes: Buffer) {
    return this.transaction(() => {
      this.store.live(p, true);
      if (!a || Object.keys(a).some(k => !['filename', 'provenance', 'packageId', 'version', 'confirmed', 'revision', 'key'].includes(k)) ||
          typeof a.filename !== 'string' || !/^[\p{L}\p{N} _.-]{1,115}\.zip$/u.test(a.filename) || typeof a.provenance !== 'string' || !a.provenance.trim() || a.provenance.length > 500 ||
          !Number.isSafeInteger(a.version) || a.version < 1 || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length > packageLimits.archive) reject('INVALID_ARGUMENT', 'Bounded licensed package ZIP and exact version required');
      const sha256 = createHash('sha256').update(bytes).digest('hex'), payload = {filename: a.filename, provenance: a.provenance.trim(), packageId: a.packageId ?? null, version: a.version, sha256};
      const m = this.mutation(p, a, 'scorm_engine_import', payload);
      if (m.old) {this.job(p, m.old.jobId); return m.old;}
      if (a.packageId !== undefined) {
        if (typeof a.packageId !== 'string' || !this.db.prepare('SELECT 1 FROM scorm_engine_packages WHERE id=? AND tenant=?').get(a.packageId, p.tenant)) reject('FORBIDDEN', 'Own tenant package required');
        const latest = this.db.prepare('SELECT MAX(version) AS n FROM scorm_engine_versions WHERE package_id=? AND tenant=?').get(a.packageId, p.tenant) as any;
        if (a.version !== Number(latest.n) + 1) reject('STALE_CONTEXT', 'Explicit next package version required');
      } else if (a.version !== 1) reject('INVALID_ARGUMENT', 'New package begins at version 1');
      const pending = this.db.prepare("SELECT count(*) AS n FROM scorm_import_jobs WHERE tenant=? AND status IN('queued','running')").get(p.tenant) as any;
      if (Number(pending.n) >= 4 || this.storedBytes(p.tenant) + bytes.length > 128 * 1024 * 1024) reject('INVALID_ARGUMENT', 'Shared tenant upload quota reached');
      const jobId = randomUUID(), now = new Date().toISOString();
      this.db.prepare('INSERT INTO scorm_import_jobs(id,tenant,owner,auth_version,filename,provenance,package_id,version,archive,sha256,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(jobId, p.tenant, p.id, p.auth_version, a.filename, a.provenance.trim(), a.packageId ?? null, a.version, bytes, sha256, now, now);
      const result = {jobId, status: 'queued'};
      this.receipt(p, a, m, 'human_scorm_engine_import', {...payload, jobId}, result);
      return result;
    });
  }

  job(p: Principal, id: string) {
    this.store.live(p, true);
    const row = this.db.prepare('SELECT id,tenant,owner,filename,package_id,version,status,warnings,error,created_at,updated_at FROM scorm_import_jobs WHERE id=? AND tenant=? AND owner=?').get(id, p.tenant, p.id) as any;
    if (!row) reject('FORBIDDEN', 'Own package import job required');
    return {...row, warnings: JSON.parse(row.warnings)};
  }

  run(id: string) {
    const existing = this.running.get(id);
    if (existing) return existing;
    const promise = this.process(id).finally(() => this.running.delete(id));
    this.running.set(id, promise);
    return promise;
  }
  async drain() {await Promise.all(this.running.values());}

  private async process(id: string) {
    const job = this.db.prepare("SELECT * FROM scorm_import_jobs WHERE id=? AND status IN('queued','running')").get(id) as any;
    if (!job) return;
    this.db.prepare("UPDATE scorm_import_jobs SET status='running',updated_at=? WHERE id=?").run(new Date().toISOString(), id);
    try {
      const inspected = await inspectSCORMPackage(Buffer.from(job.archive));
      this.transaction(() => {
        const account = this.db.prepare('SELECT * FROM accounts WHERE id=? AND tenant=?').get(job.owner, job.tenant) as unknown as Principal | undefined;
        if (!account || account.auth_version !== job.auth_version) reject('UNAUTHORIZED', 'Import authorization changed');
        this.store.live(account, true);
        if (inspected.sha256 !== job.sha256) reject('INVALID_ARGUMENT', 'Package hash changed');
        if (this.storedBytes(job.tenant) + inspected.expandedBytes > 128 * 1024 * 1024) reject('INVALID_ARGUMENT', 'Expanded tenant upload quota reached');
        const packageId = job.package_id ?? randomUUID(), now = new Date().toISOString();
        if (!job.package_id) this.db.prepare('INSERT INTO scorm_engine_packages VALUES(?,?,?,?,?)').run(packageId, job.tenant, job.owner, inspected.manifest.title, now);
        this.db.prepare('INSERT INTO scorm_engine_versions(package_id,tenant,version,standard,sha256,archive,manifest,created_at,filename,provenance) VALUES(?,?,?,?,?,?,?,?,?,?)').run(packageId, job.tenant, job.version, inspected.manifest.standard, inspected.sha256, job.archive, JSON.stringify(inspected.manifest), now, job.filename, job.provenance);
        const insert = this.db.prepare('INSERT INTO scorm_engine_resources VALUES(?,?,?,?,?,?)');
        for (const [path, bytes] of inspected.files) insert.run(packageId, job.version, job.tenant, path, bytes, scormResourceMime(path));
        const warnings = ['Parser validation is not a malware scan; exact package code and rights require human review.', 'Runtime and edition interoperability remain gated by the player support matrix.'];
        this.db.prepare("UPDATE scorm_import_jobs SET status='ready',package_id=?,archive=NULL,warnings=?,updated_at=? WHERE id=?").run(packageId, JSON.stringify(warnings), now, id);
        this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run('library:' + job.tenant);
        this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(job.tenant, job.owner, 'library:' + job.tenant, 'system_scorm_engine_import_validated', JSON.stringify({jobId: id, packageId, version: job.version, sha256: job.sha256, files: inspected.files.size}), now);
      });
    } catch (e) {
      // No manifest/path/source text is included in the durable diagnostic.
      const message = e instanceof DomainError ? e.message.slice(0, 300) : 'Package archive validation or storage failed';
      this.db.prepare("UPDATE scorm_import_jobs SET status='failed',archive=NULL,error=?,updated_at=? WHERE id=?").run(message, new Date().toISOString(), id);
    }
  }

  list(p: Principal, author = false, offset = 0) {
    this.store.live(p, author);
    return boundedPage(this.db.prepare(`SELECT p.id,p.title,v.version,v.standard,v.sha256,v.state,v.filename,v.provenance,v.review_reason
      FROM scorm_engine_packages p JOIN scorm_engine_versions v ON v.package_id=p.id AND v.tenant=p.tenant
      WHERE p.tenant=? AND (?=1 OR v.state='published') ORDER BY p.created_at DESC,p.id,v.version DESC`).all(p.tenant, author ? 1 : 0), offset, 20);
  }
  review(p: Principal, a: any) {
    return this.transaction(() => {
      this.store.live(p, true);
      if (!a || Object.keys(a).some(k => !['action', 'packageId', 'version', 'sha256', 'reason', 'confirmed', 'revision', 'key'].includes(k)) || !['publish', 'retire', 'revoke'].includes(a.action) || typeof a.reason !== 'string' || !a.reason.trim() || a.reason.length > 300 || !Number.isSafeInteger(a.version)) reject('INVALID_ARGUMENT', 'Exact reviewed package decision required');
      const row = this.db.prepare('SELECT * FROM scorm_engine_versions WHERE package_id=? AND version=? AND tenant=?').get(a.packageId, a.version, p.tenant) as any;
      if (!row || row.sha256 !== a.sha256) reject('FORBIDDEN', 'Authorized exact package hash required');
      const payload = {packageId: a.packageId, version: a.version, sha256: a.sha256, action: a.action, reason: a.reason.trim()}, m = this.mutation(p, a, 'scorm_engine_review', payload);
      if (m.old) return {packageId: a.packageId, version: a.version, state: row.state};
      if (a.action === 'publish' && row.state !== 'quarantined' || a.action === 'retire' && row.state !== 'published' || a.action === 'revoke' && row.state === 'revoked') reject('INVALID_ARGUMENT', 'Invalid package lifecycle transition');
      const state = a.action === 'publish' ? 'published' : a.action === 'retire' ? 'retired' : 'revoked';
      this.db.prepare('UPDATE scorm_engine_versions SET state=?,reviewer=?,review_reason=? WHERE package_id=? AND version=?').run(state, p.id, a.reason.trim(), a.packageId, a.version);
      const result = {packageId: a.packageId, version: a.version, state};
      this.receipt(p, a, m, 'human_scorm_engine_' + a.action, payload, result);
      return result;
    });
  }
  export(p: Principal, id: string, version: number) {
    this.store.live(p, true);
    const row = this.db.prepare('SELECT archive,filename,sha256 FROM scorm_engine_versions WHERE package_id=? AND version=? AND tenant=?').get(id, version, p.tenant) as any;
    if (!row) reject('FORBIDDEN', 'Authorized package unavailable');
    return {bytes: Buffer.from(row.archive), filename: row.filename, sha256: row.sha256};
  }
}
