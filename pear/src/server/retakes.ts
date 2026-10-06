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
}
