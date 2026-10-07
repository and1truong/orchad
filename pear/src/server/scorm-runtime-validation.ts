import Scorm12API from 'scorm-again/scorm12';
import {reject} from './errors.ts';

const writable = /^(?:cmi\.(?:suspend_data|comments)|cmi\.core\.(?:lesson_location|lesson_status|exit|session_time|score\.(?:raw|min|max))|cmi\.student_preference\.(?:audio|language|speed|text)|cmi\.objectives\.\d{1,3}\.(?:id|status|score\.(?:raw|min|max))|cmi\.interactions\.\d{1,3}\.(?:id|time|type|weighting|student_response|result|latency|objectives\.\d{1,3}\.id|correct_responses\.\d{1,3}\.pattern))$/;
const readonly = /^(?:cmi\.(?:launch_data|comments_from_lms)|cmi\.core\.(?:student_id|student_name|credit|entry|lesson_mode|total_time)|cmi\.student_data\.(?:mastery_score|max_time_allowed|time_limit_action))$/;
function leaves(value: unknown, prefix = 'cmi', depth = 0, out: Record<string, string> = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8) reject('INVALID_ARGUMENT', 'Bounded CMI object required');
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-z_]+$|^\d{1,3}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) reject('INVALID_ARGUMENT', 'Unknown CMI field');
    const path = prefix + '.' + key;
    if (typeof item === 'string') {
      if (item.length > 4096 || Object.keys(out).length >= 2048) reject('INVALID_ARGUMENT', 'CMI field quota exceeded');
      out[path] = item;
    } else leaves(item, path, depth + 1, out);
  }
  return out;
}
export function scormSeconds(value: string) {
  const match = /^(\d{2,4}):([0-5]\d):([0-5]\d)(\.\d{1,2})?$/.exec(value);
  if (!match) reject('INVALID_ARGUMENT', 'Invalid SCORM session time');
  return Number(match![1]) * 3600 + Number(match![2]) * 60 + Number(match![3]) + Number(match![4] ?? 0);
}
export function scormTime(seconds: number) {
  const centiseconds = Math.round(seconds * 100), whole = Math.floor(centiseconds / 100), fraction = centiseconds % 100;
  return String(Math.floor(whole / 3600)).padStart(2, '0') + ':' + String(Math.floor(whole / 60) % 60).padStart(2, '0') + ':' + String(whole % 60).padStart(2, '0') + (fraction ? '.' + String(fraction).padStart(2, '0') : '');
}

/** Reapply each changed writable value through the real server-side runtime. Never load untrusted JSON directly. */
export function validateSCORM12Checkpoint(input: unknown, seed: Record<string, any>) {
  if (Buffer.byteLength(JSON.stringify(input) ?? '') > 128 * 1024) reject('INVALID_ARGUMENT', 'CMI checkpoint quota exceeded');
  const incoming = leaves(input), runtime = new Scorm12API({logLevel: 'NONE', autocommit: false, lmsCommitUrl: false});
  runtime.loadFromJSON(seed);
  const baseline = leaves(runtime.renderCMIToJSONObject().cmi), protectedValues: Record<string, string> = {...baseline, 'cmi.core.total_time': seed.core?.total_time ?? '00:00:00'};
  runtime.LMSInitialize('');
  // IDs and interaction types must precede dependent data, regardless of input property order.
  const priority = (key: string) => key.endsWith('.id') ? 0 : key.endsWith('.type') ? 1 : 2;
  for (const [key, value] of Object.entries(incoming).sort(([a], [b]) => priority(a) - priority(b) || a.localeCompare(b, 'en', {numeric: true}))) {
    if (readonly.test(key)) {if (value !== protectedValues[key]) reject('FORBIDDEN', 'Server-owned CMI value changed'); continue;}
    if (!writable.test(key)) reject('INVALID_ARGUMENT', 'Unsupported CMI field');
    // Empty optional defaults in a newly exported objective/interaction need no SetValue.
    if (value === baseline[key] || value === '' && baseline[key] === undefined) continue;
    if (runtime.LMSSetValue(key, value) !== 'true') reject('INVALID_ARGUMENT', 'SCORM data model rejected checkpoint');
  }
  return runtime.renderCMIToJSONObject().cmi as Record<string, any>;
}
