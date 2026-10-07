import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {Principal} from "../shared/model.ts";
import {ProgramService} from "./programs.ts";
import {reject,boundedPage} from "./errors.ts";
const identifier=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
export class CollectionSharing{
 constructor(readonly db:DatabaseSync){}
 private admin(p:Principal){if(p.role!=="admin")reject("FORBIDDEN","Tenant administrator required");}
 private source(p:Principal,a:any){
  this.admin(p);const row=this.db.prepare("SELECT c.*,v.content FROM collections c JOIN collection_versions v ON v.collection_id=c.id AND v.version=? WHERE c.id=? AND c.tenant=?").get(a.sourceVersion,a.collectionId,p.tenant) as any;
  if(!row||row.state!=="published"||row.latest_version!==a.sourceVersion)reject("STALE_CONTEXT","Review the current published own-tenant collection");
  new ProgramService(this.db).authorize(p,"learning_get_collection",{collectionId:a.collectionId});
  const receiver=this.db.prepare("SELECT tenant FROM accounts WHERE id=? AND active=1 AND role='admin'").get(a.destinationAdminId) as any;
  if(!receiver||receiver.tenant!==a.destinationTenant||receiver.tenant===p.tenant||!identifier.test(a.destinationCollectionId))reject("FORBIDDEN","Explicit active other-tenant administrator and valid destination ID required");
  const value=JSON.parse(row.content),{groupIds,...body}=value;body.access="author";const refs=this.references(row.kind,body);
  if(refs.length>64)reject("INVALID_ARGUMENT","Collection offer supports at most 64 distinct local reference mappings");
  return {row,body};
 }
 private references(kind:string,body:any){const refs=(kind==="award"?body.requirements.flatMap((r:any)=>r.alternatives):body.items).filter((r:any)=>r.kind!=="external");return [...new Map(refs.map((r:any)=>[r.kind+":"+r.id,r])).values()] as any[];}
 private offer(p:Principal,id:string){this.admin(p);const row=this.db.prepare("SELECT * FROM original_collection_offers WHERE id=? AND ((source_tenant=? AND source_admin=?) OR (destination_tenant=? AND destination_admin=?))").get(id,p.tenant,p.id,p.tenant,p.id) as any;if(!row)reject("FORBIDDEN","Own addressed collection offer required");return row;}
 private activeOffer(row:any){
  if(row.state==="cancelled"||Date.parse(row.expires_at)<=Date.now())reject("FORBIDDEN","Collection offer cancelled or expired");
  const source=this.db.prepare("SELECT 1 FROM accounts u JOIN collections c ON c.id=? AND c.tenant=u.tenant WHERE u.id=? AND u.tenant=? AND u.active=1 AND u.role='admin' AND c.state='published'").get(row.source_collection,row.source_admin,row.source_tenant);
  if(!source)reject("FORBIDDEN","Current source administrator and published collection authority required");
  const principal=this.db.prepare("SELECT * FROM accounts WHERE id=?").get(row.source_admin) as unknown as Principal;new ProgramService(this.db).authorize(principal,"learning_get_collection",{collectionId:row.source_collection});
 }
 private mapped(p:Principal,row:any,a:any){
  const body=JSON.parse(row.snapshot),refs=this.references(row.kind,body),map=new Map<string,any>();
  for(const ref of a.references){const key=ref.kind+":"+ref.sourceId;if(map.has(key))reject("INVALID_ARGUMENT","Duplicate reference mapping");map.set(key,ref);}
  if(map.size!==refs.length||refs.some(ref=>!map.has(ref.kind+":"+ref.id)))reject("INVALID_ARGUMENT","Every original local reference requires exactly one destination mapping");
  const replace=(ref:any)=>{if(ref.kind==="external")return {...ref};const mapped=map.get(ref.kind+":"+ref.id),table=ref.kind==="award"?"collections":ref.kind==="course"?"courses":"content_items";
   const dest=this.db.prepare("SELECT * FROM "+table+" WHERE id=? AND tenant=? AND state='published'").get(mapped.destinationId,p.tenant) as any;
   if(!dest||dest.latest_version!==mapped.version||ref.kind==="award"&&dest.kind!=="award")reject("STALE_CONTEXT","Destination reference is unavailable or version changed");
   return {kind:ref.kind,id:mapped.destinationId};
  };
  if(row.kind==="award")body.requirements=body.requirements.map((r:any)=>({...r,alternatives:r.alternatives.map(replace)}));else body.items=body.items.map(replace);
  new ProgramService(this.db).validateSharedDraft(p,row.destination_collection,row.kind,body);return body;
 }
 authorize(p:Principal,name:string,a:any){
  if(!name.startsWith("human_")||!["human_offer_original_collection","human_get_original_collection_offers","human_cancel_original_collection_offer","human_accept_original_collection_offer"].includes(name))return;
  this.admin(p);if(name==="human_get_original_collection_offers")return;if(name==="human_offer_original_collection"){this.source(p,a);return;}
  const row=this.offer(p,a.offerId);
  if(name==="human_cancel_original_collection_offer"){
   if(row.source_tenant!==p.tenant||row.source_admin!==p.id||row.state==="accepted"||!a.reason.trim())reject("FORBIDDEN","Source pending offer and cancellation reason required");
   if(row.version!==a.expectedVersion&&!(row.state==="cancelled"&&row.version===a.expectedVersion+1))reject("STALE_CONTEXT","Offer version changed");return;
  }
  if(row.destination_tenant!==p.tenant||row.destination_admin!==p.id)reject("FORBIDDEN","Only explicitly addressed receiving administrator may accept");
  this.activeOffer(row);if(row.version!==a.expectedVersion&&!(row.state==="accepted"&&row.version===a.expectedVersion+1))reject("STALE_CONTEXT","Offer version changed");
  this.mapped(p,row,a);
  const existing=this.db.prepare("SELECT * FROM collections WHERE id=?").get(row.destination_collection) as any;
  if(existing&&!(row.state==="accepted"&&row.accepted_collection===existing.id&&existing.tenant===p.tenant&&existing.owner===p.id))reject("FORBIDDEN","Destination collection ID is occupied");
 }
 read(p:Principal,a:any){
  this.admin(p);const outgoing=a.direction==="outgoing";
  const rows=this.db.prepare("SELECT * FROM original_collection_offers WHERE "+(outgoing?"source_tenant=? AND source_admin=?":"destination_tenant=? AND destination_admin=?")+" ORDER BY created_at DESC,id DESC").all(p.tenant,p.id) as any[];
  return boundedPage(rows.map(row=>{let available=row.state==="pending";try{this.activeOffer(row);}catch{available=false;}return {id:row.id,sourceTenant:row.source_tenant,sourceCollection:available?row.source_collection:null,sourceVersion:available?row.source_version:null,destinationTenant:row.destination_tenant,destinationCollection:row.destination_collection,kind:row.kind,state:row.state,version:row.version,expiresAt:row.expires_at,expired:Date.parse(row.expires_at)<=Date.now(),available,definition:available?JSON.parse(row.snapshot):null,references:available?this.references(row.kind,JSON.parse(row.snapshot)):[]};}),a.offset??0,a.limit??20);
 }
 write(p:Principal,name:string,a:any){
  this.authorize(p,name,a);
  if(name==="human_offer_original_collection"){
   const {row,body}=this.source(p,a),count=this.db.prepare("SELECT count(*) n FROM original_collection_offers WHERE source_tenant=? AND source_admin=?").get(p.tenant,p.id) as any;
   if(count.n>=500)reject("INVALID_ARGUMENT","Operational quota of 500 original offers per source administrator reached");
   const id=randomUUID(),now=new Date().toISOString(),expiry=new Date(Date.now()+24*60*60*1000).toISOString();
   this.db.prepare("INSERT INTO original_collection_offers(id,source_tenant,source_admin,source_collection,source_version,destination_tenant,destination_admin,destination_collection,kind,snapshot,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,p.tenant,p.id,row.id,a.sourceVersion,a.destinationTenant,a.destinationAdminId,a.destinationCollectionId,row.kind,JSON.stringify(body),now,expiry);
   this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("library:"+a.destinationTenant);return {offerId:id,state:"pending",version:0,expiresAt:expiry,officialLearningTransferred:false};
  }
  const row=this.offer(p,a.offerId);if(row.state!=="pending"||row.version!==a.expectedVersion)reject("STALE_CONTEXT","Refresh current pending offer before a new operation");
  if(name==="human_cancel_original_collection_offer"){this.db.prepare("UPDATE original_collection_offers SET state='cancelled',version=version+1,cancelled_reason=? WHERE id=?").run(a.reason.trim(),row.id);this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("library:"+row.destination_tenant);return {offerId:row.id,state:"cancelled",version:1};}
  const body=this.mapped(p,row,a),programs=new ProgramService(this.db);
  const result=programs.write(p,row.kind==="award"?"learning_save_award":"learning_save_playlist",{collectionId:row.destination_collection,[row.kind]:body});
  this.db.prepare("UPDATE original_collection_offers SET state='accepted',version=version+1,accepted_collection=? WHERE id=?").run(row.destination_collection,row.id);this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("library:"+row.source_tenant);
  return {...result,offerId:row.id,state:"accepted",version:1,published:false,officialLearningTransferred:false,rightsTransferred:false};
 }
}
