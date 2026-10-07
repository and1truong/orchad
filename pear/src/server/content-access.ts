import {PeopleService} from "./people.ts";
import type {DatabaseSync} from "node:sqlite";
import type {Principal, SCORMReference} from "../shared/model.ts";
import {reject} from "./errors.ts";
export type ContentAudience={access?:"tenant"|"author"|"groups";groupIds?:string[]};
export type ContentKind="course"|"item";
export class ContentAccess {
 constructor(readonly db:DatabaseSync){}
 scormNew(p:Principal,ref?:SCORMReference){if(ref&&!this.db.prepare("SELECT 1 FROM scorm_engine_versions WHERE package_id=? AND version=? AND tenant=? AND sha256=? AND state='published'").get(ref.packageId,ref.version,p.tenant,ref.sha256))reject('FORBIDDEN','SCORM package is not accepting new learning');}
 owner(p:Pick<Principal,"tenant">,kind:ContentKind,id:string){return (this.db.prepare("SELECT owner FROM content_authors WHERE tenant=? AND kind=? AND content_id=?").get(p.tenant,kind,id) as any)?.owner;}
 register(p:Principal,kind:ContentKind,id:string){this.db.prepare("INSERT INTO content_authors VALUES(?,?,?,?)").run(p.tenant,kind,id,p.id);}
 visible(p:Principal,kind:ContentKind,id:string,value:ContentAudience){return (value.access??"tenant")==="tenant"||this.owner(p,kind,id)===p.id||value.access==="groups"&&!!value.groupIds?.some(groupId=>new PeopleService(this.db).isMember(p.tenant,groupId,p.id));}
 requireVisible(p:Principal,kind:ContentKind,id:string,value:ContentAudience){if(!this.visible(p,kind,id,value))reject("NOT_FOUND","Content is outside the current audience");}
 author(p:Principal,kind:ContentKind,id:string,draft:ContentAudience){if(!["admin","content_admin"].includes(p.role)||draft.access==="author"&&p.role!=="admin"&&this.owner(p,kind,id)!==p.id)reject("FORBIDDEN","Content author scope denied");}
 validate(p:Principal,value:ContentAudience){
  if(value.access==="groups"){
   if(!Array.isArray(value.groupIds)||!value.groupIds.length||value.groupIds.length>8||new Set(value.groupIds).size!==value.groupIds.length||value.groupIds.some(id=>!/^[A-Za-z0-9_-]{1,64}$/.test(id)||!this.db.prepare("SELECT 1 FROM learning_groups WHERE tenant=? AND id=?").get(p.tenant,id)))reject("INVALID_ARGUMENT","Select one to eight distinct existing own-tenant groups");
  }else if(value.groupIds!==undefined)reject("INVALID_ARGUMENT","Group IDs require the groups audience");
 }
 newCourse(p:Principal,id:string,version:number){
  this.enrolled(p,"course",id,version);this.current(p,"course",id);
  const value=JSON.parse((this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(id,version) as any).content);
  for(const lesson of value.lessons){this.scormNew(p,lesson.scorm);if(!lesson.contentRef)continue;const ref=lesson.contentRef;
   const row=this.db.prepare("SELECT c.state,v.content FROM content_items c JOIN content_item_versions v ON v.item_id=c.id AND v.version=? WHERE c.id=? AND c.tenant=?").get(ref.version,ref.itemId,p.tenant) as any;
   if(!row||row.state!=="published")reject("FORBIDDEN","Referenced content is not accepting new learning");
   this.requireVisible(p,"item",ref.itemId,JSON.parse(row.content));this.current(p,"item",ref.itemId);
  }
 }
 enrolled(p:Principal,kind:ContentKind,id:string,version:number){
  const table=kind==="course"?"course_versions":"content_item_versions",column=kind==="course"?"course_id":"item_id";
  const row=this.db.prepare("SELECT content FROM "+table+" WHERE "+column+"=? AND version=?").get(id,version) as any;
  if(!row)reject("NOT_FOUND","Pinned content unavailable");
  const value=JSON.parse(row.content) as ContentAudience;
  if(value.access==="groups")this.requireVisible(p,kind,id,value);
 }
 change(p:Principal,kind:ContentKind,id:string,value:ContentAudience){this.validate(p,value);if(value.access==="author"&&p.role!=="admin"&&this.owner(p,kind,id)!==p.id)reject("FORBIDDEN","Only the owner may restrict content to its author");}
 assetForAuthor(p:Principal,id:string){
  const asset=this.db.prepare("SELECT owner FROM assets WHERE id=? AND tenant=? AND purpose='content'").get(id,p.tenant) as any;
  if(!asset)return false;if(asset.owner===p.id||p.role==="admin")return true;
  if(p.role!=="content_admin")return false;
  const has=(value:any):boolean=>value.assetId===id||value.captions?.some((v:any)=>v.assetId===id)||value.lessons?.some((v:any)=>has(v));
  for(const kind of ["course","item"] as const){
    const table=kind==="course"?"courses":"content_items",versions=kind==="course"?"course_versions":"content_item_versions",column=kind==="course"?"course_id":"item_id";
    for(const row of this.db.prepare("SELECT id,draft FROM "+table+" WHERE tenant=?").all(p.tenant) as any[]){const value=JSON.parse(row.draft);if(this.visible(p,kind,row.id,value)&&has(value))return true;}
    for(const row of this.db.prepare("SELECT c.id,v.content FROM "+table+" c JOIN "+versions+" v ON v."+column+"=c.id WHERE c.tenant=?").all(p.tenant) as any[]){const value=JSON.parse(row.content);if(this.visible(p,kind,row.id,value)&&has(value))return true;}
  }
  return false;
 }
 current(p:Principal,kind:ContentKind,id:string){
  const table=kind==="course"?"courses":"content_items",versions=kind==="course"?"course_versions":"content_item_versions",column=kind==="course"?"course_id":"item_id";
  const row=this.db.prepare("SELECT v.content FROM "+table+" c JOIN "+versions+" v ON v."+column+"=c.id AND v.version=c.latest_version WHERE c.tenant=? AND c.id=?").get(p.tenant,id) as any;
  if(!row)reject("NOT_FOUND","Published content unavailable");
  this.requireVisible(p,kind,id,JSON.parse(row.content));
 }
 reference(p:Principal,kind:ContentKind,id:string,value:ContentAudience,rootAccess:string,rootOwner:string,currentRequired=true,rootGroups:string[]=[]){
  if(currentRequired)this.current(p,kind,id);
  this.requireVisible(p,kind,id,value);
  if(value.access==="groups"&&rootAccess!=="author"&&(rootAccess!=="groups"||!rootGroups.length||rootGroups.some(id=>!value.groupIds?.includes(id))))reject("FORBIDDEN","Group content cannot be redistributed outside its declared group audience");
  if(value.access==="author"&&(rootAccess!=="author"||this.owner(p,kind,id)!==rootOwner))reject("FORBIDDEN","Author-only content cannot be redistributed to a wider audience");
 }
}
