import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {randomUUID} from "node:crypto";
import {defaultDigestPreferences,nextDigestRun,type DigestPreferences} from "../shared/digest-subscriptions.ts";
import {DigestService} from "./digest.ts";
import {boundedPage,reject} from "./errors.ts";
export class DigestSubscriptionService{
 constructor(readonly db:DatabaseSync,readonly now=()=>new Date()){}
 private row(p:Principal){return this.db.prepare("SELECT * FROM digest_subscriptions WHERE tenant=? AND learner=?").get(p.tenant,p.id) as any;}
 private notification(p:Principal,id:string){
  const n=this.db.prepare("SELECT * FROM digest_notifications WHERE id=? AND tenant=? AND learner=? AND auth_version=? AND expires_at>?").get(id,p.tenant,p.id,p.auth_version,this.now().toISOString()) as any;
  if(!n)reject("FORBIDDEN","Own unexpired digest required");return n;
 }
 authorize(p:Principal,name:string,a:any){if(name==="human_read_digest_notification")this.notification(p,a.notificationId);}
 read(p:Principal,name:string,a:any={}){
  const now=this.now().toISOString();
  if(name==="human_get_digest_preferences"){
   const r=this.row(p),preferences=r?JSON.parse(r.definition):{...defaultDigestPreferences};
   return {preferences,version:r?.version??0,nextRun:r?.next_run??null,reviewRequired:!!r&&r.auth_version!==p.auth_version,effectiveEnabled:!!r&&preferences.enabled&&r.auth_version===p.auth_version&&!!r.next_run,channel:"in_app",policy:"Own reviewed in-app delivery only. No email, Slack, Teams, calendar or official progress."};
  }
  const rows=this.db.prepare("SELECT * FROM digest_notifications WHERE tenant=? AND learner=? AND auth_version=? AND expires_at>? ORDER BY created_at DESC,id LIMIT 1001").all(p.tenant,p.id,p.auth_version,now) as any[];
  const digest=new DigestService(this.db,this.now);
  const visible=rows.map(r=>{const payload=JSON.parse(r.payload),before=payload.items.length;payload.items=payload.items.filter((x:any)=>digest.available(p,x));return {id:r.id,runAt:r.run_at,createdAt:r.created_at,expiresAt:r.expires_at,readAt:r.read_at,payload,withheldItems:before-payload.items.length};});return boundedPage(visible,a.offset??0,20);
 }
 write(p:Principal,name:string,a:any){
  const now=this.now().toISOString();
  if(name==="human_save_digest_preferences"){
   const preferences=a.preferences as DigestPreferences;let next:string;
   try{next=nextDigestRun(preferences,now);}catch{reject("INVALID_ARGUMENT","Use a valid named timezone, distinct weekdays and resolvable schedule");}
   const version=(this.row(p)?.version??0)+1;
   this.db.prepare("INSERT INTO digest_subscriptions VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant,learner) DO UPDATE SET auth_version=excluded.auth_version,definition=excluded.definition,version=excluded.version,next_run=excluded.next_run,updated_at=excluded.updated_at").run(p.tenant,p.id,p.auth_version,JSON.stringify(preferences),version,preferences.enabled?next!:null,now);
   return {version,nextRun:preferences.enabled?next!:null,channel:"in_app"};
  }
  if(name==="human_read_digest_notification"){this.notification(p,a.notificationId);this.db.prepare("UPDATE digest_notifications SET read_at=COALESCE(read_at,?) WHERE id=?").run(now,a.notificationId);return {notificationId:a.notificationId,read:true};}
  const deleted=this.db.prepare("DELETE FROM digest_notifications WHERE tenant=? AND learner=?").run(p.tenant,p.id).changes;return {deleted:Number(deleted)};
 }
 runBackground(now=this.now().toISOString()){
  if(!Number.isFinite(Date.parse(now))||new Date(now).toISOString()!==now)throw new RangeError("Trusted UTC scheduler instant required");
  this.db.exec("BEGIN IMMEDIATE");let generated=0,skipped=0;
  try{
   this.db.prepare("DELETE FROM digest_notifications WHERE id IN (SELECT id FROM digest_notifications WHERE expires_at<=? ORDER BY expires_at LIMIT 500)").run(now);
   const rows=this.db.prepare("SELECT * FROM digest_subscriptions WHERE next_run<=? ORDER BY next_run,tenant,learner LIMIT 25").all(now) as any[];
   for(const r of rows){
    const p=this.db.prepare("SELECT id,tenant,name,role,manager_id,active,auth_version FROM accounts WHERE id=? AND tenant=?").get(r.learner,r.tenant) as unknown as Principal;
    const preferences=JSON.parse(r.definition) as DigestPreferences;
    if(!p?.active||p.auth_version!==r.auth_version||!preferences.enabled){this.db.prepare("UPDATE digest_subscriptions SET next_run=NULL WHERE tenant=? AND learner=?").run(r.tenant,r.learner);skipped++;continue;}
    const next=nextDigestRun(preferences,now);
    const quota=this.db.prepare("SELECT COUNT(*) AS n FROM digest_notifications WHERE tenant=? AND learner=?").get(r.tenant,r.learner) as any;
    const recent=this.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE tenant=? AND principal=? AND tool='digest_in_app_delivery' AND created_at>?").get(r.tenant,r.learner,new Date(Date.parse(now)-86400000).toISOString()) as any;
    const exists=this.db.prepare("SELECT 1 FROM digest_notifications WHERE tenant=? AND learner=? AND subscription_version=? AND run_at=?").get(r.tenant,r.learner,r.version,r.next_run);
    if(Date.parse(now)-Date.parse(r.next_run)<=21600000&&quota.n<1000&&recent.n<3&&!exists){
     const value=new DigestService(this.db,()=>new Date(now)).read(p,{minutes:preferences.minutes,timeZone:preferences.timeZone,limit:5},"human");
     value.policy="Scheduled own reviewed in-app metadata only. No external delivery, enrollment, acknowledgment, official completion or grading.";
     const payload=JSON.stringify(value);
     if(Buffer.byteLength(payload)>16384)throw new RangeError("Digest payload budget exceeded");
     const id=randomUUID(),expires=new Date(Date.parse(now)+preferences.retentionDays*86400000).toISOString();
     this.db.prepare("INSERT INTO digest_notifications VALUES(?,?,?,?,?,?,?,?,?,NULL)").run(id,p.tenant,p.id,p.auth_version,r.version,r.next_run,payload,now,expires);
     const doc="learning:"+p.tenant+":"+p.id;
     this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(p.tenant,p.id,doc,"digest_in_app_delivery",JSON.stringify({notificationId:id,subscriptionVersion:r.version,runAt:r.next_run}),now);
     this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run(doc);generated++;
    }else skipped++;
    this.db.prepare("UPDATE digest_subscriptions SET next_run=? WHERE tenant=? AND learner=?").run(next,r.tenant,r.learner);
   }
   this.db.exec("COMMIT");return {generated,skipped,processed:rows.length};
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
}
