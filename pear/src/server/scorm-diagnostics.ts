import type {DatabaseSync} from 'node:sqlite';
import type {Principal} from '../shared/model.ts';
import {SCORM_ENGINE, SCORM_STANDARDS} from '../shared/scorm-engine.ts';
import {SCORMEngineStore} from './scorm-engine-store.ts';
import {SCORM_RUNTIME_LIMITS} from '../shared/scorm-operations.ts';
import {packageLimits} from './scorm-package-reader.ts';
import {CURRENT_SCHEMA_VERSION} from './database.ts';
import type {SCORMPlayerService} from './scorm-player-service.ts';

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const base = () => ({format: 'pear-scorm-support-v1', engine: SCORM_ENGINE, schemaVersion: CURRENT_SCHEMA_VERSION, generatedAt: new Date().toISOString(), productionEnabled: false, loggingAdaptation: 'pear-no-direct-sequencing-logs-v1'});

// Build an allowlisted support packet. Never spread a database/runtime row.
export function scormLaunchDiagnostics(player: SCORMPlayerService, p: Principal, launchId: string, sessionHash: string) {
  const status = player.status(p, launchId, sessionHash);
  const registration = player.store.registration(p, status.registration_id);
  const row = player.db.prepare('SELECT sco_attempt_number FROM scorm_engine_launches WHERE id=? AND tenant=?').get(launchId, p.tenant) as any;
  return {...base(), scope: 'own-session-launch', launch: {id: status.id, closed: !!status.closed, expired: status.expires <= Date.now(), finished: !!status.finished, sequence: finite(status.sequence), revision: finite(status.revision), reportedSeconds: finite(status.reported_seconds), scoAttemptNumber: finite(row.sco_attempt_number)}, package: {id: registration.package_id, version: registration.version, standard: registration.standard, sha256: registration.sha256, state: registration.package_state}, mode: registration.mode, officiallyProjected: !!status.officialLearningChanged};
}

export function scormTenantDiagnostics(db: DatabaseSync, p: Principal, runtimeEnabled: boolean) {
  new SCORMEngineStore(db).live(p, true);
  const count = (table: string, condition = '') => finite((db.prepare('SELECT count(*) n FROM ' + table + ' WHERE tenant=?' + condition).get(p.tenant) as any).n);
  const storage = db.prepare(`SELECT
    (SELECT COALESCE(SUM(length(archive)),0) FROM scorm_engine_versions WHERE tenant=?) archives,
    (SELECT COALESCE(SUM(length(bytes)),0) FROM scorm_engine_resources WHERE tenant=?) resources,
    (SELECT COALESCE(SUM(length(archive)),0) FROM scorm_import_jobs WHERE tenant=?) pendingArchives,
    (SELECT COALESCE(SUM(length(CAST(store AS BLOB))+length(CAST(target_id AS BLOB))+128),0) FROM scorm_system_data WHERE tenant=?) systemData,
    (SELECT COALESCE(SUM(length(CAST(runtime_state AS BLOB))),0) FROM scorm_sco_attempts WHERE tenant=?) cmi,
    (SELECT COALESCE(SUM(length(CAST(sequencing_state AS BLOB))),0) FROM scorm_engine_attempts WHERE tenant=?) sequencing,
    (SELECT COALESCE(SUM(length(CAST(initial_state AS BLOB))),0) FROM scorm_engine_launches WHERE tenant=?) launchSeeds,
    (SELECT COALESCE(SUM(length(CAST(c.result AS BLOB))+length(c.payload_hash)),0) FROM scorm_engine_checkpoints c JOIN scorm_engine_launches l ON l.id=c.launch_id WHERE l.tenant=?) receipts`).get(p.tenant, p.tenant, p.tenant, p.tenant, p.tenant, p.tenant, p.tenant, p.tenant) as any;
  return {...base(), scope: 'own-tenant-aggregate', runtimeEnabled, limits: {archiveBytes: packageLimits.archive, expandedBytes: packageLimits.expanded, fileCount: packageLimits.files, concurrentImports: 4, sharedTenantUploadBytes: 128 * 1024 * 1024, launchLifetimeSeconds: 3600, clientCheckpointQueue: 16, ...SCORM_RUNTIME_LIMITS}, versions: Object.fromEntries(['quarantined', 'published', 'retired', 'revoked'].map(state => [state, finite((db.prepare('SELECT count(*) n FROM scorm_engine_versions WHERE tenant=? AND state=?').get(p.tenant, state) as any).n)])), editions: Object.fromEntries(SCORM_STANDARDS.map(edition => [edition, finite((db.prepare('SELECT count(*) n FROM scorm_engine_versions WHERE tenant=? AND standard=?').get(p.tenant, edition) as any).n)])), imports: Object.fromEntries(['queued', 'running', 'ready', 'failed'].map(state => [state, finite((db.prepare('SELECT count(*) n FROM scorm_import_jobs WHERE tenant=? AND status=?').get(p.tenant, state) as any).n)])), storageBytes: {archives: finite(storage.archives), resources: finite(storage.resources), pendingArchives: finite(storage.pendingArchives), runtime: finite(storage.systemData) + finite(storage.cmi) + finite(storage.sequencing) + finite(storage.launchSeeds) + finite(storage.receipts)}, execution: {registrations: count('scorm_registrations'), launches: count('scorm_engine_launches'), liveCapabilities: finite((db.prepare('SELECT count(*) n FROM scorm_engine_launches WHERE tenant=? AND closed=0 AND expires>?').get(p.tenant, Date.now()) as any).n), proofs: count('scorm_completion_proofs')}};
}
