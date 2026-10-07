import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {Principal} from "../shared/model.ts";
import {ContentAccess} from "./content-access.ts";
import {objectiveUpgradeProfile,hasPendingOfficialWork} from "./retakes.ts";
import {PeopleService} from "./people.ts";
import {reject} from "./errors.ts";
export class AssignedQuiz{
 constructor(readonly db:DatabaseSync){}
 private principal(id:string,tenant:string){const p=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(id,tenant) as unknown as Principal;if(!p)reject("FORBIDDEN","Active assignment participant required");return p;}
 private source(p:Principal,id:string,accepted=false,reviewId?:string){
  const e=this.db.prepare("SELECT * FROM enrollments WHERE id=? AND tenant=?").get(id,p.tenant) as any;
  if(!e||!e.assigned_by||e.status!=="in_progress"||e.completed_at||(e.assignment_state!=="active"&&!(accepted&&e.assignment_state==="withdrawn")))reject("FORBIDDEN","Active unfinished direct assignment required");
  if(e.award_binding_id)reject("FORBIDDEN","Use the exact award course binding review");
  this.principal(e.learner,p.tenant);
  if(e.assignment_cycle_id){
   const d=this.db.prepare("SELECT d.*,c.target_kind,c.target_id,c.plan_id,c.definition,p.state plan_state,p.owner,p.tenant FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id JOIN assignment_plans p ON p.id=c.plan_id WHERE d.cycle_id=? AND d.learner=?").get(e.assignment_cycle_id,e.learner) as any;
   const moved=accepted&&reviewId&&d?.review_id===reviewId&&this.db.prepare("SELECT 1 FROM assigned_quiz_reviews r JOIN enrollments n ON n.id=r.successor WHERE r.id=? AND r.source_enrollment=? AND r.state='accepted' AND n.id=? AND n.retake_of=? AND n.assignment_cycle_id=?").get(reviewId,e.id,d.enrollment_id,e.id,e.assignment_cycle_id);
   if(!d||d.tenant!==p.tenant||d.target_kind!=="course"||d.target_id!==e.course_id||d.state!=="active"||!["active","closed"].includes(d.plan_state)||!(d.enrollment_id===e.id||moved))reject("FORBIDDEN","Active root course cycle delivery required");
   const owner=this.principal(d.owner,p.tenant);if(!["admin","manager"].includes(owner.role)||(owner.role==="manager"&&this.principal(e.learner,p.tenant).manager_id!==owner.id))reject("FORBIDDEN","Current cycle plan owner required");
   const frozen=JSON.parse(d.definition);if(frozen.membership==="dynamic"){const people=new PeopleService(this.db);if(!people.members(owner,people.group(owner,frozen.groupId).definition).some(u=>u.id===e.learner))reject("FORBIDDEN","Active root course cycle delivery required");}
  }
  return e;
 }
 private coordinator(p:Principal,e:any){
  const learner=this.principal(e.learner,p.tenant);
  const owner=e.assignment_cycle_id?(this.db.prepare("SELECT p.owner FROM assignment_cycles c JOIN assignment_plans p ON p.id=c.plan_id WHERE c.id=? AND p.tenant=?").get(e.assignment_cycle_id,p.tenant) as any)?.owner:e.assigned_by;
  if(p.role!=="admin"&&!(p.role==="manager"&&learner.manager_id===p.id&&owner===p.id))reject("FORBIDDEN","Current assignment coordinator required");
 }
 private versions(p:Principal,e:any,mode="objective_only"){
  const course=this.db.prepare("SELECT * FROM courses WHERE id=? AND tenant=?").get(e.course_id,p.tenant) as any;
  if(!course||course.state!=="published")reject("FORBIDDEN","Course is not accepting new learning");
  const read=(version:number)=>{const row=this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(course.id,version) as any;if(!row)reject("NOT_FOUND","Course version unavailable");return JSON.parse(row.content);};
  const before=read(e.version),after=read(course.latest_version),access=new ContentAccess(this.db),learner=this.principal(e.learner,p.tenant);
  for(const who of [p,learner]){access.current(who,"course",course.id);access.requireVisible(who,"course",course.id,before);access.requireVisible(who,"course",course.id,after);}
  return {course,before,after,available:course.latest_version>e.version&&(mode==="fresh_course"?!hasPendingOfficialWork(this.db,e.id):objectiveUpgradeProfile(before,after)),mode,pendingOfficialWork:hasPendingOfficialWork(this.db,e.id)};
 }
 private latest(e:any,version:number){return this.db.prepare("SELECT * FROM assigned_quiz_reviews WHERE source_enrollment=? AND target_version=? AND tenant=? ORDER BY rowid DESC LIMIT 1").get(e.id,version,e.tenant) as any;}
 private review(p:Principal,id:string,accepted=false){
  const row=this.db.prepare("SELECT * FROM assigned_quiz_reviews WHERE id=? AND tenant=? AND learner=?").get(id,p.tenant,p.id) as any;
  if(!row||Date.parse(row.expires_at)<=Date.now()||!(row.state==="pending"||(accepted&&row.state==="accepted")))reject("FORBIDDEN","Own current assignment review required");
  const e=this.source(p,row.source_enrollment,accepted,row.id),owner=this.principal(row.owner,p.tenant);this.coordinator(owner,e);
  const value=this.versions(owner,e,row.restart_mode);this.versions(p,e,row.restart_mode);
  if(!value.available||value.course.latest_version!==row.target_version)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");
  if(row.state==="accepted"&&(!accepted||!row.successor||!this.db.prepare("SELECT 1 FROM enrollments WHERE id=? AND retake_of=? AND learner=? AND tenant=? AND version=?").get(row.successor,e.id,p.id,p.tenant,row.target_version)))reject("FORBIDDEN","Own current assignment review required");
  return {row,e};
 }
 authorize(p:Principal,name:string,a:any){
  if(name==="human_get_assigned_quiz_review"){const e=this.source(p,a.sourceEnrollmentId);if(e.learner!==p.id)this.coordinator(p,e);this.versions(p,e);}
  if(name==="human_offer_assigned_quiz_restart"){const e=this.source(p,a.sourceEnrollmentId);this.coordinator(p,e);const v=this.versions(p,e,a.mode??"objective_only");if(!v.available||a.targetVersion!==v.course.latest_version)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");
 const latest=this.latest(e,a.targetVersion),previous=a.previousReviewId??null;
 const immediate=latest&&latest.state==="pending"&&Date.parse(latest.expires_at)>Date.now()&&latest.owner===p.id&&latest.previous_review===previous&&latest.restart_mode===(a.mode??"objective_only");
 if(!immediate&&(latest?.id??null)!==previous)reject("STALE_CONTEXT","Assignment review changed; refresh before offering");
 if(!immediate&&latest&&latest.state==="pending"&&Date.parse(latest.expires_at)>Date.now())reject("INVALID_ARGUMENT","A current coordinator review already exists");
 if(latest?.state==="accepted")reject("FORBIDDEN","Accepted assignment review is immutable");
 }
  if(name==="human_cancel_assigned_quiz_review"){
 const row=this.db.prepare("SELECT * FROM assigned_quiz_reviews WHERE id=? AND tenant=?").get(a.reviewId,p.tenant) as any;
 if(!row||row.state==="accepted"||(row.owner!==p.id&&p.role!=="admin"))reject("FORBIDDEN","Own pending assignment review required");
 const e=this.source(p,row.source_enrollment);this.coordinator(p,e);this.versions(p,e);
 if(row.state==="cancelled"&&row.cancelled_by!==p.id)reject("FORBIDDEN","Own pending assignment review required");
 }
  if(name==="human_accept_assigned_quiz_restart"){const {row}=this.review(p,a.reviewId,true);if(a.targetVersion!==row.target_version||(a.mode??"objective_only")!==row.restart_mode)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");}
 }
 read(p:Principal,a:any){
  this.authorize(p,"human_get_assigned_quiz_review",a);const e=this.source(p,a.sourceEnrollmentId),initial=this.versions(p,e),row=this.latest(e,initial.course.latest_version);
  let offer=null;if(row&&row.state==="pending"){try{const owner=this.principal(row.owner,p.tenant);this.coordinator(owner,e);const reviewed=this.versions(owner,e,row.restart_mode);if(reviewed.available&&Date.parse(row.expires_at)>Date.now())offer={id:row.id,targetVersion:row.target_version,expiresAt:row.expires_at,mode:row.restart_mode};}catch{}}
  const mode=offer?.mode??(e.learner===p.id?"objective_only":a.mode??"objective_only"),v=this.versions(p,e,mode);
  const cycle=e.assignment_cycle_id?(this.db.prepare("SELECT id,plan_id,target_version FROM assignment_cycles WHERE id=?").get(e.assignment_cycle_id) as any):null;
  return {cycle:cycle?{id:cycle.id,planId:cycle.plan_id,originalTargetVersion:cycle.target_version}:null,sourceEnrollmentId:e.id,originalVersion:e.version,targetVersion:v.course.latest_version,title:v.after.title,summary:v.after.summary,mode,pendingOfficialWork:v.pendingOfficialWork,dueDate:e.due_date,assignedBy:e.assigned_by,completedLessonCount:JSON.parse(e.completed_lessons).length,available:v.available,offer,previousReviewId:row?.id??null,policy:"Direct assignment or active root course cycle delivery; separate current coordinator and learner confirmation of the exact mode. Due date, assigner and cycle remain. The original cycle definition and future cycles stay pinned; only this learner delivery moves to the reviewed version. Prior answers/results remain unchanged. Full-course mode carries zero progress and requires resolved assessor work/cancelled bookings."};
 }
 offer(p:Principal,a:any){
  this.authorize(p,"human_offer_assigned_quiz_restart",a);const e=this.source(p,a.sourceEnrollmentId);
  const latest=this.latest(e,a.targetVersion);if(latest&&latest.state==="pending"&&Date.parse(latest.expires_at)>Date.now())reject("INVALID_ARGUMENT","A current coordinator review already exists");
  if(Number(this.db.prepare("SELECT count(*) n FROM assigned_quiz_reviews WHERE tenant=?").get(p.tenant)!.n)>=5000)reject("INVALID_ARGUMENT","Assignment review quota reached");
  const id=randomUUID(),now=new Date().toISOString(),expiry=new Date(Date.now()+86400000).toISOString();
  this.db.prepare("INSERT INTO assigned_quiz_reviews(id,tenant,source_enrollment,owner,learner,target_version,created_at,expires_at,previous_review,restart_mode) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,p.tenant,e.id,p.id,e.learner,a.targetVersion,now,expiry,a.previousReviewId??null,a.mode??"objective_only");
  this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("learning:"+p.tenant+":"+e.learner);
  return {reviewId:id,sourceEnrollmentId:e.id,targetVersion:a.targetVersion,mode:a.mode??"objective_only",expiresAt:expiry,officialLearningChanged:false};
 }
 cancel(p:Principal,a:any){
  this.authorize(p,"human_cancel_assigned_quiz_review",a);
  const row=this.db.prepare("SELECT * FROM assigned_quiz_reviews WHERE id=? AND tenant=?").get(a.reviewId,p.tenant) as any;
  if(row.state!=="pending")reject("INVALID_ARGUMENT","Assignment review is no longer pending");
  this.db.prepare("UPDATE assigned_quiz_reviews SET state='cancelled',cancelled_by=? WHERE id=? AND state='pending'").run(p.id,row.id);
  this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("learning:"+p.tenant+":"+row.learner);
  return {reviewId:row.id,sourceEnrollmentId:row.source_enrollment,mode:row.restart_mode,state:"cancelled",officialLearningChanged:false};
 }
 accept(p:Principal,a:any){
  const {row,e}=this.review(p,a.reviewId);if(a.targetVersion!==row.target_version)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");
  if(this.db.prepare("SELECT 1 FROM enrollments WHERE retake_of=?").get(e.id))reject("INVALID_ARGUMENT","A successor already exists");
  const id=randomUUID();this.db.prepare("UPDATE enrollments SET assignment_state='withdrawn' WHERE id=?").run(e.id);
  this.db.prepare("INSERT INTO enrollments(id,tenant,learner,course_id,version,completed_lessons,retake_of,assigned_by,due_date,assignment_cycle_id) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,p.tenant,p.id,e.course_id,a.targetVersion,row.restart_mode==="fresh_course"?"[]":e.completed_lessons,e.id,e.assigned_by,e.due_date,e.assignment_cycle_id);
  this.db.prepare("UPDATE assigned_quiz_reviews SET state='accepted',successor=? WHERE id=? AND state='pending'").run(id,row.id);
  if(e.assignment_cycle_id){
   const updated=this.db.prepare("UPDATE assignment_deliveries SET enrollment_id=?,review_id=?,original_enrollment_id=COALESCE(original_enrollment_id,?) WHERE cycle_id=? AND learner=? AND enrollment_id=? AND state='active'").run(id,row.id,e.id,e.assignment_cycle_id,p.id,e.id);if(Number(updated.changes)!==1)reject("STALE_CONTEXT","Cycle delivery changed; refresh before restarting");
  }
  this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("library:"+p.tenant);
  return {assignmentCycleId:e.assignment_cycle_id,enrollmentId:id,reviewId:row.id,sourceEnrollmentId:e.id,version:a.targetVersion,mode:row.restart_mode,allProgressReset:row.restart_mode==="fresh_course",assignedBy:e.assigned_by,dueDate:e.due_date,answersReset:true,priorOfficialLearningPreserved:true};
 }
}
