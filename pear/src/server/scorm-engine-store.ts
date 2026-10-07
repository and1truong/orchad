import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {Principal} from '../shared/model.ts';
import {reject} from './errors.ts';
import {tokenHash} from './integration-credentials.ts';

export class SCORMEngineStore {
  constructor(readonly db: DatabaseSync) {}

  live(p: Principal, author = false) {
    const account = this.db.prepare('SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1').get(p.id, p.tenant) as any;
    if (!account || account.auth_version !== p.auth_version) reject('UNAUTHORIZED', 'Active account required');
    if (author && !['admin', 'content_admin'].includes(account.role)) reject('FORBIDDEN', 'Content administrator required');
  }

  registration(p: Principal, id: string) {
    this.live(p);
    const row = this.db.prepare(`SELECT r.*, v.standard, v.sha256, v.state AS package_state
      FROM scorm_registrations r JOIN scorm_engine_versions v ON v.package_id=r.package_id AND v.version=r.version AND v.tenant=r.tenant
      WHERE r.id=? AND r.tenant=? AND r.learner=?`).get(id, p.tenant, p.id) as any;
    if (!row) reject('FORBIDDEN', 'Own SCORM registration required');
    if (row.mode === 'preview') this.live(p, true);
    if (['quarantined', 'revoked'].includes(row.package_state)) reject('FORBIDDEN', 'Package execution is unavailable');
    return row;
  }

  register(p: Principal, a: {packageId: string; version: number; mode: 'normal' | 'preview'; confirmed: boolean; revision: number; key: string}) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.live(p, a?.mode === 'preview');
      if (!a || Object.keys(a).some(k => !['packageId', 'version', 'mode', 'confirmed', 'revision', 'key'].includes(k)) ||
          typeof a.packageId !== 'string' || !Number.isSafeInteger(a.version) || a.version < 1 ||
          !['normal', 'preview'].includes(a.mode) || a.confirmed !== true || !Number.isSafeInteger(a.revision) || a.revision < 0 ||
          typeof a.key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(a.key)) reject('INVALID_ARGUMENT', 'Reviewed exact package version required');
      const doc = `learning:${p.tenant}:${p.id}`;
      const payload = tokenHash(JSON.stringify({action: 'scorm_register', packageId: a.packageId, version: a.version, mode: a.mode}));
      const old = this.db.prepare('SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?').get(p.id, doc, a.key) as any;
      if (old) {
        if (old.payload !== payload) reject('IDEMPOTENCY_CONFLICT', 'SCORM registration request changed');
        const result = JSON.parse(old.result);
        this.registration(p, result.registrationId);
        this.db.exec('COMMIT');
        return result;
      }
      const pkg = this.db.prepare('SELECT * FROM scorm_engine_versions WHERE package_id=? AND version=? AND tenant=?').get(a.packageId, a.version, p.tenant) as any;
      if (!pkg || pkg.state !== 'published') reject('FORBIDDEN', 'Published package version required');
      if ((this.db.prepare('SELECT revision FROM workspaces WHERE id=?').get(doc) as any)?.revision !== a.revision) reject('STALE_CONTEXT', 'Learning context changed');
      let row = this.db.prepare("SELECT * FROM scorm_registrations WHERE tenant=? AND learner=? AND package_id=? AND version=? AND mode=? AND binding_key='standalone'").get(p.tenant, p.id, a.packageId, a.version, a.mode) as any;
      const now = new Date().toISOString();
      if (!row) {
        row = {id: randomUUID()};
        this.db.prepare('INSERT INTO scorm_registrations(id,tenant,learner,package_id,version,mode,created_at) VALUES(?,?,?,?,?,?,?)').run(row.id, p.tenant, p.id, a.packageId, a.version, a.mode, now);
        this.db.prepare('INSERT INTO scorm_engine_attempts(id,tenant,registration_id,attempt_number,created_at) VALUES(?,?,?,1,?)').run(randomUUID(), p.tenant, row.id, now);
      }
      const attempt = this.db.prepare('SELECT id,attempt_number FROM scorm_engine_attempts WHERE registration_id=? ORDER BY attempt_number DESC LIMIT 1').get(row.id) as any;
      const result = {registrationId: row.id, attemptId: attempt.id, attemptNumber: attempt.attempt_number, officialLearningChanged: false};
      this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(doc);
      this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant, p.id, doc, 'human_scorm_register', JSON.stringify({packageId: a.packageId, version: a.version, mode: a.mode}), now);
      this.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(p.id, doc, a.key, payload, JSON.stringify(result));
      this.db.exec('COMMIT');
      return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}
