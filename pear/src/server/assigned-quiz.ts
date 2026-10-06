import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {Principal} from "../shared/model.ts";
import {ContentAccess} from "./content-access.ts";
import {objectiveUpgradeProfile} from "./retakes.ts";
import {reject} from "./errors.ts";
export class AssignedQuiz{
 constructor(readonly db:DatabaseSync){}
 private principal(id:string,tenant:string){const p=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(id,tenant) as unknown as Principal;if(!p)reject("FORBIDDEN","Active assignment participant required");return p;}
 private source(p:Principal,id:string,accepted=false){
  const e=this.db.prepare("SELECT * FROM enrollments WHERE id=? AND tenant=?").get(id,p.tenant) as any;
  if(!e||!e.assigned_by||e.assignment_cycle_id||e.status!=="in_progress"||e.completed_at||(e.assignment_state!=="active"&&!(accepted&&e.assignment_state==="withdrawn")))reject("FORBIDDEN","Active unfinished direct assignment required");
  this.principal(e.learner,p.tenant);return e;
 }
 private coordinator(p:Principal,e:any){
  const learner=this.principal(e.learner,p.tenant);
  if(p.role!=="admin"&&!(p.role==="manager"&&learner.manager_id===p.id&&e.assigned_by===p.id))reject("FORBIDDEN","Current assignment coordinator required");
 }
 private versions(p:Principal,e:any){
  const course=this.db.prepare("SELECT * FROM courses WHERE id=? AND tenant=?").get(e.course_id,p.tenant) as any;
  if(!course||course.state!=="published")reject("FORBIDDEN","Course is not accepting new learning");
  const read=(version:number)=>{const row=this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(course.id,version) as any;if(!row)reject("NOT_FOUND","Course version unavailable");return JSON.parse(row.content);};
  const before=read(e.version),after=read(course.latest_version),access=new ContentAccess(this.db),learner=this.principal(e.learner,p.tenant);
  for(const who of [p,learner]){access.current(who,"course",course.id);access.requireVisible(who,"course",course.id,before);access.requireVisible(who,"course",course.id,after);}
  return {course,before,after,available:course.latest_version>e.version&&objectiveUpgradeProfile(before,after)};
 }
 private review(p:Principal,id:string,accepted=false){
  const row=this.db.prepare("SELECT * FROM assigned_quiz_reviews WHERE id=? AND tenant=? AND learner=?").get(id,p.tenant,p.id) as any;
  if(!row||Date.parse(row.expires_at)<=Date.now()||(!accepted&&row.state!=="pending"))reject("FORBIDDEN","Own current assignment review required");
  const e=this.source(p,row.source_enrollment,accepted),owner=this.principal(row.owner,p.tenant);this.coordinator(owner,e);
  const value=this.versions(owner,e);this.versions(p,e);
  if(!value.available||value.course.latest_version!==row.target_version)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");
  if(row.state==="accepted"&&(!accepted||!row.successor||!this.db.prepare("SELECT 1 FROM enrollments WHERE id=? AND retake_of=? AND learner=? AND tenant=? AND version=?").get(row.successor,e.id,p.id,p.tenant,row.target_version)))reject("FORBIDDEN","Own current assignment review required");
  return {row,e};
 }
 authorize(p:Principal,name:string,a:any){
  if(name==="human_get_assigned_quiz_review"){const e=this.source(p,a.sourceEnrollmentId);if(e.learner!==p.id)this.coordinator(p,e);this.versions(p,e);}
  if(name==="human_offer_assigned_quiz_restart"){const e=this.source(p,a.sourceEnrollmentId);this.coordinator(p,e);const v=this.versions(p,e);if(!v.available||a.targetVersion!==v.course.latest_version)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");}
  if(name==="human_accept_assigned_quiz_restart"){const {row}=this.review(p,a.reviewId,true);if(a.targetVersion!==row.target_version)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");}
 }
 read(p:Principal,a:any){
  this.authorize(p,"human_get_assigned_quiz_review",a);const e=this.source(p,a.sourceEnrollmentId),v=this.versions(p,e),row=this.db.prepare("SELECT * FROM assigned_quiz_reviews WHERE source_enrollment=? AND target_version=? AND tenant=?").get(e.id,v.course.latest_version,p.tenant) as any;
  let offer=null;if(row&&row.state==="pending"){try{const owner=this.principal(row.owner,p.tenant);this.coordinator(owner,e);this.versions(owner,e);if(Date.parse(row.expires_at)>Date.now())offer={id:row.id,targetVersion:row.target_version,expiresAt:row.expires_at};}catch{}}
  return {sourceEnrollmentId:e.id,originalVersion:e.version,targetVersion:v.course.latest_version,title:v.after.title,dueDate:e.due_date,assignedBy:e.assigned_by,completedLessonCount:JSON.parse(e.completed_lessons).length,available:v.available,offer,policy:"Direct assignment only; separate current coordinator and learner confirmation. Due date, assigner and prior answers/results remain unchanged. Cycle, event, submission, essay and nonquiz changes are unsupported."};
 }
 offer(p:Principal,a:any){
  this.authorize(p,"human_offer_assigned_quiz_restart",a);const e=this.source(p,a.sourceEnrollmentId);
  if(this.db.prepare("SELECT 1 FROM assigned_quiz_reviews WHERE source_enrollment=? AND target_version=?").get(e.id,a.targetVersion))reject("INVALID_ARGUMENT","A coordinator review already exists for this version");
  if(Number(this.db.prepare("SELECT count(*) n FROM assigned_quiz_reviews WHERE tenant=?").get(p.tenant)!.n)>=5000)reject("INVALID_ARGUMENT","Assignment review quota reached");
  const id=randomUUID(),now=new Date().toISOString(),expiry=new Date(Date.now()+86400000).toISOString();
  this.db.prepare("INSERT INTO assigned_quiz_reviews(id,tenant,source_enrollment,owner,learner,target_version,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)").run(id,p.tenant,e.id,p.id,e.learner,a.targetVersion,now,expiry);
  this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("learning:"+p.tenant+":"+e.learner);
  return {reviewId:id,sourceEnrollmentId:e.id,targetVersion:a.targetVersion,expiresAt:expiry,officialLearningChanged:false};
 }
 accept(p:Principal,a:any){
  const {row,e}=this.review(p,a.reviewId);if(a.targetVersion!==row.target_version)reject("STALE_CONTEXT","Assigned quiz target changed; request a new coordinator review");
  if(this.db.prepare("SELECT 1 FROM enrollments WHERE retake_of=?").get(e.id))reject("INVALID_ARGUMENT","A successor already exists");
  const id=randomUUID();this.db.prepare("UPDATE enrollments SET assignment_state='withdrawn' WHERE id=?").run(e.id);
  this.db.prepare("INSERT INTO enrollments(id,tenant,learner,course_id,version,completed_lessons,retake_of,assigned_by,due_date) VALUES(?,?,?,?,?,?,?,?,?)").run(id,p.tenant,p.id,e.course_id,a.targetVersion,e.completed_lessons,e.id,e.assigned_by,e.due_date);
  this.db.prepare("UPDATE assigned_quiz_reviews SET state='accepted',successor=? WHERE id=? AND state='pending'").run(id,row.id);
  this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("library:"+p.tenant);
  return {enrollmentId:id,reviewId:row.id,sourceEnrollmentId:e.id,version:a.targetVersion,assignedBy:e.assigned_by,dueDate:e.due_date,answersReset:true,priorOfficialLearningPreserved:true};
 }
}
