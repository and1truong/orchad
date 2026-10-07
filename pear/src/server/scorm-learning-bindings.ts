import type {DatabaseSync} from 'node:sqlite';
import type {Principal, SCORMReference} from '../shared/model.ts';
import type {SCORMManifest} from '../shared/scorm-engine.ts';
import {SCORM_ENGINE} from '../shared/scorm-engine.ts';
import type {LearningService} from './service.ts';
import {scorm12Activities} from './scorm-activities.ts';
import {reject} from './errors.ts';

export interface SCORMLearningContext {
  bindingKey: string; reference: SCORMReference; context: unknown;
  courseEnrollmentId?: string; lessonId?: string; itemEnrollmentId?: string;
}
export class SCORMLearningBindings {
  constructor(readonly db: DatabaseSync, readonly learning: LearningService) {}
  resolve(p: Principal, a: any): SCORMLearningContext | undefined {
    if (!a || Object.keys(a).some(k => !['enrollmentId', 'lessonId', 'itemEnrollmentId'].includes(k))) reject('INVALID_ARGUMENT', 'Exact learning enrollment context required');
    if (a.itemEnrollmentId && !a.enrollmentId && !a.lessonId && typeof a.itemEnrollmentId === 'string') return this.learning.standalone.scormContext(p, a.itemEnrollmentId);
    if (a.enrollmentId && a.lessonId && !a.itemEnrollmentId && typeof a.enrollmentId === 'string' && typeof a.lessonId === 'string') return this.learning.scormCourseContext(p, a.enrollmentId, a.lessonId);
    reject('INVALID_ARGUMENT', 'Choose one enrolled SCORM lesson or item');
  }
  validate(p: Principal, context: SCORMLearningContext, packageId: string, version: number) {
    const ref = context.reference, pkg = this.db.prepare('SELECT sha256,state FROM scorm_engine_versions WHERE package_id=? AND version=? AND tenant=?').get(packageId, version, p.tenant) as any;
    if (ref.packageId !== packageId || ref.version !== version || !pkg || ref.sha256 !== pkg.sha256 || !['published', 'retired'].includes(pkg.state)) reject('FORBIDDEN', 'Exact immutable learning package pin required');
  }
  attach(p: Principal, id: string, c: SCORMLearningContext) {
    this.db.prepare('INSERT INTO scorm_learning_bindings VALUES(?,?,?,?,?,?)').run(id, p.tenant, c.courseEnrollmentId ?? null, c.lessonId ?? null, c.itemEnrollmentId ?? null, JSON.stringify(c.context));
  }
  guard(p: Principal, r: any) {
    const b = this.db.prepare('SELECT * FROM scorm_learning_bindings WHERE registration_id=? AND tenant=?').get(r.id, p.tenant) as any;
    if (!b) {if (r.binding_key !== 'standalone') reject('FORBIDDEN', 'SCORM learning binding unavailable'); return undefined;}
    if (r.mode !== 'normal') reject('FORBIDDEN', 'Preview cannot bind official learning');
    const c = this.resolve(p, b.item_enrollment_id ? {itemEnrollmentId: b.item_enrollment_id} : {enrollmentId: b.course_enrollment_id, lessonId: b.lesson_id})!;
    if (JSON.stringify(c.context) !== b.context || c.bindingKey !== r.binding_key) reject('FORBIDDEN', 'SCORM learning context changed');
    this.validate(p, c, r.package_id, r.version); return c;
  }
  project(p: Principal, registration: any, attemptId: string, manifest: SCORMManifest) {
    const c = this.guard(p, registration);
    if (!c || registration.mode !== 'normal') return false;
    if (this.db.prepare('SELECT 1 FROM scorm_completion_proofs WHERE registration_id=? AND attempt_id=?').get(registration.id, attemptId)) return false;
    const rows = this.db.prepare('SELECT * FROM scorm_sco_attempts WHERE attempt_id=? AND tenant=? AND sco_attempt_number=1').all(attemptId, p.tenant) as any[];
    const evidence = scorm12Activities(manifest).map(({activity}) => {
      const row = rows.find(r => r.sco_id === activity.id), state = row ? JSON.parse(row.runtime_state) : {}, raw = state.core?.score?.raw, min = state.core?.score?.min, max = state.core?.score?.max;
      const score = raw !== undefined && raw !== '' && Number.isFinite(Number(raw)) ? min !== undefined && min !== '' && max !== undefined && max !== '' && Number(max) > Number(min) ? (Number(raw) - Number(min)) / (Number(max) - Number(min)) * 100 : Number(raw) : null;
      return {scoId: activity.id, finished: row?.finished === 1, status: state.core?.lesson_status ?? 'not attempted', score, seconds: row?.reported_seconds ?? 0, revision: row?.revision ?? 0};
    });
    if (evidence.some(e => !e.finished || !(c.reference.completion === 'passed' ? e.status === 'passed' : ['completed', 'passed'].includes(e.status)) || c.reference.minimumScore !== undefined && (e.score === null || e.score < c.reference.minimumScore || e.score > 100))) return false;
    const now = new Date().toISOString(), proof = {packageId: registration.package_id, version: registration.version, sha256: registration.sha256, engine: SCORM_ENGINE, reference: c.reference, context: c.context, scos: evidence};
    this.db.prepare('INSERT INTO scorm_completion_proofs VALUES(?,?,?,?,?)').run(registration.id, attemptId, p.tenant, JSON.stringify(proof), now);
    if (c.courseEnrollmentId) {
      const e = this.db.prepare('SELECT completed_lessons FROM enrollments WHERE id=? AND tenant=? AND learner=?').get(c.courseEnrollmentId, p.tenant, p.id) as any, completed = JSON.parse(e.completed_lessons);
      if (!completed.includes(c.lessonId)) completed.push(c.lessonId);
      this.db.prepare('UPDATE enrollments SET completed_lessons=? WHERE id=?').run(JSON.stringify(completed), c.courseEnrollmentId);
    } else this.db.prepare('UPDATE item_enrollments SET completed_at=COALESCE(completed_at,?) WHERE id=?').run(now, c.itemEnrollmentId!);
    this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant, p.id, 'learning:' + p.tenant + ':' + p.id, 'runtime_scorm_learning_completion', JSON.stringify({registrationId: registration.id, attemptId, bindingKey: c.bindingKey, proof}), now);
    if (c.itemEnrollmentId) {this.learning.programs.refreshLearner(p.tenant, p.id); this.learning.assignments.refreshCompletionNotifications(p.tenant, p.id, false);}
    return true;
  }
}
