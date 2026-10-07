import type {DatabaseSync} from 'node:sqlite';
import {randomBytes, randomUUID} from 'node:crypto';
import type {Principal} from '../shared/model.ts';
import type {SCORMManifest} from '../shared/scorm-engine.ts';
import {SCORMEngineStore} from './scorm-engine-store.ts';
import {tokenHash} from './integration-credentials.ts';
import {packagePath, inspectManifest} from './scorm-package-reader.ts';
import {validateSCORM12Checkpoint, scormSeconds, scormTime} from './scorm-runtime-validation.ts';
import {reject} from './errors.ts';
import {scoEvidence, meetsSCORMPolicy} from './scorm-evidence.ts';
import {scorm12Activities, playbackActivities, activityStates, activityAvailable} from './scorm-activities.ts';
import {validateSCORM2004Checkpoint} from './scorm2004-validation.ts';
import {scorm2004Seconds, scorm2004Time} from '../shared/scorm2004-runtime.ts';
import {usesSequencing, sequencingTree, trustedSequencing, selectSCO, saveSequencing, deliveredSCO} from './scorm-sequencing.ts';
import type {SCORMLearningBindings} from './scorm-learning-bindings.ts';
import {sharedDataClientSnapshot} from './scorm-shared-data.ts';
import {scormRuntimeStorageBytes} from './scorm-storage.ts';
import {SCORM_RUNTIME_LIMITS} from '../shared/scorm-operations.ts';

export function scorm12LaunchProfile(manifest: SCORMManifest, scoId?: string) {
  const profiles = scorm12Activities(manifest), profile = scoId ? profiles.find(p => p.activity.id === scoId) : profiles[0];
  if (!profile) reject('FORBIDDEN', 'Exact organization SCO required');
  return profile;
}

function launchProfile(manifest: SCORMManifest, scoId?: string) {
  const profiles = playbackActivities(manifest), profile = scoId ? profiles.find(p => p.activity.id === scoId) : profiles[0];
  if (!profile) reject('FORBIDDEN', 'Exact organization SCO required'); return profile;
}

export class SCORMPlayerService {
  readonly store: SCORMEngineStore;
  constructor(readonly db: DatabaseSync, readonly bindings?: SCORMLearningBindings, readonly limits: {maxCheckpointReceiptsPerLaunch: number; maxRuntimeStorageBytesPerTenant: number} = SCORM_RUNTIME_LIMITS) {
    if (Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 1)) throw Error('Positive runtime limits required');
    this.store = new SCORMEngineStore(db, bindings ? (p, r) => bindings.guard(p, r) : undefined);
  }
  private transaction<T>(fn: () => T) {this.db.exec('BEGIN IMMEDIATE'); try {const result = fn(); this.db.exec('COMMIT'); return result;} catch(e) {this.db.exec('ROLLBACK'); throw e;}}
  private scos(attemptId: string, tenant: string) {
    return this.db.prepare('SELECT s.* FROM scorm_sco_attempts s WHERE s.attempt_id=? AND s.tenant=? AND s.sco_attempt_number=(SELECT max(n.sco_attempt_number) FROM scorm_sco_attempts n WHERE n.attempt_id=s.attempt_id AND n.sco_id=s.sco_id)').all(attemptId, tenant) as any[];
  }
  private manifest(packageId: string, version: number, tenant: string) {
    // Reparse the retained immutable original XML, including features added after import.
    const paths = this.db.prepare('SELECT path FROM scorm_engine_resources WHERE package_id=? AND version=? AND tenant=?').all(packageId, version, tenant) as {path: string}[];
    const xml = this.db.prepare("SELECT bytes FROM scorm_engine_resources WHERE package_id=? AND version=? AND tenant=? AND path='imsmanifest.xml'").get(packageId, version, tenant) as any;
    const files = new Map(paths.map(r => [r.path, Buffer.alloc(0)]));
    if (xml) files.set('imsmanifest.xml', Buffer.from(xml.bytes));
    return inspectManifest(files);
  }
  playbackSupported(packageId: string, version: number, tenant: string) {try {const m = this.manifest(packageId, version, tenant); launchProfile(m); if (usesSequencing(m)) sequencingTree(m); return true;} catch {return false;}}
  launch(p: Principal, sessionHash: string, request: Parameters<SCORMEngineStore['register']>[1] & {binding?: Record<string, unknown>; scoId?: string}) {
    const {binding, scoId, ...args} = request ?? {};
    if (scoId !== undefined && (typeof scoId !== 'string' || !scoId)) reject('INVALID_ARGUMENT', 'Exact SCO identifier required');
    const context = binding ? this.bindings?.resolve(p, binding) : undefined;
    if (binding && (!context || args.mode !== 'normal')) reject('FORBIDDEN', 'Authorized normal learning context required');
    if (context) this.bindings!.validate(p, context, args.packageId, args.version);
    this.store.live(p, args?.mode === 'preview');
    if (!args || typeof args.packageId !== 'string' || !args.packageId || !Number.isSafeInteger(args.version) || args.version < 1) reject('INVALID_ARGUMENT', 'Exact package version required');
    const manifest = this.manifest(args.packageId, args.version, p.tenant);
    playbackActivities(manifest);
    const reviewed = this.context(p, binding ?? {packageId: args.packageId, version: String(args.version), mode: args.mode});
    if (scoId && !reviewed.activities.some(a => a.id === scoId && a.available) || !reviewed.activities.some(a => a.available)) reject('FORBIDDEN', 'SCO prerequisites are not satisfied');
    const session = this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND principal=? AND auth_version=? AND expires>?').get(sessionHash, p.id, p.auth_version, Date.now()) as any;
    if (!session) reject('UNAUTHORIZED', 'Current application session required');
    return this.transaction(() => {
      const registered = this.store.register(p, args, context ? {key: context.bindingKey, attach: id => this.bindings!.attach(p, id, context)} : undefined);
      const registration = this.store.registration(p, registered.registrationId);
      const rows = this.scos(registered.attemptId, p.tenant), states = activityStates(manifest, rows);
      const overall = this.db.prepare('SELECT * FROM scorm_engine_attempts WHERE id=? AND tenant=?').get(registered.attemptId, p.tenant) as any;
      const sequenceScope = {attemptId: registered.attemptId, sha256: registration.sha256}, engine = usesSequencing(manifest) ? trustedSequencing(manifest, overall.sequencing_state, sequenceScope) : undefined;
      const currentId = engine?.getSequencingState()?.currentActivity?.id, current = rows.find(r => r.sco_id === currentId);
      if (engine && current && !current.finished) {engine.loadFromJSON(JSON.parse(current.runtime_state)); engine.Initialize('');}
      const candidates = playbackActivities(manifest).filter(p => activityAvailable(p, states));
      // Default 2004 launch follows the trusted current delivery/start flow;
      // menu visibility must not turn it into a choice of a different SCO.
      const needsEvidence = (id: string) => !meetsSCORMPolicy(manifest.standard, scoEvidence(manifest.standard, id, rows.find(r => r.sco_id === id)), context?.reference ?? {completion: 'completed_or_passed'});
      const suspended = engine ? JSON.parse(engine.serializeSequencingState()).sequencing?.suspendedActivity : undefined;
      const replayTarget = engine && rows.length && !engine.getSequencingState()?.currentActivity?.isActive && !suspended ? candidates.find(p => needsEvidence(p.activity.id) && reviewed.activities.some(a => a.id === p.activity.id && a.available))?.activity.id : undefined;
      const profile = engine ? selectSCO(engine, manifest, scoId ?? replayTarget) : scoId ? launchProfile(manifest, scoId) : candidates.find(p => needsEvidence(p.activity.id)) ?? candidates[0];
      if (!profile || !activityAvailable(profile, states)) reject('FORBIDDEN', 'SCO prerequisites are not satisfied');
      const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
      this.db.prepare('UPDATE scorm_engine_launches SET closed=1 WHERE attempt_id=? AND closed=0').run(registered.attemptId);
      const previousSco = rows.find(r => r.sco_id === profile.activity.id), engineAttempt = engine?.getSequencingState()?.currentActivity?.attemptCount ?? 1;
      const scoAttempt = engine ? Math.max(1, engineAttempt, previousSco?.sco_attempt_number ?? 1) : 1;
      this.db.prepare('INSERT OR IGNORE INTO scorm_sco_attempts(attempt_id,tenant,sco_id,sco_attempt_number) VALUES(?,?,?,?)').run(registered.attemptId, p.tenant, profile.activity.id, scoAttempt);
      const sco = this.db.prepare('SELECT * FROM scorm_sco_attempts WHERE attempt_id=? AND sco_id=? AND sco_attempt_number=?').get(registered.attemptId, profile.activity.id, scoAttempt) as any, previous = JSON.parse(sco.runtime_state), account = p as any;
      this.db.prepare('UPDATE scorm_sco_attempts SET finished=0 WHERE attempt_id=? AND sco_id=? AND sco_attempt_number=?').run(registered.attemptId, profile.activity.id, scoAttempt);
      const initialState: Record<string, any> = {core: {student_id: p.id, student_name: account.name, credit: args.mode === 'preview' ? 'no-credit' : 'credit', lesson_mode: args.mode === 'preview' ? 'browse' : 'normal', entry: sco.revision === 0 ? 'ab-initio' : previous.core?.exit === 'suspend' ? 'resume' : '', total_time: scormTime(sco.reported_seconds)}};
      Object.assign(initialState, {launch_data: profile.activity.launchData ?? '', student_data: {mastery_score: profile.activity.masteryScore ?? '', max_time_allowed: profile.activity.maxTimeAllowed ?? '', time_limit_action: profile.activity.timeLimitAction ?? ''}});
      if (manifest.standard !== '1.2') {
        for (const k of Object.keys(initialState)) delete initialState[k];
        Object.assign(initialState, {learner_id: p.id, learner_name: account.name, credit: args.mode === 'preview' ? 'no-credit' : 'credit', mode: args.mode === 'preview' ? 'browse' : 'normal', entry: sco.revision === 0 ? 'ab-initio' : previous.exit === 'suspend' ? 'resume' : '', total_time: scorm2004Time(sco.reported_seconds), launch_data: profile.activity.launchData ?? '', completion_threshold: profile.activity.completionThreshold ?? '', scaled_passing_score: profile.activity.sequencing?.primaryObjective?.satisfiedByMeasure ? String(profile.activity.sequencing.primaryObjective.minNormalizedMeasure ?? 1) : '', max_time_allowed: '', time_limit_action: profile.activity.timeLimitAction ?? 'continue,no message'});
      }
      if (engine) {
        // Use a fresh API communication session on the already selected activity tree.
        const fresh = trustedSequencing(manifest, saveSequencing(engine, manifest, sequenceScope), sequenceScope);
        fresh.loadFromJSON({...previous, ...initialState, exit: '', session_time: 'PT0S'}); fresh.Initialize('');
        const seeded = fresh.renderCMIToJSONObject().cmi as Record<string, any>;
        for (const key of ['scaled_passing_score', 'completion_threshold', 'max_time_allowed', 'time_limit_action']) initialState[key] = seeded[key];
        this.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=? WHERE id=? AND tenant=?').run(saveSequencing(fresh, manifest, sequenceScope), registered.attemptId, p.tenant);
      }
      this.db.prepare('INSERT INTO scorm_engine_launches(id,token_hash,tenant,registration_id,attempt_id,sco_id,session_hash,auth_version,expires,initial_state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, tokenHash(token), p.tenant, registered.registrationId, registered.attemptId, profile.activity.id, sessionHash, p.auth_version, Math.min(session.expires, now + 60 * 60 * 1000), JSON.stringify(initialState), new Date(now).toISOString());
      this.db.prepare('UPDATE scorm_engine_launches SET sco_attempt_number=? WHERE id=?').run(scoAttempt, id);
      if (scormRuntimeStorageBytes(this.db, p.tenant) > this.limits.maxRuntimeStorageBytesPerTenant) reject('INVALID_ARGUMENT', 'SCORM runtime storage quota reached; contact a content administrator');
      this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant, p.id, 'learning:' + p.tenant + ':' + p.id, 'human_scorm_engine_launch', JSON.stringify({launchId: id, registrationId: registered.registrationId, attemptId: registered.attemptId, scoId: profile.activity.id, mode: args.mode}), new Date(now).toISOString());
      return {...registered, launchId: id, token, title: profile.activity.title, scoId: profile.activity.id, standard: manifest.standard};
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
    const sco = this.db.prepare('SELECT * FROM scorm_sco_attempts WHERE attempt_id=? AND tenant=? AND sco_id=? AND sco_attempt_number=?').get(attempt.id, launch.tenant, launch.sco_id, launch.sco_attempt_number) as any;
    if (!sco) reject('FORBIDDEN', 'Bound SCO attempt required');
    return {launch, registration, attempt, sco, p};
  }
  private seed(c: ReturnType<SCORMPlayerService['capability']>) {
    const state = JSON.parse(c.sco.runtime_state), initial = JSON.parse(c.launch.initial_state);
    if (!initial.core) {
      Object.assign(state, initial, {exit: c.launch.sequence === 0 ? '' : state.exit ?? '', session_time: scorm2004Time(c.launch.session_seconds)});
      return state;
    }
    state.core = {...state.core, ...initial.core, exit: c.launch.sequence === 0 ? '' : state.core?.exit ?? '', session_time: scormTime(c.launch.session_seconds)};
    state.launch_data = initial.launch_data ?? ''; state.student_data = {...state.student_data, ...initial.student_data};
    if (!state.core.lesson_status) state.core.lesson_status = 'not attempted';
    return state;
  }
  bootstrap(token: string) {
    const c = this.capability(token), manifest = this.manifest(c.registration.package_id, c.registration.version, c.launch.tenant), profile = launchProfile(manifest, c.launch.sco_id);
    if (c.launch.finished) reject('FORBIDDEN', 'Finished communication session must be relaunched');
    const latest = this.db.prepare('SELECT result FROM scorm_engine_checkpoints WHERE launch_id=? AND sequence=?').get(c.launch.id, c.launch.sequence) as any;
    const engine = usesSequencing(manifest) ? trustedSequencing(manifest, c.attempt.sequencing_state, {attemptId: c.attempt.id, sha256: c.registration.sha256}) : undefined;
    return {...(engine ? {sequencingTree: sequencingTree(manifest), sequencingSnapshot: sharedDataClientSnapshot(engine)} : {}), standard: manifest.standard, navigation: latest ? JSON.parse(latest.result).navigation ?? '_none_' : '_none_', launchId: c.launch.id, state: this.seed(c), revision: c.sco.revision, sequence: c.launch.sequence, title: profile.activity.title, href: profile.resource.href, parameters: profile.activity.parameters ?? '', officialLearningChanged: false};
  }
  context(p: Principal, a: {packageId?: string; version?: string; enrollmentId?: string; lessonId?: string; itemEnrollmentId?: string; mode?: string}) {
    const {mode = 'normal', ...args} = a;
    if (!['normal', 'preview'].includes(mode)) reject('INVALID_ARGUMENT', 'Exact launch mode required');
    this.store.live(p, mode === 'preview');
    const bound = args.enrollmentId || args.lessonId || args.itemEnrollmentId;
    if (bound && mode !== 'normal') reject('FORBIDDEN', 'Preview cannot bind official learning');
    if (!bound && Object.keys(args).some(k => !['packageId', 'version'].includes(k))) reject('INVALID_ARGUMENT', 'Exact package context required');
    const context = bound ? this.bindings?.resolve(p, args) : undefined;
    if (bound && !context) reject('FORBIDDEN', 'Learning bindings unavailable');
    const packageId = context?.reference.packageId ?? args.packageId, version = context?.reference.version ?? Number(args.version);
    const pkg = this.db.prepare('SELECT * FROM scorm_engine_versions WHERE package_id=? AND version=? AND tenant=?').get(packageId ?? '', version, p.tenant) as any;
    if (context) this.bindings!.validate(p, context, packageId!, version);
    else if (!pkg || pkg.state !== 'published') reject('FORBIDDEN', 'Published practice package required');
    const r = this.db.prepare("SELECT id FROM scorm_registrations WHERE tenant=? AND learner=? AND package_id=? AND version=? AND binding_key=? AND mode=?").get(p.tenant, p.id, packageId!, version, context?.bindingKey ?? 'standalone', mode) as any;
    const attempt = r ? this.db.prepare('SELECT * FROM scorm_engine_attempts WHERE registration_id=? ORDER BY attempt_number DESC LIMIT 1').get(r.id) as any : null;
    const rows = attempt ? this.scos(attempt.id, p.tenant) : [];
    const manifest = this.manifest(packageId!, version, p.tenant), states = activityStates(manifest, rows);
    const engine = usesSequencing(manifest) ? trustedSequencing(manifest, attempt?.sequencing_state ?? '{}', {attemptId: attempt?.id ?? 'context-preview', sha256: pkg.sha256}) : undefined;
    if (engine) {
      const row = rows.find(r => r.sco_id === engine.getSequencingState()?.currentActivity?.id);
      if (row && !row.finished) {engine.loadFromJSON(JSON.parse(row.runtime_state)); engine.Initialize('');}
    }
    const available = (id: string) => {
      if (!engine) return true;
      try {const copy = trustedSequencing(manifest, saveSequencing(engine, manifest, {attemptId: attempt?.id ?? 'context-preview', sha256: pkg.sha256}), {attemptId: attempt?.id ?? 'context-preview', sha256: pkg.sha256}); selectSCO(copy, manifest, id); return true;} catch {return false;}
    };
    return {packageId, version, reference: context?.reference ?? null, officialLearning: !!context,
      registrationId: r?.id ?? null, attemptId: attempt?.id ?? null, retakeAvailable: rows.some(row => row.revision > 0),
      completed: !!r && !!this.db.prepare('SELECT 1 FROM scorm_completion_proofs WHERE registration_id=?').get(r.id),
      activities: playbackActivities(manifest).map(profile => ({id: profile.activity.id, title: profile.activity.title, visible: profile.activity.isVisible !== false, available: available(profile.activity.id) && activityAvailable(profile, states), status: states.get(profile.activity.id)}))};
  }
  retake(p: Principal, a: {registrationId: string; attemptId: string; confirmed: boolean; revision: number; key: string}) {
    return this.transaction(() => {
      if (!a || Object.keys(a).some(k => !['registrationId', 'attemptId', 'confirmed', 'revision', 'key'].includes(k)) || typeof a.registrationId !== 'string' || typeof a.attemptId !== 'string' || a.confirmed !== true || !Number.isSafeInteger(a.revision) || typeof a.key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(a.key)) reject('INVALID_ARGUMENT', 'Review and confirm the exact SCORM attempt');
      const registration = this.store.registration(p, a.registrationId), doc = 'learning:' + p.tenant + ':' + p.id;
      const payload = tokenHash(JSON.stringify({action: 'scorm_retake', registrationId: a.registrationId, attemptId: a.attemptId}));
      const old = this.db.prepare('SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?').get(p.id, doc, a.key) as any;
      if (old) {if (old.payload !== payload) reject('IDEMPOTENCY_CONFLICT', 'SCORM retake payload changed'); return JSON.parse(old.result);}
      if (registration.binding_key !== 'standalone' && this.db.prepare('SELECT 1 FROM scorm_completion_proofs WHERE registration_id=?').get(registration.id)) reject('FORBIDDEN', 'Completed learning requires a fresh authorized course or item enrollment');
      const previous = this.db.prepare('SELECT * FROM scorm_engine_attempts WHERE registration_id=? ORDER BY attempt_number DESC LIMIT 1').get(registration.id) as any;
      if (previous.id !== a.attemptId || (this.db.prepare('SELECT revision FROM workspaces WHERE id=?').get(doc) as any)?.revision !== a.revision) reject('STALE_CONTEXT', 'SCORM retake context changed');
      if (!this.db.prepare('SELECT 1 FROM scorm_sco_attempts WHERE attempt_id=? AND revision>0').get(previous.id)) reject('FORBIDDEN', 'Start the current attempt before requesting another');
      const id = randomUUID(), now = new Date().toISOString();
      this.db.prepare('UPDATE scorm_engine_launches SET closed=1 WHERE registration_id=?').run(registration.id);
      this.db.prepare('INSERT INTO scorm_engine_attempts(id,tenant,registration_id,attempt_number,created_at) VALUES(?,?,?,?,?)').run(id, p.tenant, registration.id, previous.attempt_number + 1, now);
      const manifest = this.manifest(registration.package_id, registration.version, p.tenant);
      if (manifest.standard === '2004-4' && playbackActivities(manifest).some(p => p.activity.sharedDataMaps?.length)) {
        const prior = trustedSequencing(manifest, previous.sequencing_state, {attemptId: previous.id, sha256: registration.sha256});
        const next = trustedSequencing(manifest, '{}', {attemptId: id, sha256: registration.sha256});
        next.restoreSharedDataSnapshot(prior.captureSharedDataSnapshot());
        this.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=? WHERE id=? AND tenant=?').run(saveSequencing(next, manifest, {attemptId: id, sha256: registration.sha256}), id, p.tenant);
      }
      const result = {registrationId: registration.id, attemptId: id, attemptNumber: previous.attempt_number + 1, officialLearningChanged: false};
      this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(doc);
      this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant, p.id, doc, 'human_scorm_engine_retake', JSON.stringify({registrationId: registration.id, previousAttemptId: previous.id, attemptId: id}), now);
      this.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(p.id, doc, a.key, payload, JSON.stringify(result));
      return result;
    });
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
      const manifest = this.manifest(c.registration.package_id, c.registration.version, c.p.tenant);
      const keys = manifest.standard === '1.2' ? ['sequence', 'revision', 'state', 'finished'] : ['sequence', 'revision', 'state', 'finished', 'navigation', 'sharedData'];
      if (!a || Object.keys(a).some(k => !keys.includes(k)) || !Number.isSafeInteger(a.sequence) || a.sequence < 1 || !Number.isSafeInteger(a.revision) || a.revision < 0 || typeof a.finished !== 'boolean') reject('INVALID_ARGUMENT', 'Exact checkpoint sequence and revision required');
      const payloadHash = tokenHash(JSON.stringify(a)), old = this.db.prepare('SELECT * FROM scorm_engine_checkpoints WHERE launch_id=? AND sequence=?').get(c.launch.id, a.sequence) as any;
      if (old) {if (old.payload_hash !== payloadHash) reject('IDEMPOTENCY_CONFLICT', 'Checkpoint sequence payload changed'); return JSON.parse(old.result);}
      if (c.launch.finished || a.sequence !== c.launch.sequence + 1 || a.revision !== c.sco.revision) reject('STALE_CONTEXT', 'Checkpoint revision or session changed');
      if (manifest.standard !== '1.2' && a.navigation !== undefined && typeof a.navigation !== 'string') reject('INVALID_ARGUMENT', 'Exact navigation request required');
      if (a.sharedData !== undefined && manifest.standard !== '2004-4') reject('INVALID_ARGUMENT', 'Shared data requires fourth edition');
      if (a.sharedData !== undefined && Buffer.byteLength(JSON.stringify({state: a.state, sharedData: a.sharedData})) > 512 * 1024) reject('INVALID_ARGUMENT', 'Shared data checkpoint quota exceeded');
      const engine = usesSequencing(manifest) ? trustedSequencing(manifest, c.attempt.sequencing_state, {attemptId: c.attempt.id, sha256: c.registration.sha256}) : undefined;
      if (engine && deliveredSCO(engine, manifest)?.activity.id !== c.launch.sco_id) reject('STALE_CONTEXT', 'Sequencing has delivered a different SCO');
      const state = manifest.standard === '1.2' ? validateSCORM12Checkpoint(a.state, this.seed(c), a.finished) : validateSCORM2004Checkpoint(a.state, this.seed(c), manifest.standard, a.finished, a.navigation, engine, a.sharedData);
      const seconds = manifest.standard === '1.2' ? scormSeconds(state.core.session_time) : scorm2004Seconds(state.session_time);
      if (seconds < c.launch.session_seconds) reject('INVALID_ARGUMENT', 'Session time cannot decrease within a launch');
      const revision = c.sco.revision + 1, now = new Date().toISOString();
      this.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=?,revision=?,reported_seconds=reported_seconds+?,finished=? WHERE attempt_id=? AND sco_id=? AND sco_attempt_number=? AND tenant=?').run(JSON.stringify(state), revision, seconds - c.launch.session_seconds, a.finished ? 1 : 0, c.attempt.id, c.launch.sco_id, c.launch.sco_attempt_number, c.launch.tenant);
      if (engine) this.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=? WHERE id=? AND tenant=?').run(saveSequencing(engine, manifest, {attemptId: c.attempt.id, sha256: c.registration.sha256}), c.attempt.id, c.launch.tenant);
      this.db.prepare('UPDATE scorm_engine_launches SET sequence=?,session_seconds=?,finished=? WHERE id=?').run(a.sequence, seconds, a.finished ? 1 : 0, c.launch.id);
      this.db.prepare('UPDATE scorm_engine_attempts SET revision=revision+1 WHERE id=?').run(c.attempt.id);
      this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run('learning:' + c.p.tenant + ':' + c.p.id);
      const officialLearningChanged = a.finished && !!this.bindings?.project(c.p, c.registration, c.attempt.id, this.manifest(c.registration.package_id, c.registration.version, c.p.tenant));
      const nextScoId = engine && a.finished ? deliveredSCO(engine, manifest)?.activity.id ?? null : null;
      const delivered = engine?.getSequencingState()?.currentActivity;
      // A post-condition retry can deliver this same SCO as a fresh technical
      // attempt. The old communication session is finished; the shell must
      // close its capability and launch the newly delivered attempt as usual.
      const newSameSCOAttempt = delivered?.isActive && delivered.attemptCount > c.launch.sco_attempt_number;
      const result = {launchId: c.launch.id, sequence: a.sequence, revision, finished: a.finished, officialLearningChanged, ...(engine ? {nextScoId: nextScoId !== c.launch.sco_id || newSameSCOAttempt ? nextScoId : null} : {}), ...(manifest.standard !== '1.2' ? {navigation: a.navigation ?? '_none_'} : {})};
      this.db.prepare('INSERT INTO scorm_engine_checkpoints VALUES(?,?,?,?)').run(c.launch.id, a.sequence, payloadHash, JSON.stringify(result));
      if (a.sequence > this.limits.maxCheckpointReceiptsPerLaunch || scormRuntimeStorageBytes(this.db, c.p.tenant) > this.limits.maxRuntimeStorageBytesPerTenant) reject('INVALID_ARGUMENT', 'SCORM runtime storage quota reached; contact a content administrator');
      this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(c.p.tenant, c.p.id, 'learning:' + c.p.tenant + ':' + c.p.id, 'runtime_scorm_engine_checkpoint', JSON.stringify({launchId: c.launch.id, sequence: a.sequence, revision, finished: a.finished}), now);
      return result;
    });
  }
  status(p: Principal, id: string, sessionHash: string) {
    this.store.live(p);
    const row = this.db.prepare('SELECT l.id,l.sequence,l.finished,l.closed,l.expires,s.revision,s.runtime_state,s.reported_seconds,l.registration_id FROM scorm_engine_launches l JOIN scorm_sco_attempts s ON s.attempt_id=l.attempt_id AND s.sco_id=l.sco_id AND s.tenant=l.tenant AND s.sco_attempt_number=l.sco_attempt_number JOIN scorm_registrations r ON r.id=l.registration_id AND r.tenant=l.tenant WHERE l.id=? AND l.tenant=? AND r.learner=? AND l.session_hash=?').get(id, p.tenant, p.id, sessionHash) as any;
    if (!row) reject('FORBIDDEN', 'Own session launch required');
    this.store.registration(p, row.registration_id);
    const receipt = this.db.prepare('SELECT result FROM scorm_engine_checkpoints WHERE launch_id=? AND sequence=?').get(row.id, row.sequence) as any;
    return {...row, nextScoId: receipt ? JSON.parse(receipt.result).nextScoId ?? null : null, runtime_state: JSON.parse(row.runtime_state), officialLearningChanged: !!this.db.prepare('SELECT 1 FROM scorm_completion_proofs WHERE registration_id=?').get(row.registration_id)};
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
