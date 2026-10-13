import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cmi5Fixture} from './cmi5-fixture.ts';
import {xapiQueryTime} from '../src/server/cmi5-xapi.ts';

test('statement filters use stored time, retain registration permissions and paginate a stable snapshot in both directions',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),launch=s.launch(pkg.packageId),r=s.runtime(launch);s.cmi5.write(r.header,r.statement('initialized'));
    const ids:string[]=[];for(let i=0;i<6;i++){const v=r.statement(i%2?'answered':'experienced',{response:String(i)});v.context.contextActivities.category=[];v.object.id='urn:question:'+i;ids.push(v.id);s.cmi5.write(r.header,v);}
    // Equal stored timestamps exercise deterministic tie-breaking. Source time
    // does not decide xAPI retrieval order or its since/until boundaries.
    s.db.prepare("UPDATE cmi5_statements SET stored='2026-10-13T12:00:00.000Z' WHERE registration_id=?").run(launch.registrationId);
    assert.deepEqual(s.cmi5.read(r.header,{}).statements.map((v:any)=>v.id).slice(0,6),[...ids].reverse());
    const since=s.cmi5.read(r.header,{since:'2026-10-13T19:00:00+07:00'});assert.equal(since.statements.length,0);
    assert.equal(s.cmi5.read(r.header,{until:'2026-10-13T19:00:00+07:00',limit:'0'}).statements.length,8);
    assert.deepEqual(s.cmi5.read(r.header,{activity:'urn:question:2'}).statements.map((v:any)=>v.id),[ids[2]]);
    assert.equal(s.cmi5.read(r.header,{activity:launch.auId,related_activities:'true'}).statements.length,8);assert.equal(s.cmi5.read(r.header,{activity:launch.auId}).statements.length,0);
    assert.equal(s.cmi5.read(r.header,{verb:'http://adlnet.gov/expapi/verbs/answered',agent:r.query.agent,related_agents:'true'}).statements.length,3);
    for(const ascending of ['false','true']) {
      let page=s.cmi5.read(r.header,{limit:2,ascending}),seen=page.statements.map((v:any)=>v.id);const snapshot=s.cmi5.read(r.header,{ascending}).statements.map((v:any)=>v.id);
      const late=r.statement('experienced');late.context.contextActivities.category=[];s.cmi5.write(r.header,late);
      while(page.more){const query=Object.fromEntries(new URL(page.more,s.contentOrigin).searchParams);page=s.cmi5.read(r.header,query);seen.push(...page.statements.map((v:any)=>v.id));}
      assert.deepEqual(seen,snapshot);assert.equal(new Set(seen).size,seen.length);
    }
    const first=s.cmi5.read(r.header,{verb:'http://adlnet.gov/expapi/verbs/experienced',limit:1}),cursor=Object.fromEntries(new URL(first.more,s.contentOrigin).searchParams);
    assert.throws(()=>s.cmi5.read(r.header,{...cursor,verb:'urn:changed'}),/cursor/);
    assert.throws(()=>s.cmi5.read(r.header,{cursor:'not-valid'}),/cursor/);
    const other=s.runtime(s.launch(pkg.packageId));assert.throws(()=>s.cmi5.read(other.header,cursor),/cursor/);assert.throws(()=>s.cmi5.read(other.header,{statementId:ids[0]}),/unavailable/);
    for(const q of [{registration:crypto.randomUUID()},{agent:JSON.stringify({account:{homePage:s.origin,name:'foreign'}})},{ascending:'1'},{limit:'2.5'},{limit:['2','3']},{related_activities:'yes'},{since:'2026-02-30T00:00:00Z'},{until:'2026-10-13T00:00:00+24:00'},{unknown:'x'},{format:'wrong'},{statementId:ids[0],limit:'1'},{statementId:ids[0],voidedStatementId:ids[0]}])assert.throws(()=>s.cmi5.read(other.header,q));
    assert.deepEqual(xapiQueryTime('2026-10-13T19:00:00+07:00'),'2026-10-13T12:00:00.000Z');
  }finally{await s.close();}
});
test('exact, ids and language-selected canonical formats preserve immutable Activity and interaction metadata',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),r=s.runtime(s.launch(pkg.packageId));s.cmi5.write(r.header,r.statement('initialized'));
    const statement=r.statement('answered',{response:'a',score:{raw:0.5,scaled:-0.25},extensions:{'urn:kept':{name:'Untouched',display:{en:'Extension value'}}}});statement.context.contextActivities.category=[];
    statement.verb.display={en:'Answered',vi:'Đã trả lời'};statement.object.definition={name:{en:'Question',vi:'Câu hỏi'},description:{'en-US':'Description',vi:'Mô tả'},type:'http://adlnet.gov/expapi/activities/cmi.interaction',interactionType:'choice',choices:[{id:'a',description:{en:'One',vi:'Một'}},{id:'b',description:{en:'Two',vi:'Hai'}}],correctResponsesPattern:['a'],extensions:{'urn:original':{name:'Untouched'}}};
    statement.context.language='vi';statement.context.platform='Original AU';s.cmi5.write(r.header,statement);
    const exact=s.cmi5.read(r.header,{statementId:statement.id,format:'exact',attachments:'false'});assert.deepEqual(exact.object,statement.object);assert.deepEqual(exact.verb,statement.verb);
    const ids=s.cmi5.read(r.header,{statementId:statement.id,format:'ids'});assert.equal(ids.object.definition,undefined);assert.equal(ids.verb.display,undefined);assert.deepEqual(ids.result,statement.result);
    const canonical=s.cmi5.read(r.header,{statementId:statement.id,format:'canonical'},'fr;q=0.9, vi;q=0.8, en;q=0.1');assert.deepEqual(canonical.object.definition.name,{vi:'Câu hỏi'});assert.deepEqual(canonical.object.definition.choices[0].description,{vi:'Một'});assert.deepEqual(canonical.verb.display,{vi:'Đã trả lời'});assert.deepEqual(canonical.object.definition.extensions,statement.object.definition.extensions);
    const fallback=s.cmi5.read(r.header,{statementId:statement.id,format:'canonical'},'en-GB');assert.deepEqual(fallback.object.definition.description,{'en-US':'Description'});
    assert.deepEqual(s.cmi5.read(r.header,{statementId:statement.id}).object,statement.object);
    const count=s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n;
    for(const definition of [{name:{en:3}},{name:{en:'One',EN:'Two'}},{name:{'en_XX':'Invalid'}},{type:'relative'},{moreInfo:'javascript:bad'},{interactionType:'invalid'},{interactionType:'choice',steps:[]},{choices:[]},{interactionType:'choice',choices:[{id:'a'},{id:'a'}]},{interactionType:'choice',choices:[{id:'a',description:{vi:3}}]},{correctResponsesPattern:['a']},{extensions:{relative:true}}]) {
      const bad=structuredClone(statement);bad.id=crypto.randomUUID();bad.object.definition=definition;
      assert.throws(()=>s.cmi5.write(r.header,[{...statement,id:crypto.randomUUID()},bad]));assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n,count);
    }
    const bad=structuredClone(statement);bad.id=crypto.randomUUID();bad.context.contextActivities.other=[{id:'urn:other',objectType:'Agent'}];assert.throws(()=>s.cmi5.write(r.header,bad));
  }finally{await s.close();}
});
test('actual HTTP exposes consistent-through and Last-Modified while enforcing query errors and revocation',async()=>{
  const s=await cmi5Fixture();try {
    const pkg=await s.publish(),r=s.runtime(s.launch(pkg.packageId)),init=r.statement('initialized'),headers={host:new URL(s.contentOrigin).host,authorization:r.header,'x-experience-api-version':'1.0.3',origin:s.contentOrigin};
    const post=await s.content.inject({method:'POST',url:'/cmi5/xapi/statements',headers,payload:init});assert.equal(post.statusCode,200);assert.ok(Number.isFinite(Date.parse(String(post.headers['x-experience-api-consistent-through']))));
    const get=await s.content.inject({url:'/cmi5/xapi/statements?statementId='+init.id+'&format=canonical',headers:{...headers,'accept-language':'vi'}});assert.equal(get.statusCode,200);assert.ok(get.headers['last-modified']);assert.ok(String(get.headers['access-control-expose-headers']).includes('X-Experience-API-Consistent-Through'));
    assert.equal((await s.content.inject({url:'/cmi5/xapi/statements?statementId='+init.id+'&since=2026-10-13T00:00:00Z',headers})).statusCode,400);
    assert.equal((await s.content.inject({url:'/cmi5/xapi/statements?voidedStatementId='+init.id,headers})).statusCode,404);
    assert.equal((await s.content.inject({url:'/cmi5/xapi/statements?agent='+encodeURIComponent(r.query.agent)+'&limit=0',headers})).json().statements.length,2);
    s.cmi5.close(s.learner,(s.cmi5.authenticate(r.header) as any).id);assert.equal((await s.content.inject({url:'/cmi5/xapi/statements',headers})).statusCode,401);
  }finally{await s.close();}
});
