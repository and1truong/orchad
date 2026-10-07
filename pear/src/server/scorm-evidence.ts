import type {SCORMReference} from '../shared/model.ts';
import type {SCORMStandard} from '../shared/scorm-engine.ts';

/** The same trusted per-SCO policy drives official proof and default replay. */
export function scoEvidence(standard: SCORMStandard, scoId: string, row?: {runtime_state: string; finished: number; reported_seconds: number; revision: number}) {
  const state = row ? JSON.parse(row.runtime_state) : {}, scores = standard === '1.2' ? state.core?.score : state.score;
  let score: number | null = null;
  if (standard === '1.2' && scores?.raw !== undefined && scores.raw !== '' && Number.isFinite(Number(scores.raw))) score = Number(scores.raw);
  else if (scores?.scaled !== undefined && scores.scaled !== '' && Number.isFinite(Number(scores.scaled))) score = Number(scores.scaled) * 100;
  else if (scores?.raw !== undefined && scores.raw !== '' && scores.min !== undefined && scores.min !== '' && scores.max !== undefined && scores.max !== '' && Number(scores.max) > Number(scores.min)) score = (Number(scores.raw) - Number(scores.min)) / (Number(scores.max) - Number(scores.min)) * 100;
  return {scoId, finished: row?.finished === 1, status: standard === '1.2' ? state.core?.lesson_status ?? 'not attempted' : state.completion_status ?? 'unknown', success: standard === '1.2' ? state.core?.lesson_status ?? 'not attempted' : state.success_status ?? 'unknown', score, seconds: row?.reported_seconds ?? 0, revision: row?.revision ?? 0};
}
export function meetsSCORMPolicy(standard: SCORMStandard, evidence: ReturnType<typeof scoEvidence>, policy: Pick<SCORMReference, 'completion' | 'minimumScore'>) {
  return evidence.finished && (standard === '1.2' ? ['completed', 'passed'].includes(evidence.status) : evidence.status === 'completed') && (policy.completion !== 'passed' || evidence.success === 'passed') && (policy.minimumScore === undefined || evidence.score !== null && evidence.score >= policy.minimumScore && evidence.score <= 100);
}
