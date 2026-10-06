import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {IntegrationCredentials,tokenHash} from "./integration-credentials.ts";
import {boundedPage,reject} from "./errors.ts";
export type ProviderAdapter={id:string;tenant:string;clientId:string;licenseUntil:string;metadataForModels:boolean};
// This internal metadata profile is not a commercial provider's wire protocol.
// Connections are supplied by trusted server configuration, never by model arguments.
const id=/^[A-Za-z0-9_-]{1,64}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const utc=(v:any)=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v:any,keys:string[])=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v:any,n:number)=>typeof v==="string"&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u001f\u007f]/.test(v);
const canonical=(v:any):string=>v===null||typeof v!=="object"?JSON.stringify(v):Array.isArray(v)?"["+v.map(canonical).join(",")+"]":"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
export class ProviderCatalogService {
 readonly credentials:IntegrationCredentials;
 private readonly adapters:readonly ProviderAdapter[];
 constructor(readonly db:DatabaseSync,adapters:ProviderAdapter[]=[]){
  if(!Array.isArray(adapters)||adapters.length>32)throw Error("Invalid reviewed provider configuration");
  const seen=new Set<string>();
  this.adapters=Object.freeze(adapters.map(p=>{
   if(!exact(p,["id","tenant","clientId","licenseUntil","metadataForModels"])||!id.test(p.id)||!id.test(p.tenant)||!uuid.test(p.clientId)||!utc(p.licenseUntil)||typeof p.metadataForModels!=="boolean"||seen.has(p.tenant+":"+p.id))throw Error("Invalid reviewed provider configuration");
   seen.add(p.tenant+":"+p.id);return Object.freeze({...p});
  }));
  this.credentials=new IntegrationCredentials(db);
 }
 private connection(header:string|undefined,provider:string,scope:string){
  if(!id.test(provider))reject("INVALID_ARGUMENT","Invalid provider identity");
  const auth=this.credentials.authenticate(header,scope),p=this.adapters.find(v=>v.id===provider&&v.tenant===auth.principal.tenant&&v.clientId===auth.client.id);
  if(!p||Date.parse(p.licenseUntil)<=Date.now())reject("FORBIDDEN","Current reviewed provider license and client binding required");
  return {...auth,policy:p!};
 }
 private live(p:Principal,provider:string){
  const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(p.id,p.tenant) as any;
  if(!a||a.auth_version!==p.auth_version)reject("UNAUTHORIZED","Current account required");
  const policy=this.adapters.find(v=>v.tenant===p.tenant&&v.id===provider);
  if(!policy||Date.parse(policy.licenseUntil)<=Date.now())reject("FORBIDDEN","Current reviewed provider license required");
  const c=this.db.prepare("SELECT c.*,a.active AS owner_active,a.role,a.auth_version AS current_version FROM integration_clients c JOIN accounts a ON a.id=c.owner AND a.tenant=c.tenant WHERE c.id=? AND c.tenant=?").get(policy!.clientId,p.tenant) as any;
  if(!c||!c.active||c.expires<=Date.now()||!c.owner_active||c.role!=="admin"||c.auth_version!==c.current_version||!JSON.parse(c.scopes).includes("catalog.write"))reject("FORBIDDEN","Reviewed provider connection revoked");
  return policy!;
 }
 private validate(b:any){
  if(!exact(b,["profile","id","sequence","sourceTime","action","data"])||b.profile!=="pear-provider-metadata/1"||!uuid.test(b.id)||!Number.isSafeInteger(b.sequence)||b.sequence<1||b.sequence>10000||!utc(b.sourceTime)||Date.parse(b.sourceTime)>Date.now()+300000||Buffer.byteLength(JSON.stringify(b))>16384)reject("INVALID_ARGUMENT","Invalid bounded provider event");
  const d=b.data;
  if(b.action==="upsert"){
   if(!exact(d,["sourceId","version","title","summary","language","topic","intendedMinutes"])||!id.test(d.sourceId)||!Number.isSafeInteger(d.version)||d.version<1||!text(d.title,200)||!text(d.summary,2000)||!["en","vi"].includes(d.language)||!text(d.topic,100)||!Number.isSafeInteger(d.intendedMinutes)||d.intendedMinutes<1||d.intendedMinutes>10080||Buffer.byteLength(JSON.stringify(d))>4096)reject("INVALID_ARGUMENT","Metadata only; bodies, answers, URLs and unsupported fields are prohibited");
  }else if(b.action==="retire"){
   if(!exact(d,["sourceId"])||!id.test(d.sourceId))reject("INVALID_ARGUMENT","Invalid retirement");
  }else if(b.action==="grant"){
   if(!exact(d,["sourceId","learnerId","validUntil"])||!id.test(d.sourceId)||!id.test(d.learnerId)||!utc(d.validUntil)||Date.parse(d.validUntil)<=Date.now())reject("INVALID_ARGUMENT","Invalid current grant");
  }else if(b.action==="revoke"){
   if(!exact(d,["sourceId","learnerId"])||!id.test(d.sourceId)||!id.test(d.learnerId))reject("INVALID_ARGUMENT","Invalid revocation");
  }else reject("INVALID_ARGUMENT","Unsupported provider event");
 }
 write(header:string|undefined,provider:string,b:any){
  this.connection(header,provider,"catalog.write");this.validate(b);
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const {principal:p,policy}=this.connection(header,provider,"catalog.write"),digest=tokenHash(canonical(b)),old=this.db.prepare("SELECT * FROM provider_events WHERE tenant=? AND provider=? AND (event_id=? OR sequence=?)").all(p.tenant,provider,b.id.toLowerCase(),b.sequence) as any[];
   if(old.length){
    if(old.length!==1||old[0].event_id!==b.id.toLowerCase()||old[0].sequence!==b.sequence||old[0].digest!==digest)reject("IDEMPOTENCY_CONFLICT","Provider event identity changed");
    this.db.exec("COMMIT");return JSON.parse(old[0].result);
   }
   const last=this.db.prepare("SELECT MAX(sequence) AS n,MAX(source_time) AS source_time FROM provider_events WHERE tenant=? AND provider=?").get(p.tenant,provider) as any;
   if(last.source_time&&b.sourceTime<last.source_time)reject("STALE_CONTEXT","Source timestamp cannot move backward");
   if(b.sequence!==(Number(last.n)||0)+1)reject("STALE_CONTEXT","Provider sequence requires reconciliation");
   const d=b.data,item=this.db.prepare("SELECT * FROM provider_items WHERE tenant=? AND provider=? AND source_id=?").get(p.tenant,provider,d.sourceId) as any;
   if(b.action==="upsert"){
    if(item&&d.version<=item.version)reject("STALE_CONTEXT","Source version must advance");
    if(!item&&Number((this.db.prepare("SELECT COUNT(*) AS n FROM provider_items WHERE tenant=? AND provider=?").get(p.tenant,provider) as any).n)>=1000)reject("INVALID_ARGUMENT","Provider catalog quota reached");
    this.db.prepare("INSERT INTO provider_items VALUES(?,?,?,?,?,1) ON CONFLICT(tenant,provider,source_id) DO UPDATE SET version=excluded.version,definition=excluded.definition,active=1").run(p.tenant,provider,d.sourceId,d.version,JSON.stringify(d));
   }else{
    if(!item)reject("NOT_FOUND","Provider metadata item required");
    if(b.action==="retire"){
     this.db.prepare("UPDATE provider_items SET active=0 WHERE tenant=? AND provider=? AND source_id=?").run(p.tenant,provider,d.sourceId);
     this.db.prepare("UPDATE provider_grants SET active=0 WHERE tenant=? AND provider=? AND source_id=?").run(p.tenant,provider,d.sourceId);
    }
    else{
     const learner=this.db.prepare("SELECT 1 FROM accounts WHERE id=? AND tenant=? AND active=1").get(d.learnerId,p.tenant);
     if(!learner)reject("FORBIDDEN","Current same-tenant learner required");
     if(b.action==="grant"){
      if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM provider_grants WHERE tenant=? AND provider=?").get(p.tenant,provider) as any).n)>=10000&&!this.db.prepare("SELECT 1 FROM provider_grants WHERE tenant=? AND provider=? AND source_id=? AND learner=?").get(p.tenant,provider,d.sourceId,d.learnerId))reject("INVALID_ARGUMENT","Provider entitlement quota reached");
      if(!item.active||Date.parse(d.validUntil)>Date.parse(policy.licenseUntil))reject("INVALID_ARGUMENT","Grant cannot outlive active source license");
      this.db.prepare("INSERT INTO provider_grants VALUES(?,?,?,?,?,1) ON CONFLICT(tenant,provider,source_id,learner) DO UPDATE SET valid_until=excluded.valid_until,active=1").run(p.tenant,provider,d.sourceId,d.learnerId,Date.parse(d.validUntil));
     }else this.db.prepare("UPDATE provider_grants SET active=0 WHERE tenant=? AND provider=? AND source_id=? AND learner=?").run(p.tenant,provider,d.sourceId,d.learnerId);
    }
   }
   const now=new Date().toISOString(),result={providerId:provider,eventId:b.id.toLowerCase(),sequence:b.sequence,action:b.action,sourceId:d.sourceId};
   this.db.prepare("INSERT INTO provider_events VALUES(?,?,?,?,?,?,?,?)").run(p.tenant,provider,b.sequence,b.id.toLowerCase(),digest,b.sourceTime,JSON.stringify(result),now);
   this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(p.tenant,p.id,"library:"+p.tenant,"provider_catalog_event",JSON.stringify({...result,clientId:policy.clientId,learnerId:d.learnerId??null}),now);
   this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE tenant=?").run(p.tenant);
   this.db.exec("COMMIT");return result;
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 reconcile(header:string|undefined,provider:string,offset=0){
  const {principal:p}=this.connection(header,provider,"catalog.read");
  if(!Number.isSafeInteger(offset)||offset<0)reject("INVALID_ARGUMENT","Invalid provider event page");
  const rows=this.db.prepare("SELECT sequence,event_id,source_time,result,received_at FROM provider_events WHERE tenant=? AND provider=? ORDER BY sequence").all(p.tenant,provider) as any[];
  return boundedPage(rows.map(r=>({sequence:r.sequence,eventId:r.event_id,sourceTime:r.source_time,receivedAt:r.received_at,...JSON.parse(r.result)})),offset,20);
 }
 item(p:Principal,provider:string,sourceId:string,source:"human"|"bridge"="human"){
  const policy=this.live(p,provider);
  if(source==="bridge"&&!policy.metadataForModels)reject("FORBIDDEN","Provider metadata model rights not reviewed");
  const row=this.db.prepare("SELECT i.definition FROM provider_items i JOIN provider_grants g ON g.tenant=i.tenant AND g.provider=i.provider AND g.source_id=i.source_id WHERE i.tenant=? AND i.provider=? AND i.source_id=? AND i.active=1 AND g.learner=? AND g.active=1 AND g.valid_until>?").get(p.tenant,provider,sourceId,p.id,Date.now()) as any;
  if(!row)reject("FORBIDDEN","Current own provider entitlement required");
  return {providerId:provider,...JSON.parse(row.definition),recordType:"provider-metadata",officialLearning:false};
 }
}
