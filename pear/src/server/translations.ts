import {ContentAccess} from "./content-access.ts";
import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {tokenHash} from "./integration-credentials.ts";
import {reject,boundedPage} from "./errors.ts";
export class TranslationService{
 constructor(readonly db:DatabaseSync){}
 private live(p:Principal,write=false){
  const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(p.id,p.tenant) as any;
  if(!a||a.auth_version!==p.auth_version)reject("UNAUTHORIZED","Active account required");
  if(write&&!["admin","content_admin"].includes(a.role))reject("FORBIDDEN","Translation review requires content administrator");
 }
 private source(p:Principal,kind:string,id:string){
  if(!["course","item"].includes(kind)||typeof id!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(id))reject("INVALID_ARGUMENT","Explicit content kind and ID required");
  const table=kind==="course"?"courses":"content_items",versions=kind==="course"?"course_versions":"content_item_versions",column=kind==="course"?"course_id":"item_id";
  const row=this.db.prepare("SELECT c.*,v.content FROM "+table+" c JOIN "+versions+" v ON v."+column+"=c.id AND v.version=c.latest_version WHERE c.tenant=? AND c.id=? AND c.state='published'").get(p.tenant,id) as any;
  if(!row)reject("NOT_FOUND","Published authorized content required");
  const value=JSON.parse(row.content);
  new ContentAccess(this.db).requireVisible(p,kind as "course"|"item",id,value);
  return {id:row.id,version:row.latest_version,title:value.title,language:value.language,license:value.license,aiProcessingAllowed:!!value.aiProcessingAllowed,provider:value.provider};
 }
 read(p:Principal,kind:string,sourceId:string,preferredLanguage:string,access="human"){
  this.live(p);if(!["en","vi"].includes(preferredLanguage))reject("INVALID_ARGUMENT","Supported preferredLanguage values: en, vi; other provider languages remain unsupported");
  const selected=this.source(p,kind,sourceId);
  const row=this.db.prepare("SELECT i.* FROM translation_identities i WHERE i.tenant=? AND i.kind=? AND (i.original_id=? OR i.id IN(SELECT identity_id FROM translation_variants WHERE tenant=? AND kind=? AND source_id=? AND active=1))").get(p.tenant,kind,sourceId,p.tenant,kind,sourceId) as any;
  if(!row)return {identityId:kind+":"+sourceId,original:selected,selectedId:sourceId,preferredId:selected.language===preferredLanguage?selected.id:null,preferredLanguage,variants:[{...selected,provenance:"original",disclosure:"Original authored content"}],unavailable:[] as any[],fallback:selected.language!==preferredLanguage,fallbackReason:selected.language===preferredLanguage?null:"No reviewed authorized variant in the requested language; original available",gaps:["Only reviewed en/vi authored variants are supported"]};
  let original:any=null;
  try{original=this.source(p,kind,row.original_id);}catch(e){if((e as any).code!=="NOT_FOUND")throw e;}
  const variants:any[]=original?[{...original,provenance:"original",disclosure:"Original authored content"}]:[],unavailable:any[]=[];
  for(const v of this.db.prepare("SELECT * FROM translation_variants WHERE identity_id=? AND tenant=? AND active=1 ORDER BY language,id").all(row.id,p.tenant) as any[]){
   let source:any;try{source=this.source(p,kind,v.source_id);}catch(e){if((e as any).code!=="NOT_FOUND")throw e;unavailable.push({language:v.language,reason:"Reviewed variant is unavailable"});continue;}
   if(source.version!==v.source_version||(original&&original.version!==v.original_version)||source.language!==v.language){unavailable.push({language:v.language,reason:"Published source changed; a new translation review is required"});continue;}
   variants.push({...source,provenance:v.provenance,...(access==="human"?{qualityReview:v.quality_review}:{}),humanQualityReviewed:true,disclosure:v.provenance==="ai_assisted_reviewed"?"AI-assisted derivative reviewed by a human":"Human-authored derivative reviewed by a human"});
  }
  const preferred=variants.find(v=>v.language===preferredLanguage),fallback=!preferred;
  return {identityId:row.id,original,selectedId:sourceId,preferredId:preferred?.id??null,preferredLanguage,variants,unavailable,fallback,fallbackReason:fallback?(original?"No reviewed authorized variant in the requested language; original available":"Original is unavailable; choose an available authorized source explicitly"):null,gaps:["Only reviewed en/vi authored variants are supported"]};
 }
 identityId(p:Principal,kind:string,id:string){
  const root=this.db.prepare("SELECT id FROM translation_identities WHERE tenant=? AND kind=? AND original_id=?").get(p.tenant,kind,id) as any;if(root)return root.id;
  const row=this.db.prepare("SELECT i.* ,v.original_version,v.source_version,v.language FROM translation_variants v JOIN translation_identities i ON i.id=v.identity_id WHERE v.tenant=? AND v.kind=? AND v.source_id=? AND v.active=1").get(p.tenant,kind,id) as any;
  if(row){try{const original=this.source(p,kind,row.original_id),source=this.source(p,kind,id);if(original.version===row.original_version&&source.version===row.source_version&&source.language===row.language)return row.id;}catch(e){if((e as any).code!=="NOT_FOUND")throw e;}}
  return kind+":"+id;
 }
 settings(p:Principal,offset=0){
  this.live(p,true);const rows=this.db.prepare("SELECT v.id,i.original_id AS originalId,v.kind,v.source_id AS sourceId,v.source_version AS sourceVersion,v.original_version AS originalVersion,v.language,v.provenance,v.quality_review AS qualityReview,v.active,v.created_at AS createdAt FROM translation_variants v JOIN translation_identities i ON i.id=v.identity_id WHERE v.tenant=? ORDER BY v.created_at,v.id").all(p.tenant);
  return boundedPage((rows as any[]).filter(row=>{
   if(p.role==="admin")return true;
   try{new ContentAccess(this.db).current(p,row.kind,row.originalId);new ContentAccess(this.db).current(p,row.kind,row.sourceId);return true;}catch{return false;}
  }),offset,20);
 }
 mutate(p:Principal,a:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p,true);
   if(!a||!["link","disable"].includes(a.action)||typeof a.reason!=="string"||!a.reason.trim()||a.reason.length>300||typeof a.key!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(a.key)||!Number.isSafeInteger(a.revision)||a.revision<0)reject("INVALID_ARGUMENT","Invalid reviewed translation");
   const allowed=a.action==="link"?["action","kind","originalId","sourceId","originalVersion","sourceVersion","provenance","qualityReview","reason","key","revision"]:["action","variantId","reason","key","revision"];
   if(Object.keys(a).some(k=>!allowed.includes(k)))reject("INVALID_ARGUMENT","Unsupported translation field");
   let original:any,variant:any,oldRow:any;
   if(a.action==="link"){
    original=this.source(p,a.kind,a.originalId);variant=this.source(p,a.kind,a.sourceId);
    if(a.originalId===a.sourceId||original.language===variant.language||original.license!=="self-authored"||variant.license!=="self-authored")reject("INVALID_ARGUMENT","Link distinct self-authored sources with different supported languages");
    if(!["human_authored","ai_assisted_reviewed"].includes(a.provenance)||typeof a.qualityReview!=="string"||!a.qualityReview.trim()||a.qualityReview.length>500)reject("INVALID_ARGUMENT","Explicit derivative provenance and human quality review required");
    if(this.db.prepare("SELECT 1 FROM translation_variants WHERE tenant=? AND kind=? AND source_id=? AND active=1").get(p.tenant,a.kind,a.originalId))reject("INVALID_ARGUMENT","Translation chains are not allowed; select the canonical original");
    if(this.db.prepare("SELECT 1 FROM translation_identities WHERE tenant=? AND kind=? AND original_id=?").get(p.tenant,a.kind,a.sourceId))reject("INVALID_ARGUMENT","A canonical original cannot become a derivative");
   }else{
    oldRow=this.db.prepare("SELECT * FROM translation_variants WHERE id=? AND tenant=?").get(a.variantId,p.tenant);
    if(!oldRow)reject("FORBIDDEN","Authorized translation required");
    const table=oldRow.kind==="course"?"courses":"content_items",source=this.db.prepare("SELECT draft FROM "+table+" WHERE tenant=? AND id=?").get(p.tenant,oldRow.source_id) as any;
    if(!source)reject("FORBIDDEN","Authorized translation source required");new ContentAccess(this.db).author(p,oldRow.kind,oldRow.source_id,JSON.parse(source.draft));
   }
   const doc="library:"+p.tenant,payload=tokenHash(JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k])=>k!=="revision"))));
   const previous=this.db.prepare("SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?").get(p.id,doc,a.key) as any;
   if(previous){if(previous.payload!==payload)reject("IDEMPOTENCY_CONFLICT","Translation request changed");const response=JSON.parse(previous.result),current=this.db.prepare("SELECT * FROM translation_variants WHERE id=? AND tenant=?").get(response.variantId,p.tenant) as any;if(!current)reject("FORBIDDEN","Authorized translation required");this.db.exec("COMMIT");return {...response,active:!!current.active};}
   if((this.db.prepare("SELECT revision FROM workspaces WHERE id=?").get(doc) as any).revision!==a.revision)reject("STALE_CONTEXT","Translation review changed; refresh");
   let id:string,identityId:string;
   if(a.action==="link"){
    if(original.version!==a.originalVersion||variant.version!==a.sourceVersion)reject("STALE_CONTEXT","Published source version changed; review again");
    const identity=this.db.prepare("SELECT * FROM translation_identities WHERE tenant=? AND kind=? AND original_id=?").get(p.tenant,a.kind,a.originalId) as any;
    identityId=identity?.id??randomUUID();
    if(!identity){
     if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM translation_identities WHERE tenant=?").get(p.tenant) as any).n)>=1000)reject("INVALID_ARGUMENT","Translation identity quota reached");
     this.db.prepare("INSERT INTO translation_identities VALUES(?,?,?,?,?)").run(identityId,p.tenant,a.kind,a.originalId,new Date().toISOString());
    }
    if(this.db.prepare("SELECT 1 FROM translation_variants WHERE active=1 AND ((tenant=? AND kind=? AND source_id=?) OR (identity_id=? AND language=?))").get(p.tenant,a.kind,a.sourceId,identityId,variant.language))reject("INVALID_ARGUMENT","Source/language already has an active reviewed translation");
    if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM translation_variants WHERE tenant=?").get(p.tenant) as any).n)>=2000)reject("INVALID_ARGUMENT","Translation review history quota reached");
    id=randomUUID();this.db.prepare("INSERT INTO translation_variants(id,identity_id,tenant,kind,source_id,source_version,original_version,language,provenance,quality_review,reviewer,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,identityId,p.tenant,a.kind,a.sourceId,a.sourceVersion,a.originalVersion,variant.language,a.provenance,a.qualityReview.trim(),p.id,new Date().toISOString());
   }else{id=oldRow.id;identityId=oldRow.identity_id;this.db.prepare("UPDATE translation_variants SET active=0 WHERE id=?").run(id);}
   const response={identityId,variantId:id,active:a.action==="link"};
   this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run(doc);
   this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(p.tenant,p.id,doc,"human_translation_"+a.action,JSON.stringify({identityId,variantId:id,sourceId:a.sourceId??null,originalId:a.originalId??null,sourceVersion:a.sourceVersion??null,originalVersion:a.originalVersion??null,provenance:a.provenance??null,reason:a.reason}),new Date().toISOString());
   this.db.prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)").run(p.id,doc,a.key,payload,JSON.stringify(response));
   this.db.exec("COMMIT");return response;
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
}
