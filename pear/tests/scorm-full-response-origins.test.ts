import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {fixture} from './helpers.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {fullResponseOriginsScript,fullResponseOriginsVerifyScript} from './scorm-full-response-origins-vectors.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 test(edition+':2750 original response bindings survive queue refusal,3500-entry typed journal, exact receipt retry and SQLite reopen/resume within a finite cap',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-response-origins-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,multiFilePackage(edition,singleSCOManifest(edition)));let reopened:ReturnType<typeof fixture>|undefined;
  try{
   const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any,writes:any,accept=false;
   const api=createSCORM2004API({edition,...b,checkpoint(...args:any[]){state=args[0];writes=args[4];return accept;}});assert.equal(api.Initialize(''),'true');runInNewContext(fullResponseOriginsScript,{api});runInNewContext(fullResponseOriginsVerifyScript,{api});
   assert.equal(api.Commit(''),'false');assert.equal(api.GetLastError(),'391');assert.ok(state,'valid full origins reach the bounded checkpoint queue');const original=structuredClone(writes);assert.equal(writes.length,3500);accept=true;assert.equal(api.Commit(''),'true');assert.deepEqual(writes,original);
   const request={sequence:1,revision:b.revision,state,finished:false,interactionWrites:writes};assert.throws(()=>f.player.checkpoint(launch.token,{...request,interactionWrites:undefined}),/data model|reload|journal/);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,0);
   const receipt=f.player.checkpoint(launch.token,request);assert.equal(Object.keys(receipt.responseBindings!).length,2750);for(const type of Object.values(receipt.responseBindings!))assert.equal(type,'fill-in');assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
   const rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   for(const kind of ['owner','pattern','metadata','journal']){
    const bad=structuredClone(state);if(kind==='owner')bad.learner_id='forged';if(kind==='pattern')bad.interactions[249].correct_responses[9].pattern='bad uri';
    assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:bad,...(kind==='metadata'?{responseBindings:receipt.responseBindings}:{}),interactionWrites:kind==='journal'?Array(4097).fill(writes[0]):writes}),kind==='metadata'?/Exact checkpoint sequence and revision required/:/Server-owned|data model|rejected|journal/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);
   }
   const overflow={...receipt.responseBindings!,'cmi.interactions.250.learner_response':'fill-in'};assert.throws(()=>createSCORM2004API({edition,state:{...state,interactions:{...state.interactions,250:{id:'urn:pear:overflow',type:'choice',learner_response:'Original extra'}}},responseBindings:overflow}),/Invalid response bindings/);
   f.db.close();reopened=fixture(path);const player=new SCORMPlayerService(reopened.db,new SCORMLearningBindings(reopened.db,reopened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(reopened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const next=player.launch(reopened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:reopened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),bootstrap=player.bootstrap(next.token);assert.deepEqual(bootstrap.responseBindings,receipt.responseBindings);
   const restored=createSCORM2004API({edition,...bootstrap});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.entry'),'resume');runInNewContext(fullResponseOriginsVerifyScript,{api:restored});assert.deepEqual(reopened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(reopened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(reopened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{reopened?reopened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
 test(edition+': historical pattern origins cannot bypass bulk duplicate validation of the current choice subset',()=>{
  for(const duplicate of ['a[,]b','b[,]a']){
   const state={interactions:{0:{id:'urn:pear:mixed',type:'choice',correct_responses:{0:{pattern:'1[:]2'},1:{pattern:'a[,]b'},2:{pattern:duplicate}}}}},bindings={'cmi.interactions.0.correct_responses.0.pattern':'numeric'};
   assert.throws(()=>createSCORM2004API({edition,state,responseBindings:bindings}));
   state.interactions[0].correct_responses[2].pattern='c';const api=createSCORM2004API({edition,state,responseBindings:bindings});assert.equal(api.Initialize(''),'true');for(const [i,p] of Object.entries(state.interactions[0].correct_responses))assert.equal(api.GetValue('cmi.interactions.0.correct_responses.'+i+'.pattern'),p.pattern);assert.equal(api.GetValue('cmi.interactions.0.correct_responses._count'),'3');
  }
 });
}
