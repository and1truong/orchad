import {scormCharacters, scorm2004Writable} from './scorm-characterstring.ts';
import {scorm2004Engine} from './scorm2004-engine.ts';
import {loadResponseState, responseBindings, responseStateMatches, setRuntimeResponseBindings, type ResponseBindings} from './scorm-response-bindings.ts';
import {canonicalInteractionPath, interactionWritePath, interactionResponsePath, interactionTypePath, interactionWriteLimit, type InteractionWrite} from './scorm-interaction-writes.ts';
import {sequencingRuntime, validNavigation} from './scorm-sequencing-runtime.ts';
import {scormModelPath, scormSupportCode, type SCORMStandard} from './scorm-engine.ts';

export type SCORM2004Edition = Exclude<SCORMStandard, '1.2'>;
// Bounded transport for named full choice/performance SPM snapshots, including Unicode.
export const scorm2004CheckpointBytes = 2 * 1024 * 1024;
// First250 learner and100 trusted LMS comments:4000 scalars plus localization metadata.
export const scorm2004CheckpointMaxBytes = scorm2004CheckpointBytes + 350 * (6 * 4257 + 2);
export function scorm2004CheckpointLimit(state: any): number {
  let bytes = scorm2004CheckpointBytes;
  for (const [family, count] of [['comments_from_learner', 250], ['comments_from_lms', 100]] as const) {
    const comments = state && typeof state === 'object' && Object.hasOwn(state, family) ? state[family] : undefined;
    if (!comments || typeof comments !== 'object' || Array.isArray(comments)) continue;
    for (let i = 0; i < count; i++) {
      const record = Object.hasOwn(comments, i) ? comments[i] : undefined;
      const value = record && typeof record === 'object' && !Array.isArray(record) && Object.hasOwn(record, 'comment') ? record.comment : undefined;
      if (typeof value === 'string' && value.length <= 8514 && scormCharacters(value) <= 4257) bytes += new TextEncoder().encode(JSON.stringify(value)).byteLength;
    }
  }
  return bytes;
}
export const scorm2004ExitRequests = ['_none_', 'exit', 'exitAll', 'abandon', 'abandonAll', 'suspendAll'];

/** Acknowledged snapshots must survive the same strict loader used on resume. */
export function scorm2004Reloadable(state: Record<string, any>, bindings: ResponseBindings = {}, edition: SCORM2004Edition = '2004-4') {
  const runtime = new (scorm2004Engine(edition))({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false, accumulateSessionTimeOnTerminate: false}); loadResponseState(runtime, state, bindings);
  if (!responseStateMatches(runtime, state)) throw Error('SCORM response presence changed on reload');
  return state;
}

/** SCORM's timeinterval binding, with centisecond precision and bounded arithmetic. */
export function scorm2004Seconds(value: string): number {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d{1,2})?)S)?)?$/.exec(value);
  if (!m || !m.slice(1).some(v => v !== undefined) || value.endsWith('T')) throw Error('Invalid SCORM 2004 timeinterval');
  // Calendar units follow the reused engine's documented duration conversion.
  const seconds = Number(m[1] ?? 0) * 365 * 86400 + Number(m[2] ?? 0) * 30 * 86400 + Number(m[3] ?? 0) * 86400 + Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0);
  if (!Number.isSafeInteger(Math.round(seconds * 100))) throw Error('SCORM time quota exceeded');
  return Math.round(seconds * 100) / 100;
}
export function scorm2004Time(seconds: number) {return 'PT' + (Math.round(seconds * 100) / 100) + 'S';}
/** Narrow canonicalizations for upstream lexical quirks; they preserve the represented value. */
export function scorm2004EngineValue(key: string, value: string) {
  if (/\.(?:scaled|raw|min|max|progress_measure|weighting|audio_level|delivery_speed)$/.test(key)) value = value.replace(/^([+-]?)\./, '$10.');
  if (key.endsWith('.timestamp')) value = value.replace(/(T\d{2}:\d{2}:\d{2})(Z|[+-]\d{2}(?::\d{2})?)$/, '$1.00$2');
  return value;
}
export function scorm2004FieldError(edition: SCORM2004Edition, key: string, value: string): string | null {
  if (edition !== '2004-4' && (key.startsWith('adl.data.') || key.startsWith('adl.nav.request_valid.jump') || key === 'adl.nav.request' && value.endsWith('jump'))) return '401';
  if ((scorm2004Writable.test(key) || /^adl\.data\.\d+\.store$/.test(key)) && !Number.isFinite(scormCharacters(value))) return '406';
  if (key === 'cmi.suspend_data' && scormCharacters(value) > (edition === '2004-2' ? 4000 : 64000)) return '406';
  if (key === 'cmi.session_time' || /^cmi.interactions.\d+.latency$/.test(key)) {
    try {scorm2004Seconds(value);} catch {return '406';}
  }
  return null;
}

/** Exactly the eight IEEE synchronous methods; engine helpers never reach the SCO. */
export function createSCORM2004API(options: {edition: SCORM2004Edition; state?: Record<string, any>; responseBindings?: ResponseBindings; navigation?: string; sequencingTree?: Record<string, any>; sequencingSnapshot?: string; checkpoint?: (state: Record<string, any>, finished: boolean, navigation: string, sharedData?: Record<string, string>, interactionWrites?: InteractionWrite[]) => unknown}) {
  const runtime = options.sequencingTree ? sequencingRuntime(options.sequencingTree, options.sequencingSnapshot, options.edition) : new (scorm2004Engine(options.edition))({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false, accumulateSessionTimeOnTerminate: false});
  if (options.state) loadResponseState(runtime, options.state, options.responseBindings);
  let sharedWrites: Record<string, string> = Object.create(null);
  let initialized = false, finished = false, error: string | null = null, navigation = options.navigation ?? '_none_';
  const bad = (code: string) => {error = code; return 'false';};
  const inactive = (before: string, after: string) => !initialized ? before : finished ? after : null;
  let queuedState = structuredClone(options.state ?? runtime.renderCMIToJSONObject().cmi) as Record<string, any>, queuedBindings = options.responseBindings ?? {};
  let acceptedSnapshot: {state: Record<string, any>; bindings: ResponseBindings; writes?: InteractionWrite[]} | undefined;
  let interactionWrites: InteractionWrite[] = [], writtenOrigins: ResponseBindings = {}, journalBytes = 2, journalOverflow = false;
  const currentBindings = () => responseBindings(runtime.renderCMIToJSONObject().cmi as Record<string, any>, queuedState, queuedBindings, writtenOrigins);
  const snapshot = () => {
    const state = runtime.renderCMIToJSONObject().cmi as Record<string, any>, bindings = currentBindings(), previous = responseBindings(state, queuedState, queuedBindings);
    const needsWrites = Object.entries(bindings).some(([path,type])=>previous[path]!==type);
    if (needsWrites && journalOverflow) throw Error('Interaction write journal quota exceeded');
    scorm2004Reloadable(state, bindings, options.edition); acceptedSnapshot = {state: structuredClone(state), bindings, ...(needsWrites ? {writes: interactionWrites.map(([key,value])=>[key,value])} : {})}; return state;
  };
  const accept = () => {if (acceptedSnapshot) {queuedState = acceptedSnapshot.state; queuedBindings = acceptedSnapshot.bindings; setRuntimeResponseBindings(runtime, queuedBindings); interactionWrites = []; writtenOrigins = {}; journalBytes = 2; journalOverflow = false;} acceptedSnapshot = undefined;};
  return Object.freeze({
    Initialize(argument: string) {
      if (finished) return bad('104');
      if (initialized) return bad('103');
      if (argument !== '') return bad('201');
      error = null; const result = runtime.Initialize(argument);
      if (result === 'true') {initialized = true; if (navigation !== '_none_' && runtime.SetValue('adl.nav.request', navigation) !== 'true') return bad('101');}
      return result;
    },
    GetValue(key: string) {
      const code = inactive('122', '123'); if (code) {bad(code); return '';}
      if (typeof key !== 'string') {bad('201'); return '';}
      if (key !== '' && !scormModelPath(key)) {bad('401'); return '';}
      if (options.edition !== '2004-4' && (key.startsWith('adl.data.') || key.startsWith('adl.nav.request_valid.jump'))) {bad('401'); return '';}
      // ADL navigation is read/write (REQ_47.1); this engine treats the request
      // as write-only. Expose the validated local request without processing it.
      if (key === 'adl.nav.request') {error = null; runtime.lastErrorCode = '0'; return navigation;}
      error = null; const value = runtime.GetValue(key);
      if (typeof value !== 'string') {bad('401'); return '';}
      return value;
    },
    SetValue(key: string, value: string) {
      const code = inactive('132', '133'); if (code) return bad(code);
      if (typeof key !== 'string' || typeof value !== 'string') return bad('201');
      if (key !== '' && (!scormModelPath(key) || typeof runtime.GetValue(key) !== 'string')) return bad('401');
      const fieldError = scorm2004FieldError(options.edition, key, value);
      if (fieldError === '401') return bad(fieldError);
      // Navigation involving another activity is enabled only with trusted sequencing.
      if (key === 'adl.nav.request' && !options.sequencingTree && !scorm2004ExitRequests.includes(value)) return bad('406');
      const shared = /^adl\.data\.(\d+)\.(id|store)$/.exec(key);
      if (shared?.[2] === 'id') return bad('404');
      if (shared && (!Number.isSafeInteger(Number(shared[1])) || Number(shared[1]) >= Number(runtime.GetValue('adl.data._count')))) return bad('351');
      if (shared?.[2] === 'store' && runtime.getSequencingState()?.currentActivity?.sharedDataMaps[Number(shared[1])]?.writeSharedData === false) return bad('404');
      if (fieldError) return bad(fieldError);
      error = null; const result = runtime.SetValue(key, scorm2004EngineValue(key, value));
      const interactionKey = canonicalInteractionPath(key);
      if (result === 'true' && interactionWritePath.test(interactionKey)) {
        if (interactionResponsePath.test(interactionKey)) writtenOrigins[interactionKey] = runtime.GetValue(interactionTypePath(interactionKey));
        // Writes in another interaction cannot change this record's validation.
        // Keep its last same-field write, without crossing an own ID/type/response.
        // ponytail: other histories remain bounded4096/2MiB; broader witnesses if needed.
        if (!journalOverflow) {
          const entry: InteractionWrite = [interactionKey,value], base=interactionTypePath(interactionKey).slice(0,-4);
          const lastIndex=interactionWrites.findLastIndex(([key])=>key.startsWith(base)),last=interactionWrites[lastIndex];
          const compact = (interactionKey.endsWith('.type') || interactionResponsePath.test(interactionKey)) && last?.[0] === interactionKey;
          const bytes = (write: InteractionWrite) => new TextEncoder().encode(JSON.stringify(write)).byteLength + 1;
          const growth = bytes(entry) - (compact ? bytes(last!) : 0);
          if ((!compact && interactionWrites.length >= interactionWriteLimit) || journalBytes + growth > scorm2004CheckpointBytes) journalOverflow = true;
          else {if (compact) interactionWrites[lastIndex] = entry; else interactionWrites.push(entry); journalBytes += growth;}
        }
      }
      if (result === 'true' && key === 'adl.nav.request') navigation = value;
      if (result === 'true' && shared?.[2] === 'store') sharedWrites[runtime.GetValue(`adl.data.${Number(shared[1])}.id`)] = value;
      return result;
    },
    Commit(argument: string) {
      const code = inactive('142', '143'); if (code) return bad(code);
      if (argument !== '') return bad('201');
      error = null; const result = runtime.Commit(argument);
      try {if (result === 'true' && options.checkpoint?.(snapshot(), false, navigation, {...sharedWrites}, acceptedSnapshot?.writes) === false) return bad('391');}
      catch {return bad('391');}
      if (result === 'true') {sharedWrites = Object.create(null); accept();}
      return result;
    },
    Terminate(argument: string) {
      const code = inactive('112', '113'); if (code) return bad(code);
      if (argument !== '') return bad('201');
      error = null;
      setRuntimeResponseBindings(runtime, currentBindings());
      try {if (options.sequencingTree && !validNavigation(runtime, navigation)) return bad('111');} catch {return bad('111');}
      // Queue acceptance precedes termination so an unavailable durable queue is retryable.
      try {if (options.checkpoint?.(snapshot(), true, navigation, {...sharedWrites}, acceptedSnapshot?.writes) === false) return bad('111');}
      catch {return bad('111');}
      accept(); const result = runtime.Terminate(argument); if (result === 'true') {finished = true; sharedWrites = Object.create(null);} return result;
    },
    GetLastError() {return error ?? runtime.GetLastError();},
    GetErrorString(code: string) {const requested = scormSupportCode(code, options.edition); return requested === null ? '' : runtime.GetErrorString(requested);},
    GetDiagnostic(code: string) {
      const requested = scormSupportCode(code === '' ? error ?? runtime.GetLastError() : code, options.edition);
      // Pear implements error-code diagnostics only. Unknown names must not
      // reach the upstream inherited-property lookup (e.g. __proto__).
      if (requested === null) return '';
      return error && requested === error ? 'SCORM 2004 session, edition profile, argument or checkpoint queue rejected the operation (' + error + ')' : runtime.GetDiagnostic(requested);
    },
  });
}
