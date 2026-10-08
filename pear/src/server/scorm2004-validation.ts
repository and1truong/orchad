import {scormCharacters, scorm2004Writable as writable} from '../shared/scorm-characterstring.ts';
import Scorm2004API from 'scorm-again/scorm2004';
import {scorm2004CheckpointBytes, scorm2004FieldError, scorm2004EngineValue, scorm2004ExitRequests, type SCORM2004Edition} from '../shared/scorm2004-runtime.ts';
import {validNavigation} from '../shared/scorm-sequencing-runtime.ts';
import {applySharedDataWrites} from './scorm-shared-data.ts';
import {reject} from './errors.ts';

const readonly = /^(?:cmi\.(?:learner_id|learner_name|credit|mode|entry|total_time|launch_data|scaled_passing_score|completion_threshold|max_time_allowed|time_limit_action)|cmi\.comments_from_lms\.\d{1,3}\.(?:comment|location|timestamp))$/;
const container = /^(?:cmi|cmi\.(?:score|learner_preference|comments_from_learner|comments_from_lms|objectives|interactions)|cmi\.(?:comments_from_learner|comments_from_lms|objectives|interactions)\.\d{1,3}|cmi\.objectives\.\d{1,3}\.score|cmi\.interactions\.\d{1,3}\.(?:objectives|correct_responses)|cmi\.interactions\.\d{1,3}\.(?:objectives|correct_responses)\.\d{1,3})$/;
const localizedField = /^cmi\.(?:comments_from_(?:learner|lms)\.\d+\.comment|(?:objectives|interactions)\.\d+\.description)$/;
const interactionResponse = /^cmi\.interactions\.\d+\.(?:learner_response|correct_responses\.\d+\.pattern)$/;
function leaves(input: unknown, prefix = 'cmi', out: Record<string, string> = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !container.test(prefix)) reject('INVALID_ARGUMENT', 'Unknown or invalid CMI container');
  for (const [key, value] of Object.entries(input)) {
    const path = prefix + '.' + key;
    if (typeof value === 'string') {
      // Envelope quotas count binding delimiters too; engine replay validates each typed record.
      const limit = path === 'cmi.suspend_data' ? 64000 : interactionResponse.test(path) ? 36 * 4000 + 35 * 3 : localizedField.test(path) ? 4257 : 4096;
      if (Object.keys(out).length >= 2048 || scormCharacters(value) > limit) reject('INVALID_ARGUMENT', 'CMI field quota exceeded');
      out[path] = value;
    } else leaves(value, path, out);
  }
  return out;
}
/** Replay writable strings through the engine; compare LMS-owned fields to trusted seed. */
export function validateSCORM2004Checkpoint(input: unknown, seed: Record<string, any>, edition: SCORM2004Edition, finished: boolean, navigation = '_none_', trustedRuntime?: Scorm2004API, sharedData?: unknown): Record<string, any> {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > scorm2004CheckpointBytes || !trustedRuntime && !scorm2004ExitRequests.includes(navigation)) reject('INVALID_ARGUMENT', 'SCORM 2004 checkpoint or navigation quota/profile rejected');
  const incoming = leaves(input), runtime = trustedRuntime ?? new Scorm2004API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false, accumulateSessionTimeOnTerminate: false});
  runtime.loadFromJSON(seed);
  const protectedValues: Record<string, string> = {...leaves(runtime.renderCMIToJSONObject().cmi), 'cmi.total_time': seed.total_time ?? 'PT0S'};
  runtime.Initialize('');
  // Initialize seeds local objectives from the trusted manifest/snapshot. Their
  // default unknown values are not content writes that may override top-level CMI.
  const baseline = leaves(runtime.renderCMIToJSONObject().cmi);
  if (sharedData !== undefined) {if (edition !== '2004-4' || !trustedRuntime) reject('INVALID_ARGUMENT', 'Trusted fourth-edition shared data required'); applySharedDataWrites(runtime, sharedData);}
  const priority = (key: string) => key.endsWith('.id') ? 0 : key.endsWith('.type') ? 1 : 2;
  for (const [key, value] of Object.entries(incoming).sort(([a], [b]) => priority(a) - priority(b) || a.localeCompare(b, 'en', {numeric: true}))) {
    if (readonly.test(key)) {if (value !== protectedValues[key]) reject('FORBIDDEN', 'Server-owned CMI value changed'); continue;}
    if (!writable.test(key)) reject('INVALID_ARGUMENT', 'Unsupported SCORM 2004 data model field');
    const response = /^cmi\.interactions\.(\d+)\.(learner_response|correct_responses\.\d+\.pattern)$/.exec(key);
    const emptyRecord = /^cmi\.(?:comments_from_learner\.\d+\.(?:comment|location)|(?:objectives|interactions)\.\d+\.description)$/.test(key) || response && (response[2] !== 'learner_response' || ['choice','matching','sequencing','performance'].includes(runtime.GetValue(`cmi.interactions.${response[1]}.type`)));
    // Unset scalar defaults stay unset; an explicit empty collection/pattern must be replayed.
    if (value === baseline[key] || value === '' && baseline[key] === undefined && !emptyRecord) continue;
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
