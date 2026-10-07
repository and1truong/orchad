import type {DatabaseSync} from 'node:sqlite';
export function scormRuntimeStorageBytes(db: DatabaseSync, tenant: string) {
  return Number((db.prepare(`SELECT
    (SELECT COALESCE(SUM(length(CAST(runtime_state AS BLOB))),0) FROM scorm_sco_attempts WHERE tenant=?) +
    (SELECT COALESCE(SUM(length(CAST(sequencing_state AS BLOB))),0) FROM scorm_engine_attempts WHERE tenant=?) +
    (SELECT COALESCE(SUM(length(CAST(initial_state AS BLOB))),0) FROM scorm_engine_launches WHERE tenant=?) +
    (SELECT COALESCE(SUM(length(CAST(c.result AS BLOB))+length(c.payload_hash)),0) FROM scorm_engine_checkpoints c JOIN scorm_engine_launches l ON l.id=c.launch_id WHERE l.tenant=?) n`).get(tenant, tenant, tenant, tenant) as any).n);
}
