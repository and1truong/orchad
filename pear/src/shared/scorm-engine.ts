export const SCORM_STANDARDS = ['1.2', '2004-2', '2004-3', '2004-4'] as const;
export type SCORMStandard = typeof SCORM_STANDARDS[number];
export const SCORM_ENGINE = {name: 'scorm-again', version: '3.4.5', adaptation: 'pear-comment-presence-binding-v29'} as const;
/** Model keywords are public; backing fields and engine roots are not API elements. */
export function scormModelPath(key: string) {
  // Target delimiters contain authored values; the engine binds this whole family.
  if (/^adl\.nav\.request_valid\.(?:choice|jump)(?:\.|$)/.test(key)) return true;
  return /^(?:cmi|adl)\./.test(key) && key.split('.').every(part => !['initialized', 'jsonString', 'start_time'].includes(part) && (!part.startsWith('_') || ['_children', '_count', '_version'].includes(part)));
}
export interface SCORMResource {
  id: string;
  kind: 'sco' | 'asset';
  href: string;
  files: string[];
  dependencies: string[];
}
export interface SCORMActivity {
  id: string;
  title: string;
  isVisible?: boolean;
  resourceId?: string;
  parameters?: string;
  prerequisites?: string;
  launchData?: string;
  masteryScore?: string;
  completionThreshold?: string;
  completionMeasure?: {completedByMeasure: boolean; minProgressMeasure: number; progressWeight: number};
  hideLmsUi?: string[];
  sharedDataMaps?: {targetID: string; readSharedData: boolean; writeSharedData: boolean}[];
  sequencing?: Record<string, any>;
  maxTimeAllowed?: string;
  timeLimitAction?: string;
  children: SCORMActivity[];
}
export interface SCORMManifest {
  standard: SCORMStandard;
  identifier: string;
  title: string;
  organizationId: string;
  activities: SCORMActivity[];
  resources: SCORMResource[];
  runtimeFeatures?: string[];
  sequencing?: Record<string, any>;
  objectivesGlobalToSystem?: boolean;
  sharedDataGlobalToSystem?: boolean;
}
export function scormStandard(value: unknown): SCORMStandard {
  if (!SCORM_STANDARDS.includes(value as SCORMStandard)) throw new Error('Unsupported SCORM edition');
  return value as SCORMStandard;
}

/** Published support tables only; never coerce objects supplied by content. */
export function scormSupportCode(value: unknown, standard: SCORMStandard) {
  if (typeof value === 'number' && Number.isInteger(value)) value = String(value);
  if (typeof value !== 'string') return null;
  const codes = standard === '1.2'
    ? ['0', '101', '201', '202', '203', '301', '401', '402', '403', '404', '405']
    : ['0', '101', '102', '103', '104', '111', '112', '113', '122', '123', '132', '133', '142', '143', '201', '301', '351', '391', '401', '402', '403', '404', '405', '406', '407', '408'];
  return codes.includes(value) ? value : null;
}
