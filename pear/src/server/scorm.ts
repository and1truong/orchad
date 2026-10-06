import {randomUUID,randomBytes} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {tokenHash} from "./integration-credentials.ts";
import {inspectSCORM} from "./scorm-archive.ts";
import {reject,boundedPage} from "./errors.ts";
import {emptySCORMState,validSCORMState,scormTime,formatSCORMTime} from "../shared/scorm-state.ts";
export class SCORMService{
 constructor(readonly db:DatabaseSync){}
 private live(p:Principal,author=false){
  const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(p.id,p.tenant) as any;
  if(!a||a.auth_version!==p.auth_version)reject("UNAUTHORIZED","Active account required");
  if(author&&!["admin","content_admin"].includes(a.role))reject("FORBIDDEN","Content administrator required");
 }
 private metadata(r:any){return {id:r.id,title:r.title,language:r.language,filename:r.filename,sha256:r.sha256,size:r.bytes.length,expandedBytes:r.expanded_bytes,state:r.state,profile:"pear-scorm12-inline/1",license:"self-authored",tracking:"Package-reported status/score/time, separate from official Pear learning"};}
 private package(p:Principal,id:string){
  const row=this.db.prepare("SELECT * FROM scorm_packages WHERE id=? AND tenant=?").get(id,p.tenant) as any;
  if(!row)reject("NOT_FOUND","Authorized package unavailable");return row;
 }
 list(p:Principal,author=false,offset=0,limit=20){
  this.live(p,author);
  return boundedPage((this.db.prepare("SELECT * FROM scorm_packages WHERE tenant=? AND (?=1 OR state='published') ORDER BY title,id").all(p.tenant,author?1:0) as any[]).map(r=>this.metadata(r)),offset,limit);
 }
 private reviewed(a:any,allowed:string[]){
  if(!a||Object.keys(a).some(k=>!allowed.includes(k))||typeof a.key!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(a.key)||!Number.isSafeInteger(a.revision)||a.revision<0)reject("INVALID_ARGUMENT","Explicit reviewed package action required");
 }
 private previous(p:Principal,doc:string,key:string,payload:string){
  const old=this.db.prepare("SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?").get(p.id,doc,key) as any;
  if(old&&old.payload!==payload)reject("IDEMPOTENCY_CONFLICT","Package operation changed");return old?JSON.parse(old.result):null;
 }
 private cas(doc:string,revision:number){if((this.db.prepare("SELECT revision FROM workspaces WHERE id=?").get(doc) as any)?.revision!==revision)reject("STALE_CONTEXT","Package context changed; review again");}
 private finish(p:Principal,doc:string,key:string,payload:string,response:any,tool:string,args:any){
  this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run(doc);
  this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(p.tenant,p.id,doc,tool,JSON.stringify(args),new Date().toISOString());
  this.db.prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)").run(p.id,doc,key,payload,JSON.stringify(response));
 }
 import(p:Principal,a:any,bytes:Buffer){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p,true);this.reviewed(a,["filename","language","confirmed","key","revision"]);
   if(a.confirmed!==true||!["en","vi"].includes(a.language)||typeof a.filename!=="string"||!/^[\p{L}\p{N} _.-]{1,115}\.zip$/u.test(a.filename))reject("INVALID_ARGUMENT","Confirm self-authored ZIP and supported language");
   // Validate before storage/dedup: no extraction, execution or permissive retry of invalid bytes.
   const inspected=inspectSCORM(bytes),doc="library:"+p.tenant,payload=tokenHash(JSON.stringify({filename:a.filename,language:a.language,sha256:inspected.sha256}));
   const old=this.previous(p,doc,a.key,payload);if(old){const row=this.package(p,old.id);this.db.exec("COMMIT");return this.metadata(row);}
   this.cas(doc,a.revision);
   const media=this.db.prepare("SELECT COALESCE(SUM(length(bytes)),0) AS bytes,COUNT(*) AS n FROM assets WHERE tenant=?").get(p.tenant) as any,packages=this.db.prepare("SELECT COALESCE(SUM(length(bytes)+length(CAST(html AS BLOB))),0) AS bytes,COUNT(*) AS n FROM scorm_packages WHERE tenant=?").get(p.tenant) as any;
   if(Number(media.bytes)+Number(packages.bytes)+bytes.length+Buffer.byteLength(inspected.html)>128*1024*1024||Number(media.n)+Number(packages.n)>=512)reject("INVALID_ARGUMENT","Shared tenant upload quota reached");
   const id=randomUUID();
   this.db.prepare("INSERT INTO scorm_packages(id,tenant,owner,filename,title,language,sha256,bytes,html,expanded_bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id,p.tenant,p.id,a.filename,inspected.title,a.language,inspected.sha256,bytes,inspected.html,inspected.expandedBytes,new Date().toISOString());
   this.finish(p,doc,a.key,payload,{id},"human_scorm_import",{packageId:id,sha256:inspected.sha256,profile:inspected.profile});
   const row=this.package(p,id);this.db.exec("COMMIT");return this.metadata(row);
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 review(p:Principal,a:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p,true);this.reviewed(a,["action","packageId","sha256","reason","confirmed","key","revision"]);
   if(!["publish","retire"].includes(a.action)||a.confirmed!==true||typeof a.reason!=="string"||!a.reason.trim()||a.reason.length>300)reject("INVALID_ARGUMENT","Explicit package code/provenance review required");
   const row=this.package(p,a.packageId),doc="library:"+p.tenant,payload=tokenHash(JSON.stringify({action:a.action,packageId:a.packageId,sha256:a.sha256,reason:a.reason}));
   if(row.sha256!==a.sha256)reject("STALE_CONTEXT","Exact imported package hash required");
   const old=this.previous(p,doc,a.key,payload);if(old){this.db.exec("COMMIT");return {id:row.id,state:row.state};}
   this.cas(doc,a.revision);
   if(a.action==="publish"&&row.state!=="quarantined")reject("INVALID_ARGUMENT","Publish only an explicitly reviewed quarantined immutable package");
   if(a.action==="retire"&&row.state!=="published")reject("INVALID_ARGUMENT","Retire only a published package");
   const state=a.action==="publish"?"published":"retired";
   this.db.prepare("UPDATE scorm_packages SET state=?,review_reason=?,reviewer=? WHERE id=?").run(state,a.reason.trim(),p.id,row.id);
   this.finish(p,doc,a.key,payload,{id:row.id},"human_scorm_"+a.action,{packageId:row.id,sha256:row.sha256,reason:a.reason});
   this.db.exec("COMMIT");return {id:row.id,state};
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 export(p:Principal,id:string){this.live(p,true);const row=this.package(p,id);return {filename:row.filename,bytes:Buffer.from(row.bytes),sha256:row.sha256};}
 private record(p:Principal,id:string){
  const row=this.db.prepare("SELECT * FROM scorm_records WHERE id=? AND tenant=? AND learner=?").get(id,p.tenant,p.id) as any;
  if(!row)reject("FORBIDDEN","Own package record required");return row;
 }
 records(p:Principal,offset=0,limit=20){
  this.live(p);
  return boundedPage((this.db.prepare("SELECT r.*,p.title,p.language,p.state AS package_state FROM scorm_records r JOIN scorm_packages p ON p.id=r.package_id AND p.tenant=r.tenant WHERE r.learner=? AND r.tenant=? ORDER BY r.updated_at DESC,r.id").all(p.id,p.tenant) as any[]).map(r=>({id:r.id,packageId:r.package_id,title:r.title,language:r.language,packageState:r.package_state,revision:r.revision,state:JSON.parse(r.state),reportedSeconds:r.reported_seconds,updatedAt:r.updated_at,officialLearningChanged:false})),offset,limit);
 }
 start(p:Principal,sessionHash:string,a:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p);this.reviewed(a,["packageId","confirmed","key","revision"]);if(a.confirmed!==true)reject("INVALID_ARGUMENT","Human package tracking consent required");
   const pkg=this.package(p,a.packageId),existing=this.db.prepare("SELECT * FROM scorm_records WHERE learner=? AND package_id=? AND tenant=?").get(p.id,pkg.id,p.tenant) as any;
   if(pkg.state!=="published"&&!existing)reject("FORBIDDEN","Package is not accepting new launches");
   if(pkg.state==="quarantined")reject("FORBIDDEN","Quarantined package cannot execute");
   const doc="learning:"+p.tenant+":"+p.id,payload=tokenHash(JSON.stringify({action:"scorm_start",packageId:pkg.id})),old=this.previous(p,doc,a.key,payload);
   if(old){this.record(p,old.recordId);this.db.exec("COMMIT");return {...old,nonce:null,url:null,launchUnavailable:true};}
   this.cas(doc,a.revision);
   const id=existing?.id??randomUUID(),now=new Date().toISOString();
   if(!existing)this.db.prepare("INSERT INTO scorm_records(id,tenant,learner,package_id,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(id,p.tenant,p.id,pkg.id,JSON.stringify(emptySCORMState()),now,now);
   const launchId=randomUUID(),nonce=randomBytes(32).toString("hex"),ticket=randomBytes(32).toString("hex"),expires=Date.now()+8*3600000;
   this.db.prepare("DELETE FROM scorm_launches WHERE record_id=?").run(id);
   this.db.prepare("INSERT INTO scorm_launches(id,record_id,session_hash,nonce,ticket_hash,expires,ticket_expires) VALUES(?,?,?,?,?,?,?)").run(launchId,id,sessionHash,nonce,tokenHash(ticket),expires,Date.now()+60000);
   const response={recordId:id,launchId,recordRevision:existing?.revision??0};
   this.finish(p,doc,a.key,payload,response,"human_scorm_launch",{recordId:id,packageId:pkg.id});
   this.db.exec("COMMIT");return {...response,nonce,url:"/api/scorm/launch/"+launchId+"?ticket="+ticket,launchUnavailable:false};
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 private lease(p:Principal,sessionHash:string,id:string){
  const row=this.db.prepare("SELECT * FROM scorm_launches WHERE id=? AND session_hash=? AND expires>?").get(id,sessionHash,Date.now()) as any;
  if(!row)reject("FORBIDDEN","Live own package launch required");const record=this.record(p,row.record_id);return {row,record};
 }
 launch(p:Principal,sessionHash:string,id:string,ticket:string){
  this.live(p);const {row,record}=this.lease(p,sessionHash,id),pkg=this.package(p,record.package_id);
  if(typeof ticket!=="string"||ticket.length!==64||row.ticket_expires<Date.now()||tokenHash(ticket)!==row.ticket_hash)reject("FORBIDDEN","Bound package launch ticket required");
  return {html:pkg.html,launchId:row.id,nonce:row.nonce,recordId:record.id,recordRevision:record.revision,state:{...JSON.parse(record.state),"cmi.core.session_time":"0000:00:00.00"},readOnly:{"cmi.core.student_id":record.id,"cmi.core.student_name":"","cmi.core.lesson_mode":"normal","cmi.core.entry":record.revision>0?"resume":"ab-initio","cmi.core.total_time":formatSCORMTime(record.reported_seconds)},entry:record.revision>0?"resume":"ab-initio"};
 }
 commit(p:Principal,sessionHash:string,a:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p);
   if(!a||Object.keys(a).some(k=>!["launchId","nonce","recordId","recordRevision","state","key"].includes(k))||typeof a.key!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(a.key)||!Number.isSafeInteger(a.recordRevision)||a.recordRevision<0||!validSCORMState(a.state)||Buffer.byteLength(JSON.stringify(a.state))>8*1024||Buffer.byteLength(a.state["cmi.suspend_data"])>4096)reject("INVALID_ARGUMENT","Bounded package runtime state required");
   const {row,record}=this.lease(p,sessionHash,a.launchId);
   if(row.record_id!==a.recordId||row.nonce!==a.nonce)reject("FORBIDDEN","Package message binding changed");
   const doc="learning:"+p.tenant+":"+p.id,payload=tokenHash(JSON.stringify({action:"scorm_commit",launchId:a.launchId,recordId:a.recordId,state:a.state})),old=this.previous(p,doc,a.key,payload);
   if(old){this.db.exec("COMMIT");return old;}
   if(record.revision!==a.recordRevision)reject("STALE_CONTEXT","Package state changed; reopen and resume");
   const seconds=scormTime(a.state["cmi.core.session_time"])!;
   if(seconds<row.reported_seconds)reject("INVALID_ARGUMENT","Reported session time cannot go backwards");
   const delta=seconds-row.reported_seconds,revision=record.revision+1;
   this.db.prepare("UPDATE scorm_records SET state=?,revision=?,reported_seconds=reported_seconds+?,updated_at=? WHERE id=?").run(JSON.stringify(a.state),revision,delta,new Date().toISOString(),record.id);
   this.db.prepare("UPDATE scorm_launches SET reported_seconds=? WHERE id=?").run(seconds,row.id);
   const response={recordId:record.id,recordRevision:revision,reportedSeconds:record.reported_seconds+delta,officialLearningChanged:false};
   this.finish(p,doc,a.key,payload,response,"human_scorm_commit",{recordId:record.id,packageId:record.package_id,reportedStatus:a.state["cmi.core.lesson_status"],stateBytes:Buffer.byteLength(JSON.stringify(a.state))});
   this.db.exec("COMMIT");return response;
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
}
