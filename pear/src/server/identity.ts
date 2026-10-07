import {createHash,createPublicKey,randomBytes,verify} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {reject,boundedPage} from "./errors.ts";
export interface OIDCConfig {issuer:string;authorizationEndpoint:string;tokenEndpoint:string;jwksUri:string;clientId:string;clientSecret?:string;}
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export class IdentityService {
 readonly config:OIDCConfig|undefined;
 private keys:any[]=[];private keysUntil=0;
 constructor(readonly db:DatabaseSync,config:OIDCConfig|undefined,readonly origin:string,readonly fixture=false){
  if(!config)return;
  if(Object.keys(config).some(k=>!["issuer","authorizationEndpoint","tokenEndpoint","jwksUri","clientId","clientSecret"].includes(k)))throw Error("Unsupported OIDC configuration");
  if(typeof config.clientId!=="string"||!config.clientId||config.clientId.length>200||config.clientSecret!==undefined&&(typeof config.clientSecret!=="string"||config.clientSecret.length>2000))throw Error("Invalid OIDC client");
  const issuer=new URL(config.issuer);
  if(issuer.search||issuer.hash||issuer.username||issuer.password||config.issuer.endsWith("/"))throw Error("Use an exact issuer without trailing slash");
  for(const value of [origin,config.issuer,config.authorizationEndpoint,config.tokenEndpoint,config.jwksUri]){
   const url=new URL(value);if(url.username||url.password||url.hash||value.length>2048)throw Error("Invalid OIDC endpoint");
   if(url.protocol!=="https:"&&!(fixture&&url.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(url.hostname)))throw Error("OIDC requires HTTPS");
  }
  for(const value of [config.authorizationEndpoint,config.tokenEndpoint,config.jwksUri])if(new URL(value).origin!==issuer.origin)throw Error("OIDC endpoints must share the pinned issuer origin");
  this.config=Object.freeze({...config});
 }
 private live(p:Principal){
  const row=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1").get(p.id,p.tenant) as any;
  if(!row||row.auth_version!==p.auth_version)reject("UNAUTHORIZED","Active account required");
  if(row.role!=="admin")reject("FORBIDDEN","Identity settings require tenant administrator");
 }
 list(p:Principal,a:any){
  this.live(p);
  return {...boundedPage(this.db.prepare("SELECT issuer,subject,user_id AS userId,created_at AS createdAt FROM identity_links WHERE tenant=? ORDER BY issuer,subject").all(p.tenant),a.offset??0,a.limit??20),configured:!!this.config};
 }
 link(p:Principal,a:any){
  this.db.exec("BEGIN IMMEDIATE");
  try{
   this.live(p);if(!this.config)reject("FORBIDDEN","OIDC provider is not configured");
   if(!a||Object.keys(a).sort().join(",")!=="action,key,reason,revision,subject,userId"||!["link","unlink"].includes(a.action)||
     typeof a.key!=="string"||!/^[a-zA-Z0-9_-]{1,128}$/.test(a.key)||typeof a.subject!=="string"||!/^[\x21-\x7e]{1,255}$/.test(a.subject)||
     typeof a.userId!=="string"||a.userId.length>64||typeof a.reason!=="string"||!a.reason.trim()||a.reason.length>300||
     !Number.isSafeInteger(a.revision)||a.revision<0)reject("INVALID_ARGUMENT","Invalid reviewed identity mapping");
   const doc="library:"+p.tenant,payload=digest(JSON.stringify(Object.fromEntries(Object.entries(a).filter(([key])=>key!=="revision")))),old=this.db.prepare("SELECT payload,result FROM idempotency WHERE principal=? AND document_id=? AND key=?").get(p.id,doc,a.key) as any;
   if(old){if(old.payload!==payload)reject("IDEMPOTENCY_CONFLICT","Identity mapping request changed");this.db.exec("COMMIT");return JSON.parse(old.result);}
   const target=this.db.prepare("SELECT id FROM accounts WHERE id=? AND tenant=? AND active=1").get(a.userId,p.tenant);
   if(!target)reject("FORBIDDEN","Active same-tenant user required");
   const workspace=this.db.prepare("SELECT revision FROM workspaces WHERE id=?").get(doc) as any;
   if(workspace.revision!==a.revision)reject("STALE_CONTEXT","Identity settings changed; refresh");
   const existing=this.db.prepare("SELECT user_id FROM identity_links WHERE issuer=? AND subject=?").get(this.config!.issuer,a.subject) as any;
   if(existing&&existing.user_id!==a.userId)reject("FORBIDDEN","Subject is linked to another account; unlink explicitly first");
   if(a.action==="link"){
    const other=this.db.prepare("SELECT subject FROM identity_links WHERE issuer=? AND user_id=?").get(this.config!.issuer,a.userId) as any;
    if(other&&other.subject!==a.subject)reject("INVALID_ARGUMENT","User already has a subject for this issuer");
    this.db.prepare("INSERT OR IGNORE INTO identity_links VALUES(?,?,?,?,?)").run(p.tenant,this.config!.issuer,a.subject,a.userId,new Date().toISOString());
   }else {const removed=this.db.prepare("DELETE FROM identity_links WHERE tenant=? AND issuer=? AND subject=? AND user_id=?").run(p.tenant,this.config!.issuer,a.subject,a.userId);if(Number(removed.changes)!==1)reject("FORBIDDEN","Current exact identity mapping required");}
   this.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id=? AND tenant=?").run(a.userId,p.tenant);
   this.db.prepare("DELETE FROM sessions WHERE principal=?").run(a.userId);
   this.db.prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?").run(doc);
   this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(p.tenant,p.id,doc,"human_identity_"+a.action,
    JSON.stringify({issuer:this.config!.issuer,subject:a.subject,userId:a.userId,reason:a.reason}),new Date().toISOString());
   const result={userId:a.userId,action:a.action,sessionsRevoked:true};
   this.db.prepare("INSERT INTO idempotency VALUES(?,?,?,?,?)").run(p.id,doc,a.key,payload,JSON.stringify(result));
   this.db.exec("COMMIT");return result;
  }catch(e){this.db.exec("ROLLBACK");throw e;}
 }
 start(previousToken?:string){
  if(!this.config)reject("FORBIDDEN","OIDC provider is not configured");
  const now=Date.now();this.db.prepare("DELETE FROM identity_transactions WHERE expires<?").run(now);
  if(Number((this.db.prepare("SELECT COUNT(*) AS n FROM identity_transactions").get() as any).n)>=1024)reject("FORBIDDEN","Identity transaction capacity reached");
  const state=randomBytes(32).toString("base64url"),binding=randomBytes(32).toString("base64url"),nonce=randomBytes(32).toString("base64url"),verifier=randomBytes(32).toString("base64url");
  this.db.prepare("INSERT INTO identity_transactions(state_hash,binding_hash,nonce,verifier,expires,previous_token_hash,provider_hash) VALUES(?,?,?,?,?,?,?)").run(digest(state),digest(binding),nonce,verifier,now+300000,previousToken?digest(previousToken):null,digest(JSON.stringify(this.config)));
  const url=new URL(this.config!.authorizationEndpoint);
  for(const [key,value] of Object.entries({client_id:this.config!.clientId,response_type:"code",scope:"openid",redirect_uri:this.origin+"/api/auth/callback",state,nonce,
    code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"}))url.searchParams.set(key,value);
  return {url:url.toString(),binding};
 }
 private async json(url:string,init:RequestInit={}){
  const response=await fetch(url,{...init,redirect:"error",signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error("Identity endpoint rejected request");
  const reader=response.body!.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error("Identity response exceeds bound");parts.push(value);}}
  finally{await reader.cancel();}
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
 }
 private async token(value:string,nonce:string){
  if(value.length>16384)throw Error("Identity token exceeds bound");
  const segments=value.split(".");if(segments.length!==3||segments.some(s=>!s||!/^[A-Za-z0-9_-]+$/.test(s)))throw Error("Invalid identity token");
  const header=JSON.parse(Buffer.from(segments[0]!,"base64url").toString("utf8"));
  if(header.alg!=="RS256"||typeof header.kid!=="string"||header.kid.length>200||header.crit||header.jku||header.jwk||header.x5u)throw Error("Unsupported identity signing profile");
  if(this.keysUntil<Date.now()||!this.keys.some(k=>k.kid===header.kid)){
   const jwks=await this.json(this.config!.jwksUri);
   if(!Array.isArray(jwks.keys)||!jwks.keys.length||jwks.keys.length>16||new Set(jwks.keys.map((k:any)=>k.kid)).size!==jwks.keys.length)throw Error("Invalid identity key set");
   this.keys=jwks.keys;this.keysUntil=Date.now()+300000;
  }
  const jwk=this.keys.find(k=>k.kid===header.kid);
  if(!jwk||jwk.kty!=="RSA"||jwk.use&&jwk.use!=="sig"||jwk.alg&&jwk.alg!=="RS256"||jwk.key_ops&&(!Array.isArray(jwk.key_ops)||!jwk.key_ops.includes("verify"))||jwk.d)throw Error("Identity verification key unavailable");
  const key=createPublicKey({key:jwk,format:"jwk"});
  if((key.asymmetricKeyDetails?.modulusLength??0)<2048||!verify("RSA-SHA256",Buffer.from(segments[0]+"."+segments[1]),key,Buffer.from(segments[2]!,"base64url")))throw Error("Identity signature rejected");
  const claims=JSON.parse(Buffer.from(segments[1]!,"base64url").toString("utf8")),now=Math.floor(Date.now()/1000),aud=typeof claims.aud==="string"?[claims.aud]:claims.aud;
  if(claims.iss!==this.config!.issuer||!Array.isArray(aud)||aud.length!==1||aud[0]!==this.config!.clientId||
    claims.azp!==undefined&&claims.azp!==this.config!.clientId||claims.nonce!==nonce||typeof claims.sub!=="string"||!/^[\x21-\x7e]{1,255}$/.test(claims.sub)||
    !Number.isSafeInteger(claims.exp)||claims.exp<=now||!Number.isSafeInteger(claims.iat)||claims.iat>now+60||claims.iat<now-600||
    claims.exp-claims.iat>3600||claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+60))throw Error("Identity claims rejected");
  return claims;
 }
 async callback(a:any,binding:string|undefined){
  if(!this.config||!binding||typeof a.state!=="string"||a.state.length>200||typeof a.code!=="string"||!a.code||a.code.length>2048||
    a.iss!==undefined&&a.iss!==this.config.issuer||a.error)reject("UNAUTHORIZED","Identity response rejected");
  this.db.exec("BEGIN IMMEDIATE");let transaction:any;
  try{
   transaction=this.db.prepare("SELECT * FROM identity_transactions WHERE state_hash=? AND binding_hash=? AND expires>? AND used=0 AND provider_hash=?").get(digest(a.state),digest(binding!),Date.now(),digest(JSON.stringify(this.config)));
   if(!transaction)reject("UNAUTHORIZED","Identity state expired or unavailable");
   this.db.prepare("UPDATE identity_transactions SET used=1 WHERE state_hash=?").run(digest(a.state));this.db.exec("COMMIT");
  }catch(e){this.db.exec("ROLLBACK");throw e;}
  try{
   const body=new URLSearchParams({grant_type:"authorization_code",code:a.code,redirect_uri:this.origin+"/api/auth/callback",client_id:this.config.clientId,code_verifier:transaction.verifier});
   if(this.config.clientSecret)body.set("client_secret",this.config.clientSecret);
   const result=await this.json(this.config.tokenEndpoint,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
   if(typeof result.id_token!=="string")throw Error("Missing identity token");
   const claims=await this.token(result.id_token,transaction.nonce);
   this.db.exec("BEGIN IMMEDIATE");
   try{
    const account=this.db.prepare("SELECT a.* FROM identity_links l JOIN accounts a ON a.id=l.user_id AND a.tenant=l.tenant WHERE l.issuer=? AND l.subject=? AND a.active=1").get(this.config.issuer,claims.sub) as any;
    if(!account)reject("UNAUTHORIZED","Identity has no active reviewed account mapping");
    const token=randomBytes(32).toString("hex"),csrf=randomBytes(32).toString("hex");
    if(transaction.previous_token_hash)this.db.prepare("DELETE FROM sessions WHERE token_hash=?").run(transaction.previous_token_hash);
    this.db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?)").run(digest(token),account.id,csrf,Date.now()+8*3600000,account.auth_version);
    this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)").run(account.tenant,account.id,"learning:"+account.tenant+":"+account.id,"human_oidc_login",JSON.stringify({issuer:this.config.issuer}),new Date().toISOString());
    this.db.exec("COMMIT");return {token,csrf,account};
   }catch(e){this.db.exec("ROLLBACK");throw e;}
  }catch{reject("UNAUTHORIZED","Identity verification failed; restart sign-in");}
  finally{this.db.prepare("DELETE FROM identity_transactions WHERE state_hash=?").run(digest(a.state));}
 }
}
