import Scorm2004API from 'scorm-again/scorm2004';
import {scorm2004CheckpointBytes, scorm2004FieldError, scorm2004EngineValue, scorm2004ExitRequests, type SCORM2004Edition} from '../shared/scorm2004-runtime.ts';
import {validNavigation} from '../shared/scorm-sequencing-runtime.ts';
import {reject} from './errors.ts';

const writable = /^(?:cmi\.(?:completion_status|success_status|exit|location|progress_measure|session_time|suspend_data)|cmi\.score\.(?:scaled|raw|min|max)|cmi\.learner_preference\.(?:audio_level|language|delivery_speed|audio_captioning)|cmi\.comments_from_learner\.\d{1,3}\.(?:comment|location|timestamp)|cmi\.objectives\.\d{1,3}\.(?:id|description|completion_status|success_status|progress_measure|score\.(?:scaled|raw|min|max))|cmi\.interactions\.\d{1,3}\.(?:id|type|timestamp|weighting|learner_response|result|latency|description|objectives\.\d{1,3}\.id|correct_responses\.\d{1,3}\.pattern))$/;
const readonly = /^(?:cmi\.(?:learner_id|learner_name|credit|mode|entry|total_time|launch_data|scaled_passing_score|completion_threshold|max_time_allowed|time_limit_action)|cmi\.comments_from_lms\.\d{1,3}\.(?:comment|location|timestamp))$/;
const container = /^(?:cmi|cmi\.(?:score|learner_preference|comments_from_learner|comments_from_lms|objectives|interactions)|cmi\.(?:comments_from_learner|comments_from_lms|objectives|interactions)\.\d{1,3}|cmi\.objectives\.\d{1,3}\.score|cmi\.interactions\.\d{1,3}\.(?:objectives|correct_responses)|cmi\.interactions\.\d{1,3}\.(?:objectives|correct_responses)\.\d{1,3})$/;
function leaves(input: unknown, prefix = 'cmi', out: Record<string, string> = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !container.test(prefix)) reject('INVALID_ARGUMENT', 'Unknown or invalid CMI container');
  for (const [key, value] of Object.entries(input)) {
    const path = prefix + '.' + key;
    if (typeof value === 'string') {
      if (Object.keys(out).length >= 2048 || value.length > (path === 'cmi.suspend_data' ? 64000 : 4096)) reject('INVALID_ARGUMENT', 'CMI field quota exceeded');
      out[path] = value;
    } else leaves(value, path, out);
  }
  return out;
}
/** Replay writable strings through the engine; compare LMS-owned fields to trusted seed. */
export function validateSCORM2004Checkpoint(input: unknown, seed: Record<string, any>, edition: SCORM2004Edition, finished: boolean, navigation = '_none_', trustedRuntime?: Scorm2004API): Record<string, any> {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > scorm2004CheckpointBytes || !trustedRuntime && !scorm2004ExitRequests.includes(navigation)) reject('INVALID_ARGUMENT', 'SCORM 2004 checkpoint or navigation quota/profile rejected');
  const incoming = leaves(input), runtime = trustedRuntime ?? new Scorm2004API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false, accumulateSessionTimeOnTerminate: false});
  runtime.loadFromJSON(seed);
  const protectedValues: Record<string, string> = {...leaves(runtime.renderCMIToJSONObject().cmi), 'cmi.total_time': seed.total_time ?? 'PT0S'};
  runtime.Initialize('');
  // Initialize seeds local objectives from the trusted manifest/snapshot. Their
  // default unknown values are not content writes that may override top-level CMI.
  const baseline = leaves(runtime.renderCMIToJSONObject().cmi);
  const priority = (key: string) => key.endsWith('.id') ? 0 : key.endsWith('.type') ? 1 : 2;
  for (const [key, value] of Object.entries(incoming).sort(([a], [b]) => priority(a) - priority(b) || a.localeCompare(b, 'en', {numeric: true}))) {
    if (readonly.test(key)) {if (value !== protectedValues[key]) reject('FORBIDDEN', 'Server-owned CMI value changed'); continue;}
    if (!writable.test(key)) reject('INVALID_ARGUMENT', 'Unsupported SCORM 2004 data model field');
    if (value === baseline[key] || value === '' && baseline[key] === undefined) continue;
    if (scorm2004FieldError(edition, key, value)) reject('INVALID_ARGUMENT', 'Invalid SCORM 2004 data model field: ' + key);
    if (runtime.SetValue(key, scorm2004EngineValue(key, value)) !== 'true') reject('INVALID_ARGUMENT', 'SCORM 2004 data model rejected checkpoint: ' + key);
  }
  if (trustedRuntime) {
    if (scorm2004FieldError(edition, 'adl.nav.request', navigation) || runtime.SetValue('adl.nav.request', navigation) !== 'true') reject('INVALID_ARGUMENT', 'Invalid edition navigation request');
    if (finished && !validNavigation(runtime, navigation)) reject('FORBIDDEN', 'Trusted sequencing denies navigation');
    // Commit normalizes threshold/score without processing navigation. Preserve this SCO's
    // CMI before Terminate delivers another SCO and replaces LMS-owned launch fields.
    if (runtime.Commit('') !== 'true') reject('INVALID_ARGUMENT', 'SCORM engine rejected Commit');
    const state = finished ? validateSCORM2004Checkpoint(runtime.renderCMIToJSONObject().cmi, seed, edition, true) : runtime.renderCMIToJSONObject().cmi as Record<string, any>;
    if (finished) for (const key of ['completion_status', 'success_status']) if (state[key] !== (runtime.renderCMIToJSONObject().cmi as any)[key] && runtime.SetValue('cmi.' + key, state[key]) !== 'true') reject('INVALID_ARGUMENT', 'Engine-derived status rejected');
    if (finished && runtime.Terminate('') !== 'true') reject('INVALID_ARGUMENT', 'SCORM engine rejected Terminate');
    return state;
  }
  if (finished && runtime.Terminate('') !== 'true') reject('INVALID_ARGUMENT', 'SCORM engine rejected Terminate');
  return runtime.renderCMIToJSONObject().cmi as Record<string, any>;
}
