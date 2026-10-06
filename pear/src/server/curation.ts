import type {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import type {Principal} from "../shared/model.ts";
import {reject,boundedPage,DomainError} from "./errors.ts";
export class CurationService {
 constructor(readonly db:DatabaseSync){}
 private target(p:Principal,kind:string,id:string,published=false){
  if(!["course","item"].includes(kind))reject("INVALID_ARGUMENT","Invalid content kind");
  const row=this.db.prepare(`SELECT * FROM ${kind==="course"?"courses":"content_items"} WHERE tenant=? AND id=?`).get(p.tenant,id) as any;
  if(!row||!row.latest_version||(published&&row.state!=="published"))reject("NOT_FOUND","Content unavailable");
  return row;
 }
 private metadata(p:Principal,kind:string,id:string){
  const row=this.target(p,kind,id,true);
  const content=JSON.parse((this.db.prepare(kind==="course"
    ?"SELECT content FROM course_versions WHERE course_id=? AND version=?"
    :"SELECT content FROM content_item_versions WHERE item_id=? AND version=?").get(id,row.latest_version) as any).content);
  return {kind,id,version:row.latest_version,title:content.title,summary:content.summary,
    language:content.language,provider:content.provider,license:content.license,
    ...(kind==="course"?{estimatedMinutes:content.duration}:{}),aiProcessingAllowed:content.aiProcessingAllowed};
 }
 private editor(p:Principal){if(!["admin","content_admin"].includes(p.role))reject("FORBIDDEN","Content administrator required");}
 authorize(p:Principal,name:string,a:any){
  if(["learning_get_curation","learning_save_curation","learning_preview_retirement","learning_retire_with_replacement"].includes(name)){
   this.editor(p);this.target(p,a.kind,a.contentId);
  }
 }
 private impact(p:Principal,a:any){
  const source=this.target(p,a.kind,a.contentId,true);
  if(a.contentId===a.replacementId)reject("INVALID_ARGUMENT","Replacement must be different content");
  const replacement=this.metadata(p,a.kind,a.replacementId);
  const original=this.metadata(p,a.kind,a.contentId);
  const table=a.kind==="course"?"enrollments":"item_enrollments",column=a.kind==="course"?"course_id":"item_id";
  const ledgers=this.db.prepare(`SELECT version,COUNT(*) AS total,SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed FROM ${table} WHERE tenant=? AND ${column}=? GROUP BY version ORDER BY version`).all(p.tenant,a.contentId) as any[];
  const contains=(value:any,seen=new Set<string>()):boolean=>{
   if(!value||typeof value!=="object")return false;
   if((value.kind===a.kind&&value.id===a.contentId)||(a.kind==="item"&&value.contentRef?.itemId===a.contentId))return true;
   if(value.kind==="award"&&value.id&&value.version){
    const key=value.id+":"+value.version;
    if(!seen.has(key)){
     seen.add(key);
     const nested=this.db.prepare("SELECT v.content FROM collection_versions v JOIN collections c ON c.id=v.collection_id WHERE c.tenant=? AND v.collection_id=? AND v.version=?").get(p.tenant,value.id,value.version) as any;
     if(nested&&contains(JSON.parse(nested.content),seen))return true;
    }
   }
   return Object.values(value).some(child=>contains(child,seen));
  };
  const courseRefs=a.kind==="item"?(this.db.prepare("SELECT v.course_id,v.version,v.content FROM course_versions v JOIN courses c ON c.id=v.course_id WHERE c.tenant=? ORDER BY v.course_id,v.version").all(p.tenant) as any[]).filter(v=>contains(JSON.parse(v.content))).map(v=>({id:v.course_id,version:v.version})):[];
  const collectionRefs=(this.db.prepare("SELECT v.collection_id,v.version,v.content FROM collection_versions v JOIN collections c ON c.id=v.collection_id WHERE c.tenant=? ORDER BY v.collection_id,v.version").all(p.tenant) as any[]).filter(v=>contains(JSON.parse(v.content))).map(v=>({id:v.collection_id,version:v.version}));
  const plans=a.kind==="course"?this.db.prepare("SELECT id,state,target_version,next_run FROM assignment_plans WHERE tenant=? AND json_extract(definition,'$.targetKind')='course' AND json_extract(definition,'$.targetId')=? ORDER BY id").all(p.tenant,a.contentId):[];
  const snapshot={tenant:p.tenant,kind:a.kind,contentId:a.contentId,sourceVersion:source.latest_version,replacement,ledgers,courseRefs,collectionRefs,plans};
  return {source:original,replacement,previewHash:createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
    impact:{pinnedEnrollments:ledgers.reduce((n,v)=>n+Number(v.total),0),completedEnrollments:ledgers.reduce((n,v)=>n+Number(v.completed),0),
     pinnedCourseVersions:courseRefs.length,pinnedCollectionVersions:collectionRefs.length,assignmentPlans:plans.length},
    warnings:["Existing versions, progress and certificates stay pinned; learners choose replacements explicitly.",
      "Published pinned course/award references remain historical; no references or assignment plans are automatically rewritten.",
      ...(plans.length?["Future assignment jobs for the retired source become unavailable until a separate reviewed plan change."]:[]),
      ...(original.language!==replacement.language?["Replacement language differs from the source."]:[])]};
 }
 read(p:Principal,name:string,a:any){
  if(name==="learning_get_curation"){
   const source=this.target(p,a.kind,a.contentId);
   const policy=this.db.prepare("SELECT endorsed,featured,spotlight,retiring,replacement_id FROM content_curation WHERE tenant=? AND kind=? AND content_id=?").get(p.tenant,a.kind,a.contentId) as any;
   return {state:source.state,version:source.latest_version,policy:policy??{endorsed:0,featured:0,spotlight:0,retiring:0,replacement_id:null}};
  }
  if(name==="learning_preview_retirement")return this.impact(p,a);
  if(name==="learning_get_retirement_alternative"){
   const source=this.target(p,a.kind,a.contentId);
   if(source.state!=="retired")reject("NOT_FOUND","Source is not retired");
   const policy=this.db.prepare("SELECT replacement_id FROM content_curation WHERE tenant=? AND kind=? AND content_id=?").get(p.tenant,a.kind,a.contentId) as any;
   if(!policy?.replacement_id)return {available:false,reason:"No reviewed replacement is configured."};
   try{return {available:true,replacement:this.metadata(p,a.kind,policy.replacement_id),automaticMigration:false};}
   catch(e){if(e instanceof DomainError && e.code==="NOT_FOUND")return {available:false,reason:"Reviewed replacement is no longer available."};throw e;}
  }
  const rows=(this.db.prepare("SELECT * FROM content_curation WHERE tenant=? AND (endorsed=1 OR featured=1 OR spotlight=1) ORDER BY spotlight DESC,featured DESC,endorsed DESC,kind,content_id").all(p.tenant) as any[]).flatMap(r=>{
   try{return [{...this.metadata(p,r.kind,r.content_id),endorsed:!!r.endorsed,featured:!!r.featured,spotlight:!!r.spotlight,retiring:!!r.retiring,
    reasons:[...(r.spotlight?["Organization spotlight"]:[]),...(r.featured?["Organization featured"]:[]),...(r.endorsed?["Organization endorsed"]:[])]}];}catch(e){if(e instanceof DomainError && e.code==="NOT_FOUND")return [];throw e;}
  });
  return boundedPage(rows,a.offset??0,a.limit??20);
 }
 write(p:Principal,name:string,a:any){
  this.editor(p);
  if(name==="learning_save_curation"){
   this.target(p,a.kind,a.contentId,true);
   this.db.prepare("INSERT INTO content_curation VALUES(?,?,?,?,?,?,?,NULL,?) ON CONFLICT(tenant,kind,content_id) DO UPDATE SET endorsed=excluded.endorsed,featured=excluded.featured,spotlight=excluded.spotlight,retiring=excluded.retiring,updated_at=excluded.updated_at")
    .run(p.tenant,a.kind,a.contentId,Number(a.policy.endorsed),Number(a.policy.featured),Number(a.policy.spotlight),Number(a.policy.retiring),new Date().toISOString());
   return this.read(p,"learning_get_curation",a);
  }
  const review=this.impact(p,a);
  if(review.previewHash!==a.previewHash)reject("STALE_CONTEXT","Retirement impact changed; preview the exact replacement again");
  this.db.prepare(`UPDATE ${a.kind==="course"?"courses":"content_items"} SET state='retired' WHERE tenant=? AND id=?`).run(p.tenant,a.contentId);
  this.db.prepare("INSERT INTO content_curation VALUES(?,?,?,0,0,0,0,?,?) ON CONFLICT(tenant,kind,content_id) DO UPDATE SET endorsed=0,featured=0,spotlight=0,retiring=0,replacement_id=excluded.replacement_id,updated_at=excluded.updated_at").run(p.tenant,a.kind,a.contentId,a.replacementId,new Date().toISOString());
  return {kind:a.kind,contentId:a.contentId,state:"retired",replacement:review.replacement,existingLearningPreserved:true,automaticMigration:false};
 }
}
