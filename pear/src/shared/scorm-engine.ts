export const SCORM_STANDARDS = ['1.2', '2004-2', '2004-3', '2004-4'] as const;
export type SCORMStandard = typeof SCORM_STANDARDS[number];
export const SCORM_ENGINE = {name: 'scorm-again', version: '3.4.5', adaptation: 'pear-selection-v2'} as const;
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
