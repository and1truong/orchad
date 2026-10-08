import type {SCORMActivity, SCORMManifest} from '../shared/scorm-engine.ts';
import {playbackActivities} from './scorm-activities.ts';
import {sequencingRuntime, navigationTarget} from '../shared/scorm-sequencing-runtime.ts';
import {SCORM_ENGINE} from '../shared/scorm-engine.ts';
import {reject} from './errors.ts';
import {durationAllowsDelivery} from '../shared/scorm-duration.ts';

export function sequencingTree(manifest: SCORMManifest) {
  playbackActivities(manifest);
  // IMS CP isvisible affects menu rendering only. Do not forward it as the
  // engine's isVisible, which also denies otherwise valid choice navigation.
  const node = (a: SCORMActivity): Record<string, any> => ({id: a.id, title: a.title, ...a.sequencing, ...(a.sharedDataMaps ? {sharedDataMaps: a.sharedDataMaps} : {}), ...(a.hideLmsUi?.length ? {hideLmsUi: a.hideLmsUi} : {}), children: a.children.map(node), ...(a.completionMeasure ? {completionThreshold: a.completionMeasure} : a.completionThreshold !== undefined ? {completionThreshold: {completedByMeasure: true, minProgressMeasure: Number(a.completionThreshold)}} : {})});
  const tree = {id: manifest.organizationId, title: manifest.title, ...manifest.sequencing, children: manifest.activities.map(node)};
  const inspect = (n: Record<string, any>) => {
    // IMS SS UP.1: untracked activities cannot violate limit conditions.
    // Upstream calendar checks do not inspect tracked, so omit these static
    // windows from the executable tree while retaining the original manifest.
    if (n.deliveryControls?.tracked === false) {delete n.beginTimeLimit; delete n.endTimeLimit;}
    const objectives = [...(n.objectives ?? []), ...(n.primaryObjective ? [n.primaryObjective] : [])];
    const ids = new Set(objectives.map(o => o.objectiveID));
    for (const rules of Object.values(n.sequencingRules ?? {}) as any[][]) for (const rule of rules) for (const c of rule.conditions) if (c.referencedObjective && !ids.has(c.referencedObjective)) reject('INVALID_ARGUMENT', 'Sequencing rule references an unknown local objective');
    (n.children ?? []).forEach(inspect);
  }; inspect(tree); return tree;
}
export function trustedSequencing(manifest: SCORMManifest, persisted: string, scope: {attemptId: string; sha256: string}) {
  const tree = sequencingTree(manifest), envelope = JSON.parse(persisted);
  if (Object.keys(envelope).length && (envelope.attemptId !== scope.attemptId || envelope.sha256 !== scope.sha256 || envelope.standard !== manifest.standard || envelope.engine?.version !== SCORM_ENGINE.version || envelope.engine?.adaptation !== undefined && !['pear-selection-v2', 'pear-limits-v3', 'pear-unicode-v4', 'pear-localized-v5', SCORM_ENGINE.adaptation].includes(envelope.engine.adaptation) || typeof envelope.snapshot !== 'string')) reject('FORBIDDEN', 'SCORM sequencing snapshot identity changed');
  return sequencingRuntime(tree, envelope.snapshot);
}
export function saveSequencing(runtime: ReturnType<typeof sequencingRuntime>, manifest: SCORMManifest, scope: {attemptId: string; sha256: string}) {
  const snapshot = runtime.serializeSequencingState(); if (Buffer.byteLength(snapshot) > 1024 * 1024) reject('INVALID_ARGUMENT', 'Sequencing snapshot quota exceeded');
  return JSON.stringify({...scope, standard: manifest.standard, engine: SCORM_ENGINE, snapshot});
}
export function deliveredSCO(runtime: ReturnType<typeof sequencingRuntime>, manifest: SCORMManifest) {
  const id = runtime.getSequencingState()?.currentActivity?.id;
  return playbackActivities(manifest).find(p => p.activity.id === id);
}
export function selectSCO(runtime: ReturnType<typeof sequencingRuntime>, manifest: SCORMManifest, scoId?: string) {
  if (scoId && !playbackActivities(manifest).some(p => p.activity.id === scoId)) reject('FORBIDDEN', 'Exact sequencing SCO required');
  let current = deliveredSCO(runtime, manifest);
  const activity = runtime.getSequencingState()?.currentActivity;
  if (current && activity?.isActive && (!scoId || scoId === current.activity.id) && !durationAllowsDelivery(runtime)) reject('FORBIDDEN', 'Sequencing duration denies activity delivery');
  if (!current || !activity?.isActive) {
    const suspended = JSON.parse(runtime.serializeSequencingState()).sequencing?.suspendedActivity;
    if (suspended && scoId && suspended !== scoId) reject('FORBIDDEN', 'Resume the suspended SCO before selecting another');
    let ok = runtime.processNavigationRequest(suspended ? 'resumeAll' : !current ? 'start' : 'choice', scoId ?? current?.activity.id ?? playbackActivities(manifest)[0].activity.id);
    // A choice-only organization cannot start through flow. Its authored
    // choice request still has to pass the engine's delivery rules.
    if (!ok && !suspended && !current) ok = runtime.processNavigationRequest('choice', scoId ?? playbackActivities(manifest)[0].activity.id);
    if (ok && !suspended && !current && scoId && deliveredSCO(runtime, manifest)?.activity.id !== scoId) ok = runtime.processNavigationRequest('choice', scoId);
    if (!ok) reject('FORBIDDEN', 'Sequencing denies activity delivery'); current = deliveredSCO(runtime, manifest);
  } else if (scoId && scoId !== current.activity.id) {
    if (!runtime.processNavigationRequest('choice', scoId)) reject('FORBIDDEN', 'Sequencing denies choice'); current = deliveredSCO(runtime, manifest);
  }
  if (!current || scoId && current.activity.id !== scoId) reject('FORBIDDEN', 'Sequencing did not deliver the requested SCO');
  return current;
}
export function usesSequencing(manifest: SCORMManifest) {
  const configured = (a: SCORMActivity) => a.sequencing || a.sharedDataMaps?.length || a.hideLmsUi?.length || a.completionMeasure && a.completionMeasure.progressWeight !== 1;
  return manifest.standard !== '1.2' && (!!manifest.sequencing || playbackActivities(manifest).length > 1 || playbackActivities(manifest).some(p => p.resource.kind === 'asset' || configured(p.activity) || p.ancestors.some(configured)));
}
