import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import type {Principal} from '../shared/model.ts';
import {ContentAccess} from './content-access.ts';
import {PeopleService} from './people.ts';
import {hasPendingOfficialWork} from './retakes.ts';
import {awardCourseReferences} from './award-course-graph.ts';
import {reject} from './errors.ts';

export class AwardCourses {
 constructor(readonly db:DatabaseSync){}
 private principal(id:string,tenant:string){const p=this.db.prepare('SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1').get(id,tenant) as unknown as Principal;if(!p)reject('FORBIDDEN','Active assignment participant required');return p;}
 private award(p:Principal,id:string,changing=false,historical=false){
  const e=this.db.prepare('SELECT * FROM award_enrollments WHERE id=? AND tenant=?').get(id,p.tenant) as any;
  if(!e)reject('FORBIDDEN','Award binding unavailable');
  const learner=this.principal(e.learner,e.tenant),owner=this.owner(e);
  if(p.id!==learner.id)this.coordinator(p,e);
  const row=this.db.prepare('SELECT content FROM collection_versions WHERE collection_id=? AND version=?').get(e.award_id,e.version) as any;
  const value=JSON.parse(row.content);
  if(value.access==='groups'&&!value.groupIds.some((id:string)=>new PeopleService(this.db).isMember(e.tenant,id,learner.id)))reject('FORBIDDEN','Current award group membership required');
  const current=this.db.prepare('SELECT v.content FROM collections c JOIN collection_versions v ON v.collection_id=c.id AND v.version=c.latest_version WHERE c.id=? AND c.tenant=?').get(e.award_id,e.tenant) as any;
  const currentValue=current?JSON.parse(current.content):null;
  if((changing||historical)&&(!currentValue||currentValue.access==='groups'&&!currentValue.groupIds.some((id:string)=>new PeopleService(this.db).isMember(e.tenant,id,learner.id))||currentValue.access==='author'&&this.db.prepare('SELECT owner FROM collections WHERE id=?').get(e.award_id)!.owner!==learner.id))reject('FORBIDDEN','Current award audience required');
  if(e.assigned_by&&!historical)this.principal(owner,e.tenant);
  if(changing&&(e.assignment_state!=='active'||e.completed_at))reject('FORBIDDEN','An active unfinished award is required for a binding change');
  if(e.assignment_cycle_id&&!historical){
   const d=this.db.prepare('SELECT d.*,p.state plan_state,p.owner,c.definition,c.target_kind,c.target_id FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id JOIN assignment_plans p ON p.id=c.plan_id WHERE d.cycle_id=? AND d.learner=? AND p.tenant=?').get(e.assignment_cycle_id,learner.id,e.tenant) as any;
   if(!d||d.award_enrollment_id!==e.id||d.target_kind!=='award'||d.target_id!==e.award_id||!['active','closed'].includes(d.plan_state)||(changing&&d.state!=='active'))reject('FORBIDDEN','Active award cycle delivery required');
   const coordinator=this.principal(d.owner,e.tenant);this.coordinator(coordinator,e);
   const frozen=JSON.parse(d.definition);
   if(frozen.membership==='dynamic'&&!new PeopleService(this.db).members(coordinator,new PeopleService(this.db).group(coordinator,frozen.groupId).definition).some(u=>u.id===learner.id))reject('FORBIDDEN','Active award cycle membership required');
  }
  return e;
 }
 private owner(e:any){return e.assignment_cycle_id?(this.db.prepare('SELECT p.owner FROM assignment_cycles c JOIN assignment_plans p ON p.id=c.plan_id WHERE c.id=? AND p.tenant=?').get(e.assignment_cycle_id,e.tenant) as any)?.owner:e.assigned_by;}
 private coordinator(p:Principal,e:any){const learner=this.principal(e.learner,e.tenant);if(!e.assigned_by||!(p.role==='admin'||p.role==='manager'&&learner.manager_id===p.id&&this.owner(e)===p.id))reject('FORBIDDEN','Current assignment coordinator required');}
 private content(p:Principal,e:any,version:number){
  const c=this.db.prepare('SELECT * FROM courses WHERE id=? AND tenant=?').get(e.courseId,e.tenant) as any;
  const r=this.db.prepare('SELECT content FROM course_versions WHERE course_id=? AND version=?').get(e.courseId,version) as any;
  if(!c||!r)reject('NOT_FOUND','Course version unavailable');
  const access=new ContentAccess(this.db),value=JSON.parse(r.content);access.current(p,'course',c.id);access.requireVisible(p,'course',c.id,value);
  return {c,value};
 }
 private address(p:Principal,a:any){
  if(a.criterionPath)return a;
  const e=this.db.prepare('SELECT * FROM award_enrollments WHERE id=? AND learner=? AND tenant=?').get(a.awardEnrollmentId,p.id,p.tenant) as any;
  if(!e)reject('FORBIDDEN','Active own award enrollment required');
  const refs=awardCourseReferences(this.db,e).filter(r=>r.courseId===a.courseId);
  if(!refs.length)reject('FORBIDDEN','Course outside enrolled award rules');
  if(new Set(refs.map(r=>r.version)).size>1)reject('FORBIDDEN','Award references conflicting course versions; select an exact criterion path');
  if(refs.length!==1)reject('FORBIDDEN','Select an exact course criterion path');
  return {...a,criterionPath:refs[0]!.criterionPath};
 }
 requireOpeningResult(p:Principal,a:any,result:any){
  const x=this.context(p,this.address(p,a),true);
  if(x.source?.id!==result.enrollmentId)reject('STALE_CONTEXT','Award course binding changed; review again');
 }
 private context(p:Principal,a:any,changing=false,historical=false){
  const e=this.award(p,a.awardEnrollmentId,changing,historical),ref=awardCourseReferences(this.db,e).find(r=>r.criterionPath===a.criterionPath&&r.courseId===a.courseId);
  if(!ref)reject('FORBIDDEN','Exact course criterion outside enrolled award');
  const b=this.db.prepare('SELECT * FROM award_course_bindings WHERE award_enrollment_id=? AND criterion_path=? AND course_id=?').get(e.id,ref.criterionPath,ref.courseId) as any;
  if(b&&b.pinned_version!==ref.version)reject('INTERNAL','Award binding pin mismatch');
  const source=b?.course_enrollment_id?this.db.prepare('SELECT * FROM enrollments WHERE id=?').get(b.course_enrollment_id) as any:this.db.prepare('SELECT * FROM enrollments WHERE learner=? AND tenant=? AND course_id=? AND assignment_cycle_id IS ? AND award_binding_id IS NULL AND retake_of IS NULL ORDER BY (version=?) DESC,rowid DESC LIMIT 1').get(e.learner,e.tenant,ref.courseId,e.assignment_cycle_id,ref.version) as any;
  if(source&&(source.learner!==e.learner||source.tenant!==e.tenant||source.course_id!==ref.courseId||source.assignment_cycle_id!==e.assignment_cycle_id))reject('FORBIDDEN','Bound course ledger scope mismatch');
  const data={...e,courseId:ref.courseId},learner=this.principal(e.learner,e.tenant);
  for(const ancestor of ref.ancestors){const row=this.db.prepare('SELECT owner,latest_version FROM collections WHERE id=? AND tenant=?').get(ancestor.id,e.tenant) as any;if(!row)reject('FORBIDDEN','Nested award unavailable');for(const version of new Set([ancestor.version,row.latest_version])){const v=JSON.parse((this.db.prepare('SELECT content FROM collection_versions WHERE collection_id=? AND version=?').get(ancestor.id,version) as any).content);if(v.access==='author'&&row.owner!==learner.id||v.access==='groups'&&!v.groupIds.some((id:string)=>new PeopleService(this.db).isMember(e.tenant,id,learner.id)))reject('FORBIDDEN','Current nested award audience required');}}

  for(const who of p.id===learner.id?[learner]:[p,learner])for(const version of new Set([ref.version,b?.current_version??ref.version,...(source?[source.version]:[])]))this.content(who,data,version);
  return {e,ref,b,source,data,learner};
 }
 private ensure(x:ReturnType<AwardCourses['context']>){
  if(x.b)return x.b;
  const id=randomUUID();this.db.prepare('INSERT INTO award_course_bindings(id,award_enrollment_id,criterion_path,course_id,pinned_version,current_version,course_enrollment_id) VALUES(?,?,?,?,?,?,?)').run(id,x.e.id,x.ref.criterionPath,x.ref.courseId,x.ref.version,x.ref.version,x.source?.id??null);
  return this.db.prepare('SELECT * FROM award_course_bindings WHERE id=?').get(id) as any;
 }
 private target(p:Principal,x:ReturnType<AwardCourses['context']>,version:number){
  const v=this.content(x.learner,x.data,version);if(p.id!==x.learner.id)this.content(p,x.data,version);
  if(v.c.state!=='published')reject('FORBIDDEN','Course is not accepting new learning');
  if(!x.source||hasPendingOfficialWork(this.db,x.source.id))reject('FORBIDDEN','Resolve pending assessment and cancel bookings before changing award learning');
  return v;
 }
 read(p:Principal,a:any){
  const x=this.context(p,a),{e,ref,b,source}=x;
  const versions=(this.db.prepare('SELECT version FROM course_versions WHERE course_id=? ORDER BY version DESC LIMIT 20').all(ref.courseId) as any[]).flatMap(row=>{try{const v=this.content(x.learner,x.data,row.version);if(p.id!==x.learner.id)this.content(p,x.data,row.version);return [{version:row.version,title:v.value.title,available:v.c.state==='published'}];}catch{return [];}});
  const pending=b?this.db.prepare("SELECT * FROM award_course_reviews WHERE binding_id=? AND state='pending' ORDER BY rowid DESC LIMIT 1").get(b.id) as any:null;
  let offer=null;if(pending&&Date.parse(pending.expires_at)>Date.now()){try{const owner=this.principal(pending.owner,e.tenant);this.coordinator(owner,e);this.target(owner,x,pending.target_version);offer={id:pending.id,targetVersion:pending.target_version,expectedBindingRevision:pending.binding_revision};}catch{}}
  return {...a,originalVersion:ref.version,currentVersion:b?.current_version??ref.version,expectedBindingRevision:b?.revision??0,sourceEnrollmentId:source?.id??null,sourceVersion:source?.version??null,sourceCompleted:!!source?.completed_at,pendingOfficialWork:!!source&&hasPendingOfficialWork(this.db,source.id),assigned:!!e.assigned_by,available:e.assignment_state==='active'&&!e.completed_at&&!!source&&!hasPendingOfficialWork(this.db,source.id),versions,offer,policy:'Exact criterion binding only. Fresh learning copies no completion, answers, time or attendance. Resolve pending assessment and cancel bookings first. Assigned obligations require coordinator offer and separate learner acceptance; original and future cycle pins remain unchanged.'};
 }
 authorize(p:Principal,name:string,a:any){
  if(!name.startsWith('human_')||!['human_get_award_course_review','human_requalify_award_course','human_offer_award_course_change','human_accept_award_course_change','human_cancel_award_course_change'].includes(name))return;
  if(name==='human_get_award_course_review'){this.context(p,a);return;}
  if(name==='human_accept_award_course_change'||name==='human_cancel_award_course_change'){
   const r=this.db.prepare('SELECT r.*,b.award_enrollment_id,b.criterion_path,b.course_id FROM award_course_reviews r JOIN award_course_bindings b ON b.id=r.binding_id WHERE r.id=?').get(a.reviewId) as any;
   if(!r)reject('FORBIDDEN','Current award course review required');
   const x=this.context(p,{awardEnrollmentId:r.award_enrollment_id,criterionPath:r.criterion_path,courseId:r.course_id},true);
   const owner=this.principal(r.owner,x.e.tenant);this.coordinator(owner,x.e);
   if(name==='human_cancel_award_course_change'){this.coordinator(p,x.e);if(p.id!==owner.id||!['pending','cancelled'].includes(r.state))reject('FORBIDDEN','Own pending award course review required');return;}
   if(p.id!==x.e.learner||a.targetVersion!==r.target_version||a.expectedBindingRevision!==r.binding_revision)reject('FORBIDDEN','Addressed exact award course review required');
   if(r.state==='accepted'){
    if(x.b.revision!==r.binding_revision+1||x.b.course_enrollment_id!==r.successor)reject('STALE_CONTEXT','Award course binding changed; review again');
    const original={...x,source:this.db.prepare('SELECT * FROM enrollments WHERE id=?').get(r.source_enrollment_id) as any};this.target(owner,original,r.target_version);this.target(p,original,r.target_version);return;
   }
   if(r.state!=='pending'||Date.parse(r.expires_at)<=Date.now()||x.b.revision!==r.binding_revision||x.source?.id!==r.source_enrollment_id)reject('STALE_CONTEXT','Award course binding changed; review again');
   this.target(owner,x,r.target_version);this.target(p,x,r.target_version);return;
  }
  const x=this.context(p,a,true);
  if(name==='human_offer_award_course_change')this.coordinator(p,x.e);
  else if(p.id!==x.e.learner||x.e.assigned_by)reject('FORBIDDEN','Assigned award learning requires separate coordinator review');
  const prior=x.b&&this.db.prepare("SELECT * FROM award_course_reviews WHERE binding_id=? AND state='accepted' AND source_enrollment_id=? AND target_version=? AND binding_revision=? AND owner=?").get(x.b.id,a.sourceEnrollmentId,a.targetVersion,a.expectedBindingRevision,p.id) as any;
  if(name==='human_requalify_award_course'&&prior&&x.b.revision===a.expectedBindingRevision+1&&x.b.course_enrollment_id===prior.successor){this.target(p,{...x,source:this.db.prepare('SELECT * FROM enrollments WHERE id=?').get(prior.source_enrollment_id) as any},a.targetVersion);return;}
  if((x.b?.revision??0)!==a.expectedBindingRevision||x.source?.id!==a.sourceEnrollmentId)reject('STALE_CONTEXT','Award course binding changed; review again');
  this.target(p,x,a.targetVersion);
 }
 private createFresh(x:ReturnType<AwardCourses['context']>,b:any,version:number){
  new ContentAccess(this.db).newCourse(x.learner,x.ref.courseId,version);
  const source=x.source!,id=randomUUID(),linked=source.award_binding_id===b.id;
  // Do not withdraw a ledger borrowed by another criterion or unrelated assignment.
  if((linked||x.e.assignment_cycle_id&&source.assignment_cycle_id===x.e.assignment_cycle_id&&!this.db.prepare('SELECT 1 FROM award_course_bindings WHERE course_enrollment_id=? AND id!=?').get(source.id,b.id))&&!source.completed_at)this.db.prepare("UPDATE enrollments SET assignment_state='withdrawn' WHERE id=?").run(source.id);
  this.db.prepare('INSERT INTO enrollments(id,tenant,learner,course_id,version,assigned_by,due_date,assignment_cycle_id,award_binding_id,retake_of) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,x.e.tenant,x.e.learner,x.ref.courseId,version,x.e.assigned_by,x.e.due_date,x.e.assignment_cycle_id,b.id,linked?source.id:null);
  const changed=this.db.prepare('UPDATE award_course_bindings SET course_enrollment_id=?,current_version=?,revision=revision+1 WHERE id=? AND revision=?').run(id,version,b.id,b.revision);if(Number(changed.changes)!==1)reject('STALE_CONTEXT','Award course binding changed; review again');
  return id;
 }
 write(p:Principal,name:string,a:any){
  this.authorize(p,name,a);
  if(name==='human_cancel_award_course_change'){const r=this.db.prepare('SELECT * FROM award_course_reviews WHERE id=?').get(a.reviewId) as any;if(r.state!=='pending')reject('INVALID_ARGUMENT','Review already cancelled');this.db.prepare("UPDATE award_course_reviews SET state='cancelled' WHERE id=?").run(r.id);this.advanceLearner(r.binding_id);return {reviewId:r.id,state:'cancelled',officialLearningChanged:false};}
  if(name==='human_accept_award_course_change'){
   const r=this.db.prepare('SELECT r.*,b.award_enrollment_id,b.criterion_path,b.course_id FROM award_course_reviews r JOIN award_course_bindings b ON b.id=r.binding_id WHERE r.id=?').get(a.reviewId) as any;
   if(r.state!=='pending')reject('INVALID_ARGUMENT','Review already accepted');
   const x=this.context(p,{awardEnrollmentId:r.award_enrollment_id,criterionPath:r.criterion_path,courseId:r.course_id},true),id=this.createFresh(x,x.b,r.target_version);
   this.db.prepare("UPDATE award_course_reviews SET state='accepted',successor=? WHERE id=?").run(id,r.id);this.advanceLibrary(x.e.tenant);return {reviewId:r.id,enrollmentId:id,awardEnrollmentId:x.e.id,version:r.target_version,priorOfficialLearningPreserved:true,allProgressReset:true};
  }
  const x=this.context(p,a,true);if((x.b?.revision??0)!==a.expectedBindingRevision)reject('STALE_CONTEXT','Award course binding changed; review again');
  const b=this.ensure(x),id=randomUUID(),now=new Date().toISOString(),expiry=new Date(Date.now()+86400000).toISOString();
  this.db.prepare("UPDATE award_course_reviews SET state='expired' WHERE binding_id=? AND state='pending' AND expires_at<=?").run(b.id,now);
  if(this.db.prepare("SELECT 1 FROM award_course_reviews WHERE binding_id=? AND state='pending'").get(b.id))reject('INVALID_ARGUMENT','A current award course offer already exists');
  if(Number(this.db.prepare('SELECT count(*) n FROM award_course_reviews r JOIN award_course_bindings b ON b.id=r.binding_id JOIN award_enrollments a ON a.id=b.award_enrollment_id WHERE a.tenant=?').get(p.tenant)!.n)>=5000)reject('INVALID_ARGUMENT','Award course review quota reached');
  this.db.prepare('INSERT INTO award_course_reviews(id,binding_id,owner,source_enrollment_id,target_version,binding_revision,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,b.id,p.id,x.source.id,a.targetVersion,b.revision,name==='human_requalify_award_course'?'accepted':'pending',now,expiry);
  if(name==='human_offer_award_course_change'){this.advanceLearner(b.id);return {reviewId:id,officialLearningChanged:false};}
  const successor=this.createFresh(x,b,a.targetVersion);this.db.prepare('UPDATE award_course_reviews SET successor=? WHERE id=?').run(successor,id);return {reviewId:id,enrollmentId:successor,awardEnrollmentId:x.e.id,version:a.targetVersion,priorOfficialLearningPreserved:true,allProgressReset:true};
 }
 private advanceLearner(id:string){const e=this.db.prepare('SELECT a.* FROM award_course_bindings b JOIN award_enrollments a ON a.id=b.award_enrollment_id WHERE b.id=?').get(id) as any;this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(`learning:${e.tenant}:${e.learner}`);}
 private advanceLibrary(tenant:string){this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run('library:'+tenant);}
 requireCurrentCourse(p:Principal,id:string,write:boolean){
  const e=this.db.prepare('SELECT * FROM enrollments WHERE id=? AND learner=? AND tenant=?').get(id,p.id,p.tenant) as any;
  if(!e?.award_binding_id)return;
  const b=this.db.prepare('SELECT * FROM award_course_bindings WHERE id=?').get(e.award_binding_id) as any;
  if(!b)reject('FORBIDDEN','Award binding unavailable');
  if(write&&b.course_enrollment_id!==e.id)reject('FORBIDDEN','Only the current bound course may change official learning');
  const {e:award}=this.context(p,{awardEnrollmentId:b.award_enrollment_id,criterionPath:b.criterion_path,courseId:b.course_id},write,!write);
  this.content(p,{...award,courseId:b.course_id},e.version);
 }
 open(p:Principal,a:any,authorizeOnly=false){
  const x=this.context(p,this.address(p,a),true);if(p.id!==x.e.learner)reject('FORBIDDEN','Own award course required');
  const current=x.b?.current_version??x.ref.version;
  if(x.source){if(x.source.version!==current)reject('FORBIDDEN','Existing course version differs from the award; reviewed learning changes are required');if(x.source.assignment_state!=='active')reject('FORBIDDEN','Current award course obligation is not active');}
  if(authorizeOnly)return {authorized:true};
  const b=this.ensure(x);
  if(x.source)return {enrollmentId:x.source.id,version:current,alreadyEnrolled:true};
  const c=this.content(p,x.data,current).c;if(c.state!=='published')reject('FORBIDDEN','Course is not accepting new learning');
  new ContentAccess(this.db).newCourse(x.learner,x.ref.courseId,current);
  const id=randomUUID();this.db.prepare('INSERT INTO enrollments(id,tenant,learner,course_id,version,assigned_by,due_date,assignment_cycle_id,award_binding_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id,x.e.tenant,p.id,x.ref.courseId,current,x.e.assigned_by,x.e.due_date,x.e.assignment_cycle_id,b.id);this.db.prepare('UPDATE award_course_bindings SET course_enrollment_id=? WHERE id=?').run(id,b.id);
  return {enrollmentId:id,version:current,alreadyEnrolled:false};
 }
}
