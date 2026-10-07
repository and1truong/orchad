import Scorm2004API from 'scorm-again/scorm2004';
import {sequencingRuntime, validNavigation} from './scorm-sequencing-runtime.ts';
import type {SCORMStandard} from './scorm-engine.ts';

export type SCORM2004Edition = Exclude<SCORMStandard, '1.2'>;
export const scorm2004CheckpointBytes = 512 * 1024;
export const scorm2004ExitRequests = ['_none_', 'exit', 'exitAll', 'abandon', 'abandonAll', 'suspendAll'];

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
  if (key === 'cmi.suspend_data' && value.length > (edition === '2004-2' ? 4000 : 64000)) return '406';
  if (key === 'cmi.session_time' || /^cmi.interactions.\d+.latency$/.test(key)) {
    try {scorm2004Seconds(value);} catch {return '406';}
  }
  return null;
}

/** Exactly the eight IEEE synchronous methods; engine helpers never reach the SCO. */
export function createSCORM2004API(options: {edition: SCORM2004Edition; state?: Record<string, any>; navigation?: string; sequencingTree?: Record<string, any>; sequencingSnapshot?: string; checkpoint?: (state: Record<string, any>, finished: boolean, navigation: string, sharedData?: Record<string, string>) => unknown}) {
  const runtime = options.sequencingTree ? sequencingRuntime(options.sequencingTree, options.sequencingSnapshot) : new Scorm2004API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false, accumulateSessionTimeOnTerminate: false});
  if (options.state) runtime.loadFromJSON(options.state);
  let sharedWrites: Record<string, string> = Object.create(null);
  let initialized = false, finished = false, error: string | null = null, navigation = options.navigation ?? '_none_';
  const bad = (code: string) => {error = code; return 'false';};
  const inactive = (before: string, after: string) => !initialized ? before : finished ? after : null;
  const snapshot = () => runtime.renderCMIToJSONObject().cmi as Record<string, any>;
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
      if (options.edition !== '2004-4' && (key.startsWith('adl.data.') || key.startsWith('adl.nav.request_valid.jump'))) {bad('401'); return '';}
      // ADL navigation is read/write (REQ_47.1); this engine treats the request
      // as write-only. Expose the validated local request without processing it.
      if (key === 'adl.nav.request') {error = null; runtime.lastErrorCode = '0'; return navigation;}
      error = null; return runtime.GetValue(key);
    },
    SetValue(key: string, value: string) {
      const code = inactive('132', '133'); if (code) return bad(code);
      if (typeof key !== 'string' || typeof value !== 'string') return bad('201');
      const fieldError = scorm2004FieldError(options.edition, key, value); if (fieldError) return bad(fieldError);
      // Navigation involving another activity is enabled only with trusted sequencing.
      if (key === 'adl.nav.request' && !options.sequencingTree && !scorm2004ExitRequests.includes(value)) return bad('406');
      const shared = /^adl\.data\.(\d+)\.(id|store)$/.exec(key);
      if (shared?.[2] === 'id') return bad('404');
      if (shared && (!Number.isSafeInteger(Number(shared[1])) || Number(shared[1]) >= Number(runtime.GetValue('adl.data._count')))) return bad('351');
      error = null; const result = runtime.SetValue(key, scorm2004EngineValue(key, value));
      if (result === 'true' && key === 'adl.nav.request') navigation = value;
      if (result === 'true' && shared?.[2] === 'store') sharedWrites[runtime.GetValue(`adl.data.${Number(shared[1])}.id`)] = value;
      return result;
    },
    Commit(argument: string) {
      const code = inactive('142', '143'); if (code) return bad(code);
      if (argument !== '') return bad('201');
      error = null; const result = runtime.Commit(argument);
      if (result === 'true' && options.checkpoint?.(snapshot(), false, navigation, {...sharedWrites}) === false) return bad('391');
      if (result === 'true') sharedWrites = Object.create(null);
      return result;
    },
    Terminate(argument: string) {
      const code = inactive('112', '113'); if (code) return bad(code);
      if (argument !== '') return bad('201');
      error = null;
      if (options.sequencingTree && !validNavigation(runtime, navigation)) return bad('111');
      // Queue acceptance precedes termination so an unavailable durable queue is retryable.
      if (options.checkpoint?.(snapshot(), true, navigation, {...sharedWrites}) === false) return bad('111');
      const result = runtime.Terminate(argument); if (result === 'true') {finished = true; sharedWrites = Object.create(null);} return result;
    },
    GetLastError() {return error ?? runtime.GetLastError();},
    GetErrorString(code: string) {return runtime.GetErrorString(code);},
    GetDiagnostic(code: string) {return error ? 'SCORM 2004 session, edition profile, argument or checkpoint queue rejected the operation (' + error + ')' : runtime.GetDiagnostic(code);},
  });
}
