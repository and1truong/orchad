import {validReply,safeSchema} from './validation.mjs';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import Ajv from 'ajv';
export const ok=(data,revision=null)=>({ok:true,revision,data,error:null});
export const fail=(code,message=code,retryable=false)=>({ok:false,revision:null,data:null,error:{code,message,retryable}});
export const canonical=x=>JSON.stringify(x,(_,v)=>v && typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const ajv=new Ajv({strict:false});
export class Policy {
 constructor(dispatch,{timeout=10000}={}) {this.dispatch=dispatch;this.timeout=timeout;this.targets=new Map();this.clients=new Map();this.pending=new Map();this.audit=[];this.uiUntil=0;this.tools=new Map();}
 log(client,tool,ok,code=null){this.audit.push({at:Date.now(),client,tool,ok,code});if(this.audit.length>200)this.audit.shift();}
 heartbeat(){this.uiUntil=Date.now()+4000;}
 // Pairing snapshots the full binding (targetId + pageInstanceId + appId +
 // documentId + sessionEpoch) per target, not just the targetId: a native
 // rebind or session change therefore revokes the grant instead of extending
 // it to the new document/session.
 pair(name,scopes,targetIds,ttl=3600000){if(!name||!scopes.every(s=>['read','write'].includes(s))||!targetIds.every(id=>this.targets.has(id)))throw Error('Invalid pairing');const token=randomBytes(32).toString('base64url');const id=randomUUID();const bindings={};for(const tid of targetIds)bindings[tid]=canonical(this.targets.get(tid));this.clients.set(createHash('sha256').update(token).digest('hex'),{id,name,scopes,bindings,expires:Date.now()+Math.min(ttl,3600000)});this.log(name,'pair',true);return {id,token,expires:Date.now()+Math.min(ttl,3600000)};}
 authenticate(token){const c=this.clients.get(createHash('sha256').update(token).digest('hex'));return c&&c.expires>Date.now()?c:null;}
 revoke(id){for(const [key,c] of this.clients)if(c.id===id)this.clients.delete(key);for(const [key,a]of this.pending)if(a.client.id===id){a.resolve(false);this.pending.delete(key);}this.log(id,'revoke',true);}
 // Bindings always carry sessionEpoch (null when the app binds no session) so
 // canonical equality covers it; the native layer rotates pageInstanceId and
 // re-pins the epoch whenever documentId or sessionEpoch change.
 bind(t){this.invalidate(t.targetId);this.targets.set(t.targetId,{sessionEpoch:null,...t});}
 invalidate(id){this.targets.delete(id);this.tools.delete(id);for(const [key,a]of this.pending)if(a.target.targetId===id){a.resolve(false);this.pending.delete(key);}}
 allowed(c,t){return c?.id==='sidebar'||c?.bindings?.[t.targetId]===canonical(t);}
 current(t,c){const now=this.targets.get(t.targetId);return now&&canonical(now)===canonical(t)&&this.allowed(c,now)&&(c.id==='sidebar'||[...this.clients.values()].some(x=>x===c&&x.expires>Date.now()));}
 decide(id,allow){const a=this.pending.get(id);if(!a)return false;this.pending.delete(id);const granted=allow===true&&Date.now()<a.expires&&this.uiUntil>Date.now()&&this.current(a.target,a.client);this.log(a.client.name,'decide',granted);a.resolve(granted);return true;}
 async page(t,op,call,signal){if(signal?.aborted)return fail('CANCELLED');let timer,abort;try{const result=await Promise.race([this.dispatch(t,op,call,signal),new Promise(resolve=>{timer=setTimeout(()=>resolve(fail('TIMEOUT')),this.timeout);abort=()=>resolve(fail('CANCELLED'));signal?.addEventListener('abort',abort,{once:true});})]);if(!validReply(result,op))return fail('INVALID_ARGUMENT','Invalid page response');if(!result.ok&&['UNAUTHORIZED','FORBIDDEN'].includes(result.error.code))this.invalidate(t.targetId);return result;}catch(e){return fail('TARGET_CLOSED',String(e));}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
 // Drop the stored binding only if it still canonical-equals the stale one
 // the caller held — a concurrent native rebind already replaced it with
 // rotated identity and must survive.
 dropStale(t){const now=this.targets.get(t.targetId);if(t.appId!==''&&now&&canonical(now)===canonical(t))this.invalidate(t.targetId);}
 // A returned context must match the binding on app, document AND session
 // epoch before it is revealed; a session epoch appearing, changing or
 // disappearing invalidates the old authority.
 contextMatches(t,c){return c.appId===t.appId&&c.documentId===t.documentId&&(c.sessionEpoch??null)===(t.sessionEpoch??null);}
 async execute(c,name,args,signal){let result;try{result=await this.perform(c,name,args,signal);}catch(e){result=fail('INVALID_ARGUMENT',String(e));}this.log(c?.name??'unknown',name,result.ok,result.error?.code??null);return result;}
 async perform(c,name,args,signal){if(signal?.aborted)return fail('CANCELLED');if(!c)return fail('UNAUTHORIZED');if(!args||typeof args!=='object'||Array.isArray(args))return fail('INVALID_ARGUMENT');if(name==='host_list_targets')return Object.keys(args).length?fail('INVALID_ARGUMENT'):ok({targets:[...this.targets.values()].filter(t=>this.allowed(c,t))});
 if(!['host_get_context','host_list_tools','host_call_tool'].includes(name))return fail('UNSUPPORTED');const t=this.targets.get(args.targetId);if(!t)return fail('TARGET_CLOSED');if(!this.allowed(c,t)||!c.scopes.includes('read'))return fail('FORBIDDEN');if(args.pageInstanceId!==t.pageInstanceId)return fail('STALE_CONTEXT');
 if(name!=='host_call_tool'){const r=await this.page(t,name==='host_get_context'?'getContext':'describe',null,signal);if(r.ok&&name==='host_get_context'&&!this.contextMatches(t,r.data)){this.dropStale(t);return fail('STALE_CONTEXT');}if(!this.current(t,c))return fail('STALE_CONTEXT');if(r.ok&&name==='host_list_tools'){if(r.data.protocolVersion!=='0.1'||r.data.appId!==t.appId)return fail('UNSUPPORTED');this.tools.set(t.targetId,r.data.tools);}return r;}
 const call=args.call;if(!call||Object.keys(call).sort().join(',')!=='arguments,documentId,expectedRevision,idempotencyKey,requestId,toolName'||typeof call.requestId!=='string'||call.documentId!==t.documentId||!call.arguments||typeof call.arguments!=='object'||Array.isArray(call.arguments))return fail('INVALID_ARGUMENT');
 const descriptor=this.tools.get(t.targetId)?.find(x=>x.name===call.toolName);if(!descriptor)return fail('UNSUPPORTED');if(!safeSchema(descriptor.inputSchema))return fail('UNSUPPORTED','Tool schema is outside the host-safe subset');if(!/^[A-Za-z0-9_-]{1,64}$/.test(descriptor.name)||!ajv.validate(descriptor.inputSchema,call.arguments))return fail('INVALID_ARGUMENT');
 // Envelope shape follows the declared effect, not the caller: reads carry
 // expectedRevision/idempotencyKey null, mutations carry CAS revision + key.
 // A descriptor that flips read->write produces a null-envelope write call
 // that the app backend rejects — the asymmetry fails safe.
 const isRead=descriptor.effect==='read';if(isRead?(call.expectedRevision!==null||call.idempotencyKey!==null):(!Number.isInteger(call.expectedRevision)||call.expectedRevision<0||typeof call.idempotencyKey!=='string'||!call.idempotencyKey))return fail('INVALID_ARGUMENT');
 const frozen=JSON.parse(canonical(call));
 if(isRead){const pre=await this.page(t,'getContext',null,signal);if(!pre.ok)return pre;if(!this.contextMatches(t,pre.data)||!this.current(t,c)){this.dropStale(t);return fail('STALE_CONTEXT');}return this.page(t,'invoke',frozen,signal);}
 if(!c.scopes.includes('write'))return fail('FORBIDDEN');if(this.uiUntil<Date.now())return fail('APPROVAL_DENIED','Trusted approval UI is inactive');
 if(this.pending.size>=64)return fail('APPROVAL_DENIED','Approval queue is full');
 const id=randomUUID();let timer,abort;const approved=await new Promise(resolve=>{this.pending.set(id,{id,client:c,target:{...t},call:frozen,expires:Date.now()+this.timeout,resolve});timer=setTimeout(()=>{this.pending.delete(id);resolve(false);},this.timeout);abort=()=>{this.pending.delete(id);resolve(false);};signal?.addEventListener('abort',abort,{once:true});});clearTimeout(timer);signal?.removeEventListener('abort',abort);if(signal?.aborted)return fail('CANCELLED');if(!this.current(t,c))return fail('STALE_CONTEXT');if(!approved)return fail('APPROVAL_DENIED');const context=await this.page(t,'getContext',null,signal);if(!context.ok)return context;if(!this.contextMatches(t,context.data)||context.data.documentId!==frozen.documentId||!this.current(t,c)){this.dropStale(t);return fail('STALE_CONTEXT');}if(this.uiUntil<Date.now())return fail('APPROVAL_DENIED');return this.page(t,'invoke',frozen,signal);
 }
 snapshot(){return {targets:[...this.targets.values()],approvals:[...this.pending.values()].map(a=>({id:a.id,client:a.client.name,target:a.target,call:a.call,expires:a.expires})),audit:this.audit,clients:[...this.clients.values()].map(c=>({id:c.id,name:c.name,expires:c.expires,scopes:c.scopes,targetIds:Object.keys(c.bindings??{})}))};}
}
export const sidebar={id:'sidebar',name:'Sidebar',scopes:['read','write']};
