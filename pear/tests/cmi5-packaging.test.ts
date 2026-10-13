import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cmi5Fixture,cmi5XML,cmi5ZIP} from './cmi5-fixture.ts';
import {cmi5ZIP64,standaloneCMI5} from './cmi5-packaging-fixture.ts';
import {inspectCMI5Package} from '../src/server/cmi5-package.ts';

test('standalone XML requires fully qualified safe AU URLs and cannot hide a malformed local path or namespace',async()=>{
  const bytes=Buffer.from(standaloneCMI5()),p=await inspectCMI5Package(bytes,'xml');assert.equal(p.manifest.sourceFormat,'xml');assert.equal(p.manifest.profile,'pear-cmi5-quartz/2');assert.ok(p.manifest.aus.every(a=>a.remote));
  assert.equal(p.manifest.aus[0]!.href,'https://content.example.test/lessons/intro.html?theme=blue#start');
  for(const xml of [cmi5XML(),standaloneCMI5().replace('https://content.example.test/lessons/intro.html','//other.test/intro.html'),standaloneCMI5('http://public.test'),standaloneCMI5('https://user:secret@public.test'),standaloneCMI5('file:///tmp'),standaloneCMI5().replace('theme=blue','%66etch=forged'),standaloneCMI5().replace('<courseStructure','<!DOCTYPE courseStructure><courseStructure')])await assert.rejects(()=>inspectCMI5Package(Buffer.from(xml),'xml'));
  await assert.rejects(()=>inspectCMI5Package(Buffer.alloc(1024*1024+1),'xml'),/quota/);
  const mixed=await inspectCMI5Package(cmi5ZIP(cmi5XML().replace('lessons/practice.html','https://public.test/practice')));assert.equal(mixed.manifest.aus[0]!.remote,false);assert.equal(mixed.manifest.aus[1]!.remote,true);
});
test('valid trailing vendor extensions and unordered objective metadata are ignored without overwriting core elements',async()=>{
  const xml=standaloneCMI5().replace('<courseStructure ', '<courseStructure xmlns:v="urn:vendor" v:version="1" ').replace('<title><langstring lang="en">Objective</langstring></title><description><langstring lang="en">Original test content</langstring></description>','<description><langstring lang="en">Original test content</langstring></description><title><langstring lang="en">Objective</langstring></title>').replace('</courseStructure>','<v:au id="urn:fake"/><v:metadata>Ignored</v:metadata></courseStructure>');
  assert.equal((await inspectCMI5Package(Buffer.from(xml),'xml')).manifest.aus.length,2);
  await assert.rejects(()=>inspectCMI5Package(Buffer.from(xml.replace('<course id=', '<v:au/><course id=')),'xml'),/misplaced/);
});
test('ZIP64 fixtures independently pass Python zipfile CRC/read checks and runtime size quotas still reject oversized entries',async()=>{
  const bytes=cmi5ZIP64(),dir=mkdtempSync(join(tmpdir(),'pear-zip64-')),path=join(dir,'fixture.zip');
  try {writeFileSync(path,bytes);const independent=spawnSync('python3',['-c',"import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.infolist())==3; assert all(i.extract_version==45 for i in z.infolist()); print('ZIP64 verified')",path],{timeout:10000});assert.equal(independent.status,0,independent.stderr.toString());assert.match(independent.stdout.toString(),/ZIP64 verified/);}finally{rmSync(dir,{recursive:true,force:true});}
  const p=await inspectCMI5Package(bytes);assert.equal(p.manifest.aus.length,2);assert.equal(p.files.size,3);await assert.rejects(()=>inspectCMI5Package(cmi5ZIP64(cmi5XML(),true)));
  const corrupted=Buffer.from(bytes);corrupted.writeUInt32LE(0,corrupted.length-22-20);await assert.rejects(()=>inspectCMI5Package(corrupted));
});
test('standalone XML HTTP import preserves exact export bytes, MIME, receipts, tenant authorization and restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-cmi5-xml-')),path=join(dir,'db.sqlite');let s=await cmi5Fixture(path);try {
    const bytes=Buffer.from(standaloneCMI5()),a={...s.args(),filename:'original.xml',provenance:'Original XML source'},q=new URLSearchParams(Object.fromEntries(Object.entries(a).map(([k,v])=>[k,String(v)])));
    const post=()=>s.app.inject({method:'POST',url:'/api/cmi5/import?'+q,headers:{...s.adminLogin.headers,'content-type':'application/xml'},payload:bytes});
    const response=await post();assert.equal(response.statusCode,201,response.body);const pkg=response.json();assert.equal((await post()).json().recovered,true);
    assert.equal((await s.app.inject({method:'POST',url:'/api/cmi5/import?'+q,headers:{...s.adminLogin.headers,'content-type':'application/zip'},payload:bytes})).statusCode,400);
    const exportResponse=await s.app.inject({url:'/api/cmi5/packages/'+pkg.packageId+'/export',headers:s.adminLogin.headers});assert.deepEqual(exportResponse.rawPayload,bytes);assert.match(String(exportResponse.headers['content-type']),/application\/xml/);
    assert.throws(()=>s.cmi5.export(s.service.principal('outsider'),pkg.packageId));
    s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'publish',reason:'Reviewed original XML and remote provenance'});
    assert.equal(s.cmi5.list(s.learner).items[0].aus[0].playbackSupported,false);assert.throws(()=>s.launch(pkg.packageId),/reviewed origin/);
    await s.close();s=await cmi5Fixture(path);assert.deepEqual(s.cmi5.export(s.admin,pkg.packageId).bytes,bytes);assert.equal(s.cmi5.list(s.learner).items[0].profile,'pear-cmi5-quartz/2');assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await s.close();rmSync(dir,{recursive:true,force:true});}
});
