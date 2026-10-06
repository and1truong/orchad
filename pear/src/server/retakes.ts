import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {Principal} from "../shared/model.ts";
import {ContentAccess} from "./content-access.ts";
import {reject} from "./errors.ts";
export class RetakeService{
 constructor(readonly db:DatabaseSync){}
 private source(p:Principal,id:string){
  const e=this.db.prepare("SELECT * FROM enrollments WHERE id=? AND learner=? AND tenant=?").get(id,p.id,p.tenant) as any;
  if(!e)reject("FORBIDDEN","Own enrollment required");
  if(e.status!=="completed"||!e.completed_at)reject("FORBIDDEN","Only completed learning may be retaken");
  return e;
 }
 private course(p:Principal,e:any){const c=this.db.prepare("SELECT * FROM courses WHERE id=? AND tenant=?").get(e.course_id,p.tenant) as any;if(!c)reject("NOT_FOUND","Course unavailable");return c;}
 private value(id:string,version:number){const r=this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(id,version) as any;if(!r)reject("NOT_FOUND","Course version unavailable");return JSON.parse(r.content);}
 authorize(p:Principal,name:string,a:any){
  if(["human_get_latest_quiz_options","human_restart_latest_quiz"].includes(name)){this.upgradeSource(p,a.enrollmentId);if(name==="human_restart_latest_quiz"){const review=this.readUpgrade(p,a);if(!review.acceptingNewLearning||(!review.available&&!(review.successor?.version===a.targetVersion&&this.upgradeSource(p,a.enrollmentId).assignment_state==="withdrawn"))||a.targetVersion!==review.targetVersion)reject("STALE_CONTEXT","Latest quiz upgrade is unavailable or changed; review again");}return;}
  if(!["human_get_course_retake_options","human_retake_completed_course"].includes(name))return;
  const e=this.source(p,a.enrollmentId);
  if(name==="human_retake_completed_course"){
   const c=this.course(p,e);if(c.state!=="published")reject("FORBIDDEN","Course is not accepting new learning");
   const version=a.mode==="enrolled"?e.version:c.latest_version;
   if(a.targetVersion!==version)reject("STALE_CONTEXT","Chosen course version changed; review options again");
   new ContentAccess(this.db).requireVisible(p,"course",c.id,this.value(c.id,version));
  }
 }
 read(p:Principal,a:any){
  const e=this.source(p,a.enrollmentId),c=this.course(p,e),access=new ContentAccess(this.db);
  const existing=this.db.prepare("SELECT id,version,status FROM enrollments WHERE retake_of=? AND learner=? AND tenant=?").get(e.id,p.id,p.tenant) as any;
  return {enrollmentId:e.id,courseId:c.id,originalVersion:e.version,existingRetake:existing??null,options:(["enrolled","latest"] as const).flatMap(mode=>{
   const version=mode==="enrolled"?e.version:c.latest_version,value=this.value(c.id,version);
   if(!access.visible(p,"course",c.id,value))return [];
   return [{mode,version,title:value.title,available:c.state==="published"&&!existing}];
  }),policy:"New self-directed record; no inherited answers, progress, bookings, due dates or award obligations. Prior official learning and certificates remain unchanged."};
 }
 write(p:Principal,a:any){
  this.authorize(p,"human_retake_completed_course",a);const e=this.source(p,a.enrollmentId);
  if(this.db.prepare("SELECT 1 FROM enrollments WHERE retake_of=?").get(e.id))reject("INVALID_ARGUMENT","A retake already exists; continue that record");
  const id=randomUUID();this.db.prepare("INSERT INTO enrollments(id,tenant,learner,course_id,version,retake_of) VALUES(?,?,?,?,?,?)").run(id,p.tenant,p.id,e.course_id,a.targetVersion,e.id);
  return {enrollmentId:id,courseId:e.course_id,version:a.targetVersion,retakeOf:e.id,priorOfficialLearningPreserved:true,selfDirected:true};
 }

 private upgradeSource(p:Principal,id:string){
  const e=this.db.prepare("SELECT * FROM enrollments WHERE id=? AND learner=? AND tenant=?").get(id,p.id,p.tenant) as any;
  if(!e||e.status!=="in_progress"||e.completed_at||e.assigned_by||e.assignment_cycle_id)reject("FORBIDDEN","Own unfinished self-directed learning required");
  new ContentAccess(this.db).enrolled(p,"course",e.course_id,e.version);
  if(e.assignment_state!=="active"&&!(e.assignment_state==="withdrawn"&&this.db.prepare("SELECT 1 FROM enrollments WHERE retake_of=?").get(e.id)))reject("FORBIDDEN","Active unfinished learning required");
  return e;
 }
 readUpgrade(p:Principal,a:any){
  const e=this.upgradeSource(p,a.enrollmentId),c=this.course(p,e),before=this.value(c.id,e.version),after=this.value(c.id,c.latest_version),access=new ContentAccess(this.db);
  access.requireVisible(p,"course",c.id,after);
  const eligible=objectiveUpgradeProfile(before,after);
  const successor=this.db.prepare("SELECT id,version FROM enrollments WHERE retake_of=?").get(e.id) as any;
  return {enrollmentId:e.id,courseId:c.id,originalVersion:e.version,targetVersion:c.latest_version,acceptingNewLearning:c.state==="published",available:c.state==="published"&&c.latest_version>e.version&&eligible&&e.assignment_state==="active"&&!successor,successor:successor??null,completedLessonCount:JSON.parse(e.completed_lessons).length,policy:"Explicit objective-quiz-only upgrade for unfinished self-directed learning. A new immutable record retains identical completed lessons and resets answers; old answers and results remain in withdrawn history. Assigned/event/submission/essay or nonquiz edits are unsupported."};
 }
 writeUpgrade(p:Principal,a:any){
  this.authorize(p,"human_restart_latest_quiz",a);const e=this.upgradeSource(p,a.enrollmentId),id=randomUUID();
  if(this.db.prepare("SELECT 1 FROM enrollments WHERE retake_of=?").get(e.id))reject("INVALID_ARGUMENT","A successor already exists");
  this.db.prepare("UPDATE enrollments SET assignment_state='withdrawn' WHERE id=?").run(e.id);
  this.db.prepare("INSERT INTO enrollments(id,tenant,learner,course_id,version,completed_lessons,retake_of) VALUES(?,?,?,?,?,?,?)").run(id,p.tenant,p.id,e.course_id,a.targetVersion,e.completed_lessons,e.id);
  return {enrollmentId:id,courseId:e.course_id,version:a.targetVersion,priorEnrollmentId:e.id,completedLessonsPreserved:JSON.parse(e.completed_lessons).length,answersReset:true,priorOfficialLearningPreserved:true};
 }
}

export function objectiveUpgradeProfile(before:any,after:any){
 const stable=(v:any):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
 const withoutQuiz=(v:any)=>{const {quiz,...body}=v;return body;};
 return !!before.quiz&&!!after.quiz&&!before.quiz.questions.some((q:any)=>q.kind==="long_answer")&&!after.quiz.questions.some((q:any)=>q.kind==="long_answer")&&!before.lessons.some((l:any)=>["event","submission"].includes(l.kind))&&stable(withoutQuiz(before))===stable(withoutQuiz(after));
}
