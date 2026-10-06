import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {IntegrationCredentials,tokenHash} from "./integration-credentials.ts";
import {reject,boundedPage} from "./errors.ts";
import {signWebhook} from "../shared/webhook-signature.ts";
export const eventTopics=["enrollment.created","enrollment.completed","content.published","content.retired"] as const;
export interface WebhookEndpoint{id:string;url:string;secret:string;}
export class OutboxService{
 private stopping=false;
 stop(){this.stopping=true;}
 readonly endpoints:Map<string,WebhookEndpoint>;readonly credentials:IntegrationCredentials;
 constructor(readonly db:DatabaseSync,endpoints:WebhookEndpoint[]=[],fixture=false){
  if(endpoints.length>16)throw Error("At most 16 reviewed server endpoints");
  this.endpoints=new Map();this.credentials=new IntegrationCredentials(db);
  for(const raw of endpoints){
   if(!raw||Object.keys(raw).some(k=>!["id","url","secret"].includes(k))||!/^[A-Za-z0-9_-]{1,64}$/.test(raw.id)||this.endpoints.has(raw.id)||typeof raw.secret!=="string"||!/^([a-f0-9]{64})$/.test(raw.secret))throw Error("Invalid reviewed webhook endpoint");
   const url=new URL(raw.url);
   if(url.username||url.password||url.hash||url.search||url.href!==raw.url||url.href.length>1024||(url.protocol!=="https:"&&!(fixture&&url.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(url.hostname))))throw Error("Webhook endpoints require exact reviewed HTTPS URLs");
   this.endpoints.set(raw.id,{...raw});
  }
 }
 private live(p:Principal){
  const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(p.id,p.tenant) as any;
  if(!a||a.auth_version!==p.auth_version)reject("UNAUTHORIZED","Active administrator required");
  if(a.role!=="admin")reject("FORBIDDEN","Webhook settings require tenant administrator");
 }
 private hash(endpoint:WebhookEndpoint){return tokenHash(JSON.stringify(endpoint));}
 private enabled(row:any){
  const a=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=?").get(row.owner,row.tenant) as any,endpoint=this.endpoints.get(row.endpoint_id);
  const current=this.db.prepare("SELECT active,config_hash FROM webhook_subscriptions WHERE id=?").get(row.id) as any;
  return !!(current?.active&&current.config_hash===row.config_hash&&row.active&&a?.active&&a.role==="admin"&&a.auth_version===row.auth_version&&endpoint&&this.hash(endpoint)===row.config_hash);
 }
 private metadata(row:any){return {id:row.id,endpointId:row.endpoint_id,topics:JSON.parse(row.topics),active:!!row.active,live:this.enabled(row),createdAt:row.created_at,startSequence:row.start_sequence,cursor:row.cursor};}
 settings(p:Principal,offset=0){
  this.live(p);return {endpoints:[...this.endpoints.keys()],...boundedPage((this.db.prepare("SELECT * FROM webhook_subscriptions WHERE tenant=? AND owner=? ORDER BY created_at,id").all(p.tenant,p.id) as any[]).map(r=>this.metadata(r)),offset,20)};
 }
 mutate(p:Principal,a:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p);
   if(!a||!["subscribe","disable","retry"].includes(a.action)||typeof a.reason!=="string"||!a.reason.trim()||a.reason.length>300||typeof a.key!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(a.key)||!Number.isSafeInteger(a.revision))reject("INVALID_ARGUMENT","Invalid reviewed webhook action");
   const allowed=a.action==="subscribe"?["action","reason","key","revision","endpointId","topics"]:a.action==="retry"?["action","reason","key","revision","subscriptionId","eventSequence"]:["action","reason","key","revision","subscriptionId"];
   if(Object.keys(a).some(k=>!allowed.includes(k)))reject("INVALID_ARGUMENT","Unsupported webhook field");
   const endpoint=a.action==="subscribe"?this.endpoints.get(a.endpointId):null;
   if(a.action==="subscribe"&&(!endpoint||!Array.isArray(a.topics)||!a.topics.length||a.topics.length>4||new Set(a.topics).size!==a.topics.length||a.topics.some((t:any)=>!eventTopics.includes(t))))reject("INVALID_ARGUMENT","Select reviewed endpoint and explicit event topics");
   let row:any;
   if(a.action!=="subscribe"){
    row=this.db.prepare("SELECT * FROM webhook_subscriptions WHERE id=? AND tenant=? AND owner=?").get(a.subscriptionId,p.tenant,p.id);
    if(!row)reject("FORBIDDEN","Own subscription required");
    if(a.action==="retry"&&(!this.enabled(row)||!Number.isSafeInteger(a.eventSequence)))reject("FORBIDDEN","Live subscription and explicit failed event required");
   }
   const doc="library:"+p.tenant,payload=tokenHash(JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k])=>k!=="revision"))));
   const old=this.db.prepare("SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?").get(p.id,doc,a.key) as any;
   if(old){if(old.payload!==payload)reject("IDEMPOTENCY_CONFLICT","Webhook action changed");const saved=JSON.parse(old.result),current=this.db.prepare("SELECT * FROM webhook_subscriptions WHERE id=? AND tenant=? AND owner=?").get(saved.id,p.tenant,p.id) as any;if(!current)reject("FORBIDDEN","Own subscription required");this.db.exec("COMMIT");return this.metadata(current);}
   const workspace=this.db.prepare("SELECT revision FROM workspaces WHERE id=?").get(doc) as any;
   if(workspace.revision!==a.revision)reject("STALE_CONTEXT","Webhook review is stale");
   let id:string;
   if(a.action==="subscribe"){
    if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM webhook_subscriptions WHERE tenant=?").get(p.tenant) as any).n)>=32)reject("INVALID_ARGUMENT","Subscription quota reached");
    id=randomUUID();const cursor=Number((this.db.prepare("SELECT COALESCE(MAX(sequence),0) AS n FROM integration_events").get() as any).n);
    this.db.prepare("INSERT INTO webhook_subscriptions(id,tenant,owner,auth_version,endpoint_id,config_hash,topics,start_sequence,cursor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,p.tenant,p.id,p.auth_version,endpoint!.id,this.hash(endpoint!),JSON.stringify([...a.topics].sort()),cursor,cursor,new Date().toISOString());
   }else{
    id=row.id;
    if(a.action==="disable")this.db.prepare("UPDATE webhook_subscriptions SET active=0 WHERE id=?").run(id);
    else{
     const delivery=this.db.prepare("SELECT * FROM webhook_deliveries WHERE subscription_id=? AND event_sequence=?").get(id,a.eventSequence) as any;
     if(!delivery||delivery.state!=="failed")reject("INVALID_ARGUMENT","Only an explicit failed event may be retried");
     this.db.prepare("UPDATE webhook_deliveries SET state='pending',attempts=0,next_attempt=0,lease=NULL,lease_until=0 WHERE subscription_id=? AND event_sequence=?").run(id,a.eventSequence);
    }
   }
   this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run(doc);
   this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(p.tenant,p.id,doc,"human_webhook_"+a.action,JSON.stringify({subscriptionId:id,endpointId:a.endpointId??null,topics:a.topics??null,eventSequence:a.eventSequence??null,reason:a.reason}),new Date().toISOString());
   this.db.prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)").run(p.id,doc,a.key,payload,JSON.stringify({id}));
   const current=this.db.prepare("SELECT * FROM webhook_subscriptions WHERE id=?").get(id);this.db.exec("COMMIT");return this.metadata(current);
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 events(header:string|undefined,query:any={}){
  const {client}=this.credentials.authenticate(header,"events.read");
  if(Object.keys(query).some(k=>!["after","limit"].includes(k)))reject("INVALID_ARGUMENT","Only after and limit supported");
  const after=Number(query.after??0),limit=Number(query.limit??20);
  if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>20)reject("INVALID_ARGUMENT","Invalid event cursor");
  const rows=this.db.prepare("SELECT * FROM integration_events WHERE tenant=? AND sequence>? ORDER BY sequence LIMIT ?").all(client.tenant,after,limit+1) as any[];
  const page=boundedPage(rows.map(r=>this.event(r)),0,limit);
  return {events:page.items,nextAfter:page.items.length?page.items.at(-1).sequence:after,hasMore:page.items.length<rows.length};
 }
 private event(row:any){return {schemaVersion:"pear-events/1",id:row.id,sequence:row.sequence,topic:row.topic,createdAt:row.created_at,data:JSON.parse(row.data)};}
 deliveries(p:Principal,id:string,offset=0){
  this.live(p);const row=this.db.prepare("SELECT * FROM webhook_subscriptions WHERE id=? AND tenant=? AND owner=?").get(id,p.tenant,p.id);
  if(!row)reject("FORBIDDEN","Own subscription required");
  return boundedPage(this.db.prepare("SELECT event_sequence AS eventSequence,state,attempts,next_attempt AS nextAttempt,last_status AS lastStatus FROM webhook_deliveries WHERE subscription_id=? ORDER BY event_sequence").all(id),offset,20);
 }
 private claim(now:number){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   const subscriptions=this.db.prepare("SELECT * FROM webhook_subscriptions ORDER BY id").all() as any[];
   for(const row of subscriptions){
    if(!this.enabled(row))continue;
    // Strict ordering: the first selected unacknowledged event blocks all later selected events.
    const events=this.db.prepare("SELECT * FROM integration_events WHERE tenant=? AND sequence>? ORDER BY sequence LIMIT 100").all(row.tenant,row.cursor) as any[];
    for(const event of events){
     if(!JSON.parse(row.topics).includes(event.topic)){
      this.db.prepare("UPDATE webhook_subscriptions SET cursor=? WHERE id=?").run(event.sequence,row.id);continue;
     }
     let delivery=this.db.prepare("SELECT * FROM webhook_deliveries WHERE subscription_id=? AND event_sequence=?").get(row.id,event.sequence) as any;
     if(!delivery){this.db.prepare("INSERT INTO webhook_deliveries(subscription_id,event_sequence,state) VALUES(?,?,'pending')").run(row.id,event.sequence);delivery={state:"pending",attempts:0,next_attempt:0,lease_until:0};}
     if(delivery.state==="delivered"){this.db.prepare("UPDATE webhook_subscriptions SET cursor=? WHERE id=?").run(event.sequence,row.id);continue;}
     if(delivery.state==="failed"||delivery.next_attempt>now||delivery.state==="sending"&&delivery.lease_until>now)break;
     const lease=randomUUID();
     this.db.prepare("UPDATE webhook_deliveries SET state='sending',attempts=attempts+1,lease=?,lease_until=? WHERE subscription_id=? AND event_sequence=?").run(lease,now+30000,row.id,event.sequence);
     this.db.exec("COMMIT");return {row,event,lease,attempt:delivery.attempts+1};
    }
   }
   this.db.exec("COMMIT");return null;
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 async run(now=Date.now(),limit=20){
  if(!Number.isSafeInteger(now)||!Number.isInteger(limit)||limit<1||limit>20)throw Error("Invalid bounded outbox run");
  let sent=0;
  for(let i=0;i<limit&&!this.stopping;i++){
   const job=this.claim(now);if(!job)break;
   const endpoint=this.endpoints.get(job.row.endpoint_id)!;
   // Recheck after the durable lease and immediately before network dispatch.
   if(!this.enabled(job.row))break;
   const body=JSON.stringify(this.event(job.event)),timestamp=String(Math.floor(now/1000));
   let status:number|null=null,ok=false;
   try{
    const response=await fetch(endpoint.url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(5000),headers:{"Content-Type":"application/json","X-Pear-Timestamp":timestamp,"X-Pear-Signature":"v1="+signWebhook(endpoint.secret,timestamp,body),"X-Pear-Event-Id":job.event.id,"X-Pear-Attempt":String(job.attempt)},body});
    status=response.status;ok=response.ok;await response.body?.cancel();
   }catch{/* Do not persist/log remote bodies, URLs, secrets or transport exception text. */}
   const current=this.db.prepare("SELECT * FROM webhook_subscriptions WHERE id=?").get(job.row.id) as any;
   if(!current||!this.enabled(current))ok=false;
   const state=ok?"delivered":job.attempt>=8?"failed":"pending",next=ok?0:now+Math.min(3600000,1000*2**(job.attempt-1));
   this.db.prepare("UPDATE webhook_deliveries SET state=?,next_attempt=?,lease=NULL,lease_until=0,last_status=? WHERE subscription_id=? AND event_sequence=? AND lease=?").run(state,next,status,job.row.id,job.event.sequence,job.lease);
   sent++;
  }
  return {attempted:sent};
 }
}
