import type {SCORMManifest} from '../shared/scorm-engine.ts';
import {playbackActivities} from './scorm-activities.ts';

export function hasSelection(manifest: SCORMManifest) {
  const active = (s: any) => s?.sequencingControls?.selectionTiming && s.sequencingControls.selectionTiming !== 'never';
  const node = (a: any): boolean => active(a.sequencing) || a.children.some(node);
  return active(manifest.sequencing) || manifest.activities.some(node);
}
/** Preview eligibility without spending a random selection in a read-only context. */
export function beforeSelection(tree: Record<string, any>) {
  const copy = structuredClone(tree), visit = (node: any) => {if (node.sequencingControls) Object.assign(node.sequencingControls, {selectionTiming: 'never', randomizationTiming: 'never'}); node.children.forEach(visit);};
  visit(copy); return copy;
}
/** Only original selection clusters can remove activities from proof requirements. */
export function selectionEvidence(manifest: SCORMManifest, serialized: string) {
  const states = JSON.parse(serialized).sequencing?.activityStates ?? {}, excluded = new Set<string>(), clusters: {activityId: string; selectedChildren: string[]; childOrder: string[]}[] = [];
  const omit = (node: any) => {excluded.add(node.id); node.children.forEach(omit);};
  const visit = (node: any, controls: any) => {
    const selection = states[node.id]?.selectionRandomizationState;
    if (controls?.selectionTiming && controls.selectionTiming !== 'never' && typeof controls.selectCount === 'number' && controls.selectCount < node.children.length && selection?.selectionCountStatus === true && Array.isArray(selection.selectedChildIds)) {
      const selected = new Set<string>(selection.selectedChildIds);
      clusters.push({activityId: node.id, selectedChildren: node.children.filter((c: any) => selected.has(c.id)).map((c: any) => c.id), childOrder: selection.childOrder});
      for (const child of node.children) if (!selected.has(child.id)) omit(child);
    }
    for (const child of node.children) if (!excluded.has(child.id)) visit(child, child.sequencing?.sequencingControls);
  };
  visit({id: manifest.organizationId, children: manifest.activities}, manifest.sequencing?.sequencingControls);
  return {scos: playbackActivities(manifest).filter(p => !excluded.has(p.activity.id)), clusters};
}
