import {scormCharacters, scorm12Writable} from './scorm-characterstring.ts';
import Scorm12API from 'scorm-again/scorm12';
import {scormModelPath} from './scorm-engine.ts';

/** Only the standard synchronous API is exposed to content, never engine helpers. */
export function createSCORM12API(options: {state?: Record<string, any>; checkpoint?: (state: Record<string, any>, finished: boolean) => unknown} = {}) {
  const runtime = new Scorm12API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false});
  if (options.state) runtime.loadFromJSON(options.state);
  const snapshot = () => {
    const state = runtime.renderCMIToJSONObject().cmi;
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid SCORM runtime snapshot');
    return state as Record<string, any>;
  };
  let initialized = false, finished = false, localError: string | null = null;
  const bad = (code: string) => {localError = code; return 'false';};
  const active = () => initialized && !finished;
  return Object.freeze({
    LMSInitialize(argument: string) {
      if (finished) return bad('301');
      if (argument !== '') return bad('201');
      localError = null;
      const value = runtime.LMSInitialize(argument);
      if (value === 'true') initialized = true;
      return value;
    },
    LMSGetValue(key: string) {
      if (!active()) {bad('301'); return '';}
      if (typeof key !== 'string' || key === '') {bad('201'); return '';}
      if (!scormModelPath(key)) {bad('401'); return '';}
      localError = null; const value = runtime.LMSGetValue(key);
      if (typeof value !== 'string') {bad('401'); return '';}
      return value;
    },
    LMSSetValue(key: string, value: string) {
      if (!active()) return bad('301');
      if (typeof key !== 'string' || key === '' || typeof value !== 'string') return bad('201');
      if (!scormModelPath(key) || typeof runtime.LMSGetValue(key) !== 'string') return bad('401');
      if (scorm12Writable.test(key) && !Number.isFinite(scormCharacters(value)) || key === 'cmi.suspend_data' && scormCharacters(value) > 4096) return bad('405');
      if (key === 'cmi.core.lesson_status' && value === 'not attempted') return bad('405');
      localError = null; return runtime.LMSSetValue(key, value);
    },
    LMSCommit(argument: string) {
      if (!active()) return bad('301');
      if (argument !== '') return bad('201');
      localError = null;
      const value = runtime.LMSCommit(argument);
      try {if (value === 'true' && options.checkpoint?.(snapshot(), false) === false) return bad('101');}
      catch {return bad('101');}
      return value;
    },
    LMSFinish(argument: string) {
      if (!active()) return bad('301');
      if (argument !== '') return bad('201');
      localError = null;
      const state = snapshot();
      try {if (options.checkpoint?.(state, true) === false) return bad('101');}
      catch {return bad('101');}
      runtime.settings = {...runtime.settings, mastery_override: state.core?.lesson_status !== 'incomplete'};
      const value = runtime.LMSFinish(argument);
      if (value === 'true') finished = true;
      return value;
    },
    LMSGetLastError() {return localError ?? runtime.LMSGetLastError();},
    LMSGetErrorString(code: string) {return runtime.LMSGetErrorString(code);},
    LMSGetDiagnostic(code: string) {
      const requested = code === '' ? localError ?? runtime.LMSGetLastError() : code;
      return localError && requested === localError ? 'SCORM API communication session or data model rejected the operation (' + localError + ')' : runtime.LMSGetDiagnostic(requested);
    },
  });
}
