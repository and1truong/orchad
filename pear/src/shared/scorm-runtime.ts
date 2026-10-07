import Scorm12API from 'scorm-again/scorm12';

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
      if (typeof key !== 'string') {bad('201'); return '';}
      localError = null; return runtime.LMSGetValue(key);
    },
    LMSSetValue(key: string, value: string) {
      if (!active()) return bad('301');
      if (typeof key !== 'string' || typeof value !== 'string') return bad('201');
      if (key === 'cmi.core.lesson_status' && value === 'not attempted') return bad('405');
      localError = null; return runtime.LMSSetValue(key, value);
    },
    LMSCommit(argument: string) {
      if (!active()) return bad('301');
      if (argument !== '') return bad('201');
      localError = null;
      const value = runtime.LMSCommit(argument);
      if (value === 'true' && options.checkpoint?.(snapshot(), false) === false) return bad('101');
      return value;
    },
    LMSFinish(argument: string) {
      if (!active()) return bad('301');
      if (argument !== '') return bad('201');
      localError = null;
      const state = snapshot();
      if (options.checkpoint?.(state, true) === false) return bad('101');
      runtime.settings = {...runtime.settings, mastery_override: state.core?.lesson_status !== 'incomplete'};
      const value = runtime.LMSFinish(argument);
      if (value === 'true') finished = true;
      return value;
    },
    LMSGetLastError() {return localError ?? runtime.LMSGetLastError();},
    LMSGetErrorString(code: string) {return runtime.LMSGetErrorString(code);},
    LMSGetDiagnostic(code: string) {return localError ? 'SCORM API communication session is inactive or argument is invalid' : runtime.LMSGetDiagnostic(code);},
  });
}
