import {selectionEvidence} from './scorm-selection.ts';
import type {DatabaseSync} from 'node:sqlite';
import type {Principal, SCORMReference} from '../shared/model.ts';
import type {SCORMManifest} from '../shared/scorm-engine.ts';
import {SCORM_ENGINE} from '../shared/scorm-engine.ts';
import type {LearningService} from './service.ts';
import {playbackActivities} from './scorm-activities.ts';
import {usesSequencing} from './scorm-sequencing.ts';
import {reject} from './errors.ts';
import {scoEvidence, meetsSCORMPolicy} from './scorm-evidence.ts';

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
    const rows = this.db.prepare('SELECT s.* FROM scorm_sco_attempts s WHERE s.attempt_id=? AND s.tenant=? AND s.sco_attempt_number=(SELECT max(n.sco_attempt_number) FROM scorm_sco_attempts n WHERE n.attempt_id=s.attempt_id AND n.sco_id=s.sco_id)').all(attemptId, p.tenant) as any[];
    const overall = usesSequencing(manifest) ? this.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts WHERE id=? AND tenant=?').get(attemptId, p.tenant) as any : null;
    const selection = overall ? selectionEvidence(manifest, JSON.parse(overall.sequencing_state).snapshot) : {scos: playbackActivities(manifest), clusters: []};
    const evidence = selection.scos.filter(p => p.resource.kind === 'sco').map(({activity}) => scoEvidence(manifest.standard, activity.id, rows.find(r => r.sco_id === activity.id)));
    if (!evidence.length) return false;
    if (evidence.some(e => !meetsSCORMPolicy(manifest.standard, e, c.reference))) return false;
    let rollup: Record<string, any> | undefined;
    if (usesSequencing(manifest)) {
      const envelope = JSON.parse(overall.sequencing_state), root = JSON.parse(envelope.snapshot).sequencing?.activityStates?.[manifest.organizationId];
      if (!root || root.completionStatus !== 'completed' || c.reference.completion === 'passed' && root.successStatus !== 'passed') return false;
      rollup = {activityId: manifest.organizationId, completion: root.completionStatus, success: root.successStatus, normalizedMeasure: root.objectiveMeasureStatus ? root.objectiveNormalizedMeasure : null, completionMeasure: root.attemptCompletionAmountStatus ? root.attemptCompletionAmount : null};
    }
    const now = new Date().toISOString(), proof = {packageId: registration.package_id, version: registration.version, sha256: registration.sha256, engine: SCORM_ENGINE, reference: c.reference, context: c.context, scos: evidence, ...(selection.clusters.length ? {selection: selection.clusters} : {}), ...(rollup ? {rollup} : {})};
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
