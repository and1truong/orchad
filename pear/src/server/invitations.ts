import {createHash, randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {Principal} from '../shared/model.ts';
import {boundedPage, reject} from './errors.ts';
import type {OIDCConfig} from './identity.ts';

export type InvitationMail = {url: string; token: string};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const identifier = /^[A-Za-z0-9_-]{1,64}$/;
export class InvitationService {
  constructor(readonly db: DatabaseSync, readonly config: OIDCConfig | undefined, readonly origin: string, readonly mail?: InvitationMail, fixture = false) {
    if (mail) {
      const url = new URL(mail.url);
      if (url.username || url.password || url.hash || mail.url.length > 2048 ||
          (url.protocol !== 'https:' && !(fixture && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ||
          typeof mail.token !== 'string' || !mail.token || mail.token.length > 2000 || /[\r\n]/.test(mail.token)) throw Error('Invitation mail requires a reviewed HTTPS endpoint and token');
    }
  }
  private admin(p: Principal) {
    const row = this.db.prepare('SELECT role,auth_version FROM accounts WHERE id=? AND tenant=? AND active=1').get(p.id, p.tenant) as any;
    if (!row || row.auth_version !== p.auth_version) reject('UNAUTHORIZED', 'Active account required');
    if (row.role !== 'admin') reject('FORBIDDEN', 'Invitations require tenant administrator');
  }
  private row(id: string) {
    return this.db.prepare('SELECT * FROM user_invitations WHERE id=?').get(id) as any;
  }
  private available(row: any) {
    if (!row || row.state !== 'pending' || row.expires <= Date.now() || !this.config || row.issuer !== this.config.issuer || row.client_id !== this.config.clientId) reject('FORBIDDEN', 'Invitation expired or unavailable');
    const owner = this.db.prepare('SELECT 1 FROM accounts WHERE id=? AND tenant=? AND active=1 AND role=\'admin\' AND auth_version=?').get(row.owner, row.tenant, row.owner_auth_version);
    const target = this.db.prepare('SELECT 1 FROM accounts WHERE id=? AND tenant=? AND active=1 AND auth_version=?').get(row.user_id, row.tenant, row.user_auth_version);
    if (!owner || !target || this.db.prepare('SELECT 1 FROM identity_links WHERE issuer=? AND (subject=? OR user_id=?)').get(row.issuer, row.subject, row.user_id)) reject('FORBIDDEN', 'Invitation identity or authority changed');
    return row;
  }
  start(id: string) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) reject('FORBIDDEN', 'Invitation expired or unavailable');
    return this.available(this.row(id));
  }
  redeem(id: string, subject: string) {
    // Called inside the verified OIDC callback transaction. A link alone grants no access.
    const row = this.start(id);
    if (subject !== row.subject) reject('UNAUTHORIZED', 'Invitation requires the reviewed organization identity');
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO identity_links VALUES(?,?,?,?,?)').run(row.tenant, row.issuer, row.subject, row.user_id, now);
    this.db.prepare("UPDATE user_invitations SET state='accepted',accepted_at=? WHERE id=?").run(now, id);
    this.db.prepare('UPDATE accounts SET auth_version=auth_version+1 WHERE id=?').run(row.user_id);
    this.db.prepare('DELETE FROM sessions WHERE principal=?').run(row.user_id);
    this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id IN(?,?)').run('library:' + row.tenant, `learning:${row.tenant}:${row.user_id}`);
    this.audit(row.tenant, row.user_id, 'accept', {invitationId: id, userId: row.user_id});
  }
  private audit(tenant: string, principal: string, action: string, args: any) {
    this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(tenant, principal, 'library:' + tenant, 'human_invitation_' + action, JSON.stringify(args), new Date().toISOString());
  }
  list(p: Principal, offset: number) {
    this.admin(p);
    const items = this.db.prepare('SELECT * FROM user_invitations WHERE tenant=? ORDER BY created_at DESC,id').all(p.tenant) as any[];
    return {...boundedPage(items.map(row => {
      let state = row.state;
      if (state === 'pending') {
        try {this.available(row);} catch {state = row.expires <= Date.now() ? 'expired' : 'unavailable';}
      }
      return {id: row.id, userId: row.user_id, recipient: row.recipient, subject: row.subject, state, delivery: row.delivery, expiresAt: new Date(row.expires).toISOString(), url: this.origin + '/?invitation=' + row.id};
    }), offset, 20), configured: !!this.config, mailConfigured: !!this.mail};
  }
  change(p: Principal, a: any) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.admin(p);
      if (!a || !['create', 'revoke'].includes(a.action) || typeof a.key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(a.key) || !Number.isSafeInteger(a.revision) || a.revision < 0 || typeof a.reason !== 'string' || !a.reason.trim() || a.reason.length > 300) reject('INVALID_ARGUMENT', 'Invalid reviewed invitation');
      const expected = a.action === 'create' ? 'action,expiresInDays,key,reason,recipient,revision,subject,userId' : 'action,invitationId,key,reason,revision';
      if (Object.keys(a).sort().join(',') !== expected) reject('INVALID_ARGUMENT', 'Invalid reviewed invitation');
      if (a.action === 'create' && (typeof a.userId !== 'string' || !identifier.test(a.userId) || typeof a.subject !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(a.subject) || typeof a.recipient !== 'string' || a.recipient.length > 254 || !/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(a.recipient) || !Number.isSafeInteger(a.expiresInDays) || a.expiresInDays < 1 || a.expiresInDays > 30)) reject('INVALID_ARGUMENT', 'Invalid invitation identity, recipient or expiry');
      if (a.action === 'revoke' && (typeof a.invitationId !== 'string' || !/^[a-f0-9-]{36}$/.test(a.invitationId))) reject('INVALID_ARGUMENT', 'Invalid reviewed invitation');
      const doc = 'library:' + p.tenant, key = 'invitation:' + a.key, payload = hash(JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k]) => k !== 'revision'))));
      const receipt = this.db.prepare('SELECT payload,result FROM idempotency WHERE principal=? AND document_id=? AND key=?').get(p.id, doc, key) as any;
      if (receipt) {
        if (receipt.payload !== payload) reject('IDEMPOTENCY_CONFLICT', 'Invitation request changed');
        this.db.exec('COMMIT'); return JSON.parse(receipt.result);
      }
      if ((this.db.prepare('SELECT revision FROM workspaces WHERE id=?').get(doc) as any)?.revision !== a.revision) reject('STALE_CONTEXT', 'Invitation settings changed; refresh');
      let id: string;
      if (a.action === 'create') {
        if (!this.config) reject('FORBIDDEN', 'OIDC provider is not configured');
        const target = this.db.prepare('SELECT auth_version FROM accounts WHERE id=? AND tenant=? AND active=1').get(a.userId, p.tenant) as any;
        if (!target) reject('FORBIDDEN', 'Active same-tenant user required');
        if (this.db.prepare('SELECT 1 FROM identity_links WHERE issuer=? AND (subject=? OR user_id=?)').get(this.config.issuer, a.subject, a.userId)) reject('FORBIDDEN', 'Identity already mapped; review existing mappings');
        this.db.prepare("UPDATE user_invitations SET state='expired' WHERE state='pending' AND expires<=?").run(Date.now());
        if (this.db.prepare("SELECT 1 FROM user_invitations WHERE issuer=? AND state='pending' AND (subject=? OR user_id=?)").get(this.config.issuer, a.subject, a.userId)) reject('INVALID_ARGUMENT', 'Pending invitation already exists; revoke it before reissuing');
        if ((this.db.prepare("SELECT COUNT(*) AS n FROM user_invitations WHERE tenant=? AND state='pending'").get(p.tenant) as any).n >= 1000) reject('INVALID_ARGUMENT', 'Pending invitation capacity reached');
        id = randomUUID();
        this.db.prepare('INSERT INTO user_invitations(id,tenant,issuer,client_id,subject,user_id,user_auth_version,owner,owner_auth_version,recipient,created_at,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, p.tenant, this.config.issuer, this.config.clientId, a.subject, a.userId, target.auth_version, p.id, p.auth_version, a.recipient, new Date().toISOString(), Date.now() + a.expiresInDays * 86400000);
      } else {
        const row = this.row(a.invitationId);
        if (!row || row.tenant !== p.tenant) reject('FORBIDDEN', 'Invitation unavailable');
        if (row.state === 'accepted') reject('INVALID_ARGUMENT', 'Accepted invitation requires explicit identity unlink');
        id = row.id;
        this.db.prepare("UPDATE user_invitations SET state='revoked' WHERE id=?").run(id);
      }
      this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(doc);
      this.audit(p.tenant, p.id, a.action, {invitationId: id, reason: a.reason});
      const result = {invitationId: id, action: a.action, url: this.origin + '/?invitation=' + id};
      this.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(p.id, doc, key, payload, JSON.stringify(result));
      this.db.exec('COMMIT'); return result;
    } catch (e) {this.db.exec('ROLLBACK'); throw e;}
  }
  async deliver(p: Principal, id: string) {
    this.db.exec('BEGIN IMMEDIATE'); let row: any;
    try {
      this.admin(p); row = this.start(id);
      if (row.tenant !== p.tenant) reject('FORBIDDEN', 'Invitation unavailable');
      if (!this.mail) reject('FORBIDDEN', 'Invitation mail endpoint is not configured');
      if (row.delivery === 'accepted') {this.db.exec('COMMIT'); return {acceptedByTransport: true};}
      if (row.delivery === 'sending' && row.delivery_until > Date.now()) reject('STALE_CONTEXT', 'Invitation delivery is already in progress');
      this.db.prepare("UPDATE user_invitations SET delivery='sending',delivery_until=? WHERE id=?").run(Date.now() + 60000, id);
      this.audit(p.tenant, p.id, 'send', {invitationId: id});
      this.db.exec('COMMIT');
    } catch (e) {this.db.exec('ROLLBACK'); throw e;}
    let accepted = false;
    try {
      const response = await fetch(this.mail!.url, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000), headers: {'content-type': 'application/json', authorization: 'Bearer ' + this.mail!.token, 'idempotency-key': id}, body: JSON.stringify({recipient: row.recipient, url: this.origin + '/?invitation=' + id, expiresAt: new Date(row.expires).toISOString()})});
      accepted = response.ok;
      await response.body?.cancel();
    } catch { /* Retain a retryable failure without leaking transport diagnostics. */ }
    this.db.prepare("UPDATE user_invitations SET delivery=?,delivery_until=0 WHERE id=?").run(accepted ? 'accepted' : 'failed', id);
    if (!accepted) reject('INTERNAL', 'Invitation mail transport failed; retry delivery');
    return {acceptedByTransport: true};
  }
}
