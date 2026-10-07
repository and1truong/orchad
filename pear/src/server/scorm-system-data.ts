import type {DatabaseSync} from 'node:sqlite';
import type Scorm2004API from 'scorm-again/scorm2004';
import type {SCORMManifest} from '../shared/scorm-engine.ts';
import {playbackActivities} from './scorm-activities.ts';
import {reject} from './errors.ts';

type Registration = {id: string; tenant: string; learner: string; mode: string; binding_key: string};
function systemScope(manifest: SCORMManifest, registration: Registration) {
  // Unofficial practice/preview working data cannot seed an official registration.
  return manifest.standard === '2004-4' && manifest.sharedDataGlobalToSystem && registration.mode === 'normal' && registration.binding_key !== 'standalone';
}
export function loadSystemData(db: DatabaseSync, registration: Registration, manifest: SCORMManifest, runtime: Scorm2004API) {
  if (!systemScope(manifest, registration)) return;
  const targets = new Set(playbackActivities(manifest).flatMap(p => p.activity.sharedDataMaps?.map(m => m.targetID) ?? []));
  const values: Record<string, string> = Object.create(null), query = db.prepare('SELECT store FROM scorm_system_data WHERE tenant=? AND learner=? AND target_id=?');
  for (const id of targets) {const row = query.get(registration.tenant, registration.learner, id); if (row) values[id] = String(row.store);}
  runtime.restoreSharedDataSnapshot(values);
}
export function saveSystemData(db: DatabaseSync, registration: Registration, manifest: SCORMManifest, scoId: string, writes: unknown) {
  if (!systemScope(manifest, registration) || writes === undefined) return;
  const maps = playbackActivities(manifest).find(p => p.activity.id === scoId)?.activity.sharedDataMaps ?? [];
  const update = db.prepare('INSERT INTO scorm_system_data VALUES(?,?,?,?,1,?,?) ON CONFLICT(tenant,learner,target_id) DO UPDATE SET store=excluded.store,revision=scorm_system_data.revision+1,source_registration_id=excluded.source_registration_id,updated_at=excluded.updated_at');
  for (const [id, store] of Object.entries(writes as Record<string, unknown>)) {
    if (typeof store !== 'string' || store.length > 64000 || !maps.some(m => m.targetID === id && m.writeSharedData)) reject('FORBIDDEN', 'Mapped system shared data write required');
    update.run(registration.tenant, registration.learner, id, store, registration.id, new Date().toISOString());
  }
  if (Number(db.prepare('SELECT count(*) n FROM scorm_system_data WHERE tenant=? AND learner=?').get(registration.tenant, registration.learner)!.n) > 4096) reject('INVALID_ARGUMENT', 'System shared data store quota reached');
}
