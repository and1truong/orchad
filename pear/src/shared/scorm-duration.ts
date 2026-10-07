import type Scorm2004API from 'scorm-again/scorm2004';
export const durationKeys = ['attemptAbsoluteDurationLimit', 'attemptExperiencedDurationLimit', 'activityAbsoluteDurationLimit', 'activityExperiencedDurationLimit'] as const;
/** Nonnegative XML day/time duration profile; no ambiguous calendar conversion. */
export function durationSeconds(value: string) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d{1,2})?)S)?)?$/.exec(value);
  if (!m || !m.slice(1).some(v => v !== undefined) || value.endsWith('T')) throw Error('Invalid sequencing day/time duration');
  const seconds = Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  if (!Number.isSafeInteger(Math.round(seconds * 100)) || seconds > 3660 * 86400) throw Error('Sequencing duration quota exceeded');
  return Math.round(seconds * 100) / 100;
}
type ClockRow = {attempt: number; absolute: number; experienced: number; activityAbsolute: number; activityExperienced: number; last: number; open: boolean; active: boolean; known: boolean};
type Clock = {version: 1; paused: boolean; exposureEnds: number; rows: Record<string, ClockRow>};
const controls = new WeakMap<Scorm2004API, {sync(): void; clock: Clock}>();
export function exposeDuration(runtime: Scorm2004API, expires: number) {const c = controls.get(runtime); if (!c) return; c.sync(); c.clock.paused = false; c.clock.exposureEnds = expires;}
export function pauseDuration(runtime: Scorm2004API) {const c = controls.get(runtime); if (!c) return false; c.sync(); c.clock.paused = true; return true;}

/** Install only from original definitions and the trusted persisted host snapshot. */
export function installDurationClock(runtime: Scorm2004API, tree: Record<string, any>, snapshot?: string) {
  const definitions = new Map<string, Record<string, any>>(), visit = (n: any) => {definitions.set(n.id, n); n.children.forEach(visit);}; visit(tree);
  if (![...definitions.values()].some(n => durationKeys.some(k => n[k] !== undefined) || n.attemptLimit === 0)) return;
  const restored = snapshot ? JSON.parse(snapshot).pearDurationClock : undefined;
  const clock: Clock = restored ?? {version: 1, paused: true, exposureEnds: 0, rows: Object.create(null)};
  if (clock.version !== 1 || typeof clock.paused !== 'boolean' || !Number.isSafeInteger(clock.exposureEnds) || !clock.rows || typeof clock.rows !== 'object' || Array.isArray(clock.rows) || Object.keys(clock.rows).some(id => !definitions.has(id))) throw Error('Invalid trusted duration clock');
  for (const row of Object.values(clock.rows)) if (!row || !['attempt', 'absolute', 'experienced', 'activityAbsolute', 'activityExperienced', 'last'].every(k => Number.isSafeInteger((row as any)[k]) && (row as any)[k] >= 0) || typeof row.open !== 'boolean' || typeof row.active !== 'boolean' || typeof row.known !== 'boolean') throw Error('Invalid trusted duration tracking');
  clock.rows = Object.assign(Object.create(null), clock.rows);
  const activities = () => {const out: any[] = [], walk = (a: any) => {if (!a) return; out.push(a); a.children.forEach(walk);}; walk(runtime.getSequencingState()?.rootActivity); return out;};
  const sync = () => {
    const now = Date.now();
    for (const a of activities()) {
      let row = clock.rows[a.id];
      if (!row) row = clock.rows[a.id] = {attempt: 0, absolute: 0, experienced: 0, activityAbsolute: 0, activityExperienced: 0, last: now, open: false, active: false, known: false};
      const time = Math.max(now, row.last), delta = time - row.last;
      if (row.open) {row.absolute += delta; row.activityAbsolute += delta;}
      if (row.active && !clock.paused) {const experienced = Math.max(0, Math.min(time, clock.exposureEnds) - row.last); row.experienced += experienced; row.activityExperienced += experienced;}
      if (a.attemptCount !== row.attempt) {row.attempt = a.attemptCount; row.absolute = 0; row.experienced = 0; row.known = false;}
      row.known ||= a.attemptProgressStatus;
      a.attemptProgressStatus = row.known;
      row.last = time; row.open = a.attemptCount > 0 && (a.isActive || a.isSuspended); row.active = a.isActive && !a.isSuspended;
      const duration = (ms: number) => 'PT' + Math.floor(ms / 10) / 100 + 'S';
      a.attemptAbsoluteDuration = duration(row.absolute); a.attemptExperiencedDuration = duration(row.experienced);
      a.activityAbsoluteDuration = duration(row.activityAbsolute); a.activityExperiencedDuration = duration(row.activityExperienced);
      a.attemptAbsoluteDurationValue = duration(row.absolute); a.attemptExperiencedDurationValue = duration(row.experienced);
      a.activityAbsoluteDurationValue = duration(row.activityAbsolute); a.activityExperiencedDurationValue = duration(row.activityExperienced);
    }
  };
  if (snapshot && activities().some(a => a.attemptCount > 0 && !Object.hasOwn(clock.rows, a.id))) throw Error('Missing trusted duration tracking');
  for (const a of activities()) if (clock.rows[a.id]?.attempt === a.attemptCount) a.attemptProgressStatus = clock.rows[a.id].known;
  controls.set(runtime, {sync, clock});
  // The pinned engine's UP.1 paths call this ephemeral adapter. It is never
  // serialized or exposed through the eight-method SCO API.
  for (const a of activities()) {
    const definition = definitions.get(a.id)!;
    if (!durationKeys.some(k => definition[k] !== undefined) && definition.attemptLimit !== 0) continue;
    a._pearDurationLimitCheck = (activity: any) => {
      sync(); if (definition.deliveryControls?.tracked === false) return false;
      const row = clock.rows[activity.id];
      if (definition.attemptLimit !== undefined && (definition.attemptLimit === 0 || !activity.isSuspended && !activity.isActive && activity.attemptCount >= definition.attemptLimit)) return true;
      if (definition.beginTimeLimit && Date.now() < Date.parse(definition.beginTimeLimit) || definition.endTimeLimit && Date.now() > Date.parse(definition.endTimeLimit)) return true;
      const values = [row.absolute, row.experienced, row.activityAbsolute, row.activityExperienced];
      return durationKeys.some((key, index) => definition[key] !== undefined && (durationSeconds(definition[key]) === 0 || (index >= 2 ? row.attempt > 0 : row.attempt > 0 && activity.attemptProgressStatus) && values[index] >= durationSeconds(definition[key]) * 1000));
    };
  }
  const rememberProgress = () => {const current = runtime.getSequencingState()?.currentActivity; if (!current) return; const cmi = runtime.renderCMIToJSONObject().cmi as Record<string, any>; if (['incomplete', 'completed'].includes(cmi.completion_status)) {clock.rows[current.id].known = true; current.attemptProgressStatus = true;}};
  for (const method of ['Initialize', 'Commit', 'Terminate', 'processNavigationRequest'] as const) {
    const original = runtime[method].bind(runtime);
    (runtime as any)[method] = (...args: any[]) => {sync(); if (method === 'Terminate') rememberProgress(); try {const result = (original as any)(...args); sync(); if ((method === 'Initialize' || method === 'Commit') && result === 'true') rememberProgress(); return result;} finally {sync();}};
  }
  const serialize = runtime.serializeSequencingState.bind(runtime);
  runtime.serializeSequencingState = () => {sync(); const state = JSON.parse(serialize()); state.pearDurationClock = clock; return JSON.stringify(state);};
  sync();
}

/** Communication-session reopen still has to satisfy current duration limits. */
export function durationAllowsDelivery(runtime: Scorm2004API) {
  let activity: any = runtime.getSequencingState()?.currentActivity;
  while (activity) {if (activity._pearDurationLimitCheck?.(activity)) return false; activity = activity.parent;}
  return true;
}
