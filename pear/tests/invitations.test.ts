import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fixture, data} from './helpers.ts';
import {createApp} from '../src/server/app.ts';
import {InvitationService} from '../src/server/invitations.ts';
import {IdentityService} from '../src/server/identity.ts';
import {startIdentityFixture} from './identity-fixture.ts';
const origin = 'http://127.0.0.1:4314', base = {host: '127.0.0.1:4314', origin};
const config = {issuer: 'https://identity.example', authorizationEndpoint: 'https://identity.example/auth', tokenEndpoint: 'https://identity.example/token', jwksUri: 'https://identity.example/keys', clientId: 'pear'};
function issue(f: ReturnType<typeof fixture>, invitations: InvitationService, extra: any = {}) {
  return invitations.change(f.service.principal('admin'), {action: 'create', userId: 'learner-a', subject: 'subject-a', recipient: 'learner@example.test', expiresInDays: 1, reason: 'Reviewed original invitation', key: crypto.randomUUID(), revision: f.service.context('admin', 'library:demo').revision, ...extra});
}
function revoke(f: ReturnType<typeof fixture>, invitations: InvitationService, id: string) {
  return invitations.change(f.service.principal('admin'), {action: 'revoke', invitationId: id, reason: 'Human revoked', key: crypto.randomUUID(), revision: f.service.context('admin', 'library:demo').revision});
}
async function login(app: any, id = 'admin') {
  const response = await app.inject({method: 'POST', url: '/api/login', headers: base, payload: {username: id, password: id + '-dev'}});
  assert.equal(response.statusCode, 200); const b = response.json();
  return {...base, cookie: String(response.headers['set-cookie']).split(';')[0]!, 'x-csrf-token': b.csrf, 'x-pear-epoch': b.sessionEpoch};
}

test('invitations enforce current admin/tenant/identity, bounded input, CAS, receipts, duplicates and audited rollback', () => {
  const f = fixture(), s = new InvitationService(f.db, config, origin);
  try {
    const args = {action: 'create', userId: 'learner-a', subject: 'subject-a', recipient: 'learner@example.test', expiresInDays: 1, reason: 'Reviewed', key: 'stable', revision: 0};
    for (const actor of ['manager', 'editor', 'assessor', 'learner-a', 'outsider']) assert.throws(() => s.change(f.service.principal(actor), args), /administrator/);
    for (const extra of [{userId: 'outsider'}, {userId: 'absent'}, {subject: 'invalid subject'}, {recipient: 'a@example.test\r\nBcc: bad@example.test'}, {expiresInDays: 0}, {expiresInDays: 31}, {expiresInDays: 1.5}, {role: 'admin'}, {userId: 42}, {reason: ' '}]) assert.throws(() => issue(f, s, extra));
    const r = s.change(f.service.principal('admin'), args);
    assert.deepEqual(s.change(f.service.principal('admin'), {...args, revision: 99}), r);
    assert.throws(() => s.change(f.service.principal('admin'), {...args, recipient: 'changed@example.test'}), /changed/);
    assert.throws(() => issue(f, s), /already exists/);
    assert.throws(() => issue(f, s, {userId: 'learner-b'}), /already exists/);
    assert.throws(() => issue(f, s, {userId: 'learner-b', subject: 'subject-b', revision: 0}), /refresh/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM identity_links').get()!.n, 0);
    assert.equal(s.list(f.service.principal('admin'), 0).items[0].state, 'pending');
    revoke(f, s, r.invitationId); assert.throws(() => s.start(r.invitationId), /unavailable/);
    const before = f.service.context('admin', 'library:demo').revision;
    f.db.exec("CREATE TRIGGER invitation_audit_fail BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    assert.throws(() => issue(f, s), /audit unavailable/);
    assert.equal(f.service.context('admin', 'library:demo').revision, before);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM user_invitations').get()!.n, 1);
    f.db.exec('DROP TRIGGER invitation_audit_fail');
    const expired = issue(f, s); f.db.prepare('UPDATE user_invitations SET expires=0 WHERE id=?').run(expired.invitationId);
    assert.throws(() => s.start(expired.invitationId), /unavailable/); assert.equal(s.list(f.service.principal('admin'), 0).items.find(r => r.id === expired.invitationId).state, 'expired');
    issue(f, s); assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.throws(() => new InvitationService(f.db, config, origin, {url: 'http://external.example/mail', token: 'test'}), /HTTPS/);
  } finally {f.db.close();}
});

test('authority changes and existing mappings invalidate pending invitations; expiry/revoke survives reopen without changing learning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pear-invitation-')), path = join(dir, 'data.sqlite');
  let f = fixture(path);
  try {
    data(f.call('learner-a', 'learning_enroll', {courseId: 'systems-basics'}));
    const ledger = f.db.prepare('SELECT * FROM enrollments').all(), s = new InvitationService(f.db, config, origin), r = issue(f, s);
    f.db.close(); f = fixture(path); const reopened = new InvitationService(f.db, config, origin);
    assert.equal(reopened.start(r.invitationId).user_id, 'learner-a');
    for (const id of ['admin', 'learner-a']) {
      f.db.prepare('UPDATE accounts SET auth_version=auth_version+1 WHERE id=?').run(id);
      assert.throws(() => reopened.start(r.invitationId), /authority changed/);
      f.db.prepare('UPDATE accounts SET auth_version=auth_version-1 WHERE id=?').run(id);
    }
    f.db.prepare('UPDATE accounts SET active=0 WHERE id=\'learner-a\'').run(); assert.throws(() => reopened.start(r.invitationId), /authority changed/);
    f.db.prepare('UPDATE accounts SET active=1 WHERE id=\'learner-a\'').run();
    f.db.prepare('INSERT INTO identity_links VALUES(?,?,?,?,?)').run('demo', config.issuer, 'other-subject', 'learner-a', new Date().toISOString());
    assert.throws(() => reopened.start(r.invitationId), /authority changed/);
    assert.throws(() => issue(f, reopened), /already mapped/);
    revoke(f, reopened, r.invitationId);
    assert.deepEqual(f.db.prepare('SELECT * FROM enrollments').all(), ledger);
    assert.equal(f.service.description('admin', 'library:demo').tools.some(t => /invitation/.test(t.name)), false);
  } finally {f.db.close(); rmSync(dir, {recursive: true, force: true});}
});

test('signed browser-bound OIDC redeems only the reviewed subject once; revocation during exchange and audit failure roll back mapping/session/acceptance', async () => {
  const f = fixture(), provider = await startIdentityFixture(origin + '/api/auth/callback');
  const s = new InvitationService(f.db, provider.config, origin), identity = new IdentityService(f.db, provider.config, origin, true);
  const redeem = async (id: string, before?: () => void) => {
    const flow = identity.start(undefined, id), target = await provider.authorize(flow.url);
    before?.(); return identity.callback(Object.fromEntries(target.searchParams), flow.binding);
  };
  try {
    const r = issue(f, s);
    provider.controls.subject = 'wrong-subject'; await assert.rejects(() => redeem(r.invitationId), /verification failed/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM identity_links').get()!.n, 0);
    provider.controls.subject = 'subject-a';
    await assert.rejects(() => redeem(r.invitationId, () => revoke(f, s, r.invitationId)), /verification failed/);
    const fresh = issue(f, s);
    f.db.exec("CREATE TRIGGER invitation_audit_fail BEFORE INSERT ON audit WHEN NEW.tool='human_oidc_login' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await assert.rejects(() => redeem(fresh.invitationId), /verification failed/);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM identity_links').get()!.n, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sessions').get()!.n, 0);
    assert.equal(f.db.prepare('SELECT state FROM user_invitations WHERE id=?').get(fresh.invitationId)!.state, 'pending');
    f.db.exec('DROP TRIGGER invitation_audit_fail');
    const result = await redeem(fresh.invitationId); assert.equal(result!.account.id, 'learner-a'); assert.equal(result!.account.role, 'learner');
    assert.equal(f.db.prepare('SELECT state FROM user_invitations WHERE id=?').get(fresh.invitationId)!.state, 'accepted');
    assert.throws(() => identity.start(undefined, fresh.invitationId), /unavailable/);
    assert.throws(() => revoke(f, s, fresh.invitationId), /unlink/);
    const ordinary = identity.start(), target = await provider.authorize(ordinary.url);
    assert.equal((await identity.callback(Object.fromEntries(target.searchParams), ordinary.binding))!.account.id, 'learner-a');
  } finally {await provider.close(); f.db.close();}
});

test('HTTP invitation admin routes require CSRF/epoch and send only through configured transport with stable retry key and live invitation checks', async () => {
  const f = fixture(); let count = 0, fail = true, last: any;
  const mail = createServer(async (req, res) => {
    count++; let body = ''; for await (const b of req) body += b;
    last = {headers: req.headers, body: JSON.parse(body)}; res.writeHead(fail ? 503 : 202); res.end();
  });
  await new Promise<void>(resolve => mail.listen(0, '127.0.0.1', resolve));
  const {app} = await createApp({db: f.db, origin, developmentAuth: true, identityFixture: true, oidc: config, invitationMail: {url: 'http://127.0.0.1:' + (mail.address() as any).port, token: 'fixture-mail-token'}});
  try {
    const h = await login(app), body = {action: 'create', userId: 'learner-a', subject: 'subject-a', recipient: 'learner@example.test', expiresInDays: 1, reason: 'HTTP reviewed', key: 'http-invite', revision: 0};
    const post = (payload: any, headers = h) => app.inject({method: 'POST', url: '/api/invitations', headers, payload});
    assert.equal((await post(body, {...h, 'x-csrf-token': 'wrong'})).statusCode, 403);
    assert.equal((await post(body, {...h, 'x-pear-epoch': 'wrong'})).statusCode, 409);
    assert.equal((await post(body, await login(app, 'manager'))).statusCode, 403);
    const created = await post(body); assert.equal(created.statusCode, 200); const id = created.json().invitationId;
    assert.deepEqual((await post(body)).json(), created.json());
    const send = (headers = h) => app.inject({method: 'POST', url: '/api/invitations/' + id + '/send', headers, payload: {}});
    assert.equal((await send({...h, 'x-csrf-token': 'wrong'})).statusCode, 403); assert.equal(count, 0);
    assert.equal((await send()).statusCode, 500); assert.equal(f.db.prepare('SELECT delivery FROM user_invitations WHERE id=?').get(id)!.delivery, 'failed');
    fail = false; assert.equal((await send()).statusCode, 200); assert.equal(count, 2);
    assert.equal(last.headers.authorization, 'Bearer fixture-mail-token'); assert.equal(last.headers['idempotency-key'], id);
    assert.equal(last.body.url, origin + '/?invitation=' + id); assert.equal(last.body.recipient, body.recipient);
    assert.equal((await send()).statusCode, 200); assert.equal(count, 2);
    const visible = await app.inject({url: '/api/invitations', headers: h}); assert.equal(visible.statusCode, 200); assert.equal(JSON.stringify(visible.json()).includes('fixture-mail-token'), false);
    const s = new InvitationService(f.db, config, origin); revoke(f, s, id); assert.equal((await send()).statusCode, 403); assert.equal(count, 2);
    assert.equal((await app.inject({method: 'POST', url: '/api/auth/start', headers: base, payload: {invitationId: id}})).statusCode, 403);
    assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM audit').all()).includes(body.recipient), false);
    f.db.prepare('UPDATE accounts SET auth_version=auth_version+1 WHERE id=\'admin\'').run(); assert.equal((await app.inject({url: '/api/invitations', headers: h})).statusCode, 401);
  } finally {await app.close(); await new Promise<void>(resolve => {mail.close(() => resolve()); mail.closeAllConnections();}); f.db.close();}
});


test('schema-50 populated accounts, learning and ordinary OIDC transactions migrate without identity mutation', () => {
  const dir=mkdtempSync(join(tmpdir(),'pear-invitation-migration-')),path=join(dir,'data.sqlite');
  let f=fixture(path);
  try {
    data(f.call('learner-a','learning_enroll',{courseId:'systems-basics'}));
    const accounts=f.db.prepare('SELECT * FROM accounts ORDER BY id').all(),enrollments=f.db.prepare('SELECT * FROM enrollments').all();
    f.db.exec('ALTER TABLE identity_transactions DROP COLUMN invitation_id; DROP TABLE user_invitations; DELETE FROM schema_version WHERE version=51');
    f.db.prepare('INSERT INTO identity_transactions(state_hash,binding_hash,nonce,verifier,expires,provider_hash) VALUES(?,?,?,?,?,?)').run('state','binding','nonce','verifier',Date.now()+300000,'provider');
    f.db.close();f=fixture(path);
    assert.equal(f.db.prepare('SELECT max(version) n FROM schema_version').get()!.n,51);
    assert.deepEqual(f.db.prepare('SELECT * FROM accounts ORDER BY id').all(),accounts);
    assert.deepEqual(f.db.prepare('SELECT * FROM enrollments').all(),enrollments);
    assert.equal(f.db.prepare('SELECT invitation_id FROM identity_transactions').get()!.invitation_id,null);
    assert.equal(f.db.prepare('SELECT count(*) n FROM user_invitations').get()!.n,0);
    assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {f.db.close();rmSync(dir,{recursive:true,force:true});}
});
