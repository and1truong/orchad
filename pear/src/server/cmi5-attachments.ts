import {createHash,randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {parseUniqueJSON} from '../shared/json-unique.ts';
import {cmi5Invalid,cmi5IRI,cmi5RemoteURL} from './cmi5-package.ts';
import {xapiObject,xapiLanguageMap} from './cmi5-xapi.ts';

export const attachmentLimits={transmission:256*1024,json:64*1024,bytes:32*1024,parts:4,registration:512*1024,tenant:16*1024*1024};
export type AttachmentPart={bytes:Buffer;contentType?:string};
export type AttachmentParts=Map<string,AttachmentPart>;
const sha2=/^(?:[a-f0-9]{64}|[a-f0-9]{96}|[a-f0-9]{128})$/i;
const media=/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;[^\r\n]{0,200})?$/i;
export function attachmentHash(bytes:Buffer,hash:string){return createHash(hash.length===64?'sha256':hash.length===96?'sha384':'sha512').update(bytes).digest('hex');}
export function validateAttachments(value:any) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>attachmentLimits.parts)cmi5Invalid('at most four attachment objects required');
  for(const a of value){xapiObject(a,['usageType','display','description','contentType','length','sha2','fileUrl'],['usageType','display','contentType','length','sha2']);if(!cmi5IRI(a.usageType)||typeof a.contentType!=='string'||!media.test(a.contentType)||!Number.isSafeInteger(a.length)||a.length<0||a.length>attachmentLimits.bytes||typeof a.sha2!=='string'||!sha2.test(a.sha2))cmi5Invalid('bounded attachment metadata, media type and SHA-2 required');xapiLanguageMap(a.display);if(!Object.keys(a.display).length)cmi5Invalid('attachment display required');if(a.description!==undefined)xapiLanguageMap(a.description);if(a.fileUrl!==undefined)cmi5RemoteURL(a.fileUrl);}
  return value as any[];
}
export function parseCMI5Multipart(bytes:Buffer,contentType:string):{body:any;parts:AttachmentParts} {
  if(!Buffer.isBuffer(bytes)||bytes.length>attachmentLimits.transmission)cmi5Invalid('bounded multipart body required');
  const match=/^multipart\/mixed\s*;\s*boundary=(?:"([a-z0-9'()+_,.\/:=? -]{1,70})"|([a-z0-9'()+_,.\/:=?-]{1,70}))\s*$/i.exec(contentType),boundary=match?.[1]??match?.[2];
  if(!boundary||boundary.endsWith(' '))cmi5Invalid('bounded MIME boundary required');
  const marker=Buffer.from('--'+boundary),separator=Buffer.from('\r\n--'+boundary),parts:AttachmentParts=new Map();let position=0,body:any,index=0;
  // Bounded, strict CRLF MIME framing. Scan Buffer delimiters, not text, so
  // arbitrary binary data and near-boundary prefixes survive byte-for-byte.
  if(!bytes.subarray(0,marker.length).equals(marker))cmi5Invalid('multipart opening boundary required');position=marker.length;
  while(true) {
    if(!bytes.subarray(position,position+2).equals(Buffer.from('\r\n')))cmi5Invalid('multipart CRLF required');position+=2;
    const end=bytes.indexOf('\r\n\r\n',position);if(end<0||end-position>4096)cmi5Invalid('bounded MIME headers required');
    const headers:Record<string,string>={};for(const line of bytes.subarray(position,end).toString('latin1').split('\r\n')){const h=/^([a-z0-9-]+):[ \t]*([\x20-\x7e\t]*)$/i.exec(line);if(!h||Object.hasOwn(headers,h[1]!.toLowerCase()))cmi5Invalid('unique ASCII MIME headers required');headers[h[1]!.toLowerCase()]=h[2]!.trim();}
    position=end+4;let next=position;
    while(true){next=bytes.indexOf(separator,next);if(next<0)cmi5Invalid('multipart closing boundary required');const at=next+separator.length,suffix=bytes.subarray(at,at+2).toString('ascii');if(suffix==='\r\n'||suffix==='--'&&(at+2===bytes.length||bytes.subarray(at+2,at+4).toString('ascii')==='\r\n'))break;next++;}
    const payload=bytes.subarray(position,next),type=headers['content-type'];
    if(index===0){if(!type||!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(type)||payload.length>attachmentLimits.json||headers['content-transfer-encoding']!==undefined&&headers['content-transfer-encoding']!=='binary')cmi5Invalid('first multipart part must be bounded UTF-8 JSON');try{body=parseUniqueJSON(new TextDecoder('utf-8',{fatal:true}).decode(payload));}catch{cmi5Invalid('valid unique UTF-8 statement JSON required');}}
    else {const hash=headers['x-experience-api-hash'];if(!hash||!sha2.test(hash)||headers['content-transfer-encoding']!==undefined&&headers['content-transfer-encoding'].toLowerCase()!=='binary'||type!==undefined&&!media.test(type)||payload.length>attachmentLimits.bytes||parts.size>=attachmentLimits.parts||parts.has(hash.toLowerCase())||attachmentHash(payload,hash)!==hash.toLowerCase())cmi5Invalid('bounded unique binary MIME part with matching SHA-2 required');parts.set(hash.toLowerCase(),{bytes:payload,contentType:type});}
    index++;position=next+separator.length;
    if(bytes.subarray(position,position+2).toString('ascii')==='--'){position+=2;if(position!==bytes.length&&!bytes.subarray(position).equals(Buffer.from('\r\n')))cmi5Invalid('multipart epilogue unsupported');break;}
  }
  return {body,parts};
}
export function saveCMI5Attachments(db:DatabaseSync,s:any,attachments:any[],parts?:AttachmentParts) {
  const referenced=new Map<string,any[]>();for(const a of attachments){const hash=a.sha2.toLowerCase(),group=referenced.get(hash)??[];group.push(a);referenced.set(hash,group);if(!parts&&a.fileUrl===undefined)cmi5Invalid('JSON attachments require fileUrl');if(parts&&!parts.has(hash)&&a.fileUrl===undefined)cmi5Invalid('attachment requires a matching received part or fileUrl');}
  const added:string[]=[];
  for(const [hash,part] of parts??[]) {
    const metadata=referenced.get(hash);if(!metadata||metadata.some(a=>a.length!==part.bytes.length||part.contentType!==undefined&&part.contentType!==a.contentType)||attachmentHash(part.bytes,hash)!==hash)cmi5Invalid('attachment header, bytes and metadata must match');
    const old=db.prepare('SELECT bytes FROM cmi5_attachments WHERE registration_id=? AND sha2=?').get(s.registration_id,hash) as any;
    if(old){if(!Buffer.from(old.bytes).equals(part.bytes))cmi5Invalid('attachment content changed');continue;}
    const used=db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS n FROM cmi5_attachments WHERE registration_id=?').get(s.registration_id) as any,total=db.prepare('SELECT COALESCE(SUM(length(bytes)),0) AS n FROM cmi5_attachments WHERE tenant=?').get(s.tenant) as any;
    if(used.n+part.bytes.length>attachmentLimits.registration||total.n+part.bytes.length>attachmentLimits.tenant)cmi5Invalid('attachment byte quota reached');
    db.prepare('INSERT INTO cmi5_attachments VALUES(?,?,?,?)').run(s.registration_id,s.tenant,hash,part.bytes);added.push(hash);
  }
  return added;
}
export function encodeCMI5Multipart(body:any,parts:AttachmentParts) {
  let boundary:string;do{boundary='pear-cmi5-'+randomUUID();}while([...parts.values()].some(p=>p.bytes.includes(Buffer.from('\r\n--'+boundary))));
  const chunks:Buffer[]=[Buffer.from('--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(body))];
  for(const [hash,p] of parts)chunks.push(Buffer.from('\r\n--'+boundary+'\r\n'+(p.contentType?'Content-Type: '+p.contentType+'\r\n':'')+'Content-Transfer-Encoding: binary\r\nX-Experience-API-Hash: '+hash+'\r\n\r\n'),p.bytes);
  chunks.push(Buffer.from('\r\n--'+boundary+'--\r\n'));return {bytes:Buffer.concat(chunks),contentType:'multipart/mixed; boundary='+boundary};
}
