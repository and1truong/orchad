import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {cmi5Fixture} from './cmi5-fixture.ts';
import {encodeCMI5Multipart,parseCMI5Multipart,attachmentHash} from '../src/server/cmi5-attachments.ts';

const metadata=(bytes:Buffer,algorithm='sha256')=>({usageType:'urn:original:evidence',display:{en:'Original attachment'},contentType:'application/octet-stream',length:bytes.length,sha2:createHash(algorithm).update(bytes).digest('hex')});
test('actual multipart POST/PUT and GET deduplicate SHA-2 bytes, preserve JSON/raw formats and respect scoped credentials',async()=>{
  const f=await cmi5Fixture();try {
    const pkg=await f.publish(),launch=f.launch(pkg.packageId),r=f.runtime(launch);f.cmi5.write(r.header,r.statement('initialized'));
    const headers={host:new URL(f.contentOrigin).host,authorization:r.header,'x-experience-api-version':'1.0.3',origin:f.contentOrigin},bytes=Buffer.from([0,255,128,13,10,0]),a=metadata(bytes);
    const one=r.statement('experienced'),two=r.statement('answered');for(const s of [one,two]){s.context.contextActivities.category=[];s.attachments=[a];}
    const mixed=encodeCMI5Multipart([one,two],new Map([[a.sha2,{bytes,contentType:a.contentType}]])),request={method:'POST' as const,url:'/cmi5/xapi/statements',headers:{...headers,'content-type':mixed.contentType},payload:mixed.bytes};
    const accepted=await f.content.inject(request);assert.equal(accepted.statusCode,200);assert.deepEqual(accepted.json(),[one.id,two.id]);const revision=f.service.context(f.learner.id,'learning:demo:learner-a').revision;assert.equal((await f.content.inject(request)).statusCode,200);assert.equal(f.service.context(f.learner.id,'learning:demo:learner-a').revision,revision);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_attachments').get()!.n,1);
    const json=await f.content.inject({url:'/cmi5/xapi/statements?statementId='+one.id,headers});assert.equal(json.statusCode,200);assert.deepEqual(json.json().attachments,[a]);assert.equal(json.headers['content-type'],'application/json; charset=utf-8');
    const get=await f.content.inject({url:'/cmi5/xapi/statements?attachments=true&limit=0',headers});assert.equal(get.statusCode,200);const decoded=parseCMI5Multipart(get.rawPayload,String(get.headers['content-type']));assert.equal(decoded.body.statements.length,4);assert.deepEqual(decoded.parts.get(a.sha2)!.bytes,bytes);assert.equal(decoded.parts.size,1);assert.ok(get.headers['x-experience-api-consistent-through']);
    for(const algorithm of ['sha384','sha512']){const v=r.statement('experienced');v.context.contextActivities.category=[];const attachment=metadata(bytes,algorithm);v.attachments=[attachment];const put=encodeCMI5Multipart({...v,id:undefined},new Map([[attachment.sha2,{bytes}]]));assert.equal((await f.content.inject({method:'PUT',url:'/cmi5/xapi/statements?statementId='+v.id,headers:{...headers,'content-type':put.contentType},payload:put.bytes})).statusCode,204);}
    const other=f.runtime(f.launch(pkg.packageId));assert.throws(()=>f.cmi5.read(other.header,{statementId:one.id}),/unavailable/);const isolated=f.cmi5.multipart(other.header,f.cmi5.read(other.header,{}));assert.equal(parseCMI5Multipart(isolated.bytes,isolated.contentType).parts.size,0);
  }finally{await f.close();}
});
test('malformed MIME, duplicate JSON, hash/length/media/orphan errors and audit failures roll back statements and attachments together',async()=>{
  const f=await cmi5Fixture();try {
    const pkg=await f.publish(),r=f.runtime(f.launch(pkg.packageId));f.cmi5.write(r.header,r.statement('initialized'));const bytes=Buffer.from('Original binary'),a=metadata(bytes),statement=r.statement('experienced');statement.context.contextActivities.category=[];statement.attachments=[a];
    const count=f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n;
    for(const [s,parts] of [[{...statement,attachments:[{...a,length:a.length+1}]},new Map([[a.sha2,{bytes}]])],[statement,new Map([[a.sha2,{bytes,contentType:'text/plain'}]])],[statement,new Map()],[statement,new Map([[a.sha2,{bytes:Buffer.from('Changed')}]] )],[{...statement,attachments:[]},new Map([[a.sha2,{bytes}]])]] as const){assert.throws(()=>f.cmi5.write(r.header,s,parts));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_attachments').get()!.n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n,count);}
    assert.throws(()=>f.cmi5.write(r.header,statement),/fileUrl/);
    const valid=encodeCMI5Multipart(statement,new Map([[a.sha2,{bytes}]])),text=valid.bytes.toString('latin1');
    for(const bad of [Buffer.from(text.replace('Content-Transfer-Encoding: binary','Content-Transfer-Encoding: base64'),'latin1'),Buffer.from(text.replace('X-Experience-API-Hash: '+a.sha2,'X-Experience-API-Hash: '+'a'.repeat(64)),'latin1'),Buffer.from(text.replace('Content-Type: application/json','Content-Type: application/json\r\nContent-Type: application/json'),'latin1'),valid.bytes.subarray(0,valid.bytes.length-8),Buffer.from(text.replace('"id":','"duplicate":1,"duplicate":2,"id":'),'latin1')])assert.throws(()=>parseCMI5Multipart(bad,valid.contentType));
    const boundary='near-boundary',raw=Buffer.concat([Buffer.from('\r\n--near-boundaryX\r\n--near-boundary--X'),Buffer.from([0,255])]),m=metadata(raw),packet=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json\r\n\r\n{}\r\n--'+boundary+'\r\nX-Experience-API-Hash: '+m.sha2+'\r\n\r\n'),raw,Buffer.from('\r\n--'+boundary+'--\r\n')]);assert.deepEqual(parseCMI5Multipart(packet,'multipart/mixed; boundary="'+boundary+'"').parts.get(m.sha2)!.bytes,raw);
    f.db.exec("CREATE TRIGGER reject_attachment_audit BEFORE INSERT ON audit WHEN NEW.tool='cmi5_statements' BEGIN SELECT RAISE(ABORT,'attachment audit failed'); END");assert.throws(()=>f.cmi5.write(r.header,statement,new Map([[a.sha2,{bytes}]])),/audit failed/);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_attachments').get()!.n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n,count);
  }finally{await f.close();}
});
test('JSON fileUrl metadata never fetches remote files and raw attachment quotas count distinct bytes rather than retries',async()=>{
  const f=await cmi5Fixture();try {
    const pkg=await f.publish(),r=f.runtime(f.launch(pkg.packageId));f.cmi5.write(r.header,r.statement('initialized'));const linked=r.statement('experienced'),external={...metadata(Buffer.from('External')),fileUrl:'https://external.example.test/original.bin'};external.fileUrl='https://external.example.test/original.bin';linked.context.contextActivities.category=[];linked.attachments=[external];f.cmi5.write(r.header,linked);const result=f.cmi5.multipart(r.header,f.cmi5.read(r.header,{statementId:linked.id,attachments:'true'}));assert.equal(parseCMI5Multipart(result.bytes,result.contentType).parts.size,0);
    for(const fileUrl of ['file:///etc/passwd','https://user:pass@example.test/file','http://public.example.test/file'])assert.throws(()=>f.cmi5.write(r.header,{...linked,id:crypto.randomUUID(),attachments:[{...external,fileUrl}]}));
    for(let i=0;i<16;i++){const bytes=Buffer.alloc(32768,i),a=metadata(bytes),s=r.statement('experienced');s.context.contextActivities.category=[];s.attachments=[a];f.cmi5.write(r.header,s,new Map([[a.sha2,{bytes}]]));}
    const bytes=Buffer.alloc(32768,17),a=metadata(bytes),s=r.statement('experienced');s.context.contextActivities.category=[];s.attachments=[a];assert.throws(()=>f.cmi5.write(r.header,s,new Map([[a.sha2,{bytes}]])),/quota/);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_attachments').get()!.n,16);assert.throws(()=>f.db.exec('DELETE FROM cmi5_attachments'),/immutable/);
  }finally{await f.close();}
});
test('populated schema-54 migration and SQLite reopen preserve exact scoped attachment bytes without altering prior statements',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'cmi5-attachment-')),path=join(dir,'db.sqlite');let f=await cmi5Fixture(path);try {
    const pkg=await f.publish(),r=f.runtime(f.launch(pkg.packageId));f.cmi5.write(r.header,r.statement('initialized'));const before=f.db.prepare('SELECT * FROM cmi5_statements ORDER BY sequence').all();f.db.exec('DROP TABLE cmi5_attachments; DELETE FROM schema_version WHERE version=55');await f.close();f=await cmi5Fixture(path);assert.deepEqual(f.db.prepare('SELECT * FROM cmi5_statements ORDER BY sequence').all(),before);
    const bytes=Buffer.from([0,255,128]),a=metadata(bytes),s=r.statement('experienced');s.context.contextActivities.category=[];s.attachments=[a];f.cmi5.write(r.header,s,new Map([[a.sha2,{bytes}]]));await f.close();f=await cmi5Fixture(path);const mixed=f.cmi5.multipart(r.header,f.cmi5.read(r.header,{statementId:s.id}));assert.deepEqual(parseCMI5Multipart(mixed.bytes,mixed.contentType).parts.get(a.sha2)!.bytes,bytes);assert.equal(attachmentHash(bytes,a.sha2),a.sha2);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await f.close();rmSync(dir,{recursive:true,force:true});}
});
