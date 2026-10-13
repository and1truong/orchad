import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cmi5Fixture,cmi5XML,cmi5ZIP} from './cmi5-fixture.ts';
import {inspectCMI5Package} from '../src/server/cmi5-package.ts';
import {cmi5Category,cmi5Extension} from '../src/server/cmi5.ts';
import {createApp} from '../src/server/app.ts';

test('cmi5 root namespace, nested blocks, objectives and launch metadata are parsed independently of SCORM',async()=>{
  const {manifest,files}=await inspectCMI5Package(cmi5ZIP());
  assert.equal(manifest.profile,'pear-cmi5-quartz-local/1');assert.equal(manifest.aus.length,2);assert.equal(manifest.blocks.length,1);assert.equal(files.size,4);
  assert.equal(manifest.aus[0]!.launchParameters,'lesson=1');assert.equal(manifest.aus[0]!.masteryScore,0.75);assert.deepEqual(manifest.course.auIds,manifest.blocks[0]!.auIds);
  for(const node of [manifest.course,...manifest.blocks,...manifest.aus])assert.notEqual(node.activityId,node.id);
  for(const xml of [cmi5XML().replace('courseStructure','manifest'),cmi5XML().replace('https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd','urn:wrong'),cmi5XML().replace('moveOn="Completed"','moveOn="Unknown"'),cmi5XML().replace('0.75','1.1'),cmi5XML().replace('lessons/intro.html?theme=blue#start','../outside.html'),cmi5XML().replace('lessons/intro.html?theme=blue#start','http://remote.test/au.html'),cmi5XML().replace('theme=blue','actor=forged'),cmi5XML().replace('idref="https://content.example.test/objective"','idref="urn:missing"'),cmi5XML().replace('https://content.example.test/au/practice','https://content.example.test/au/intro'), '<!DOCTYPE courseStructure [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+cmi5XML()])await assert.rejects(()=>inspectCMI5Package(cmi5ZIP(xml)));
});
test('immutable quarantined imports, exact hash review, own tenant export and operation receipts preserve authorization',async()=>{
  const s=await cmi5Fixture();try {
    const bytes=cmi5ZIP(),a={...s.args(),filename:'original.zip',provenance:'Self authored'};
    await assert.rejects(()=>s.cmi5.import(s.learner,a,bytes),/administrator/);
    const pkg=await s.cmi5.import(s.admin,a,bytes);assert.deepEqual(await s.cmi5.import(s.admin,a,bytes),{...pkg,recovered:true});
    await assert.rejects(()=>s.cmi5.import(s.admin,{...a,provenance:'Changed'},bytes),/changed/);
    assert.equal(s.cmi5.list(s.learner).items.length,0);assert.deepEqual(s.cmi5.export(s.admin,pkg.packageId).bytes,bytes);
    assert.throws(()=>s.cmi5.export(s.service.principal('outsider'),pkg.packageId));
    assert.throws(()=>s.launch(pkg.packageId),/Published/);
    assert.throws(()=>s.cmi5.launch(s.learner,s.learnerLogin.browser,{...s.args(s.learner,false),packageId:{},auId:'urn:au:invalid',mode:'Normal'}),/UUID/);
    assert.throws(()=>s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:'wrong',action:'publish',reason:'Review'}));
    s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'publish',reason:'Reviewed'});
    assert.equal(s.cmi5.list(s.learner).items.length,1);
    s.db.exec("CREATE TRIGGER reject_cmi5_audit BEFORE INSERT ON audit WHEN NEW.tool='human_cmi5_review' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
    assert.throws(()=>s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'retire',reason:'Retire'}),/audit failed/);
    assert.equal(s.cmi5.list(s.learner).items.length,1);assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await s.close();}
});
test('launch parameters, one-use fetch, Basic session credential, protected LaunchData and learner preferences use exact scopes',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),url=new URL(launch.url),r=s.runtime(launch);
    assert.equal(url.searchParams.get('theme'),'blue');assert.equal(url.hash,'#start');assert.equal(url.searchParams.size,6);
    assert.equal(r.data.launchMode,'Normal');assert.equal(r.data.contextTemplate.extensions[cmi5Extension+'sessionid'],launch.sessionId);
    assert.notEqual(r.query.activityId,launch.auId);assert.ok(!r.query.agent.includes('learner-a'));
    const lms=s.cmi5.read(r.header,{}).statements[0];assert.equal(lms.verb.id,'http://adlnet.gov/expapi/verbs/launched');assert.ok(!JSON.stringify(lms).includes(r.token));
    assert.equal(s.cmi5.fetch(r.token)['error-code'],'1');assert.equal(s.cmi5.fetch('invalid')['error-code'],'2');
    assert.throws(()=>s.cmi5.authenticate('Bearer '+r.header),/Basic/);
    assert.throws(()=>s.cmi5.state(r.header,{...r.query,stateId:'LMS.LaunchData'},'PUT',{}),/read-only/);
    assert.throws(()=>s.cmi5.state(r.header,{...r.query,registration:crypto.randomUUID()},'GET',null),/scope/);
    assert.deepEqual(s.cmi5.profile(r.header,{agent:r.query.agent,profileId:'cmi5LearnerPreferences'}),{languagePreference:'en'});
    assert.throws(()=>s.cmi5.report(s.service.principal('learner-b'),launch.registrationId),/Authorized/);
    assert.equal(s.cmi5.report(s.admin,launch.registrationId,true).statementCount,1);
    assert.equal(s.cmi5.resource(launch.sessionId,'au.js').bytes.length>0,true);assert.throws(()=>s.cmi5.resource(launch.sessionId,'../au.js'));
  }finally{await s.close();}
});
test('cmi5 defined and allowed statements, UUID retry, atomic batches, timestamp ordering and moveOn rollup are durable',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch),init=r.statement('initialized');
    const rev=s.service.context(s.learner.id,'learning:demo:learner-a').revision;
    assert.deepEqual(s.cmi5.write(r.header,init),[init.id]);assert.deepEqual(s.cmi5.write(r.header,{...Object.fromEntries(Object.entries(init).reverse()),id:init.id.toUpperCase()}),[init.id]);assert.equal(s.service.context(s.learner.id,'learning:demo:learner-a').revision,rev+1);
    const allowed=r.statement('experienced',{response:'Original response'});allowed.context.contextActivities.category=[];s.cmi5.write(r.header,allowed);
    const completed=r.statement('completed',{completion:true,duration:'PT1M'}),passed=r.statement('passed',{success:true,duration:'PT1M',score:{scaled:0.9}}),end=r.statement('terminated',{duration:'PT1M'});
    s.cmi5.write(r.header,[end,passed,completed]);
    const report=s.cmi5.report(s.learner,launch.registrationId);assert.equal(report.aus[0].satisfied,true);assert.equal(report.satisfied,false);assert.equal(report.sessions[0].status,'terminated');
    assert.deepEqual(s.cmi5.write(r.header,end),[end.id]);
    assert.throws(()=>s.cmi5.write(r.header,r.statement('completed',{completion:true,duration:'PT1M'})),/duplicate/);
    const next=s.launch(pkg.packageId,'https://content.example.test/au/practice',launch.registrationId),r2=s.runtime(next);
    s.cmi5.write(r2.header,[r2.statement('initialized'),r2.statement('completed',{completion:true,duration:'PT2M'}),r2.statement('terminated',{duration:'PT2M'})]);
    assert.equal(s.cmi5.report(s.learner,next.registrationId).satisfied,true);
    const satisfied=(s.db.prepare("SELECT statement FROM cmi5_statements WHERE verb='satisfied'").all() as any[]).map(v=>JSON.parse(v.statement));assert.equal(satisfied.length,2);
    assert.equal(satisfied[0].context.extensions[cmi5Extension+'sessionid'],next.sessionId);
    for(const table of ['enrollments','attempts','certificates','study_totals','xapi_statements','scorm_registrations'])assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM '+table).get()!.n,0);
  }finally{await s.close();}
});
test('invalid lifecycle, forged identity/context, scores, verbs, duplicates and audit failures roll back the whole batch',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch);
    assert.throws(()=>s.cmi5.write(r.header,r.statement('completed',{completion:true,duration:'PT1M'})),/ordering/);
    s.cmi5.write(r.header,r.statement('initialized'));
    for(const statement of [r.statement('passed',{success:true,duration:'PT1M',score:{scaled:0.1}}),r.statement('completed',{completion:true}),r.statement('completed',{completion:true,duration:'PT1M',score:{scaled:0.9}}),r.statement('failed',{success:true,duration:'PT1M'}),r.statement('voided'),r.statement('terminated',{duration:'P1Y'}),r.statement('initialized'),r.statement('completed',{completion:true,duration:'PT1M'},{actor:{objectType:'Agent',account:{homePage:s.origin,name:'someone'}}}),r.statement('completed',{completion:true,duration:'PT1M'},{timestamp:'2026-02-30T00:00:00Z'})]) {
      const before=s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n;
      assert.throws(()=>s.cmi5.write(r.header,[r.statement('completed',{completion:true,duration:'PT1M'}),statement]));
      assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n,before);
    }
    const wrong=r.statement('completed',{completion:true,duration:'PT1M'});wrong.context.extensions[cmi5Extension+'sessionid']=crypto.randomUUID();assert.throws(()=>s.cmi5.write(r.header,wrong));
    const voided=r.statement('voided');voided.context.contextActivities.category=[];assert.throws(()=>s.cmi5.write(r.header,voided),/cannot void/);
    const id=r.statement('completed',{completion:true,duration:'PT1M'});s.cmi5.write(r.header,id);assert.throws(()=>s.cmi5.write(r.header,{...id,result:{completion:true,duration:'PT2M'}}),/changed/);
    s.db.exec("CREATE TRIGGER reject_cmi5_statements BEFORE INSERT ON audit WHEN NEW.tool='cmi5_statements' BEGIN SELECT RAISE(ABORT,'audit failed'); END");
    assert.throws(()=>s.cmi5.write(r.header,r.statement('passed',{success:true,duration:'PT1M'})),/audit failed/);assert.equal(s.cmi5.report(s.learner,launch.registrationId).aus[0].passed,false);
  }finally{await s.close();}
});
test('JSON State PUT/POST/DELETE ETags and registration/AU isolation survive a process restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-cmi5-')),path=join(dir,'db.sqlite');let s=await cmi5Fixture(path);
  try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch),q={...r.query,stateId:'bookmark'};
    const first=s.cmi5.state(r.header,q,'PUT',{page:2},{'if-none-match':'*'});assert.ok(first.etag);
    assert.equal(s.cmi5.state(r.header,q,'PUT',{page:3}).preconditionRequired,true);assert.equal(s.cmi5.state(r.header,q,'PUT',{page:3},{'if-match':'wrong'}).preconditionFailed,true);
    const merged=s.cmi5.state(r.header,q,'POST',{note:'Original'},{'if-match':first.etag});assert.notEqual(first.etag,merged.etag);assert.deepEqual(s.cmi5.state(r.header,q,'GET',null).body,{page:2,note:'Original'});
    s.cmi5.write(r.header,r.statement('initialized'));const saved=r.statement('completed',{completion:true,duration:'PT1M'});s.cmi5.write(r.header,saved);
    await s.close();s=await cmi5Fixture(path);
    assert.deepEqual(s.cmi5.write(r.header,saved),[saved.id]);assert.equal(s.cmi5.state(r.header,q,'GET',null).body.page,2);
    const second=s.launch(pkg.packageId,launch.auId,launch.registrationId),r2=s.runtime(second);assert.equal(second.registrationId,launch.registrationId);assert.equal(r2.query.activityId,r.query.activityId);
    assert.throws(()=>s.cmi5.authenticate(r.header),/revoked/);assert.equal(s.cmi5.state(r2.header,{...r2.query,stateId:'bookmark'},'GET',null).body.page,2);
    s.cmi5.state(r2.header,{...r2.query,stateId:'bookmark'},'DELETE',null,{'if-match':merged.etag});assert.throws(()=>s.cmi5.state(r2.header,{...r2.query,stateId:'bookmark'},'GET',null),/unavailable/);
    const other=s.launch(pkg.packageId);const r3=s.runtime(other);assert.notEqual(other.registrationId,launch.registrationId);assert.throws(()=>s.cmi5.state(r3.header,{...r3.query,stateId:'bookmark'},'GET',null));
    assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await s.close();rmSync(dir,{recursive:true,force:true});}
});
test('abandon/relaunch, retired pin, revocation, logout and account changes invalidate capabilities immediately',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),first=s.launch(pkg.packageId),r=s.runtime(first);s.cmi5.write(r.header,r.statement('initialized'));
    const next=s.launch(pkg.packageId,'https://content.example.test/au/practice',first.registrationId);assert.throws(()=>s.cmi5.authenticate(r.header));assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM cmi5_statements WHERE verb='abandoned'").get()!.n,1);
    s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'retire',reason:'Stop new registrations'});
    assert.throws(()=>s.launch(pkg.packageId));const pinned=s.launch(pkg.packageId,first.auId,first.registrationId),r2=s.runtime(pinned);assert.equal(pinned.registrationId,first.registrationId);
    const logout=await s.app.inject({method:'POST',url:'/api/logout',headers:s.learnerLogin.headers,payload:{}});assert.equal(logout.statusCode,200);assert.throws(()=>s.cmi5.authenticate(r2.header));
    const login=await s.login('learner-a');const refreshed=s.cmi5.launch(s.learner,login.browser,{...s.args(s.learner,false),packageId:pkg.packageId,auId:first.auId,registrationId:first.registrationId,mode:'Normal'}),r3=s.runtime(refreshed);
    s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'revoke',reason:'Unsafe content'});assert.throws(()=>s.cmi5.authenticate(r3.header));assert.throws(()=>s.cmi5.resource(refreshed.sessionId,'au.js'));
    assert.equal(s.cmi5.report(s.learner,next.registrationId).packageState,'revoked');
  }finally{await s.close();}
});
test('preview/review modes forbid satisfaction statements and launch retries return IDs without stored capabilities',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),a={...s.args(s.admin,false),packageId:pkg.packageId,auId:'https://content.example.test/au/intro',mode:'Browse'};
    const preview=s.cmi5.launch(s.admin,s.adminLogin.browser,a),r=s.runtime(preview),retry=s.cmi5.launch(s.admin,s.adminLogin.browser,a);
    assert.equal(retry.recovered,true);assert.equal(retry.url,undefined);assert.equal(retry.sessionId,preview.sessionId);
    assert.ok(!(s.db.prepare('SELECT result FROM idempotency WHERE key=?').get(a.key) as any).result.includes(r.token));
    s.cmi5.write(r.header,r.statement('initialized'));assert.throws(()=>s.cmi5.write(r.header,r.statement('completed',{completion:true,duration:'PT1M'})),/Browse\/Review/);s.cmi5.write(r.header,r.statement('terminated',{duration:'PT1M'}));
    const review=s.launch(pkg.packageId,undefined,undefined,'Review'),r2=s.runtime(review);s.cmi5.write(r2.header,r2.statement('initialized'));assert.throws(()=>s.cmi5.write(r2.header,r2.statement('passed',{success:true,duration:'PT1M'})));
    assert.equal(s.cmi5.report(s.admin,preview.registrationId).satisfied,false);assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM cmi5_statements WHERE verb='satisfied'").get()!.n,0);
  }finally{await s.close();}
});
test('actual HTTP cmi5 host enforces origin, version, unique JSON, exact identity, fetch errors and all supported state methods',async()=>{
  const s=await cmi5Fixture();try {
    await assert.rejects(()=>createApp({db:s.db,origin:s.origin,cmi5ContentOrigin:s.contentOrigin}),/loopback/);
    await assert.rejects(()=>createApp({db:s.db,origin:s.origin,developmentAuth:true,cmi5ContentOrigin:s.origin.replace('4390','4391')}),/hostname/);
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),token=new URL(launch.url).searchParams.get('fetch')!.split('/').at(-1)!;
    const base={host:'localhost:4391',origin:s.contentOrigin};
    assert.equal((await s.content.inject({url:'/cmi5/fetch/'+token,headers:base})).statusCode,404);
    const fetch=await s.content.inject({method:'POST',url:'/cmi5/fetch/'+token,headers:base});assert.equal(fetch.statusCode,200);assert.ok(fetch.json()['auth-token']);
    assert.equal((await s.content.inject({method:'POST',url:'/cmi5/fetch/'+token,headers:base})).json()['error-code'],'1');
    const headers={...base,authorization:'Basic '+fetch.json()['auth-token'],'x-experience-api-version':'1.0.3','content-type':'application/json'};
    assert.equal((await s.content.inject({url:'/cmi5/xapi/about',headers})).statusCode,200);
    for(const changed of [{host:'evil.test'},{origin:s.origin},{cookie:'pear-session=forged'},{'x-experience-api-version':'2.0.0'},{authorization:s.adminLogin.headers.cookie}])assert.ok((await s.content.inject({url:'/cmi5/xapi/about',headers:{...headers,...changed}})).statusCode>=400);
    const url=new URL(launch.url),scope=new URLSearchParams({activityId:url.searchParams.get('activityId')!,agent:url.searchParams.get('actor')!,registration:launch.registrationId}),path='/cmi5/xapi/activities/state?'+scope;
    const state=await s.content.inject({url:path+'&stateId=LMS.LaunchData',headers});assert.equal(state.statusCode,200);assert.ok(state.headers.etag);
    const context={...state.json().contextTemplate,registration:launch.registrationId};context.contextActivities.category=[{id:cmi5Category}];
    const init={id:crypto.randomUUID(),actor:JSON.parse(scope.get('agent')!),verb:{id:'http://adlnet.gov/expapi/verbs/initialized'},object:{id:scope.get('activityId')!},context,timestamp:new Date().toISOString()};
    assert.equal((await s.content.inject({method:'PUT',url:'/cmi5/xapi/statements?statementId='+init.id,headers,payload:init})).statusCode,204);
    assert.equal((await s.content.inject({url:'/cmi5/xapi/statements?statementId='+init.id,headers})).json().id,init.id);
    assert.equal((await s.content.inject({method:'POST',url:'/cmi5/xapi/statements',headers,payload:'{"id":1,"\\u0069d":2}'})).statusCode,400);
    const put=await s.content.inject({method:'PUT',url:path+'&stateId=bookmark',headers:{...headers,'if-none-match':'*'},payload:{page:1}});assert.equal(put.statusCode,204);
    assert.equal((await s.content.inject({method:'POST',url:path+'&stateId=bookmark',headers:{...headers,'if-match':String(put.headers.etag)},payload:{note:'Original'}})).statusCode,204);
    const get=await s.content.inject({url:path+'&stateId=bookmark',headers});assert.deepEqual(get.json(),{page:1,note:'Original'});
    assert.equal((await s.content.inject({method:'DELETE',url:path+'&stateId=bookmark',headers:{...headers,'if-match':String(get.headers.etag)}})).statusCode,204);
    assert.equal((await s.content.inject({method:'DELETE',url:path+'&stateId=LMS.LaunchData',headers})).statusCode,403);
    assert.equal((await s.content.inject({method:'POST',url:'/cmi5/fetch/invalid',headers:base})).json()['error-code'],'2');
  }finally{await s.close();}
});
test('moveOn values use accepted defined evidence, and NotApplicable is evaluated at registration launch',async()=>{
  const s=await cmi5Fixture();try {
    for(const moveOn of ['NotApplicable','Passed','Completed','CompletedAndPassed','CompletedOrPassed']) {
      const xml=cmi5XML().replace('moveOn="Completed"','moveOn="NotApplicable"').replace('moveOn="CompletedAndPassed"',`moveOn="${moveOn}"`);
      const pkg=await s.publish(xml),launch=s.launch(pkg.packageId),r=s.runtime(launch);
      assert.equal(s.cmi5.report(s.learner,launch.registrationId).satisfied,moveOn==='NotApplicable');
      s.cmi5.write(r.header,r.statement('initialized'));
      const allowed=r.statement('completed',{completion:true});allowed.context.contextActivities.category=[];s.cmi5.write(r.header,allowed);
      assert.equal(s.cmi5.report(s.learner,launch.registrationId).satisfied,moveOn==='NotApplicable');
      s.cmi5.write(r.header,r.statement('completed',{completion:true,duration:'PT0S'}));
      assert.equal(s.cmi5.report(s.learner,launch.registrationId).satisfied,['NotApplicable','Completed','CompletedOrPassed'].includes(moveOn));
      s.cmi5.write(r.header,r.statement('passed',{success:true,duration:'PT0S',score:{scaled:0.75}}));
      assert.equal(s.cmi5.report(s.learner,launch.registrationId).satisfied,true);
    }
  }finally{await s.close();}
});
test('source timestamp ordering, five-second terminal grace and registration-wide outcomes resist delayed conflicting reports',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch),base=Date.parse((s.db.prepare('SELECT created_at FROM cmi5_sessions WHERE id=?').get(launch.sessionId) as any).created_at);
    const time=(ms:number)=>new Date(base+ms).toISOString();
    const init=r.statement('initialized',undefined,{timestamp:time(10)}),end=r.statement('terminated',{duration:'PT1S'},{timestamp:time(1000)});
    assert.throws(()=>s.cmi5.write(r.header,[init,r.statement('completed',{completion:true,duration:'PT0S'},{timestamp:time(5)})]),/ordering/);
    s.cmi5.write(r.header,[end,init]);
    const completed=r.statement('completed',{completion:true,duration:'PT1S'},{timestamp:time(500)});s.cmi5.write(r.header,completed);
    assert.throws(()=>s.cmi5.write(r.header,r.statement('passed',{success:true,duration:'PT1S'},{timestamp:time(1500)})),/ordering/);
    s.db.prepare('UPDATE cmi5_sessions SET terminated_at=? WHERE id=?').run(Date.now()-5001,launch.sessionId);assert.throws(()=>s.cmi5.write(r.header,completed),/ended/);
    const evidence=s.cmi5.evidence(s.learner,launch.registrationId,{limit:2});assert.equal(evidence.statements.length,2);assert.ok(evidence.nextAfter);assert.ok(s.cmi5.evidence(s.admin,launch.registrationId,{after:evidence.nextAfter},true).statements.some(v=>v.id===completed.id));
    assert.throws(()=>s.cmi5.evidence(s.service.principal('learner-b'),launch.registrationId,{}));
    assert.equal(s.cmi5.report(s.learner,launch.registrationId).aus[0].completed,true);
    const second=s.launch(pkg.packageId,launch.auId,launch.registrationId),r2=s.runtime(second);s.cmi5.write(r2.header,r2.statement('initialized'));
    s.cmi5.write(r2.header,r2.statement('passed',{success:true,duration:'PT1S'}));
    assert.throws(()=>s.cmi5.write(r2.header,r2.statement('failed',{success:false,duration:'PT1S'})));
    s.db.prepare('UPDATE accounts SET auth_version=auth_version+1 WHERE id=?').run(s.learner.id);assert.throws(()=>s.cmi5.authenticate(r2.header),/revoked/);
  }finally{await s.close();}
});
test('a 1001-AU package imports and paginates to its final AU without dropping a large package row',async()=>{
  const s=await cmi5Fixture();try {
    const description='<title><langstring lang="en">Original</langstring></title><description><langstring lang="en">Original</langstring></description>';
    const xml=`<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd"><course id="urn:course:many">${description}</course>`+Array.from({length:1001},(_,i)=>`<au id="urn:au:${i}" moveOn="Completed">${description}<url>lessons/intro.html</url></au>`).join('')+'</courseStructure>';
    const pkg=await s.publish(xml),page=s.cmi5.list(s.learner);assert.equal(page.items.length,1);assert.equal(page.items[0].auTotal,1001);assert.equal(page.items[0].aus.length,10);
    const last=s.cmi5.activities(s.learner,pkg.packageId,1000);assert.equal(last.aus[0].id,'urn:au:1000');assert.equal(last.nextAuOffset,null);
    const launch=s.launch(pkg.packageId,'urn:au:1000'),r=s.runtime(launch);s.cmi5.write(r.header,[r.statement('initialized'),r.statement('completed',{completion:true,duration:'PT0S'})]);assert.equal(s.cmi5.report(s.learner,launch.registrationId).aus[1000].completed,true);
  }finally{await s.close();}
});
