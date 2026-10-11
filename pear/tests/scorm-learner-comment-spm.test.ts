import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {createSCORM2004API,scorm2004CheckpointBytes,scorm2004CheckpointLimit,scorm2004CheckpointMaxBytes} from '../src/shared/scorm2004-runtime.ts';
import {validateSCORM2004Checkpoint} from '../src/server/scorm2004-validation.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {createSCORMContentHost} from '../src/server/scorm-content-host.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {fixture} from './helpers.ts';
import {learnerCommentScript,learnerCommentVerifyScript} from './scorm-learner-comment-spm-vectors.ts';

test('Comment allowance counts exact JSON UTF8 bytes only for first250 learner/100 LMS canonical own scalar strings, with a finite worst-case bound',()=>{
  const bytes=(s:string)=>Buffer.byteLength(JSON.stringify(s));
  for(const [family,count] of [['comments_from_learner',250],['comments_from_lms',100]] as const){
    for(const value of ['🙂'.repeat(4000),'\u0000'.repeat(4257),'{lang=en}'+'é'.repeat(4000)])
      assert.equal(scorm2004CheckpointLimit({[family]:{0:{comment:value}}}),scorm2004CheckpointBytes+bytes(value));
    for(const comments of [[],{0:[]},{'00':{comment:'Original'}},{[count]:{comment:'Original'}},{0:{comment:'x'.repeat(4258)}},{0:{comment:'\ud800'}},Object.create({0:{comment:'Inherited'}}),{0:Object.create({comment:'Inherited'})}])
      assert.equal(scorm2004CheckpointLimit({[family]:comments}),scorm2004CheckpointBytes);
    assert.equal(scorm2004CheckpointLimit(Object.create({[family]:{0:{comment:'Inherited'}}})),scorm2004CheckpointBytes);
  }
  const maximum={comments_from_learner:Object.fromEntries(Array.from({length:250},(_,i)=>[i,{comment:'\u0000'.repeat(4257)}]))};
  assert.equal(scorm2004CheckpointLimit(maximum),scorm2004CheckpointBytes+250*(6*4257+2));
  assert.equal(scorm2004CheckpointLimit({...maximum,comments_from_lms:Object.fromEntries(Array.from({length:100},(_,i)=>[i,{comment:'\u0000'.repeat(4257)}]))}),scorm2004CheckpointMaxBytes);
});
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 test(edition+':250 full Unicode learner comments survive queue refusal, exact HTTP retry and SQLite reopen/resume',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-comment-spm-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,multiFilePackage(edition,singleSCOManifest(edition)));let opened:ReturnType<typeof fixture>|undefined;
  try{
   const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any,accept=false;
   const api=createSCORM2004API({edition,...b,checkpoint(s){state=s;return accept;}});assert.equal(api.Initialize(''),'true');runInNewContext(learnerCommentScript,{api});runInNewContext(learnerCommentVerifyScript,{api});
   assert.equal(api.Commit(''),'false');assert.equal(api.GetLastError(),'391');const refused=structuredClone(state);accept=true;assert.equal(api.Commit(''),'true');assert.deepEqual(state,refused);
   const request={sequence:1,revision:b.revision,state,finished:false};assert.ok(Buffer.byteLength(JSON.stringify(request))>scorm2004CheckpointBytes);assert.ok(Buffer.byteLength(JSON.stringify(request))<scorm2004CheckpointLimit(state));
   const host=createSCORMContentHost({pearOrigin:'http://127.0.0.1:5630',contentOrigin:'http://localhost:5631',player:f.player,runtimeBundle:Buffer.from('// Original learner comment SPM fixture')});
   let receipt:any;
   try{for(let i=0;i<2;i++){const response=await host.inject({method:'POST',url:'/launch/'+launch.token+'/checkpoint',headers:{host:'localhost:5631',origin:'http://localhost:5631','content-type':'application/json'},payload:request});assert.equal(response.statusCode,200);if(i===0)receipt=response.json();else assert.deepEqual(response.json(),receipt);}}finally{await host.close();}
   assert.equal(receipt.officialLearningChanged,false);assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+1);const rows=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all();assert.equal(rows.length,1);f.db.close();opened=fixture(path);
   const player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(opened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const resumed=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),restored=createSCORM2004API({edition,...player.bootstrap(resumed.token)});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.entry'),'resume');runInNewContext(learnerCommentVerifyScript,{api:restored});
   assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),rows);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{opened?opened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
 test(edition+': full-comment allowance preserves typed validation, authority and ordinary byte quota with atomic HTTP refusal',async()=>{
  const f=await scormLearningFixture(undefined,multiFilePackage(edition,singleSCOManifest(edition)));
  try{
   const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any;
   const api=createSCORM2004API({edition,...b,checkpoint(s){state=s;}});assert.equal(api.Initialize(''),'true');runInNewContext(learnerCommentScript,{api});assert.equal(api.Commit(''),'true');
   const request={sequence:1,revision:b.revision,state,finished:false},receipt=f.player.checkpoint(launch.token,request),rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   const host=createSCORMContentHost({pearOrigin:'http://127.0.0.1:5630',contentOrigin:'http://localhost:5631',player:f.player,runtimeBundle:Buffer.from('// Original bounded comment fixture')});
   try{for(const kind of ['owner','readonly','unknown','array','scalar','ordinary','index'] as const){
    const bad=structuredClone(state);
    if(kind==='owner')bad.learner_id='forged';if(kind==='readonly')bad.comments_from_lms={0:{comment:'forged'}};if(kind==='unknown')bad.comments_from_learner[0].unknown='forged';if(kind==='array')bad.comments_from_learner=[];if(kind==='scalar')bad.comments_from_learner[0].comment='🙂'.repeat(4001);if(kind==='ordinary')bad.suspend_data='x'.repeat(scorm2004CheckpointBytes);if(kind==='index')bad.comments_from_learner[250]={comment:'🙂'.repeat(4000),location:'page250',timestamp:'2020-02-29T12:00:00Z'};
    // Beyond-SPM index250 is valid when remaining ordinary data fits; it gets no extra bytes.
    if(kind==='index'){assert.equal(scorm2004CheckpointLimit(bad),scorm2004CheckpointLimit(state));bad.suspend_data='x'.repeat(scorm2004CheckpointBytes);}
    assert.throws(()=>validateSCORM2004Checkpoint(bad,b.state,edition,false),/Server-owned|Unsupported|container|data model|quota/);
    assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:bad}),/Server-owned|Unsupported|container|data model|quota/);
    const response=await host.inject({method:'POST',url:'/launch/'+launch.token+'/checkpoint',headers:{host:'localhost:5631',origin:'http://localhost:5631','content-type':'application/json'},payload:{...request,sequence:2,revision:b.revision+1,state:bad}});assert.ok([400,403,413].includes(response.statusCode));if(kind==='ordinary'||kind==='index')assert.equal(response.statusCode,413);
    assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
   }}finally{await host.close();}
  }finally{f.db.close();}
 });
}
