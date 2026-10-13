import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cmi5Fixture} from './cmi5-fixture.ts';

const etag=(v:Buffer|string)=>'"'+createHash('sha1').update(v).digest('hex')+'"';
test('binary State bytes, SHA-1 ETags, HEAD/304, optional registration, since and bulk delete follow the actual HTTP protocol',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch),scope=new URLSearchParams(r.query),url='/cmi5/xapi/activities/state?'+scope;
    const headers={host:'localhost:4391',origin:s.contentOrigin,authorization:r.header,'x-experience-api-version':'1.0.3','content-type':'application/octet-stream'},bytes=Buffer.from([0,255,128,13,10,1,2]);
    const put=await s.content.inject({method:'PUT',url:url+'&stateId=binary',headers,payload:bytes});assert.equal(put.statusCode,204,put.body);assert.equal(put.headers.etag,etag(bytes));
    const get=await s.content.inject({url:url+'&stateId=binary',headers});assert.deepEqual(get.rawPayload,bytes);assert.match(String(get.headers['content-type']),/application\/octet-stream/);assert.ok(get.headers['last-modified']);
    const head=await s.content.inject({method:'HEAD',url:url+'&stateId=binary',headers});assert.equal(head.statusCode,200);assert.equal(head.body,'');assert.equal(head.headers.etag,get.headers.etag);
    assert.equal((await s.content.inject({url:url+'&stateId=binary',headers:{...headers,'if-none-match':String(get.headers.etag)}})).statusCode,304);
    assert.equal((await s.content.inject({method:'PUT',url:url+'&stateId=binary',headers:{...headers,'if-match':'"stale"'},payload:Buffer.from('new')})).statusCode,412);
    assert.equal((await s.content.inject({method:'PUT',url:url+'&stateId=binary',headers:{...headers,'if-match':'"stale", '+get.headers.etag},payload:bytes})).statusCode,204);
    assert.equal((await s.content.inject({method:'POST',url:url+'&stateId=binary',headers,payload:bytes})).statusCode,400);
    const global={activityId:r.query.activityId,agent:r.query.agent,stateId:'global'},globalURL='/cmi5/xapi/activities/state?'+new URLSearchParams(global);
    assert.equal((await s.content.inject({method:'PUT',url:globalURL,headers,payload:bytes})).statusCode,204);assert.equal((await s.content.inject({url:url+'&stateId=global',headers})).statusCode,404);
    const list=await s.content.inject({url:url+'&since=1970-01-01T00%3A00%3A00Z',headers});assert.deepEqual(list.json(),['LMS.LaunchData','binary']);assert.ok(list.headers.etag);
    assert.equal((await s.content.inject({method:'DELETE',url,headers})).statusCode,204);assert.equal((await s.content.inject({url:url+'&stateId=binary',headers})).statusCode,404);assert.equal((await s.content.inject({url:url+'&stateId=LMS.LaunchData',headers})).statusCode,200);
    const next=s.launch(pkg.packageId),r2=s.runtime(next);assert.deepEqual(s.cmi5.state(r2.header,{activityId:r2.query.activityId,agent:r2.query.agent,stateId:'global'},'GET',null).body,bytes);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n,0);
  }finally{await s.close();}
});
test('JSON documents preserve PUT bytes, merge only top-level POST fields and reject duplicate or incompatible payloads atomically',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),r=s.runtime(s.launch(pkg.packageId)),url='/cmi5/xapi/activities/state?'+new URLSearchParams({...r.query,stateId:'json'}),headers={host:'localhost:4391',origin:s.contentOrigin,authorization:r.header,'x-experience-api-version':'1.0.3','content-type':'application/json'},bytes=Buffer.from('{ "nested": { "a": 1, "b": 2 }, "keep": "\\u0061" }');
    const put=await s.content.inject({method:'PUT',url,headers,payload:bytes});assert.equal(put.statusCode,204);assert.equal(put.headers.etag,etag(bytes));assert.deepEqual((await s.content.inject({url,headers})).rawPayload,bytes);
    const merge=await s.content.inject({method:'POST',url,headers,payload:{nested:{a:9},add:true}});assert.equal(merge.statusCode,204);const get=await s.content.inject({url,headers});assert.deepEqual(get.json(),{nested:{a:9},keep:'a',add:true});assert.equal(get.headers.etag,etag(get.rawPayload));
    assert.equal((await s.content.inject({method:'POST',url,headers,payload:'{"a":1,"\\u0061":2}'})).statusCode,400);assert.equal((await s.content.inject({method:'POST',url,headers,payload:[1,2]})).statusCode,400);assert.deepEqual((await s.content.inject({url,headers})).rawPayload,get.rawPayload);
    assert.equal((await s.content.inject({method:'POST',url,headers:{...headers,'if-match':'"old"'},payload:{keep:'changed'}})).statusCode,412);
  }finally{await s.close();}
});
test('Agent/Activity profiles persist in their proper scopes with concurrency control while cmi5 preferences and foreign agents remain protected',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch),headers={'content-type':'application/json'};
    const agent={agent:r.query.agent,profileId:'own-settings'},activity={activityId:r.query.activityId,profileId:'shared-description'};
    const first=s.cmi5.documentProfile(r.header,agent,'agent','PUT',{lesson:1},headers);assert.ok(first.etag);
    assert.equal(s.cmi5.documentProfile(r.header,agent,'agent','PUT',{lesson:2},headers).preconditionRequired,true);assert.equal(s.cmi5.documentProfile(r.header,agent,'agent','PUT',{lesson:2},{...headers,'if-match':'"stale"'}).preconditionFailed,true);
    s.cmi5.documentProfile(r.header,agent,'agent','POST',{note:'Original'},headers);assert.deepEqual(s.cmi5.documentProfile(r.header,agent,'agent','GET',null).body,{lesson:1,note:'Original'});
    s.cmi5.documentProfile(r.header,activity,'activity','PUT',Buffer.from('binary metadata'),{'content-type':'text/plain'});assert.deepEqual(s.cmi5.documentProfile(r.header,activity,'activity','GET',null).body,Buffer.from('binary metadata'));
    assert.deepEqual(s.cmi5.profile(r.header,{agent:r.query.agent}),['cmi5LearnerPreferences','own-settings']);assert.deepEqual(s.cmi5.documentProfile(r.header,{activityId:r.query.activityId,since:'2099-01-01T00:00:00Z'},'activity','GET',null).body,[]);
    assert.throws(()=>s.cmi5.documentProfile(r.header,{agent:r.query.agent,profileId:'cmi5LearnerPreferences'},'agent','DELETE',null),/read-only/);
    assert.throws(()=>s.cmi5.documentProfile(r.header,{...activity,activityId:'urn:other:au'},'activity','GET',null),/Exact AU/);
    assert.deepEqual(s.cmi5.agent(r.header,{agent:r.query.agent}),{objectType:'Person',account:[JSON.parse(r.query.agent).account]});assert.equal(s.cmi5.activity(r.header,{activityId:r.query.activityId}).definition.name.en,'Introduction');
    const second=s.launch(pkg.packageId),r2=s.runtime(second);assert.deepEqual(s.cmi5.documentProfile(r2.header,{agent:r2.query.agent,profileId:agent.profileId},'agent','GET',null).body,{lesson:1,note:'Original'});
    assert.throws(()=>s.cmi5.documentProfile(r2.header,{agent:JSON.stringify({account:{homePage:s.origin,name:'other'}}),profileId:agent.profileId},'agent','GET',null),/Own launch/);
    const get=s.cmi5.documentProfile(r2.header,{agent:r2.query.agent,profileId:agent.profileId},'agent','GET',null);assert.equal(s.cmi5.documentProfile(r2.header,{agent:r2.query.agent,profileId:agent.profileId},'agent','DELETE',null,{'if-match':get.etag}).preconditionFailed,undefined);
  }finally{await s.close();}
});
test('binary documents and profile bytes survive restart, quotas count bytes and failed storage mutations leave prior State intact',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-cmi5-docs-')),path=join(dir,'db.sqlite');let s=await cmi5Fixture(path);try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch),q={...r.query,stateId:'binary'},data=Buffer.from([255,0,128]);
    s.cmi5.state(r.header,q,'PUT',data,{'content-type':'application/octet-stream'});s.cmi5.documentProfile(r.header,{agent:r.query.agent,profileId:'persist'},'agent','PUT',data,{'content-type':'application/octet-stream'});
    await s.close();s=await cmi5Fixture(path);assert.deepEqual(s.cmi5.state(r.header,q,'GET',null).body,data);assert.deepEqual(s.cmi5.documentProfile(r.header,{agent:r.query.agent,profileId:'persist'},'agent','GET',null).body,data);
    s.db.exec("CREATE TRIGGER reject_cmi5_doc_update BEFORE UPDATE ON cmi5_state BEGIN SELECT RAISE(ABORT,'doc failed'); END");assert.throws(()=>s.cmi5.state(r.header,q,'PUT',Buffer.from('new'),{'content-type':'application/octet-stream'}),/doc failed/);assert.deepEqual(s.cmi5.state(r.header,q,'GET',null).body,data);s.db.exec('DROP TRIGGER reject_cmi5_doc_update');
    for(let i=0;i<16;i++)s.cmi5.state(r.header,{...r.query,stateId:'quota-'+i},'PUT',Buffer.alloc(32000,255),{'content-type':'application/octet-stream'});
    assert.throws(()=>s.cmi5.state(r.header,{...r.query,stateId:'over-quota'},'PUT',Buffer.alloc(32000),{'content-type':'application/octet-stream'}),/quota/);assert.throws(()=>s.cmi5.state(r.header,{...r.query,stateId:'over-quota'},'GET',null));assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await s.close();rmSync(dir,{recursive:true,force:true});}
});
test('real schema-52 migration preserves existing JSON State and converts its ETag to the xAPI SHA-1 representation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-cmi5-v52-')),path=join(dir,'db.sqlite');let s=await cmi5Fixture(path);try {
    const pkg=await s.publish(),r=s.runtime(s.launch(pkg.packageId)),q={...r.query,stateId:'legacy'};s.cmi5.state(r.header,q,'PUT',{original:'Tiếng Việt'});
    const before=s.db.prepare('SELECT body,registration_id,au_id,state_id,updated_at FROM cmi5_state').get() as any,registrations=s.db.prepare('SELECT * FROM cmi5_registrations').all();
    s.db.exec('DROP TABLE cmi5_documents; ALTER TABLE cmi5_state DROP COLUMN bytes; ALTER TABLE cmi5_state DROP COLUMN content_type; DELETE FROM schema_version WHERE version=53');s.db.prepare('UPDATE cmi5_state SET etag=?').run('"'+createHash('sha256').update(before.body).digest('hex')+'"');
    await s.close();s=await cmi5Fixture(path);assert.deepEqual(s.db.prepare('SELECT body,registration_id,au_id,state_id,updated_at FROM cmi5_state').get(),before);assert.deepEqual(s.db.prepare('SELECT * FROM cmi5_registrations').all(),registrations);assert.equal(s.cmi5.state(r.header,q,'GET',null).etag,etag(before.body));assert.equal(s.db.prepare('SELECT MAX(version) AS n FROM schema_version').get()!.n,53);
  }finally{await s.close();rmSync(dir,{recursive:true,force:true});}
});
