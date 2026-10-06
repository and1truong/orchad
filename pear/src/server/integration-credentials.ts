import {createHash,randomBytes,randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {reject,boundedPage} from "./errors.ts";
export const integrationScopes=["provisioning.read","provisioning.write"] as const;
export const tokenHash=(value:string)=>createHash("sha256").update(value).digest("hex");
export class IntegrationCredentials{
 constructor(readonly db:DatabaseSync){}
 private live(p:Principal){
  const row=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(p.id,p.tenant) as any;
  if(!row||row.auth_version!==p.auth_version)reject("UNAUTHORIZED","Active administrator required");
  if(row.role!=="admin")reject("FORBIDDEN","Integration credentials require tenant administrator");
 }
 private metadata(row:any){return {id:row.id,name:row.name,scopes:JSON.parse(row.scopes),createdAt:row.created_at,expiresAt:new Date(row.expires).toISOString(),active:!!row.active};}
 list(p:Principal,offset=0){
  this.live(p);return boundedPage((this.db.prepare("SELECT * FROM integration_clients WHERE tenant=? AND owner=? ORDER BY created_at,id").all(p.tenant,p.id) as any[]).map(r=>this.metadata(r)),offset,20);
 }
 mutate(p:Principal,a:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p);
   if(!a||!["issue","revoke"].includes(a.action)||typeof a.reason!=="string"||!a.reason.trim()||a.reason.length>300||
    !/^[A-Za-z0-9_-]{1,128}$/.test(a.key)||!Number.isSafeInteger(a.revision)||a.revision<0)reject("INVALID_ARGUMENT","Invalid reviewed integration credential");
   const allowed=a.action==="issue"?["action","reason","key","revision","name","scopes","ttlDays"]:["action","reason","key","revision","clientId"];
   if(Object.keys(a).some(k=>!allowed.includes(k)))reject("INVALID_ARGUMENT","Unsupported credential field");
   if(a.action==="issue"&&(typeof a.name!=="string"||!a.name.trim()||a.name.length>100||!Number.isInteger(a.ttlDays)||a.ttlDays<1||a.ttlDays>30||
     !Array.isArray(a.scopes)||!a.scopes.length||a.scopes.length>integrationScopes.length||new Set(a.scopes).size!==a.scopes.length||a.scopes.some((v:any)=>!integrationScopes.includes(v))))
    reject("INVALID_ARGUMENT","Use reviewed provisioning scopes and 1–30 day expiration");
   const doc="library:"+p.tenant,payload=tokenHash(JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k])=>k!=="revision")))),
    previous=this.db.prepare("SELECT payload,result FROM idempotency WHERE principal=? AND document_id=? AND key=?").get(p.id,doc,a.key) as any;
   if(previous){
    if(previous.payload!==payload)reject("IDEMPOTENCY_CONFLICT","Credential request changed");
    const id=JSON.parse(previous.result).id,row=this.db.prepare("SELECT * FROM integration_clients WHERE id=? AND tenant=? AND owner=?").get(id,p.tenant,p.id) as any;
    if(!row)reject("FORBIDDEN","Own credential required");this.db.exec("COMMIT");return {...this.metadata(row),token:null,oneTimeSecretUnavailable:true};
   }
   const workspace=this.db.prepare("SELECT revision FROM workspaces WHERE id=?").get(doc) as any;
   if(workspace.revision!==a.revision)reject("STALE_CONTEXT","Integration settings changed; refresh");
   let id:string,token:string|null=null;
   if(a.action==="issue"){
    if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM integration_clients WHERE tenant=?").get(p.tenant) as any).n)>=128)reject("INVALID_ARGUMENT","Integration credential quota reached");
    id=randomUUID();token="pear_"+randomBytes(32).toString("hex");const now=new Date().toISOString();
    this.db.prepare("INSERT INTO integration_clients(id,tenant,owner,auth_version,token_hash,name,scopes,created_at,expires) VALUES(?,?,?,?,?,?,?,?,?)")
     .run(id,p.tenant,p.id,p.auth_version,tokenHash(token),a.name.trim(),JSON.stringify([...a.scopes].sort()),now,Date.now()+a.ttlDays*86400000);
   }else{
    const row=this.db.prepare("SELECT * FROM integration_clients WHERE id=? AND tenant=? AND owner=?").get(a.clientId,p.tenant,p.id) as any;
    if(!row)reject("FORBIDDEN","Own credential required");id=row.id;this.db.prepare("UPDATE integration_clients SET active=0 WHERE id=?").run(id);
   }
   this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run(doc);
   this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)")
    .run(p.tenant,p.id,doc,"human_integration_"+a.action,JSON.stringify({clientId:id,reason:a.reason,scopes:a.scopes??null}),new Date().toISOString());
   this.db.prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)").run(p.id,doc,a.key,payload,JSON.stringify({id}));
   const row=this.db.prepare("SELECT * FROM integration_clients WHERE id=?").get(id);this.db.exec("COMMIT");return {...this.metadata(row),token,oneTimeSecretUnavailable:false};
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 authenticate(header:string|undefined,scope:string){
  const match=/^Bearer (pear_[a-f0-9]{64})$/i.exec(header??"");if(!match)reject("UNAUTHORIZED","Provisioning credential required");
  const row=this.db.prepare("SELECT c.*,a.name AS owner_name,a.role,a.active AS owner_active,a.auth_version AS current_version,a.manager_id FROM integration_clients c JOIN accounts a ON a.id=c.owner AND a.tenant=c.tenant WHERE c.token_hash=? AND c.active=1 AND c.expires>?").get(tokenHash(match![1]!),Date.now()) as any;
  if(!row||!row.owner_active||row.role!=="admin"||row.auth_version!==row.current_version)reject("UNAUTHORIZED","Provisioning credential expired or revoked");
  if(!JSON.parse(row.scopes).includes(scope))reject("FORBIDDEN","Provisioning scope required");
  const principal:Principal={id:row.owner,tenant:row.tenant,name:row.owner_name,role:"admin",active:1,auth_version:row.current_version,manager_id:row.manager_id};
  return {principal,client:row};
 }
}
