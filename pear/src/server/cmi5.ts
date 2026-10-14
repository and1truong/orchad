import {createHash, randomBytes, randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {Principal} from '../shared/model.ts';
import {cmi5WaiverReasons} from '../shared/cmi5.ts';
import {CMI5LearningBindings} from './cmi5-learning-bindings.ts';
import type {LearningService} from './service.ts';
import {parseUniqueJSON} from '../shared/json-unique.ts';
import {SCORMEngineStore} from './scorm-engine-store.ts';
import {packageLimits, packagePath} from './scorm-package-reader.ts';
import {scormResourceMime} from './scorm-package-service.ts';
import {boundedPage, reject} from './errors.ts';
import {cmi5Invalid, cmi5IRI, cmi5RemoteURL, inspectCMI5Package, type CMI5AU, type CMI5Manifest, type CMI5Node} from './cmi5-package.ts';
import {cmi5Document,documentRead,documentETag} from './cmi5-documents.ts';
import {validateAttachments,saveCMI5Attachments,encodeCMI5Multipart,type AttachmentParts} from './cmi5-attachments.ts';
import {xapiObject as object,xapiLanguageMap,xapiUUID,xapiResult,xapiDuration as duration,xapiQueryTime,statementFormat} from './cmi5-xapi.ts';
import {xapiStatementObject,xapiContext} from './cmi5-objects.ts';

export const cmi5Category = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
export const cmi5MoveCategory = 'https://w3id.org/xapi/cmi5/context/categories/moveon';
export const cmi5Extension = 'https://w3id.org/xapi/cmi5/context/extensions/';
const exp = 'http://adlnet.gov/expapi/verbs/', adl = 'https://w3id.org/xapi/adl/verbs/';
const uuid = xapiUUID;
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
function stable(v: any): string {return Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+stable(v[k])).join(',') + '}' : JSON.stringify(v);}
function timestamp(v: any) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) || !Number.isFinite(Date.parse(v)) || Date.parse(v)>Date.now()+300000 || Date.parse(v)<0) cmi5Invalid('valid UTC timestamp required');
  const normalized = new Date(v).toISOString(); if (normalized.slice(0,19) !== v.slice(0,19)) cmi5Invalid('invalid calendar date'); return normalized;
}

export class CMI5Service {
  readonly store: SCORMEngineStore;
  readonly remoteOrigins: readonly string[];
  readonly bindings?:CMI5LearningBindings;
  constructor(readonly db: DatabaseSync, readonly pearOrigin: string, readonly contentOrigin: string, remoteOrigins:string[] = [],learning?:LearningService) {
    this.store = new SCORMEngineStore(db);
    if(learning)this.bindings=new CMI5LearningBindings(db,learning);
    if(!Array.isArray(remoteOrigins)||remoteOrigins.length>20)throw Error('At most 20 reviewed cmi5 remote origins required');
    this.remoteOrigins=Object.freeze(remoteOrigins.map(origin=>{
      if(typeof origin!=='string')throw Error('Canonical cmi5 remote origin required');
      const url=new URL(cmi5RemoteURL(origin));
      if(url.origin!==origin||url.hostname===new URL(pearOrigin).hostname||origin===contentOrigin)throw Error('cmi5 remote origin must be canonical and separate from Pear cookies/content');
      return origin;
    }));
  }
  sessionOrigin(s:any) {return s.au.remote ? new URL(s.au.href).origin : this.contentOrigin;}
  fetchOrigin(token:string) {
    const row=this.db.prepare('SELECT id FROM cmi5_sessions WHERE fetch_hash=?').get(hash(token)) as any;
    if(!row)return undefined;const s=this.session(row.id,false),origin=this.sessionOrigin(s);
    return !s.au.remote||this.remoteOrigins.includes(origin)?origin:undefined;
  }
  private transaction<T>(fn: () => T): T {this.db.exec('BEGIN IMMEDIATE'); try {const result=fn(); this.db.exec('COMMIT'); return result;} catch(e) {this.db.exec('ROLLBACK'); throw e;}}
  private audit(p: Principal, action: string, payload: object, doc = 'library:'+p.tenant) {
    this.db.prepare('INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)').run(p.tenant,p.id,doc,action,JSON.stringify(payload),new Date().toISOString());
    this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(doc);
  }
  private command(p: Principal, a: any, action: string, payload: object, author: boolean, fn: () => any) {
    return this.transaction(() => {
      this.store.live(p,author);
      if (a.confirmed !== true || typeof a.key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(a.key) || !Number.isSafeInteger(a.revision) || a.revision < 0) cmi5Invalid('confirmed action, revision and operation key required');
      const doc = author ? 'library:'+p.tenant : `learning:${p.tenant}:${p.id}`, fingerprint=hash(stable({action,...payload}));
      const old=this.db.prepare('SELECT * FROM idempotency WHERE principal=? AND document_id=? AND key=?').get(p.id,doc,a.key) as any;
      if (old) {if (old.payload!==fingerprint) reject('IDEMPOTENCY_CONFLICT','cmi5 operation changed'); return {...JSON.parse(old.result),recovered:true};}
      if ((this.db.prepare('SELECT revision FROM workspaces WHERE id=?').get(doc) as any)?.revision!==a.revision) reject('STALE_CONTEXT','cmi5 context changed');
      const result=fn(), {url,...receipt}=result;
      this.audit(p,action,payload,doc);
      // Launch URLs are capabilities. Receipts retain IDs for reconciliation, never tokens.
      this.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?)').run(p.id,doc,a.key,fingerprint,JSON.stringify(receipt));
      return result;
    });
  }
  async import(p: Principal, a: any, bytes: Buffer) {
    this.store.live(p,true); object(a,['filename','provenance','confirmed','key','revision'],['filename','provenance']);
    if (typeof a.filename !== 'string' || !/^[\p{L}\p{N} _.-]{1,115}\.(zip|xml)$/u.test(a.filename) || typeof a.provenance !== 'string' || !a.provenance.trim() || a.provenance.length>500 || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length>packageLimits.archive) cmi5Invalid('bounded ZIP/XML and rights provenance required');
    const sha256=hash(bytes), inspected=await inspectCMI5Package(bytes,a.filename.endsWith('.xml') ? 'xml' : 'zip');
    return this.command(p,a,'human_cmi5_import',{filename:a.filename,provenance:a.provenance.trim(),sha256},true,() => {
      const used=this.db.prepare('SELECT COALESCE(SUM(length(archive)),0)+(SELECT COALESCE(SUM(length(bytes)),0) FROM cmi5_resources r JOIN cmi5_packages p ON p.id=r.package_id WHERE p.tenant=?) AS n FROM cmi5_packages WHERE tenant=?').get(p.tenant,p.tenant) as any;
      const expanded=[...inspected.files.values()].reduce((n,b)=>n+b.length,0);
      if (used.n+bytes.length+expanded>128*1024*1024) cmi5Invalid('tenant package quota reached');
      const id=randomUUID();
      this.db.prepare('INSERT INTO cmi5_packages(id,tenant,owner,filename,provenance,sha256,archive,manifest,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,p.tenant,p.id,a.filename,a.provenance.trim(),sha256,bytes,JSON.stringify(inspected.manifest),new Date().toISOString());
      const insert=this.db.prepare('INSERT INTO cmi5_resources VALUES(?,?,?)'); for (const [path,data] of inspected.files) insert.run(id,path,data);
      return {packageId:id,sha256,state:'quarantined'};
    });
  }
  private package(p: Principal, id: string) {if(typeof id!=='string'||!uuid.test(id))cmi5Invalid('package UUID required');const row=this.db.prepare('SELECT * FROM cmi5_packages WHERE id=? AND tenant=?').get(id,p.tenant) as any; if(!row) reject('FORBIDDEN','Same-tenant cmi5 package required'); return row;}
  list(p: Principal, author=false, offset=0) {
    this.store.live(p,author); if(!Number.isSafeInteger(offset)||offset<0)cmi5Invalid('invalid page');
    const rows=this.db.prepare(`SELECT id,filename,sha256,state,manifest${author?',provenance,review_reason':''} FROM cmi5_packages WHERE tenant=? AND (?=1 OR state='published') ORDER BY created_at DESC,id`).all(p.tenant,author?1:0) as any[];
    return boundedPage(rows.map(({manifest,...row})=>{const m:CMI5Manifest=JSON.parse(manifest); return {...row,profile:m.profile,title:m.course.title,...this.activityPage(m,0)};}),offset);
  }
  private activityPage(m:CMI5Manifest,offset:number) {
    const page=boundedPage(m.aus.map(au=>({id:au.id,title:au.title,moveOn:au.moveOn,launchMethod:au.launchMethod,remoteOrigin:au.remote?new URL(au.href).origin:null,playbackSupported:!au.remote||this.remoteOrigins.includes(new URL(au.href).origin)})),offset,10);
    return {aus:page.items,auOffset:page.offset,nextAuOffset:page.nextOffset,auTotal:page.total};
  }
  activities(p:Principal,id:string,offset=0,author=false) {
    this.store.live(p,author);if(!Number.isSafeInteger(offset)||offset<0)cmi5Invalid('invalid AU page');
    const pkg=this.package(p,id);
    if(!author&&pkg.state!=='published')reject('FORBIDDEN','Published cmi5 package required');
    return this.activityPage(JSON.parse(pkg.manifest),offset);
  }
  review(p: Principal,a: any) {
    object(a,['packageId','sha256','action','reason','confirmed','key','revision'],['packageId','sha256','action','reason']);
    this.store.live(p,true); const pkg=this.package(p,a.packageId);
    if(pkg.sha256!==a.sha256 || !['publish','retire','revoke'].includes(a.action) || typeof a.reason!=='string' || !a.reason.trim() || a.reason.length>300)cmi5Invalid('exact hash and review reason required');
    return this.command(p,a,'human_cmi5_review',{packageId:pkg.id,sha256:pkg.sha256,action:a.action,reason:a.reason.trim()},true,()=>{
      const current=this.package(p,pkg.id).state;
      if(a.action==='publish'&&current!=='quarantined'||a.action==='retire'&&current!=='published'||a.action==='revoke'&&current==='revoked')cmi5Invalid('invalid package transition');
      const state=a.action==='publish'?'published':a.action==='retire'?'retired':'revoked';
      this.db.prepare('UPDATE cmi5_packages SET state=?,reviewer=?,review_reason=? WHERE id=?').run(state,p.id,a.reason.trim(),pkg.id);
      if(state==='revoked')for(const s of this.db.prepare("SELECT s.id FROM cmi5_sessions s JOIN cmi5_registrations r ON r.id=s.registration_id WHERE r.package_id=? AND s.status IN('launched','initialized')").all(pkg.id) as any[])this.abandon(this.session(s.id,false));
      return {packageId:pkg.id,state};
    });
  }
  export(p:Principal,id:string) {this.store.live(p,true); const pkg=this.package(p,id); return {bytes:Buffer.from(pkg.archive),filename:pkg.filename,mime:pkg.filename.endsWith('.xml') ? 'application/xml' : 'application/zip'};}
  private session(id:string, live=true) {
    const s=this.db.prepare(`SELECT s.*,r.tenant,r.learner,r.mode,r.actor,r.package_id,p.manifest,p.state AS package_state
      FROM cmi5_sessions s JOIN cmi5_registrations r ON r.id=s.registration_id JOIN cmi5_packages p ON p.id=r.package_id WHERE s.id=?`).get(id) as any;
    if(!s)reject('UNAUTHORIZED','cmi5 session unavailable');
    s.data=JSON.parse(s.launch_data); s.au=(JSON.parse(s.manifest) as CMI5Manifest).aus.find(a=>a.id===s.au_id);
    if(live) {
      if(s.au.remote&&!this.remoteOrigins.includes(this.sessionOrigin(s)))reject('UNAUTHORIZED','Remote AU origin configuration was revoked');
      const account=this.db.prepare('SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1').get(s.learner,s.tenant) as any;
      const browser=this.db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND principal=? AND auth_version=? AND expires>?').get(s.browser_session,s.learner,s.auth_version,Date.now());
      if(!account || account.auth_version!==s.auth_version || !browser || s.expires<=Date.now() || s.status==='abandoned' || s.package_state==='revoked' || s.package_state==='quarantined')reject('UNAUTHORIZED','cmi5 session revoked or expired');
      this.store.live(account,s.mode==='Browse');
      this.learningGuard(account,s.registration_id);
    }
    return s;
  }
  private actor(p:Principal) {return {objectType:'Agent',account:{homePage:this.pearOrigin,name:hash('cmi5:'+p.tenant+':'+p.id)}};}
  private learningGuard(p:Principal,id:string) {
    if(!this.bindings&&this.db.prepare('SELECT 1 FROM cmi5_learning_bindings WHERE registration_id=?').get(id))reject('FORBIDDEN','cmi5 learning authorization adapter required');
    return this.bindings?.guard(p,id);
  }
  launch(p:Principal,browserSession:string,a:any) {
    object(a,['packageId','auId','registrationId','mode','binding','confirmed','key','revision'],['packageId','auId','mode']);
    if(!['Normal','Browse','Review'].includes(a.mode))cmi5Invalid('explicit launch mode required');
    this.store.live(p,a.mode==='Browse'); const pkg=this.package(p,a.packageId), manifest:CMI5Manifest=JSON.parse(pkg.manifest), au=manifest.aus.find(v=>v.id===a.auId);
    if(!au) cmi5Invalid('manifest AU required');
    if(au.remote&&!this.remoteOrigins.includes(new URL(au.href).origin))reject('FORBIDDEN','Remote AU launch requires reviewed origin configuration');
    const binding=a.binding===undefined?undefined:this.bindings?.resolve(p,a.binding);
    if(a.binding!==undefined&&!binding)reject('FORBIDDEN','cmi5 learning bindings are unavailable');
    if(binding){if(a.mode==='Browse')reject('FORBIDDEN','Browse cannot bind official learning');this.bindings!.validate(p,binding,pkg.id);}
    return this.command(p,a,'human_cmi5_launch',{packageId:pkg.id,auId:au.id,registrationId:a.registrationId??null,mode:a.mode,binding:a.binding??null},false,()=>{
      const browser=this.db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND principal=? AND auth_version=? AND expires>?').get(browserSession,p.id,p.auth_version,Date.now());
      if(!browser)reject('UNAUTHORIZED','Live browser session required');
      let registration:any;
      const registrationId=a.registrationId??(binding?this.bindings!.find(p,binding)?.registration_id:undefined);
      if(registrationId!==undefined) {
        if(typeof registrationId!=='string'||!uuid.test(registrationId))cmi5Invalid('registration UUID required');
        registration=this.db.prepare('SELECT * FROM cmi5_registrations WHERE id=? AND tenant=? AND learner=? AND package_id=?').get(registrationId,p.tenant,p.id,pkg.id);
        if(!registration || registration.mode==='Browse'&&a.mode!=='Browse' || registration.mode!=='Browse'&&a.mode==='Browse')reject('FORBIDDEN','Own exact cmi5 registration required');
        const bound=this.learningGuard(p,registration.id);
        if(binding&&(!bound||bound.bindingKey!==binding.bindingKey))reject('FORBIDDEN','Exact cmi5 enrollment binding required');
      }
      const current=this.package(p,pkg.id).state;
      if(current!=='published' && !(registration && current==='retired'))reject('FORBIDDEN','Published or pinned retired cmi5 package required');
      if(registration&&a.mode==='Normal'&&this.db.prepare("SELECT 1 FROM cmi5_statements WHERE registration_id=? AND au_id=? AND source='lms' AND verb='waived'").get(registration.id,au.id))reject('FORBIDDEN','Waived AU requires Review mode or a new registration');
      if(!registration) {
        if(Number((this.db.prepare('SELECT COUNT(*) AS n FROM cmi5_registrations WHERE tenant=? AND learner=?').get(p.tenant,p.id) as any).n)>=200)cmi5Invalid('registration quota reached');
        registration={id:randomUUID()};
        this.db.prepare('INSERT INTO cmi5_registrations VALUES(?,?,?,?,?,?,?)').run(registration.id,pkg.id,p.tenant,p.id,binding?'Normal':a.mode,JSON.stringify(this.actor(p)),new Date().toISOString());
        if(binding)this.bindings!.attach(p,registration.id,binding);
      }
      for(const old of this.db.prepare("SELECT id FROM cmi5_sessions WHERE registration_id=? AND status IN('launched','initialized')").all(registration.id) as any[])this.abandon(this.session(old.id,false));
      const sessionId=randomUUID(), token=randomBytes(32).toString('base64url'), now=new Date().toISOString();
      const contextTemplate={extensions:{[cmi5Extension+'sessionid']:sessionId},contextActivities:{grouping:[{id:au.id}]}};
      const data={contextTemplate,launchMode:a.mode,moveOn:au.moveOn,...(au.masteryScore!==undefined?{masteryScore:au.masteryScore}:{}),...(au.launchParameters!==undefined?{launchParameters:au.launchParameters}:{}),...(au.entitlementKey!==undefined?{entitlementKey:{courseStructure:au.entitlementKey}}:{})};
      this.db.prepare('INSERT INTO cmi5_sessions(id,registration_id,au_id,auth_version,browser_session,fetch_hash,launch_data,created_at,expires) VALUES(?,?,?,?,?,?,?,?,?)').run(sessionId,registration.id,au.id,p.auth_version,browserSession,hash(token),JSON.stringify(data),now,Date.now()+4*60*60*1000);
      const s=this.session(sessionId), url=new URL(au.remote ? au.href : this.contentOrigin+'/cmi5/content/'+sessionId+'/files/'+au.href);
      const plainURL=url.href;
      for(const [key,value] of Object.entries({endpoint:this.contentOrigin+'/cmi5/xapi/',fetch:this.contentOrigin+'/cmi5/fetch/'+token,actor:s.actor,registration:registration.id,activityId:au.activityId}))url.searchParams.set(key,value);
      this.lms(s,'launched',undefined,undefined,{[cmi5Extension+'launchmode']:a.mode,[cmi5Extension+'moveon']:au.moveOn,[cmi5Extension+'launchurl']:plainURL,...(au.masteryScore!==undefined?{[cmi5Extension+'masteryscore']:au.masteryScore}:{}),...(au.launchParameters!==undefined?{[cmi5Extension+'launchparameters']:au.launchParameters}:{})});
      if(a.mode==='Normal')this.satisfaction(s);
      return {sessionId,registrationId:registration.id,auId:au.id,launchMethod:au.remote?'OwnWindow':au.launchMethod,url:url.href,officialLearningChanged:false};
    });
  }
  fetch(token:string) {
    return this.transaction(()=>{
      const row=this.db.prepare('SELECT id FROM cmi5_sessions WHERE fetch_hash=?').get(hash(token)) as any;
      if(!row)return {'error-code':'2','error-text':'Invalid launch capability'};
      let s:any; try{s=this.session(row.id);}catch{return {'error-code':'1','error-text':'Session expired or revoked'};}
      if(s.auth_hash || s.status==='terminated')return {'error-code':'1','error-text':'Token already returned or session expired'};
      const auth=Buffer.from(s.id+':'+randomBytes(32).toString('base64url')).toString('base64');
      this.db.prepare('UPDATE cmi5_sessions SET auth_hash=? WHERE id=?').run(hash(auth),s.id);
      return {'auth-token':auth};
    });
  }
  authenticate(header:string|undefined, statements=false) {
    if(typeof header!=='string'||!/^Basic [A-Za-z0-9+/]+={0,2}$/.test(header))reject('UNAUTHORIZED','cmi5 Basic token required');
    const row=this.db.prepare('SELECT id FROM cmi5_sessions WHERE auth_hash=?').get(hash(header.slice(6))) as any;
    if(!row)reject('UNAUTHORIZED','cmi5 token unavailable'); const s=this.session(row.id);
    if(s.status==='terminated' && (!statements || Date.now()>=s.terminated_at+5000))reject('UNAUTHORIZED','cmi5 session ended');
    return s;
  }
  resource(sessionId:string,path:string) {
    const s=this.session(sessionId);
    if(s.au.remote)reject('FORBIDDEN','Remote AUs cannot read local package resources');
    if(s.status==='terminated' && Date.now()>=s.terminated_at+5000)reject('UNAUTHORIZED','cmi5 session ended');
    packagePath(path); const file=this.db.prepare('SELECT bytes FROM cmi5_resources WHERE package_id=? AND path=?').get(s.package_id,path) as any;
    if(!file)reject('NOT_FOUND','cmi5 resource unavailable'); return {bytes:Buffer.from(file.bytes),mime:scormResourceMime(path)};
  }
  private lms(s:any,verb:string,result?:object,node?:CMI5Node,extra:object={}) {
    const context={...s.data.contextTemplate,registration:s.registration_id,extensions:{...s.data.contextTemplate.extensions,...extra},contextActivities:{grouping:[{id:node?.id??s.au.id}],category:[{id:cmi5Category}]}};
    const statement={id:randomUUID(),actor:JSON.parse(s.actor),verb:{id:['launched'].includes(verb)?exp+verb:adl+verb},object:{objectType:'Activity',id:node?.activityId??s.au.activityId,...(node?{definition:{type:'https://w3id.org/xapi/cmi5/activitytype/'+(node.auIds.length&&node.id===(JSON.parse(s.manifest) as CMI5Manifest).course.id?'course':'block')}}:{})},context,timestamp:new Date().toISOString(),...(result?{result}:{})};
    this.insert(s,statement,verb,true,'lms');
  }
  private insert(s:any,statement:any,verb:string,defined:boolean,source:'lms'|'au') {
    if(Number((this.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements WHERE registration_id=?').get(s.registration_id) as any).n)>=10000)cmi5Invalid('registration statement quota reached');
    const now=new Date().toISOString();
    this.db.prepare('INSERT INTO cmi5_statements(id,session_id,registration_id,au_id,verb,defined,source,timestamp,stored,payload_hash,statement) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(statement.id,s.id,s.registration_id,s.au_id,verb,defined?1:0,source,timestamp(statement.timestamp),now,hash(stable(statement)),JSON.stringify(statement));
  }
  private abandon(s:any) {
    if(!['launched','initialized'].includes(s.status))return;
    const last=this.db.prepare("SELECT MAX(timestamp) AS t FROM cmi5_statements WHERE session_id=? AND source='au'").get(s.id) as any;
    this.lms(s,'abandoned',{duration:'PT'+Math.max(0,(Date.parse(last.t??s.created_at)-Date.parse(s.created_at))/1000)+'S'});
    this.db.prepare("UPDATE cmi5_sessions SET status='abandoned' WHERE id=?").run(s.id);
  }
  private validate(s:any,input:any,references:Set<string>) {
    object(input,['id','actor','verb','object','context','result','timestamp','attachments'],['id','actor','verb','object','context','timestamp']);
    validateAttachments(input.attachments);
    if(typeof input.id!=='string'||!uuid.test(input.id)||Buffer.byteLength(JSON.stringify(input))>16*1024)cmi5Invalid('UUID and ≤16 KiB statement required');
    if(stable(input.actor)!==stable(JSON.parse(s.actor)))reject('FORBIDDEN','Exact launch actor required');
    object(input.verb,['id','display'],['id']); if(!cmi5IRI(input.verb.id))cmi5Invalid('verb IRI required');if(input.verb.display!==undefined)xapiLanguageMap(input.verb.display);
    const scoped=(id:string)=>{if(!references.has(id)&&!this.db.prepare('SELECT 1 FROM cmi5_statements WHERE id=? AND registration_id=?').get(id,s.registration_id))reject('FORBIDDEN','Scoped StatementRef unavailable');};
    xapiStatementObject(input.object,scoped);xapiContext(input.context,scoped);
    const c=input.context; if(c.registration!==s.registration_id||c.extensions?.[cmi5Extension+'sessionid']!==s.id)reject('FORBIDDEN','Exact registration/session required');
    if(!c.contextActivities||!c.extensions)cmi5Invalid('context template activities/extensions required');
    if(!c.contextActivities.grouping?.some((v:any)=>v.id===s.au.id))reject('FORBIDDEN','Publisher grouping required');
    const categories=c.contextActivities.category??[], defined=categories.some((v:any)=>v.id===cmi5Category), verb=input.verb.id.startsWith(exp)?input.verb.id.slice(exp.length):input.verb.id;
    if(input.verb.id===exp+'voided')reject('FORBIDDEN','AU credentials cannot void statements');
    const result=xapiResult(input.result??{},defined);
    if((c.revision!==undefined||c.platform!==undefined)&&(input.object.objectType??'Activity')!=='Activity')cmi5Invalid('revision/platform require an Activity object');
    if(defined) {
      if(!['initialized','completed','passed','failed','terminated'].includes(verb)||input.verb.id!==exp+verb)cmi5Invalid('AU cannot issue LMS-only or unknown defined verbs');
      if((input.object.objectType??'Activity')!=='Activity'||input.object.id!==s.au.activityId)reject('FORBIDDEN','Exact AU activity required');
      if(s.data.launchMode!=='Normal'&&!['initialized','terminated'].includes(verb))cmi5Invalid('Browse/Review cannot report satisfaction');
      if(result.success!==(['passed','failed'].includes(verb)?verb==='passed':undefined)||result.completion!==(verb==='completed'?true:undefined)||result.score!==undefined&&!['passed','failed'].includes(verb))cmi5Invalid('defined verb/result mismatch');
      if(['completed','passed','failed','terminated'].includes(verb))duration(result.duration);
      const move=categories.some((v:any)=>v.id===cmi5MoveCategory); if(move!==['completed','passed','failed'].includes(verb))cmi5Invalid('moveOn category/result mismatch');
      if(['passed','failed'].includes(verb)&&s.au.masteryScore!==undefined) {
        if(c.extensions[cmi5Extension+'masteryscore']!==s.au.masteryScore)cmi5Invalid('masteryScore extension required');
        if(result.score?.scaled!==undefined && (verb==='passed' ? result.score.scaled<s.au.masteryScore : result.score.scaled>=s.au.masteryScore))cmi5Invalid('score disagrees with masteryScore');
      }
    } else if(categories.some((v:any)=>v.id===cmi5MoveCategory))cmi5Invalid('allowed statements cannot assert moveOn');
    const time=timestamp(input.timestamp); if(Date.parse(time)<Date.parse(s.created_at))cmi5Invalid('statement precedes launch');
    return {statement:{...input,id:input.id.toLowerCase()},verb,defined,time};
  }
  write(header:string|undefined,body:any,parts?:AttachmentParts) {
    return this.transaction(()=>{
      const s=this.authenticate(header,true), batch=Array.isArray(body)?body:[body];
      if(!batch.length||batch.length>20||Buffer.byteLength(JSON.stringify(batch))>64*1024)cmi5Invalid('1–20 bounded statements required');
      const references=new Set<string>(batch.map(v=>typeof v?.id==='string'?v.id.toLowerCase():''));
      if(references.size!==batch.length)cmi5Invalid('duplicate statement ID in batch');
      const values=batch.map(v=>this.validate(s,v,references)), changed:string[]=[];
      const added=saveCMI5Attachments(this.db,s,values.flatMap(v=>v.statement.attachments??[]),parts);
      for(const v of values) {
        const old=this.db.prepare('SELECT * FROM cmi5_statements WHERE id=?').get(v.statement.id) as any;
        if(old) {if(old.session_id!==s.id)reject('FORBIDDEN','Statement ID unavailable');if(old.payload_hash!==hash(stable(v.statement)))reject('IDEMPOTENCY_CONFLICT','Statement payload changed');continue;}
        if(Number((this.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements WHERE registration_id=?').get(s.registration_id) as any).n)>=10000)cmi5Invalid('registration statement quota reached');
        this.insert(s,v.statement,v.verb,v.defined,'au'); changed.push(v.statement.id);
      }
      // Validate the complete history by source timestamps, including delayed
      // delivery during the five-second termination grace period. Equal times
      // are legal; lifecycle verbs define their boundary order.
      const history=this.db.prepare("SELECT * FROM cmi5_statements WHERE session_id=? AND source='au' ORDER BY timestamp,CASE WHEN defined=1 AND verb='initialized' THEN 0 WHEN defined=1 AND verb='terminated' THEN 2 ELSE 1 END,sequence").all(s.id) as any[];
      const defined=history.filter(v=>v.defined), seen=new Set<string>();
      for(const v of defined) {if(seen.has(v.verb))cmi5Invalid('duplicate defined verb');seen.add(v.verb);}
      if(seen.has('passed')&&seen.has('failed')||history.length&&(!history[0].defined||history[0].verb!=='initialized')||seen.has('terminated')&&(!history.at(-1).defined||history.at(-1).verb!=='terminated'))cmi5Invalid('invalid AU lifecycle ordering');
      const registration=this.db.prepare("SELECT s.* FROM cmi5_statements s WHERE registration_id=? AND au_id=? AND source='au' AND defined=1 ORDER BY timestamp,sequence").all(s.registration_id,s.au_id) as any[];
      for(const v of ['completed','passed'])if(registration.filter(row=>row.verb===v).length>1)cmi5Invalid('duplicate registration outcome');
      const passed=registration.find(v=>v.verb==='passed');if(passed&&registration.some(v=>v.verb==='failed'&&v.timestamp>passed.timestamp))cmi5Invalid('failed after registration passed');
      const status=seen.has('terminated')?'terminated':seen.has('initialized')?'initialized':'launched';
      this.db.prepare('UPDATE cmi5_sessions SET status=?,terminated_at=CASE WHEN ?=\'terminated\' THEN COALESCE(terminated_at,?) ELSE terminated_at END WHERE id=?').run(status,status,Date.now(),s.id);
      if(changed.length||added.length) {
        const p=this.db.prepare('SELECT * FROM accounts WHERE id=?').get(s.learner) as unknown as Principal;
        if(s.data.launchMode==='Normal'){this.satisfaction(s);this.bindings?.project(p,s,this.outcomes(s.registration_id,JSON.parse(s.manifest)));}
        this.audit(p,'cmi5_statements',{sessionId:s.id,statementIds:changed,...(added.length?{attachmentHashes:added}:{})},`learning:${s.tenant}:${s.learner}`);
      }
      return values.map(v=>v.statement.id);
    });
  }
  private outcomes(registration:string,manifest:CMI5Manifest) {
    const rows=this.db.prepare("SELECT au_id,verb,statement FROM cmi5_statements WHERE registration_id=? AND defined=1 AND (source='au' OR source='lms' AND verb='waived') ORDER BY timestamp,sequence").all(registration) as any[];
    const groups=new Map<string,any[]>();for(const row of rows){const group=groups.get(row.au_id)??[];group.push(row);groups.set(row.au_id,group);}
    return manifest.aus.map(au=>{
      const evidence=groups.get(au.id)??[], completed=evidence.some(r=>r.verb==='completed'), passed=evidence.some(r=>r.verb==='passed');
      const waiver=evidence.find(r=>r.verb==='waived'),waived=!!waiver;
      const satisfied=waived||au.moveOn==='NotApplicable'||au.moveOn==='Passed'&&passed||au.moveOn==='Completed'&&completed||au.moveOn==='CompletedAndPassed'&&completed&&passed||au.moveOn==='CompletedOrPassed'&&(completed||passed);
      const last=evidence.filter(r=>['passed','failed','terminated'].includes(r.verb)).at(-1), score=evidence.filter(r=>JSON.parse(r.statement).result?.score).at(-1);
      return {id:au.id,title:au.title,moveOn:au.moveOn,completed,passed,satisfied,waived,waiverReason:waiver?JSON.parse(waiver.statement).result.extensions['https://w3id.org/xapi/cmi5/result/extensions/reason']:null,success:evidence.some(r=>r.verb==='failed')&&!passed?false:passed?true:null,score:score?JSON.parse(score.statement).result.score:null,duration:last?JSON.parse(last.statement).result?.duration:null};
    });
  }
  private satisfaction(s:any) {
    const m:CMI5Manifest=JSON.parse(s.manifest), satisfied=new Set(this.outcomes(s.registration_id,m).filter(v=>v.satisfied).map(v=>v.id));
    for(const node of [...m.blocks,m.course])if(node.auIds.every(id=>satisfied.has(id))) {
      const existing=this.db.prepare("SELECT 1 FROM cmi5_statements WHERE registration_id=? AND source='lms' AND verb='satisfied' AND json_extract(statement,'$.object.id')=?").get(s.registration_id,node.activityId);
      if(!existing)this.lms(s,'satisfied',undefined,node);
    }
  }
  read(header:string|undefined,q:any,language?:string) {
    const s=this.authenticate(header,true); object(q,['statementId','voidedStatementId','registration','agent','verb','activity','related_activities','related_agents','since','until','ascending','format','attachments','after','cursor','limit']);
    if(q.registration!==undefined&&q.registration!==s.registration_id)reject('FORBIDDEN','Exact registration required');
    const bool=(key:string)=>{if(q[key]!==undefined&&!['true','false'].includes(q[key]))cmi5Invalid('Boolean query must be true or false');return q[key]==='true';};
    const ascending=q.ascending===undefined&&q.after!==undefined?true:bool('ascending'),related=bool('related_activities');bool('related_agents');
    bool('attachments');
    const format=q.format??'exact';if(!['exact','ids','canonical'].includes(format))cmi5Invalid('statement format invalid');
    const present=(row:any)=>statementFormat(this.stored(row),format,language);
    if(q.statementId!==undefined||q.voidedStatementId!==undefined) {
      const id=q.statementId??q.voidedStatementId;
      if(typeof id!=='string'||!uuid.test(id)||q.statementId!==undefined&&q.voidedStatementId!==undefined||Object.keys(q).some(k=>!['statementId','voidedStatementId','format','attachments'].includes(k)))cmi5Invalid('single UUID query required');
      const row=q.voidedStatementId===undefined?this.db.prepare('SELECT * FROM cmi5_statements WHERE id=? AND registration_id=?').get(id.toLowerCase(),s.registration_id) as any:undefined;
      if(!row)reject('NOT_FOUND','Scoped statement unavailable');return present(row);
    }
    if(q.agent!==undefined)this.agentQuery(s,q.agent);
    for(const key of ['verb','activity'])if(q[key]!==undefined&&!cmi5IRI(q[key]))cmi5Invalid('IRI query required');
    const since=xapiQueryTime(q.since),until=xapiQueryTime(q.until);
    const integer=(v:any)=>typeof v==='number'?Number.isSafeInteger(v)&&v>=0:typeof v==='string'&&/^(0|[1-9]\d{0,9})$/.test(v);
    if(!integer(q.after??0)||!integer(q.limit??0))cmi5Invalid('invalid statement page');
    const after=Number(q.after??0),limit=Math.min(Number(q.limit??0)||20,20);
    const max=Number((this.db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM cmi5_statements WHERE registration_id=?').get(s.registration_id) as any).n);
    let ceiling=max,lastTime:string|undefined,lastSequence:number|undefined;
    const filter=hash(stable(Object.fromEntries(Object.entries(q).filter(([key])=>key!=='cursor').map(([key,value])=>[key,String(value)]))));
    if(q.cursor!==undefined) {
      let cursor:any;try{if(typeof q.cursor!=='string'||q.cursor.length>256||!/^[A-Za-z0-9_-]+$/.test(q.cursor))throw Error();cursor=parseUniqueJSON(Buffer.from(q.cursor,'base64url').toString('utf8'));}catch{cmi5Invalid('invalid statement cursor');}
      if(!Array.isArray(cursor)||cursor.length!==5||cursor[0]!==filter||cursor[1]!==s.registration_id||!integer(cursor[2])||cursor[2]>max||typeof cursor[3]!=='string'||xapiQueryTime(cursor[3])!==cursor[3]||!integer(cursor[4])||cursor[4]>cursor[2])cmi5Invalid('statement cursor does not match query');
      [,,ceiling,lastTime,lastSequence]=cursor;
    }
    const where=['registration_id=?','sequence<=?','sequence>?'],args:any[]=[s.registration_id,ceiling,after];
    if(since){where.push('stored>?');args.push(since);}if(until){where.push('stored<=?');args.push(until);}
    const ctes=["targets(id,target) AS MATERIALIZED (SELECT id,lower(json_extract(statement,'$.object.id')) FROM cmi5_statements WHERE registration_id=? AND json_extract(statement,'$.object.objectType')='StatementRef')"],filterArgs:any[]=[s.registration_id];
    const matching=(name:string,condition:string,values:any[])=>{ctes.push(`${name}(id) AS (SELECT id FROM cmi5_statements WHERE registration_id=? AND (${condition}) UNION SELECT t.id FROM targets t JOIN ${name} matched ON t.target=matched.id)`);filterArgs.push(s.registration_id,...values);where.push(`id IN(SELECT id FROM ${name})`);};
    if(q.verb!==undefined)matching('verbMatches',"json_extract(statement,'$.verb.id')=?",[q.verb]);
    if(q.activity!==undefined){const conditions=["json_extract(statement,'$.object.id')=?"],values=[q.activity];if(related){conditions.push("json_extract(statement,'$.object.objectType')='SubStatement' AND json_extract(statement,'$.object.object.id')=?","EXISTS(SELECT 1 FROM json_each(statement,'$.context.contextActivities') AS groups,json_each(groups.value) AS activity WHERE json_extract(activity.value,'$.id')=?)","EXISTS(SELECT 1 FROM json_each(statement,'$.object.context.contextActivities') AS groups,json_each(groups.value) AS activity WHERE json_extract(activity.value,'$.id')=?)");values.push(q.activity,q.activity,q.activity);}matching('activityMatches',conditions.join(' OR '),values);}
    const direction=ascending?'ASC':'DESC',comparison=ascending?'>':'<';
    if(lastTime!==undefined){where.push(`(stored${comparison}? OR stored=? AND sequence${comparison}?)`);args.push(lastTime,lastTime,lastSequence);}
    const prefix=ctes.length>1?'WITH RECURSIVE '+ctes.join(',')+' ':'';
    const rows=this.db.prepare(`${prefix}SELECT * FROM cmi5_statements WHERE ${where.join(' AND ')} ORDER BY stored ${direction},sequence ${direction} LIMIT ?`).all(...(prefix?filterArgs:[]),...args,limit+1) as any[];
    const page=rows.slice(0,limit),next=new URLSearchParams(q);next.delete('cursor');
    if(rows.length>limit){const last=page.at(-1);next.set('cursor',Buffer.from(JSON.stringify([filter,s.registration_id,ceiling,last.stored,last.sequence])).toString('base64url'));}
    return {statements:page.map(present),more:rows.length>limit?'/cmi5/xapi/statements?'+next:''};
  }
  evidence(p:Principal,registrationId:string,q:any,admin=false) {
    this.report(p,registrationId,admin);object(q,['after','limit']);
    const after=Number(q.after??0),limit=Number(q.limit??20);if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>20)cmi5Invalid('invalid evidence page');
    const rows=this.db.prepare('SELECT * FROM cmi5_statements WHERE registration_id=? AND sequence>? ORDER BY sequence LIMIT ?').all(registrationId,after,limit+1) as any[];
    const page=rows.slice(0,limit);return {statements:page.map(row=>this.stored(row)),nextAfter:rows.length>limit?page.at(-1).sequence:null};
  }
  multipart(header:string|undefined,result:any) {
    const s=this.authenticate(header,true),parts:AttachmentParts=new Map(),metadata=new Map<string,any[]>();
    for(const statement of result.statements??[result])for(const a of statement.attachments??[]){const hash=a.sha2.toLowerCase(),group=metadata.get(hash)??[];group.push(a);metadata.set(hash,group);}
    for(const [hash,group] of metadata){const row=this.db.prepare('SELECT bytes FROM cmi5_attachments WHERE registration_id=? AND sha2=?').get(s.registration_id,hash) as any;if(row)parts.set(hash,{bytes:Buffer.from(row.bytes),...(group.every(a=>a.contentType===group[0].contentType)?{contentType:group[0].contentType}:{})});}
    return encodeCMI5Multipart(result,parts);
  }
  private stored(row:any) {return {...JSON.parse(row.statement),stored:row.stored,version:'1.0.3',authority:{objectType:'Agent',account:{homePage:this.pearOrigin,name:row.source==='lms'?'pear-cmi5-lms':row.session_id}}};}
  private agentQuery(s:any,value:any) {
    let agent:any;try{agent=parseUniqueJSON(value);}catch{cmi5Invalid('valid Agent query required');}
    object(agent,['objectType','name','account'],['account']);
    if(agent.name!==undefined&&(typeof agent.name!=='string'||agent.name.length>500))cmi5Invalid('bounded Agent display name required');
    if(agent.objectType!==undefined&&agent.objectType!=='Agent'||stable(agent.account)!==stable(JSON.parse(s.actor).account))reject('FORBIDDEN','Own launch Agent required');
    return agent;
  }
  state(header:string|undefined,q:any,method:string,body:any,headers:any={}) {
    const fn=()=>{
      const s=this.authenticate(header);object(q,['activityId','agent','registration','stateId','since'],['activityId','agent']);this.agentQuery(s,q.agent);
      if(q.activityId!==s.au.activityId||q.registration!==undefined&&q.registration!==s.registration_id)reject('FORBIDDEN','Exact state scope required');
      if(q.since!==undefined&&(q.stateId!==undefined||!['GET','HEAD'].includes(method)))cmi5Invalid('since requires a document list read');
      const scoped=q.registration!==undefined;
      if(q.stateId==='LMS.LaunchData'&&scoped) {
        if(!['GET','HEAD'].includes(method))reject('FORBIDDEN','LaunchData is read-only');
        return documentRead(s.data,'application/json',documentETag(s.launch_data),s.created_at,headers);
      }
      return cmi5Document(this.db,scoped?'state':'global-state',s,q.stateId,q.since,method,body,headers,scoped?[{id:'LMS.LaunchData',updated:s.created_at}]:[]);
    };
    return ['GET','HEAD'].includes(method)?fn():this.transaction(fn);
  }
  documentProfile(header:string|undefined,q:any,kind:'agent'|'activity',method:string,body:any,headers:any={}) {
    const fn=()=>{
      const s=this.authenticate(header);object(q,kind==='agent'?['agent','profileId','since']:['activityId','profileId','since'],kind==='agent'?['agent']:['activityId']);
      if(kind==='agent')this.agentQuery(s,q.agent);else if(q.activityId!==s.au.activityId)reject('FORBIDDEN','Exact AU Activity required');
      if(q.since!==undefined&&(q.profileId!==undefined||!['GET','HEAD'].includes(method)))cmi5Invalid('since requires a profile list read');
      const row=kind==='agent'?this.db.prepare('SELECT preferred_language,created_at FROM user_profiles WHERE user_id=?').get(s.learner) as any:undefined;
      if(kind==='agent'&&q.profileId==='cmi5LearnerPreferences') {
        if(!['GET','HEAD'].includes(method))reject('FORBIDDEN','LMS learner preferences are read-only');
        const preferences={languagePreference:row?.preferred_language??'en'};
        return documentRead(preferences,'application/json',documentETag(JSON.stringify(preferences)),row?.created_at,headers);
      }
      return cmi5Document(this.db,kind,s,q.profileId,q.since,method,body,headers,kind==='agent'?[{id:'cmi5LearnerPreferences',updated:row?.created_at??'1970-01-01T00:00:00.000Z'}]:[]);
    };
    return ['GET','HEAD'].includes(method)?fn():this.transaction(fn);
  }
  profile(header:string|undefined,q:any) {return this.documentProfile(header,q,'agent','GET',undefined).body;}
  agent(header:string|undefined,q:any) {
    const s=this.authenticate(header);object(q,['agent'],['agent']);this.agentQuery(s,q.agent);return {objectType:'Person',account:[JSON.parse(s.actor).account]};
  }
  activity(header:string|undefined,q:any) {
    const s=this.authenticate(header);object(q,['activityId'],['activityId']);if(q.activityId!==s.au.activityId)reject('FORBIDDEN','Exact AU Activity required');
    return {objectType:'Activity',id:s.au.activityId,definition:{name:s.au.names,description:s.au.descriptions,...(s.au.activityType?{type:s.au.activityType}:{})}};
  }
  waive(p:Principal,a:any) {
    object(a,['registrationId','auId','reason','confirmed','key','revision'],['registrationId','auId','reason']);
    if(typeof a.registrationId!=='string'||!uuid.test(a.registrationId)||!cmi5IRI(a.auId)||!cmi5WaiverReasons.includes(a.reason))cmi5Invalid('registration, AU and explicit waiver reason required');
    return this.command(p,a,'human_cmi5_waiver',{registrationId:a.registrationId,auId:a.auId,reason:a.reason},true,()=>{
      const report=this.report(p,a.registrationId,true);
      if(report.mode!=='Normal'||!['published','retired'].includes(report.packageState))reject('FORBIDDEN','Normal registration on a reviewed package required');
      const outcome=report.aus.find(au=>au.id===a.auId);if(!outcome)cmi5Invalid('exact registered AU required');
      if(outcome.waived||outcome.satisfied)cmi5Invalid('AU is already waived or satisfied');
      const r=this.db.prepare('SELECT * FROM cmi5_registrations WHERE id=?').get(a.registrationId) as any,learner=this.db.prepare('SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1').get(r.learner,r.tenant) as any;
      if(!learner)reject('FORBIDDEN','Active registration learner required');
      const bound=this.learningGuard(learner,r.id);if(bound&&!bound.reference.allowWaivers)reject('FORBIDDEN','Enrolled cmi5 policy does not permit waivers');
      for(const active of this.db.prepare("SELECT id FROM cmi5_sessions WHERE registration_id=? AND au_id=? AND status IN('launched','initialized')").all(r.id,a.auId) as any[])this.abandon(this.session(active.id,false));
      const id=randomUUID(),now=new Date().toISOString(),data={contextTemplate:{extensions:{[cmi5Extension+'sessionid']:id},contextActivities:{grouping:[{id:a.auId}]}},launchMode:'Normal'};
      // A dedicated expired LMS session satisfies Quartz 9.3.7 without minting
      // a fetch/Basic capability or pretending that the learner launched an AU.
      this.db.prepare("INSERT INTO cmi5_sessions(id,registration_id,au_id,auth_version,browser_session,fetch_hash,launch_data,status,created_at,expires,terminated_at) VALUES(?,?,?,?,?,?,?,'terminated',?,0,?)").run(id,r.id,a.auId,learner.auth_version,'','waived:'+id,JSON.stringify(data),now,Date.now());
      const s=this.session(id,false);this.lms(s,'waived',{extensions:{'https://w3id.org/xapi/cmi5/result/extensions/reason':a.reason}});this.satisfaction(s);this.bindings?.project(learner,s,this.outcomes(r.id,JSON.parse(s.manifest)));
      this.db.prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?').run(`learning:${r.tenant}:${r.learner}`);
      return {...this.report(p,r.id,true),sessionId:id};
    });
  }
  report(p:Principal,registrationId:string,admin=false) {
    this.store.live(p,admin);const r=this.db.prepare(`SELECT r.*,p.manifest,p.state AS package_state FROM cmi5_registrations r JOIN cmi5_packages p ON p.id=r.package_id WHERE r.id=? AND r.tenant=? AND (?=1 OR r.learner=?)`).get(registrationId,p.tenant,admin?1:0,p.id) as any;
    if(!r)reject('FORBIDDEN','Authorized cmi5 registration required');const m:CMI5Manifest=JSON.parse(r.manifest), aus=this.outcomes(r.id,m);
    const sessions=this.db.prepare("SELECT id,au_id,status,created_at,expires,EXISTS(SELECT 1 FROM cmi5_statements WHERE session_id=cmi5_sessions.id AND source='lms' AND verb='waived') AS waiver FROM cmi5_sessions WHERE registration_id=? ORDER BY created_at DESC,id LIMIT 20").all(r.id) as any[];
    const statementCount=(this.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements WHERE registration_id=?').get(r.id) as any).n;
    const binding=this.db.prepare('SELECT context,course_enrollment_id FROM cmi5_learning_bindings WHERE registration_id=?').get(r.id) as any;
    return {registrationId:r.id,packageId:r.package_id,title:m.course.title,mode:r.mode,packageState:r.package_state,aus,sessions:sessions.map(row=>({...row})),statementCount,satisfied:r.mode==='Normal'&&aus.every(a=>a.satisfied),learningBound:!!binding,learningKind:binding?(binding.course_enrollment_id?'course':'item'):null,waiverAllowed:!binding||JSON.parse(binding.context).reference.allowWaivers,officialLearningChanged:!!this.db.prepare('SELECT 1 FROM cmi5_completion_proofs WHERE registration_id=?').get(r.id)};
  }
  learningContext(p:Principal,a:any,offset=0) {
    this.store.live(p);if(!Number.isSafeInteger(offset)||offset<0)cmi5Invalid('invalid AU page');if(!this.bindings)reject('FORBIDDEN','cmi5 learning bindings are unavailable');
    const c=this.bindings.resolve(p,a);this.bindings.validate(p,c,c.reference.packageId);const pkg=this.package(p,c.reference.packageId),existing=this.bindings.find(p,c);
    return {packageId:pkg.id,sha256:pkg.sha256,title:JSON.parse(pkg.manifest).course.title,allowWaivers:c.reference.allowWaivers,...this.activityPage(JSON.parse(pkg.manifest),offset),registrationId:existing?.registration_id??null,completed:existing?this.bindings.completed(existing.registration_id):false};
  }
  registrations(p:Principal,admin=false,offset=0) {
    this.store.live(p,admin);if(!Number.isSafeInteger(offset)||offset<0)cmi5Invalid('invalid registration page');
    const rows=this.db.prepare(`SELECT r.id,r.learner,r.package_id,r.mode,p.manifest FROM cmi5_registrations r JOIN cmi5_packages p ON p.id=r.package_id WHERE r.tenant=? AND (?=1 OR r.learner=?) ORDER BY r.created_at DESC,r.id`).all(p.tenant,admin?1:0,p.id) as any[];
    return boundedPage(rows.map(({manifest,...row})=>({...row,title:JSON.parse(manifest).course.title})),offset);
  }
  close(p:Principal,id:string) {
    return this.transaction(()=>{this.store.live(p);const s=this.session(id,false);if(s.tenant!==p.tenant||s.learner!==p.id)reject('FORBIDDEN','Own cmi5 session required');this.abandon(s);return this.report(p,s.registration_id);});
  }
}
