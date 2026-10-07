import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {Principal} from "../shared/model.ts";
import {reject,boundedPage} from "./errors.ts";
export class ModerationAssignments{
 constructor(readonly db:DatabaseSync){}
 record(p:Principal,id:string){const row=this.db.prepare("SELECT r.*,e.tenant,e.award_id,e.learner FROM external_records r JOIN award_enrollments e ON e.id=r.enrollment_id WHERE r.id=? AND e.tenant=?").get(id,p.tenant) as any;if(!row)reject("FORBIDDEN","External record scope denied");return row;}
 assignment(id:string){return this.db.prepare("SELECT * FROM external_primary_assignments WHERE record_id=?").get(id) as any;}
 delegated(tenant:string,awardId:string,id:string){return !!this.db.prepare("SELECT 1 FROM accounts u JOIN award_assessors a ON a.assessor_id=u.id WHERE u.id=? AND u.tenant=? AND u.active=1 AND u.role='assessor' AND a.award_id=?").get(id,tenant,awardId);}
 canSee(p:Principal,row:any){if(row.tenant!==p.tenant)return false;if(p.role==="admin")return true;if(p.role!=="assessor"||!this.delegated(p.tenant,row.award_id,p.id))return false;const assignment=this.assignment(row.id);return !assignment||assignment.assessor_id===p.id;}
 requireDecision(p:Principal,row:any){if(!this.canSee(p,row))reject("FORBIDDEN","Primary assessor scope denied");const assignment=this.assignment(row.id);if(assignment&&assignment.assessor_id!==p.id)reject("FORBIDDEN","This pending evidence requires its designated primary assessor");}
 initialize(id:string,required:boolean){if(required)this.db.prepare("INSERT INTO external_primary_assignments(record_id) VALUES(?)").run(id);}
 metadata(id:string){const row=this.assignment(id);return {primaryRequired:!!row,primaryAssessorId:row?.assessor_id??null,assignmentVersion:row?.version??0};}
 authorize(p:Principal,name:string,a:any){
  if(name==="human_get_assessment_notices"||name==="human_read_assessment_notice"){
   if(!["admin","assessor"].includes(p.role))reject("FORBIDDEN","Assessor notice scope required");
   if(name==="human_read_assessment_notice"&&!this.db.prepare("SELECT 1 FROM moderation_assignment_notices WHERE id=? AND tenant=? AND principal=?").get(a.noticeId,p.tenant,p.id))reject("FORBIDDEN","Own notice required");
  }
  if(name!=="human_assign_external_assessor")return;
  if(p.role!=="admin")reject("FORBIDDEN","Tenant administrator assignment required");
  const row=this.record(p,a.recordId),assignment=this.assignment(row.id),version=assignment?.version??0;
  if(row.state!=="pending")reject("FORBIDDEN","Only pending evidence may be assigned");
  if(!this.delegated(p.tenant,row.award_id,a.assessorId))reject("FORBIDDEN","Existing active same-tenant delegated assessor required");
  if(!a.reason.trim())reject("INVALID_ARGUMENT","Assignment reason required");
  if(version!==a.expectedVersion&&!(version===a.expectedVersion+1&&assignment.assessor_id===a.assessorId&&assignment.updated_by===p.id))reject("STALE_CONTEXT","Primary assignment changed; refresh current record");
 }
 assign(p:Principal,a:any){
  this.authorize(p,"human_assign_external_assessor",a);const row=this.record(p,a.recordId),before=this.assignment(row.id),version=before?.version??0;
  if(version!==a.expectedVersion)reject("STALE_CONTEXT","Refresh current primary assignment before a new operation");
  if(version>=100)reject("INVALID_ARGUMENT","Operational quota of 100 primary assignments per record reached");
  const next=version+1,now=new Date().toISOString();
  this.db.prepare("INSERT INTO external_primary_assignments(record_id,assessor_id,version,updated_by,reason,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET assessor_id=excluded.assessor_id,version=excluded.version,updated_by=excluded.updated_by,reason=excluded.reason,updated_at=excluded.updated_at").run(row.id,a.assessorId,next,p.id,a.reason.trim(),now);
  if(before?.assessor_id&&before.assessor_id!==a.assessorId)this.notice(row,before.assessor_id,next,"removed",now);
  this.notice(row,a.assessorId,next,"assigned",now);return {recordId:row.id,primaryAssessorId:a.assessorId,assignmentVersion:next,officialGradeChanged:false};
 }
 private notice(row:any,principal:string,version:number,kind:string,now:string){
  this.db.prepare("INSERT INTO moderation_assignment_notices VALUES(?,?,?,?,?,?,?,NULL)").run(randomUUID(),row.tenant,principal,row.id,version,kind,now);
  this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("learning:"+row.tenant+":"+principal);
 }
 read(p:Principal,a:any){
  this.authorize(p,"human_get_assessment_notices",a);
  const rows=this.db.prepare("SELECT n.*,e.award_id FROM moderation_assignment_notices n JOIN external_records r ON r.id=n.record_id JOIN award_enrollments e ON e.id=r.enrollment_id WHERE n.tenant=? AND n.principal=? ORDER BY n.created_at DESC,n.id DESC").all(p.tenant,p.id) as any[];
  return boundedPage(rows.map(row=>{const assignment=this.assignment(row.record_id),current=row.kind==="assigned"&&assignment?.assessor_id===p.id&&assignment.version===row.assignment_version&&this.delegated(p.tenant,row.award_id,p.id);return {id:row.id,kind:current?"assigned":"removed",recordId:current?row.record_id:null,awardId:current?row.award_id:null,createdAt:row.created_at,readAt:row.read_at};}),a.offset??0,a.limit??20);
 }
 acknowledge(p:Principal,a:any){this.authorize(p,"human_read_assessment_notice",a);this.db.prepare("UPDATE moderation_assignment_notices SET read_at=COALESCE(read_at,?) WHERE id=? AND tenant=? AND principal=?").run(new Date().toISOString(),a.noticeId,p.tenant,p.id);return {noticeId:a.noticeId,read:true,officialGradeChanged:false};}
}
