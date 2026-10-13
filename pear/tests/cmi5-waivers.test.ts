import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cmi5Fixture} from './cmi5-fixture.ts';
import {cmi5Category,cmi5Extension} from '../src/server/cmi5.ts';

test('administrative waiver uses its own capability-free session, revokes the current AU and rolls up without inventing learner outcomes',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch);s.cmi5.write(r.header,r.statement('initialized'));
    const before=s.service.context(s.learner.id,'learning:demo:learner-a').revision;
    const args={...s.args(),registrationId:launch.registrationId,auId:launch.auId,reason:'Administrative'},first=s.cmi5.waive(s.admin,args);
    assert.equal(first.aus[0].waived,true);assert.equal(first.aus[0].satisfied,true);assert.equal(first.aus[0].completed,false);assert.equal(first.aus[0].passed,false);assert.equal(first.aus[0].score,null);assert.equal(first.aus[0].waiverReason,'Administrative');assert.equal(first.satisfied,false);
    assert.notEqual(first.sessionId,launch.sessionId);assert.throws(()=>s.cmi5.authenticate(r.header),/revoked/);
    const session=s.db.prepare('SELECT * FROM cmi5_sessions WHERE id=?').get(first.sessionId) as any;assert.equal(session.expires,0);assert.equal(session.auth_hash,null);assert.equal(session.browser_session,'');assert.throws(()=>s.cmi5.resource(session.id,'au.js'));assert.equal(s.cmi5.fetch(session.fetch_hash)['error-code'],'2');
    const rows=s.db.prepare('SELECT * FROM cmi5_statements WHERE session_id=?').all(session.id) as any[];assert.deepEqual(rows.map(v=>v.verb),['waived']);
    const v=JSON.parse(rows[0].statement);assert.equal(v.context.extensions[cmi5Extension+'sessionid'],session.id);assert.equal(v.context.registration,launch.registrationId);assert.equal(v.object.id,r.query.activityId);assert.deepEqual(v.context.contextActivities.category,[{id:cmi5Category}]);assert.deepEqual(v.result,{extensions:{'https://w3id.org/xapi/cmi5/result/extensions/reason':'Administrative'}});
    assert.equal(s.service.context(s.learner.id,'learning:demo:learner-a').revision,before+1);assert.deepEqual(s.cmi5.waive(s.admin,args),{...first,recovered:true});
    assert.throws(()=>s.cmi5.waive(s.admin,{...args,reason:'Equivalent AU'}),/changed/);assert.throws(()=>s.cmi5.waive(s.admin,{...s.args(),registrationId:launch.registrationId,auId:launch.auId,reason:'Tested Out'}),/already/);
    const final=s.cmi5.waive(s.admin,{...s.args(),registrationId:launch.registrationId,auId:'https://content.example.test/au/practice',reason:'Equivalent Outside Activity'});assert.equal(final.satisfied,true);
    const finalRows=s.db.prepare('SELECT verb FROM cmi5_statements WHERE session_id=? ORDER BY sequence').all(final.sessionId) as any[];assert.deepEqual(finalRows.map(v=>v.verb),['waived','satisfied','satisfied']);
    assert.equal(s.cmi5.report(s.learner,launch.registrationId).aus[0].waiverReason,'Administrative');assert.throws(()=>s.launch(pkg.packageId,launch.auId,launch.registrationId),/Review mode/);
    const review=s.cmi5.launch(s.learner,s.learnerLogin.browser,{...s.args(s.learner,false),packageId:pkg.packageId,auId:launch.auId,registrationId:launch.registrationId,mode:'Review'}),rr=s.runtime(review);assert.equal(rr.data.launchMode,'Review');s.cmi5.write(rr.header,rr.statement('initialized'));assert.throws(()=>s.cmi5.write(rr.header,rr.statement('completed',{completion:true,duration:'PT1M'})),/cannot report/);
    assert.equal(s.cmi5.evidence(s.admin,launch.registrationId,{},true).statements.filter(v=>v.verb.id.endsWith('/waived')).length,2);
    for(const table of ['enrollments','attempts','certificates','study_totals','xapi_statements'])assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM '+table).get()!.n,0);
    assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await s.close();}
});
test('waiver confirmation/CAS, role, tenant, package and mode checks remain atomic with audit and receipt failures',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch);s.cmi5.write(r.header,r.statement('initialized'));
    const args=()=>({...s.args(),registrationId:launch.registrationId,auId:launch.auId,reason:'Tested Out'}),baseline=Number(s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n);
    assert.throws(()=>s.cmi5.waive(s.learner,args()),/administrator/);assert.throws(()=>s.cmi5.waive(s.service.principal('outsider'),args()));
    for(const a of [{...args(),confirmed:false},{...args(),revision:0},{...args(),reason:'made up'},{...args(),registrationId:crypto.randomUUID()},{...args(),auId:'urn:foreign-au'}])assert.throws(()=>s.cmi5.waive(s.admin,a));
    const preview=s.cmi5.launch(s.admin,s.adminLogin.browser,{...s.args(s.admin,false),packageId:pkg.packageId,auId:launch.auId,mode:'Browse'});assert.throws(()=>s.cmi5.waive(s.admin,{...args(),registrationId:preview.registrationId}),/Normal registration/);
    for(const table of ['audit','idempotency']) {
      s.db.exec(`CREATE TRIGGER reject_waiver BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'waiver storage failed'); END`);
      const revisions=[s.service.context(s.admin.id,'library:demo').revision,s.service.context(s.learner.id,'learning:demo:learner-a').revision],count=s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n;
      assert.throws(()=>s.cmi5.waive(s.admin,args()),/storage failed/);assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n,count);assert.equal(s.cmi5.authenticate(r.header).status,'initialized');assert.equal(s.cmi5.report(s.learner,launch.registrationId).aus[0].waived,false);
      assert.deepEqual([s.service.context(s.admin.id,'library:demo').revision,s.service.context(s.learner.id,'learning:demo:learner-a').revision],revisions);s.db.exec('DROP TRIGGER reject_waiver');
    }
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM cmi5_statements WHERE verb='waived'").get()!.n,0);assert.ok(Number(s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n)>=baseline);
    s.db.prepare('UPDATE accounts SET active=0 WHERE id=?').run(s.learner.id);assert.throws(()=>s.cmi5.waive(s.admin,args()),/Active registration learner/);s.db.prepare('UPDATE accounts SET active=1 WHERE id=?').run(s.learner.id);
    s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'retire',reason:'Pinned learners may finish'});assert.equal(s.cmi5.waive(s.admin,args()).aus[0].waived,true);
    s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'revoke',reason:'Security issue'});assert.throws(()=>s.cmi5.waive(s.admin,{...args(),auId:'https://content.example.test/au/practice'}),/reviewed package/);
    const statement=r.statement('waived');assert.throws(()=>s.cmi5.write(r.header,statement));
  }finally{await s.close();}
});
test('human HTTP waiver requires browser protections and survives SQLite reopen with its exact receipt and evidence',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'cmi5-waiver-')),path=join(dir,'db.sqlite');let s=await cmi5Fixture(path);try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),args={...s.args(),registrationId:launch.registrationId,auId:launch.auId,reason:'Equivalent AU'};
    const request={method:'POST' as const,url:'/api/cmi5/waive',payload:args};
    assert.equal((await s.app.inject({...request,headers:s.learnerLogin.headers})).statusCode,403);
    assert.equal((await s.app.inject({...request,headers:{...s.adminLogin.headers,'x-csrf-token':'wrong'}})).statusCode,403);
    const accepted=await s.app.inject({...request,headers:s.adminLogin.headers});assert.equal(accepted.statusCode,200);assert.equal(accepted.json().aus[0].waived,true);
    const receipt=accepted.json(),evidence=s.cmi5.evidence(s.admin,launch.registrationId,{},true);await s.close();s=await cmi5Fixture(path);
    assert.deepEqual(s.cmi5.waive(s.admin,args),{...receipt,recovered:true});assert.deepEqual(s.cmi5.evidence(s.learner,launch.registrationId,{}),evidence);assert.equal(s.cmi5.report(s.learner,launch.registrationId).aus[0].completed,false);
  }finally{await s.close();rmSync(dir,{recursive:true,force:true});}
});
