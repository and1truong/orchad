import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {reject} from "./errors.ts";
export type ContentKind="course"|"item";
export class ContentAccess {
 constructor(readonly db:DatabaseSync){}
 owner(p:Pick<Principal,"tenant">,kind:ContentKind,id:string){return (this.db.prepare("SELECT owner FROM content_authors WHERE tenant=? AND kind=? AND content_id=?").get(p.tenant,kind,id) as any)?.owner;}
 register(p:Principal,kind:ContentKind,id:string){this.db.prepare("INSERT INTO content_authors VALUES(?,?,?,?)").run(p.tenant,kind,id,p.id);}
 visible(p:Principal,kind:ContentKind,id:string,value:{access?:"tenant"|"author"}){return (value.access??"tenant")==="tenant"||this.owner(p,kind,id)===p.id;}
 requireVisible(p:Principal,kind:ContentKind,id:string,value:{access?:"tenant"|"author"}){if(!this.visible(p,kind,id,value))reject("NOT_FOUND","Content is outside the current audience");}
 author(p:Principal,kind:ContentKind,id:string,draft:{access?:"tenant"|"author"}){if(!["admin","content_admin"].includes(p.role)||draft.access==="author"&&p.role!=="admin"&&this.owner(p,kind,id)!==p.id)reject("FORBIDDEN","Content author scope denied");}
 change(p:Principal,kind:ContentKind,id:string,value:{access?:"tenant"|"author"}){if(value.access==="author"&&p.role!=="admin"&&this.owner(p,kind,id)!==p.id)reject("FORBIDDEN","Only the owner may restrict content to its author");}
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
 reference(p:Principal,kind:ContentKind,id:string,value:{access?:"tenant"|"author"},rootAccess:string,rootOwner:string,currentRequired=true){
  if(currentRequired)this.current(p,kind,id);
  this.requireVisible(p,kind,id,value);
  if(value.access==="author"&&(rootAccess!=="author"||this.owner(p,kind,id)!==rootOwner))reject("FORBIDDEN","Author-only content cannot be redistributed to a wider audience");
 }
}
