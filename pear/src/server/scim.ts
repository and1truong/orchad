import {randomUUID,randomBytes,scryptSync} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {IntegrationCredentials,tokenHash} from "./integration-credentials.ts";
import {PeopleService} from "./people.ts";
const prefix="urn:ietf:params:scim:";
export const userURN=prefix+"schemas:core:2.0:User",groupURN=prefix+"schemas:core:2.0:Group";
export class SCIMError extends Error{
 constructor(readonly status:number,message:string,readonly scimType?:string){super(message);}
}
function fail(status:number,message:string,type?:string):never{throw new SCIMError(status,message,type);}
function record(v:any){if(!v||typeof v!=="object"||Array.isArray(v))fail(400,"Object required","invalidSyntax");return v;}
function text(v:any,max=120){if(typeof v!=="string"||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/u.test(v))fail(400,"Invalid bounded string","invalidValue");return v.trim();}
const userKey=(v:string)=>v.normalize("NFKC").toLowerCase();
export class SCIMService{
 readonly credentials:IntegrationCredentials;readonly people:PeopleService;
 constructor(readonly db:DatabaseSync,readonly origin:string){this.credentials=new IntegrationCredentials(db);this.people=new PeopleService(db);}
 private table(kind:string){if(!["Users","Groups"].includes(kind))fail(404,"Resource type unavailable");return kind==="Users"?"scim_users":"scim_groups";}
 private row(client:any,kind:string,id:string,includeDeleted=false){
  const row=this.db.prepare("SELECT * FROM "+this.table(kind)+" WHERE id=? AND tenant=? AND client_id=?"+(includeDeleted?"":" AND deleted=0")).get(id,client.tenant,client.id) as any;
  if(!row)fail(404,"Managed resource unavailable");return row;
 }
 private account(row:any){const a=this.db.prepare("SELECT a.*,p.preferred_language,p.interests,p.custom_fields FROM accounts a LEFT JOIN user_profiles p ON p.user_id=a.id WHERE a.id=? AND a.tenant=?").get(row.user_id,row.tenant) as any;if(!a)fail(404,"Managed account unavailable");return a;}
 private group(row:any){const g=this.db.prepare("SELECT * FROM learning_groups WHERE id=? AND tenant=?").get(row.group_id,row.tenant) as any;if(!g)fail(404,"Managed group unavailable");return g;}
 private resource(row:any,kind:string){
  let fields:any;
  if(kind==="Users"){const a=this.account(row);fields={schemas:[userURN],id:row.id,userName:row.user_name,displayName:a.name,active:!!a.active,preferredLanguage:a.preferred_language??"en"};}
  else{const g=this.group(row),definition=JSON.parse(g.definition);fields={schemas:[groupURN],id:row.id,displayName:g.name,members:(this.db.prepare("SELECT id,user_id FROM scim_users WHERE client_id=? AND tenant=? AND deleted=0 ORDER BY id").all(row.client_id,row.tenant) as any[]).filter(u=>definition.memberIds.includes(u.user_id)).map(u=>({value:u.id}))};}
  if(row.external_id!==null)fields.externalId=row.external_id;
  const security=kind==="Users"?this.account(row):this.group(row);
  const version='"'+tokenHash(JSON.stringify({v:row.version,fields,security:kind==="Users"?[security.auth_version,security.role,security.manager_id,security.interests,security.custom_fields]:[security.version,security.definition]}))+'"';
  return {...fields,meta:{resourceType:kind==="Users"?"User":"Group",created:row.created_at,lastModified:row.modified_at,location:this.origin+"/scim/v2/"+kind+"/"+row.id,version}};
 }
 private writable(row:any,kind:string){
  if(kind==="Users"){if(this.account(row).role!=="learner")fail(403,"Human-promoted accounts require administrator review");}
  else if(this.group(row).kind!=="static")fail(403,"Human-converted dynamic groups require administrator review");
 }
 private userInput(value:any,initial:boolean){
  const b=record(value),allowed=["schemas","userName","displayName","active","preferredLanguage","externalId"];
  if(Object.keys(b).some(k=>!allowed.includes(k)))fail(400,"Unsupported user attribute; roles, passwords and enterprise attributes are not accepted","invalidValue");
  if(b.schemas!==undefined&&JSON.stringify(b.schemas)!==JSON.stringify([userURN]))fail(400,"Only the documented core User schema is supported","invalidValue");
  const name=text(b.userName),display=b.displayName===undefined?name:text(b.displayName);
  if(b.active!==undefined&&typeof b.active!=="boolean")fail(400,"active must be boolean","invalidValue");
  const language=b.preferredLanguage??"en";if(!["en","vi"].includes(language))fail(400,"Supported preferredLanguage values: en, vi","invalidValue");
  return {userName:name,displayName:display,active:b.active??true,preferredLanguage:language,externalId:b.externalId===undefined?null:text(b.externalId,255)};
 }
 private groupInput(client:any,value:any){
  const b=record(value);if(Object.keys(b).some(k=>!["schemas","displayName","members","externalId"].includes(k)))fail(400,"Unsupported group attribute","invalidValue");
  if(b.schemas!==undefined&&JSON.stringify(b.schemas)!==JSON.stringify([groupURN]))fail(400,"Only core Group schema supported","invalidValue");
  const name=text(b.displayName),members=b.members??[];
  if(!Array.isArray(members)||members.length>100)fail(400,"At most 100 managed group members","invalidValue");
  const values=members.map((m:any)=>{record(m);if(Object.keys(m).some(k=>k!=="value"))fail(400,"Group members accept only managed resource value","invalidValue");return text(m.value,64);});
  if(new Set(values).size!==values.length)fail(400,"Duplicate member","invalidValue");
  const ids=values.map((id:string)=>this.row(client,"Users",id).user_id);
  return {displayName:name,memberIds:ids,externalId:b.externalId===undefined?null:text(b.externalId,255)};
 }
 private patch(kind:string,base:any,input:any){
  const b=record(input);
  if(Object.keys(b).some(k=>!["schemas","Operations"].includes(k))||JSON.stringify(b.schemas)!==JSON.stringify([prefix+"api:messages:2.0:PatchOp"])||!Array.isArray(b.Operations)||!b.Operations.length||b.Operations.length>10)fail(400,"Supply 1–10 documented PatchOp operations","invalidSyntax");
  const next:any={...base};delete next.id;delete next.meta;
  for(const operation of b.Operations){
   const o=record(operation),op=typeof o.op==="string"?o.op.toLowerCase():"";
   if(Object.keys(o).some(k=>!["op","path","value"].includes(k))||!["add","replace","remove"].includes(op))fail(400,"Unsupported patch operation","invalidSyntax");
   const paths=kind==="Users"?["userName","displayName","active","preferredLanguage","externalId"]:["displayName","externalId","members"];
   if(typeof o.path!=="string"||!paths.includes(o.path))fail(400,"Only explicit documented attribute paths are supported","invalidPath");
   if(op==="remove"){
    if(!["externalId","members"].includes(o.path))fail(400,"Required attribute cannot be removed","mutability");
    if(o.value!==undefined)fail(400,"Remove does not accept a value","invalidValue");
    delete next[o.path];
   }else{
    if(o.value===undefined)fail(400,"Patch value required","invalidValue");
    next[o.path]=o.path==="members"&&op==="add"?[...(next.members??[]),...(Array.isArray(o.value)?o.value:[o.value])]:o.value;
   }
  }
  return next;
 }
 private saveUser(principal:any,client:any,id:string,b:any,row?:any){
  const a=row?this.account(row):null,internal=row?.user_id??"scim-user-"+id;
  const duplicate=this.db.prepare("SELECT id FROM scim_users WHERE tenant=? AND user_name_key=? AND id!=?").get(client.tenant,userKey(b.userName),id);
  if(duplicate)fail(409,"userName already exists in this tenant","uniqueness");
  this.people.write(principal,"learning_save_user",{user:{id:internal,name:b.displayName,role:"learner",active:b.active,managerId:a?.manager_id??null,preferredLanguage:b.preferredLanguage,interests:JSON.parse(a?.interests??"[]"),customFields:JSON.parse(a?.custom_fields??"[]")}});
  const now=new Date().toISOString();
  if(!row){
   const salt=randomBytes(16).toString("hex");
   this.db.prepare("UPDATE accounts SET salt=?,password_hash=? WHERE id=?").run(salt,scryptSync(randomBytes(32),salt,64).toString("hex"),internal);
   this.db.prepare("INSERT INTO scim_users(id,tenant,client_id,user_id,user_name,user_name_key,external_id,created_at,modified_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,client.tenant,client.id,internal,b.userName,userKey(b.userName),b.externalId,now,now);
  }else this.db.prepare("UPDATE scim_users SET user_name=?,user_name_key=?,external_id=?,modified_at=?,version=version+1 WHERE id=?").run(b.userName,userKey(b.userName),b.externalId,now,id);
 }
 private saveGroup(principal:any,client:any,id:string,b:any,row?:any){
  const internal=row?.group_id??"scim-group-"+id,now=new Date().toISOString();
  this.people.write(principal,"learning_save_group",{groupId:internal,group:{name:b.displayName,kind:"static",memberIds:b.memberIds,mode:"ALL",rules:[]}});
  if(!row)this.db.prepare("INSERT INTO scim_groups(id,tenant,client_id,group_id,external_id,created_at,modified_at) VALUES(?,?,?,?,?,?,?)").run(id,client.tenant,client.id,internal,b.externalId,now,now);
  else this.db.prepare("UPDATE scim_groups SET external_id=?,modified_at=?,version=version+1 WHERE id=?").run(b.externalId,now,id);
 }
 read(header:string|undefined,kind:string,id?:string,query:any={}){
  const {client}=this.credentials.authenticate(header,"provisioning.read");
  if(id)return this.resource(this.row(client,kind,id),kind);
  const rows=this.db.prepare("SELECT * FROM "+this.table(kind)+" WHERE client_id=? AND tenant=? AND deleted=0 ORDER BY id").all(client.id,client.tenant) as any[];
  if(Object.keys(query).some(k=>!["startIndex","count","filter"].includes(k)))fail(400,"Unsupported list option","invalidValue");
  const start=Number(query.startIndex??1),count=Number(query.count??20);
  if(!Number.isSafeInteger(start)||start<1||!Number.isSafeInteger(count)||count<0||count>20)fail(400,"startIndex ≥1 and count 0–20 required","invalidValue");
  let resources=rows.map(row=>this.resource(row,kind));
  if(query.filter!==undefined){
   if(typeof query.filter!=="string"||query.filter.length>512)fail(400,"Invalid filter","invalidFilter");
   const match=/^(userName|externalId|id|displayName) eq ("(?:[^"\\]|\\.)*")$/.exec(query.filter);
   if(!match||(kind==="Users"&&match[1]==="displayName")||(kind==="Groups"&&match[1]==="userName"))fail(400,"Only a documented single eq filter is supported","invalidFilter");
   let value:string;try{value=JSON.parse(match[2]!);}catch{fail(400,"Invalid quoted filter","invalidFilter");}
   resources=resources.filter(r=>match[1]==="userName"?userKey(r.userName)===userKey(value!):r[match[1]!]==value);
  }
  const page:any[]=[];for(const r of resources.slice(start-1,start-1+count)){if(Buffer.byteLength(JSON.stringify([...page,r]))>48*1024)break;page.push(r);}
  return {schemas:[prefix+"api:messages:2.0:ListResponse"],totalResults:resources.length,startIndex:start,itemsPerPage:page.length,Resources:page};
 }
 mutate(header:string|undefined,kind:string,id:string|undefined,method:string,body:any,match:string|undefined,key:string|undefined){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const {principal,client}=this.credentials.authenticate(header,"provisioning.write");
   const table=this.table(kind);let row:any;
   if(id){row=this.row(client,kind,id,true);this.writable(row,kind);}
   if(key!==undefined&&!/^[A-Za-z0-9_-]{1,128}$/.test(key))fail(400,"Invalid Idempotency-Key","invalidValue");
   const payload=tokenHash(JSON.stringify({kind,id:id??null,method,body:body??null}));
   const previous=key?this.db.prepare("SELECT * FROM integration_requests WHERE client_id=? AND operation_key=?").get(client.id,key) as any:null;
   if(previous){
    if(previous.payload_hash!==payload)fail(409,"Idempotency request changed","uniqueness");
    const response=JSON.parse(previous.response);
    if(!id){const original=this.row(client,kind,response.body.id,true);this.writable(original,kind);if(original.deleted)fail(404,"Managed resource deleted");}
    else if(row.deleted&&method!=="DELETE")fail(404,"Managed resource deleted");
    this.db.exec("COMMIT");return response;
   }
   if(row?.deleted)fail(404,"Managed resource deleted");
   if(row&&match!==this.resource(row,kind).meta.version)fail(412,"Current If-Match is required for managed writes","invalidVers");
   if(!row&&method!=="POST")fail(405,"Unsupported mutation");
   if(!row&&Number((this.db.prepare("SELECT COUNT(*) AS n FROM "+table+" WHERE client_id=?").get(client.id) as any).n)>=1000)fail(409,"Managed resource quota reached","tooMany");
   const resourceId=id??randomUUID();
   if(method==="DELETE"){
    if(kind==="Users"){
     const current=this.resource(row,kind);delete current.id;delete current.meta;
     this.saveUser(principal,client,resourceId,this.userInput({...current,active:false},false),row);
     for(const group of this.db.prepare("SELECT * FROM scim_groups WHERE tenant=? AND client_id=? AND deleted=0").all(client.tenant,client.id) as any[]){
      const live=this.group(group),definition=JSON.parse(live.definition);
      if(live.kind==="static"&&definition.memberIds.includes(row.user_id))this.saveGroup(principal,client,group.id,{displayName:live.name,memberIds:definition.memberIds.filter((id:string)=>id!==row.user_id),externalId:group.external_id},group);
     }
     this.db.prepare("UPDATE scim_users SET deleted=1,user_name_key=? WHERE id=?").run("__deleted__"+resourceId,resourceId);
    }else{
     this.saveGroup(principal,client,resourceId,{displayName:this.group(row).name,memberIds:[],externalId:row.external_id},row);
     this.db.prepare("UPDATE scim_groups SET deleted=1 WHERE id=?").run(resourceId);
    }
   }else{
    if(!["POST","PUT","PATCH"].includes(method))fail(405,"Unsupported mutation");
    const value=method==="PATCH"?this.patch(kind,this.resource(row,kind),body):body;
    if(kind==="Users")this.saveUser(principal,client,resourceId,this.userInput(value,!row),row);
    else this.saveGroup(principal,client,resourceId,this.groupInput(client,value),row);
   }
   const response={status:method==="POST"?201:method==="DELETE"?204:200,body:method==="DELETE"?null:this.resource(this.row(client,kind,resourceId),kind)};
   this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run("library:"+client.tenant);
   this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(client.tenant,principal.id,"library:"+client.tenant,"scim_"+method.toLowerCase(),JSON.stringify({clientId:client.id,resourceType:kind,resourceId}),new Date().toISOString());
   if(key){
    if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM integration_requests WHERE client_id=?").get(client.id) as any).n)>=10000)fail(409,"Reconciliation ledger quota reached","tooMany");
    this.db.prepare("INSERT INTO integration_requests VALUES(?,?,?,?,?)").run(client.id,key,payload,JSON.stringify(response),new Date().toISOString());
   }
   this.db.exec("COMMIT");return response;
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
}
