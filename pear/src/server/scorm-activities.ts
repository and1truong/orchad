import type {SCORMActivity, SCORMManifest} from '../shared/scorm-engine.ts';
import {reject} from './errors.ts';

export function scorm12Activities(manifest: SCORMManifest) {
  if (manifest.standard !== '1.2' || manifest.runtimeFeatures?.some(f => !['prerequisites', 'masteryscore', 'maxtimeallowed', 'timelimitaction', 'datafromlms'].includes(f))) reject('INVALID_ARGUMENT', 'Unsupported SCORM 1.2 runtime or sequencing extensions');
  const result: {activity: SCORMActivity; ancestors: SCORMActivity[]; resource: SCORMManifest['resources'][number]}[] = [];
  function walk(a: SCORMActivity, ancestors: SCORMActivity[]) {
    if (a.resourceId) {
      const resource = manifest.resources.find(r => r.id === a.resourceId);
      if (!resource || resource.kind !== 'sco' || a.children.length) reject('INVALID_ARGUMENT', 'Playback requires SCO leaves and organization folders');
      result.push({activity: a, resource, ancestors});
    } else if (!a.children.length) reject('INVALID_ARGUMENT', 'Empty activity folder');
    for (const child of a.children) walk(child, [...ancestors, a]);
  }
  for (const a of manifest.activities) walk(a, []);
  if (!result.length) reject('INVALID_ARGUMENT', 'Organization has no launchable SCO');
  // Parse every expression before presenting the package as playable, including locked branches.
  const states = activityStates(manifest, []);
  for (const {activity, ancestors} of result) for (const a of [...ancestors, activity]) if (a.prerequisites) prerequisite(a.prerequisites, states);
  return result;
}

export function activityStates(manifest: SCORMManifest, rows: {sco_id: string; runtime_state: string; finished?: number}[]) {
  const states = new Map<string, string>(), byId = new Map(rows.map(r => [r.sco_id, r]));
  function walk(a: SCORMActivity): string {
    let status: string;
    if (a.children.length) status = a.children.map(walk).every(s => ['completed', 'passed'].includes(s)) ? 'completed' : 'incomplete';
    else {
      const row = byId.get(a.id);
      // Prerequisite completion uses accepted SCO communication completion, not an in-flight write.
      status = row?.finished ? (manifest.standard === '1.2' ? JSON.parse(row.runtime_state).core?.lesson_status : JSON.parse(row.runtime_state).completion_status) ?? 'not attempted' : 'not attempted';
    }
    states.set(a.id, status); return status;
  }
  manifest.activities.forEach(walk); return states;
}

/** Bounded AICC prerequisite parser. No JavaScript evaluation or client-supplied progress. */
export function prerequisite(source: string, states: Map<string, string>) {
  if (source.length > 4096) reject('INVALID_ARGUMENT', 'Prerequisite quota exceeded');
  const tokens = source.match(/\s+|<>|[&|~=*(){},]|"[^"]*"|[^\s&|~=*(){},<>]+/g) ?? [];
  if (tokens.join('') !== source || tokens.length > 1024) reject('INVALID_ARGUMENT', 'Invalid prerequisite expression');
  const t = tokens.filter(v => !/^\s+$/.test(v)); let i = 0, depth = 0;
  const invalid = (): never => reject('INVALID_ARGUMENT', 'Invalid or unknown AICC prerequisite');
  const take = (value: string) => {if (t[i++] !== value) invalid();};
  const complete = (id: string) => {if (!states.has(id)) invalid(); return ['completed', 'passed'].includes(states.get(id)!);};
  function atom(): boolean {
    if (++depth > 32) invalid();
    let result: boolean;
    if (t[i] === '~') {i++; result = !atom();}
    else if (t[i] === '(') {i++; result = expression(0); take(')');}
    else if (/^\d+$/.test(t[i] ?? '') && t[i + 1] === '*') {
      const n = Number(t[i++]); i++; take('{'); let count = 0, members = 0;
      do {if (members++) take(','); count += complete(t[i++] ?? '') ? 1 : 0;} while (t[i] === ',');
      take('}'); if (n < 1 || n > members) invalid(); result = count >= n;
    } else if (t[i] === '{') {
      i++; let all = true, members = 0;
      do {if (members++) take(','); const value = complete(t[i++] ?? ''); all = value && all;} while (t[i] === ',');
      take('}'); result = all;
    } else {
      const id = t[i++] ?? ''; result = complete(id);
      if (['=', '<>'].includes(t[i])) {
        const op = t[i++], value = t[i++] ?? '';
        if (!/^"(?:passed|completed|browsed|failed|not attempted|incomplete)"$/.test(value)) invalid();
        const same = states.get(id) === value.slice(1, -1); result = op === '=' ? same : !same;
      }
    }
    depth--; return result;
  }
  function expression(min: number): boolean {
    let left = atom();
    while (t[i] === '&' || t[i] === '|') {
      const op = t[i], priority = op === '&' ? 2 : 1;
      if (priority < min) break;
      i++; const right = expression(priority + 1); left = op === '&' ? left && right : left || right;
    }
    return left;
  }
  const result = expression(0); if (i !== t.length) invalid(); return result;
}

export function activityAvailable(profile: ReturnType<typeof scorm12Activities>[number], states: Map<string, string>) {
  return [...profile.ancestors, profile.activity].every(a => !a.prerequisites || prerequisite(a.prerequisites, states));
}

/** S5's explicit profile; complex 2004 manifests require the sequencing slice. */
export function playbackActivities(manifest: SCORMManifest) {
  if (manifest.standard === '1.2') return scorm12Activities(manifest);
  if (manifest.runtimeFeatures?.some(f => !['dataFromLMS', 'timeLimitAction', 'completionThreshold'].includes(f)) || manifest.activities.length !== 1 || manifest.activities[0].children.length) reject('INVALID_ARGUMENT', 'SCORM 2004 multi-activity or sequencing profile not yet supported');
  const activity = manifest.activities[0], resource = manifest.resources.find(r => r.id === activity.resourceId);
  if (!resource || resource.kind !== 'sco') reject('INVALID_ARGUMENT', 'SCORM 2004 requires an exact SCO leaf');
  return [{activity, resource, ancestors: [] as SCORMActivity[]}];
}
