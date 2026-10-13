import type {DatabaseSync} from 'node:sqlite';
import type {Principal,CMI5Reference} from '../shared/model.ts';
import type {LearningService} from './service.ts';
import {xapiObject} from './cmi5-xapi.ts';
import {reject} from './errors.ts';

export interface CMI5LearningContext {
  bindingKey:string;reference:CMI5Reference;context:unknown;
  courseEnrollmentId?:string;lessonId?:string;itemEnrollmentId?:string;
}
export class CMI5LearningBindings {
  constructor(readonly db:DatabaseSync,readonly learning:LearningService) {}
  resolve(p:Principal,a:any):CMI5LearningContext {
    xapiObject(a,['enrollmentId','lessonId','itemEnrollmentId']);
    if(typeof a.enrollmentId==='string'&&typeof a.lessonId==='string'&&a.itemEnrollmentId===undefined)return this.learning.cmi5CourseContext(p,a.enrollmentId,a.lessonId);
    if(typeof a.itemEnrollmentId==='string'&&a.enrollmentId===undefined&&a.lessonId===undefined)return this.learning.standalone.cmi5Context(p,a.itemEnrollmentId);
    reject('INVALID_ARGUMENT','Choose one exact enrolled cmi5 lesson or item');
  }
  validate(p:Principal,c:CMI5LearningContext,packageId:string) {
    const pkg=this.db.prepare('SELECT sha256,state FROM cmi5_packages WHERE id=? AND tenant=?').get(packageId,p.tenant) as any;
    if(c.reference.packageId!==packageId||!pkg||c.reference.sha256!==pkg.sha256||!['published','retired'].includes(pkg.state))reject('FORBIDDEN','Exact immutable cmi5 learning package pin required');
  }
  find(p:Principal,c:CMI5LearningContext) {return this.db.prepare('SELECT registration_id FROM cmi5_learning_bindings WHERE tenant=? AND learner=? AND binding_key=?').get(p.tenant,p.id,c.bindingKey) as {registration_id:string}|undefined;}
  attach(p:Principal,id:string,c:CMI5LearningContext) {this.db.prepare('INSERT INTO cmi5_learning_bindings VALUES(?,?,?,?,?,?,?,?)').run(id,p.tenant,p.id,c.bindingKey,c.courseEnrollmentId??null,c.lessonId??null,c.itemEnrollmentId??null,JSON.stringify(c.context));}
  guard(p:Principal,id:string) {
    const b=this.db.prepare('SELECT * FROM cmi5_learning_bindings WHERE registration_id=?').get(id) as any;if(!b)return undefined;
    if(b.tenant!==p.tenant||b.learner!==p.id)reject('FORBIDDEN','Own cmi5 learning binding required');
    const c=this.resolve(p,b.item_enrollment_id?{itemEnrollmentId:b.item_enrollment_id}:{enrollmentId:b.course_enrollment_id,lessonId:b.lesson_id}),r=this.db.prepare('SELECT * FROM cmi5_registrations WHERE id=?').get(id) as any;
    if(r.mode!=='Normal'||c.bindingKey!==b.binding_key||JSON.stringify(c.context)!==b.context)reject('FORBIDDEN','cmi5 learning context changed');
    this.validate(p,c,r.package_id);return c;
  }
  completed(id:string){return !!this.db.prepare('SELECT 1 FROM cmi5_completion_proofs WHERE registration_id=?').get(id);}
  project(p:Principal,s:any,aus:any[]) {
    const c=this.guard(p,s.registration_id);if(!c||s.data.launchMode!=='Normal'||this.completed(s.registration_id))return false;
    if(!aus.length||aus.some(au=>!au.satisfied||au.waived&&!c.reference.allowWaivers))return false;
    const rows=this.db.prepare("SELECT t.id,t.au_id,t.verb,t.source,t.payload_hash,json_extract(n.launch_data,'$.launchMode') AS mode FROM cmi5_statements t JOIN cmi5_sessions n ON n.id=t.session_id WHERE t.registration_id=? AND t.defined=1 ORDER BY t.timestamp,CASE WHEN t.verb='initialized' THEN 0 WHEN t.verb='terminated' THEN 2 ELSE 1 END,t.sequence").all(s.registration_id) as any[];
    // Official credit waits for an accepted Normal termination for every AU;
    // NotApplicable alone at launch and an in-flight pass are insufficient.
    if(aus.some(au=>!au.waived&&rows.filter(row=>row.au_id===au.id&&row.source==='au'&&row.mode==='Normal').at(-1)?.verb!=='terminated'))return false;
    const now=new Date().toISOString(),proof={packageId:s.package_id,sha256:c.reference.sha256,profile:'pear-cmi5-quartz/2',reference:c.reference,context:c.context,aus:aus.map(au=>({id:au.id,moveOn:au.moveOn,completed:au.completed,passed:au.passed,waived:au.waived})),statements:rows.filter(row=>row.source==='au'&&row.mode==='Normal'||row.source==='lms'&&row.verb==='waived').map(({mode,...row})=>row)};
    this.db.prepare('INSERT INTO cmi5_completion_proofs VALUES(?,?,?,?)').run(s.registration_id,p.tenant,JSON.stringify(proof),now);
    if(c.courseEnrollmentId) {
      const row=this.db.prepare('SELECT completed_lessons FROM enrollments WHERE id=? AND tenant=? AND learner=?').get(c.courseEnrollmentId,p.tenant,p.id) as any,completed=JSON.parse(row.completed_lessons);if(!completed.includes(c.lessonId))completed.push(c.lessonId);
      this.db.prepare('UPDATE enrollments SET completed_lessons=? WHERE id=?').run(JSON.stringify(completed),c.courseEnrollmentId);
    }else this.db.prepare('UPDATE item_enrollments SET completed_at=COALESCE(completed_at,?) WHERE id=?').run(now,c.itemEnrollmentId!);
    this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant,p.id,`learning:${p.tenant}:${p.id}`,'runtime_cmi5_learning_completion',JSON.stringify({registrationId:s.registration_id,bindingKey:c.bindingKey,proof}),now);
    if(c.itemEnrollmentId){this.learning.programs.refreshLearner(p.tenant,p.id);this.learning.assignments.refreshCompletionNotifications(p.tenant,p.id,false);}return true;
  }
}
