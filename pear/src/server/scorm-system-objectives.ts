import type {DatabaseSync} from 'node:sqlite';
import type Scorm2004API from 'scorm-again/scorm2004';
import type {SCORMManifest} from '../shared/scorm-engine.ts';
import {sequencingTree} from './scorm-sequencing.ts';
import {reject} from './errors.ts';

type Registration = {id: string; tenant: string; learner: string; mode: string; binding_key: string};
const fields = ['satisfiedStatus', 'normalizedMeasure', 'rawScore', 'minScore', 'maxScore', 'progressMeasure', 'completionStatus'] as const;
const flag = (access: 'read' | 'write', field: string) => access + field[0].toUpperCase() + field.slice(1);
function systemScope(manifest: SCORMManifest, registration: Registration) {
  return manifest.standard !== '1.2' && manifest.objectivesGlobalToSystem && registration.mode === 'normal' && registration.binding_key !== 'standalone';
}
function maps(tree: Record<string, any>) {
  const result: any[] = [];
  const visit = (node: any) => {if (node.deliveryControls?.tracked !== false) for (const objective of [...(node.objectives ?? []), ...(node.primaryObjective ? [node.primaryObjective] : [])]) result.push(...(objective.mapInfo ?? [])); (node.children ?? []).forEach(visit);};
  visit(tree); return result;
}
export function objectiveSnapshot(runtime: Scorm2004API): Record<string, any> {
  return JSON.parse(runtime.serializeSequencingState()).globalObjectiveMap ?? {};
}
export function loadSystemObjectives(db: DatabaseSync, registration: Registration, manifest: SCORMManifest, runtime: Scorm2004API) {
  if (!systemScope(manifest, registration)) return;
  const values: Record<string, any> = Object.create(null), query = db.prepare('SELECT state FROM scorm_system_objectives WHERE tenant=? AND learner=? AND target_id=?');
  for (const id of new Set(maps(sequencingTree(manifest)).map(m => m.targetObjectiveID))) {
    const row = query.get(registration.tenant, registration.learner, id); if (row) values[id] = JSON.parse(String(row.state));
  }
  // Only tracking values are persisted; manifest-created access flags stay authoritative.
  runtime.restoreGlobalObjectiveSnapshot(values);
}
export function saveSystemObjectives(db: DatabaseSync, registration: Registration, manifest: SCORMManifest, runtime: Scorm2004API, before: Record<string, any>) {
  if (!systemScope(manifest, registration)) return;
  const declared = maps(sequencingTree(manifest)), after = objectiveSnapshot(runtime);
  const query = db.prepare('SELECT state FROM scorm_system_objectives WHERE tenant=? AND learner=? AND target_id=?');
  const update = db.prepare('INSERT INTO scorm_system_objectives VALUES(?,?,?,?,1,?,?) ON CONFLICT(tenant,learner,target_id) DO UPDATE SET state=excluded.state,revision=scorm_system_objectives.revision+1,source_registration_id=excluded.source_registration_id,updated_at=excluded.updated_at');
  for (const [id, value] of Object.entries(after)) {
    const delta: Record<string, any> = {};
    for (const field of fields) if (declared.some(m => m.targetObjectiveID === id && m[flag('write', field)])) {
      const known = field + 'Known';
      if (value[known] !== before[id]?.[known] || value[field] !== before[id]?.[field]) {
        if (value[known] === true || before[id]?.[known] === true) {delta[field] = value[field]; delta[known] = value[known] === true;}
      }
    }
    if (!Object.keys(delta).length) continue;
    const row = query.get(registration.tenant, registration.learner, id), state = {...(row ? JSON.parse(String(row.state)) : {}), ...delta};
    const encoded = JSON.stringify(state); if (Buffer.byteLength(encoded) > 16384) reject('INVALID_ARGUMENT', 'System objective quota exceeded');
    update.run(registration.tenant, registration.learner, id, encoded, registration.id, new Date().toISOString());
  }
  if (Number(db.prepare('SELECT count(*) n FROM scorm_system_objectives WHERE tenant=? AND learner=?').get(registration.tenant, registration.learner)!.n) > 4096) reject('INVALID_ARGUMENT', 'System objective count quota reached');
}

/** Global values exposed to content are restricted to current read maps. */
export function objectiveClientSnapshot(serialized: string, runtime: Scorm2004API) {
  const snapshot = JSON.parse(serialized), current = runtime.getSequencingState()?.currentActivity;
  const read = new Map<string, Set<string>>();
  for (const objective of current?.getAllObjectives() ?? []) for (const map of objective.mapInfo) {
    let permitted = read.get(map.targetObjectiveID); if (!permitted) read.set(map.targetObjectiveID, permitted = new Set());
    for (const field of fields) if ((map as any)[flag('read', field)]) permitted.add(field);
  }
  const filtered: Record<string, any> = {};
  for (const [id, value] of Object.entries(snapshot.globalObjectiveMap ?? {}) as [string, any][]) {
    const allowed = read.get(id); if (!allowed?.size) continue;
    filtered[id] = {id}; for (const field of allowed) {filtered[id][field] = value[field]; filtered[id][field + 'Known'] = value[field + 'Known'];}
  }
  snapshot.globalObjectiveMap = filtered;
  if (snapshot.sequencing) snapshot.sequencing.globalObjectiveMap = filtered;
  if (snapshot.suspensionState) snapshot.suspensionState.globalObjectives = filtered;
  snapshot.globalObjectives = []; // Rebuilt from the permitted map by the engine.
  // Other activities' read-mapped tracking snapshots can also contain inherited
  // values. Mask those copies, including suspension trees, by the same policy.
  const nodes = new Map<string, any>();
  const index = (node: any) => {nodes.set(node.id, node); (node.children ?? []).forEach(index);};
  index(runtime.settings.sequencing?.activityTree);
  const aliases: Record<string, string[]> = {satisfiedStatus: ['objectiveSatisfiedStatus', 'objectiveSatisfiedStatusKnown'], normalizedMeasure: ['objectiveNormalizedMeasure', 'objectiveMeasureStatus'], progressMeasure: ['progressMeasure', 'progressMeasureStatus']};
  const mask = (state: any, node: any) => {
    if (!state || !node) return;
    for (const objective of [...(node.objectives ?? []), ...(node.primaryObjective ? [node.primaryObjective] : [])]) {
      const targets = (objective.mapInfo ?? []).map((m: any) => m.targetObjectiveID);
      if (!targets.length) continue;
      const copies = [state.objectives?.primary, ...(state.objectives?.objectives ?? []), state.primaryObjective, ...(Array.isArray(state.objectives) ? state.objectives : [])].filter(s => s?.id === objective.objectiveID);
      for (const field of fields) if (!targets.some((id: string) => read.get(id)?.has(field))) {
        for (const copy of copies) {delete copy[field]; delete copy[field + 'Known']; if (field === 'normalizedMeasure') delete copy.measureStatus; if (field === 'progressMeasure') delete copy.progressMeasureStatus;}
        if (objective === node.primaryObjective) for (const alias of aliases[field] ?? []) delete state[alias];
      }
    }
  };
  for (const [id, state] of Object.entries(snapshot.sequencing?.activityStates ?? {})) mask(state, nodes.get(id));
  const suspension = (value: any) => {if (!value || typeof value !== 'object') return; if (typeof value.id === 'string') mask(value, nodes.get(value.id)); for (const child of Object.values(value)) if (child && typeof child === 'object') suspension(child);};
  suspension(snapshot.suspensionState);
  return JSON.stringify(snapshot);
}
