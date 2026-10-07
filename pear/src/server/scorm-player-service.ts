import type {DatabaseSync} from 'node:sqlite';
import {randomBytes, randomUUID} from 'node:crypto';
import type {Principal} from '../shared/model.ts';
import type {SCORMManifest} from '../shared/scorm-engine.ts';
import {SCORMEngineStore} from './scorm-engine-store.ts';
import {tokenHash} from './integration-credentials.ts';
import {packagePath, inspectManifest} from './scorm-package-reader.ts';
import {validateSCORM12Checkpoint, scormSeconds, scormTime} from './scorm-runtime-validation.ts';
import {reject} from './errors.ts';

export function scorm12LaunchProfile(manifest: SCORMManifest) {
  const activity = manifest.activities?.[0], resource = manifest.resources?.find(r => r.id === activity?.resourceId);
  if (manifest.standard !== '1.2' || manifest.activities?.length !== 1 || !activity || activity.children.length || !resource || resource.kind !== 'sco' || manifest.resources.filter(r => r.kind === 'sco').length !== 1 || manifest.runtimeFeatures?.length) reject('INVALID_ARGUMENT', 'This player currently supports SCORM 1.2 single-SCO packages without prerequisite or sequencing extensions');
  return {activity, resource};
}

export class SCORMPlayerService {
  readonly store: SCORMEngineStore;
  constructor(readonly db: DatabaseSync) {this.store = new SCORMEngineStore(db);}
  private transaction<T>(fn: () => T) {this.db.exec('BEGIN IMMEDIATE'); try {const result = fn(); this.db.exec('COMMIT'); return result;} catch(e) {this.db.exec('ROLLBACK'); throw e;}}
  private manifest(packageId: string, version: number, tenant: string) {
    // Reparse the retained immutable original XML, including features added after import.
    const paths = this.db.prepare('SELECT path FROM scorm_engine_resources WHERE package_id=? AND version=? AND tenant=?').all(packageId, version, tenant) as {path: string}[];
    const xml = this.db.prepare("SELECT bytes FROM scorm_engine_resources WHERE package_id=? AND version=? AND tenant=? AND path='imsmanifest.xml'").get(packageId, version, tenant) as any;
    const files = new Map(paths.map(r => [r.path, Buffer.alloc(0)]));
    if (xml) files.set('imsmanifest.xml', Buffer.from(xml.bytes));
    return inspectManifest(files);
  }
  playbackSupported(packageId: string, version: number, tenant: string) {try {scorm12LaunchProfile(this.manifest(packageId, version, tenant)); return true;} catch {return false;}}
  launch(p: Principal, sessionHash: string, args: Parameters<SCORMEngineStore['register']>[1]) {
    this.store.live(p, args?.mode === 'preview');
    if (!args || typeof args.packageId !== 'string' || !args.packageId || !Number.isSafeInteger(args.version) || args.version < 1) reject('INVALID_ARGUMENT', 'Exact package version required');
    const profile = scorm12LaunchProfile(this.manifest(args.packageId, args.version, p.tenant));
    const session = this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND principal=? AND auth_version=? AND expires>?').get(sessionHash, p.id, p.auth_version, Date.now()) as any;
    if (!session) reject('UNAUTHORIZED', 'Current application session required');
    const registered = this.store.register(p, args);
    return this.transaction(() => {
      this.store.registration(p, registered.registrationId);
      const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
      this.db.prepare('UPDATE scorm_engine_launches SET closed=1 WHERE attempt_id=? AND sco_id=? AND closed=0').run(registered.attemptId, profile.activity.id);
      this.db.prepare('INSERT OR IGNORE INTO scorm_sco_attempts(attempt_id,tenant,sco_id) VALUES(?,?,?)').run(registered.attemptId, p.tenant, profile.activity.id);
      const sco = this.db.prepare('SELECT * FROM scorm_sco_attempts WHERE attempt_id=? AND sco_id=? AND sco_attempt_number=1').get(registered.attemptId, profile.activity.id) as any, previous = JSON.parse(sco.runtime_state), account = p as any;
      const initialState = {core: {student_id: p.id, student_name: account.name, credit: args.mode === 'preview' ? 'no-credit' : 'credit', lesson_mode: args.mode === 'preview' ? 'browse' : 'normal', entry: sco.revision === 0 ? 'ab-initio' : previous.core?.exit === 'suspend' ? 'resume' : '', total_time: scormTime(sco.reported_seconds)}};
      this.db.prepare('INSERT INTO scorm_engine_launches(id,token_hash,tenant,registration_id,attempt_id,sco_id,session_hash,auth_version,expires,initial_state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, tokenHash(token), p.tenant, registered.registrationId, registered.attemptId, profile.activity.id, sessionHash, p.auth_version, Math.min(session.expires, now + 60 * 60 * 1000), JSON.stringify(initialState), new Date(now).toISOString());
      this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant, p.id, 'learning:' + p.tenant + ':' + p.id, 'human_scorm_engine_launch', JSON.stringify({launchId: id, registrationId: registered.registrationId, attemptId: registered.attemptId, scoId: profile.activity.id, mode: args.mode}), new Date(now).toISOString());
      return {...registered, launchId: id, token, title: profile.activity.title, standard: '1.2'};
    });
  }
  private capability(token: string) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) reject('FORBIDDEN', 'Valid launch capability required');
    const launch = this.db.prepare('SELECT * FROM scorm_engine_launches WHERE token_hash=? AND closed=0 AND expires>?').get(tokenHash(token), Date.now()) as any;
    if (!launch) reject('FORBIDDEN', 'Launch closed or expired');
    const session = this.db.prepare('SELECT principal FROM sessions WHERE token_hash=? AND auth_version=? AND expires>?').get(launch.session_hash, launch.auth_version, Date.now()) as any;
    if (!session) reject('UNAUTHORIZED', 'Launch application session ended');
    const p = this.db.prepare('SELECT * FROM accounts WHERE id=? AND tenant=?').get(session.principal, launch.tenant) as unknown as Principal;
    if (!p || p.auth_version !== launch.auth_version) reject('UNAUTHORIZED', 'Launch authorization changed');
    const registration = this.store.registration(p, launch.registration_id);
    const attempt = this.db.prepare('SELECT * FROM scorm_engine_attempts WHERE id=? AND tenant=? AND registration_id=?').get(launch.attempt_id, launch.tenant, registration.id) as any;
    if (!attempt) reject('FORBIDDEN', 'Bound registration attempt required');
    const sco = this.db.prepare('SELECT * FROM scorm_sco_attempts WHERE attempt_id=? AND tenant=? AND sco_id=? AND sco_attempt_number=1').get(attempt.id, launch.tenant, launch.sco_id) as any;
    if (!sco) reject('FORBIDDEN', 'Bound SCO attempt required');
    return {launch, registration, attempt, sco, p};
  }
  private seed(c: ReturnType<SCORMPlayerService['capability']>) {
    const state = JSON.parse(c.sco.runtime_state), initial = JSON.parse(c.launch.initial_state);
    state.core = {...state.core, ...initial.core, exit: state.core?.exit ?? '', session_time: scormTime(c.launch.session_seconds)};
    if (!state.core.lesson_status) state.core.lesson_status = 'not attempted';
    return state;
  }
  bootstrap(token: string) {
    const c = this.capability(token), manifest = this.manifest(c.registration.package_id, c.registration.version, c.launch.tenant), profile = scorm12LaunchProfile(manifest);
    if (c.launch.finished) reject('FORBIDDEN', 'Finished communication session must be relaunched');
    return {launchId: c.launch.id, state: this.seed(c), revision: c.sco.revision, sequence: c.launch.sequence, title: profile.activity.title, href: profile.resource.href, parameters: profile.activity.parameters ?? '', officialLearningChanged: false};
  }
  resource(token: string, path: string) {
    const c = this.capability(token);
    packagePath(path);
    const row = this.db.prepare('SELECT bytes,mime FROM scorm_engine_resources WHERE package_id=? AND version=? AND tenant=? AND path=?').get(c.registration.package_id, c.registration.version, c.launch.tenant, path) as any;
    if (!row) reject('FORBIDDEN', 'Package resource unavailable');
    return {bytes: Buffer.from(row.bytes), mime: row.mime};
  }
  checkpoint(token: string, a: any) {
    return this.transaction(() => {
      const c = this.capability(token);
      if (!a || Object.keys(a).some(k => !['sequence', 'revision', 'state', 'finished'].includes(k)) || !Number.isSafeInteger(a.sequence) || a.sequence < 1 || !Number.isSafeInteger(a.revision) || a.revision < 0 || typeof a.finished !== 'boolean') reject('INVALID_ARGUMENT', 'Exact checkpoint sequence and revision required');
      const payloadHash = tokenHash(JSON.stringify(a)), old = this.db.prepare('SELECT * FROM scorm_engine_checkpoints WHERE launch_id=? AND sequence=?').get(c.launch.id, a.sequence) as any;
      if (old) {if (old.payload_hash !== payloadHash) reject('IDEMPOTENCY_CONFLICT', 'Checkpoint sequence payload changed'); return JSON.parse(old.result);}
      if (c.launch.finished || a.sequence !== c.launch.sequence + 1 || a.revision !== c.sco.revision) reject('STALE_CONTEXT', 'Checkpoint revision or session changed');
      const state = validateSCORM12Checkpoint(a.state, this.seed(c)), seconds = scormSeconds(state.core.session_time);
      if (seconds < c.launch.session_seconds) reject('INVALID_ARGUMENT', 'Session time cannot decrease within a launch');
      const revision = c.sco.revision + 1, now = new Date().toISOString();
      this.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?,revision=?,reported_seconds=reported_seconds+? WHERE attempt_id=? AND sco_id=? AND sco_attempt_number=1 AND tenant=?').run(JSON.stringify(state), revision, seconds - c.launch.session_seconds, c.attempt.id, c.launch.sco_id, c.launch.tenant);
      this.db.prepare('UPDATE scorm_engine_launches SET sequence=?,session_seconds=?,finished=? WHERE id=?').run(a.sequence, seconds, a.finished ? 1 : 0, c.launch.id);
      this.db.prepare('UPDATE scorm_engine_attempts SET revision=revision+1 WHERE id=?').run(c.attempt.id);
      this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run('learning:' + c.p.tenant + ':' + c.p.id);
      const result = {launchId: c.launch.id, sequence: a.sequence, revision, finished: a.finished, officialLearningChanged: false};
      this.db.prepare('INSERT INTO scorm_engine_checkpoints VALUES(?,?,?,?)').run(c.launch.id, a.sequence, payloadHash, JSON.stringify(result));
      this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(c.p.tenant, c.p.id, 'learning:' + c.p.tenant + ':' + c.p.id, 'runtime_scorm_engine_checkpoint', JSON.stringify({launchId: c.launch.id, sequence: a.sequence, revision, finished: a.finished}), now);
      return result;
    });
  }
  status(p: Principal, id: string, sessionHash: string) {
    this.store.live(p);
    const row = this.db.prepare('SELECT l.id,l.sequence,l.finished,l.closed,l.expires,s.revision,s.runtime_state,s.reported_seconds,l.registration_id FROM scorm_engine_launches l JOIN scorm_sco_attempts s ON s.attempt_id=l.attempt_id AND s.sco_id=l.sco_id AND s.tenant=l.tenant AND s.sco_attempt_number=1 JOIN scorm_registrations r ON r.id=l.registration_id AND r.tenant=l.tenant WHERE l.id=? AND l.tenant=? AND r.learner=? AND l.session_hash=?').get(id, p.tenant, p.id, sessionHash) as any;
    if (!row) reject('FORBIDDEN', 'Own session launch required');
    this.store.registration(p, row.registration_id);
    return {...row, runtime_state: JSON.parse(row.runtime_state), officialLearningChanged: false};
  }
  close(p: Principal, id: string, sessionHash: string) {
    return this.transaction(() => {
      const status = this.status(p, id, sessionHash);
      if (status.closed) return {closed: true};
      this.db.prepare('UPDATE scorm_engine_launches SET closed=1 WHERE id=?').run(id);
      this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant, p.id, 'learning:' + p.tenant + ':' + p.id, 'human_scorm_engine_close', JSON.stringify({launchId: id, sequence: status.sequence}), new Date().toISOString());
      return {closed: true};
    });
  }
}
