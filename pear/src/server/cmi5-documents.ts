import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {parseUniqueJSON} from '../shared/json-unique.ts';
import {cmi5Invalid} from './cmi5-package.ts';
import {reject} from './errors.ts';
import {xapiQueryTime} from './cmi5-xapi.ts';

export const documentETag=(bytes:Buffer|string)=>'"'+createHash('sha1').update(bytes).digest('hex')+'"';
const jsonType=(type:string)=>type.split(';')[0]!.trim().toLowerCase()==='application/json';
function matches(header:unknown,etag:string|undefined,weak=false) {
  if(typeof header!=='string'||header.length>4096)cmi5Invalid('bounded ETag header required');
  return header.split(',').map(s=>s.trim()).some(tag=>tag==='*'?etag!==undefined:weak?tag.replace(/^W\//,'')===etag:tag===etag);
}
export function documentRead(body:any,type:string,etag:string,updated:string|undefined,headers:any={}) {
  const preconditionFailed=headers['if-match']!==undefined&&!matches(headers['if-match'],etag),notModified=headers['if-none-match']!==undefined&&matches(headers['if-none-match'],etag,true);
  return {body,contentType:type,etag,updated,...(preconditionFailed?{preconditionFailed:true}:notModified?{notModified:true}:{})};
}
export function documentSince(value:unknown) {
  return xapiQueryTime(value);
}

// Shared HTTP document semantics for four real storage scopes. SQL identifiers
// come only from this fixed kind, never a caller's query or document content.
export function cmi5Document(db:DatabaseSync,kind:'state'|'global-state'|'agent'|'activity',s:any,id:string|undefined,since:string|undefined,method:string,body:any,headers:any={},reserved:{id:string;updated?:string}[]=[]):any {
  const state=kind==='state',table=state?'cmi5_state':'cmi5_documents',idColumn=state?'state_id':'profile_id',columns=state?['registration_id','au_id']:['tenant','kind','subject'];
  const subject=kind==='agent'?s.learner:kind==='activity'?s.au.activityId:JSON.stringify([s.learner,s.au.activityId]);
  const scope=state?[s.registration_id,s.au_id]:[s.tenant,kind,subject],where=columns.map(col=>col+'=?').join(' AND '),time=documentSince(since);
  if(id!==undefined&&(typeof id!=='string'||!id||id.length>256))cmi5Invalid('bounded document ID required');
  if(time!==undefined&&(id!==undefined||!['GET','HEAD'].includes(method)))cmi5Invalid('since is only supported for document ID lists');
  if(id===undefined) {
    if(['GET','HEAD'].includes(method)) {
      const rows=db.prepare(`SELECT ${idColumn} AS id,updated_at FROM ${table} WHERE ${where} ORDER BY ${idColumn}`).all(...scope) as any[];
      const all=[...rows,...reserved],ids=[...new Set(all.filter(row=>!time||row.updated_at>time||row.updated&&row.updated>time).map(row=>row.id))].sort();
      const updated=all.map(row=>row.updated_at??row.updated).filter(Boolean).sort().at(-1);
      return documentRead(ids,'application/json',documentETag(JSON.stringify(ids)),updated,headers);
    }
    if(method!=='DELETE'||!['state','global-state'].includes(kind))cmi5Invalid('document ID required');
    db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...scope);return {};
  }
  const row=db.prepare(`SELECT * FROM ${table} WHERE ${where} AND ${idColumn}=?`).get(...scope,id) as any;
  const bytes=row?Buffer.from(row.bytes??row.body):undefined;
  if(['GET','HEAD'].includes(method)) {
    if(!row)reject('NOT_FOUND','Document unavailable');
    const value=jsonType(row.content_type)?parseUniqueJSON(bytes!.toString('utf8')):bytes;
    return {...documentRead(value,row.content_type,row.etag,row.updated_at,headers),raw:bytes};
  }
  if(headers['if-match']!==undefined&&!matches(headers['if-match'],row?.etag)||headers['if-none-match']!==undefined&&matches(headers['if-none-match'],row?.etag,true))return {preconditionFailed:true};
  if(row&&method==='PUT'&&['agent','activity'].includes(kind)&&headers['if-match']===undefined&&headers['if-none-match']===undefined)return {preconditionRequired:true};
  if(method==='DELETE'){db.prepare(`DELETE FROM ${table} WHERE ${where} AND ${idColumn}=?`).run(...scope,id);return {};}
  const type=String(headers['content-type']??'application/json').trim();
  if(!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;[^\r\n]{0,200})?$/i.test(type))cmi5Invalid('valid document media type required');
  let data:Buffer,value:any;
  if(jsonType(type)) {
    try {value=Buffer.isBuffer(body)?parseUniqueJSON(new TextDecoder('utf-8',{fatal:true}).decode(body)):body;}catch{cmi5Invalid('valid unique UTF-8 JSON document required');}
    const encoded=JSON.stringify(value);if(encoded===undefined)cmi5Invalid('JSON body required');data=Buffer.isBuffer(body)?body:Buffer.from(encoded);
  }else {if(!Buffer.isBuffer(body))cmi5Invalid('raw binary document body required');data=body;}
  if(method==='POST') {
    if(!jsonType(type)||row&&!jsonType(row.content_type)||!value||typeof value!=='object'||Array.isArray(value))cmi5Invalid('POST merge requires JSON objects');
    let old:any;try {old=row?parseUniqueJSON(bytes!.toString('utf8')):{};}catch{cmi5Invalid('existing JSON document invalid');}
    if(!old||typeof old!=='object'||Array.isArray(old))cmi5Invalid('POST merge requires existing JSON object');
    value={...old,...value};data=Buffer.from(JSON.stringify(value));
  }
  if(data.length>32*1024)cmi5Invalid('document exceeds 32 KiB');
  const quotaWhere=state?'registration_id=?':where,quotaScope=state?[s.registration_id]:scope;
  const used=db.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(${state?'COALESCE(length(bytes),length(CAST(body AS BLOB)))':'length(bytes)'}),0) AS bytes FROM ${table} WHERE ${quotaWhere}`).get(...quotaScope) as any;
  if(!row&&used.n>=128||used.bytes-(bytes?.length??0)+data.length>512*1024)cmi5Invalid('document scope quota reached');
  if(!state) {const total=db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS n FROM cmi5_documents WHERE tenant=?').get(s.tenant) as any;if(total.n-(bytes?.length??0)+data.length>16*1024*1024)cmi5Invalid('tenant document quota reached');}
  const etag=documentETag(data),updated=new Date().toISOString();
  if(state)db.prepare('INSERT INTO cmi5_state(registration_id,au_id,state_id,body,etag,updated_at,bytes,content_type) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(registration_id,au_id,state_id) DO UPDATE SET body=excluded.body,etag=excluded.etag,updated_at=excluded.updated_at,bytes=excluded.bytes,content_type=excluded.content_type').run(...scope,id,jsonType(type)?data.toString('utf8'):'',etag,updated,data,type);
  else db.prepare('INSERT INTO cmi5_documents VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(tenant,kind,subject,profile_id) DO UPDATE SET bytes=excluded.bytes,content_type=excluded.content_type,etag=excluded.etag,updated_at=excluded.updated_at').run(...scope,id,data,type,etag,updated);
  return {etag};
}
