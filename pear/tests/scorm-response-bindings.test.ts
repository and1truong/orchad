import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
import Scorm2004API from 'scorm-again/scorm2004';
import {runInNewContext} from 'node:vm';
import {scorm2004Engine} from '../src/shared/scorm2004-engine.ts';
import {loadResponseState,responseBindings,responseStateMatches,runtimeResponseBindings} from '../src/shared/scorm-response-bindings.ts';
import {interactionCollectionScript} from './scorm-interaction-collection-vectors.ts';
import {learnerCommentScript} from './scorm-learner-comment-spm-vectors.ts';
import {lmsCommentState} from './scorm-lms-comment-spm-vectors.ts';
test('shared raw correct-response setter follows a legal type replacement without clearing old data',()=>{
  const api=new Scorm2004API({logLevel:'NONE',autocommit:false,lmsCommitUrl:false});assert.equal(api.Initialize(''),'true');
  for(const [key,value] of [['id','urn:pear:type'],['type','choice'],['correct_responses.0.pattern','answer'],['type','numeric']])assert.equal(api.SetValue('cmi.interactions.0.'+key,value),'true');
  assert.equal(api.GetValue('cmi.interactions.0.correct_responses.0.pattern'),'answer');assert.equal(api.SetValue('cmi.interactions.0.correct_responses.0.pattern','1[:]2'),'true');assert.equal(api.SetValue('cmi.interactions.0.type','invented'),'false');assert.equal(api.GetLastError(),'406');assert.equal(api.SetValue('cmi.interactions.0.correct_responses.0.pattern','3[:]4'),'true');assert.equal(api.SetValue('cmi.interactions.0.correct_responses.0.pattern','bad'),'false');assert.equal(api.GetLastError(),'406');assert.equal(api.GetValue('cmi.interactions.0.correct_responses.0.pattern'),'3[:]4');assert.equal(api.GetValue('cmi.interactions.0.correct_responses._count'),'1');
});
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 test(edition+': learner-only origins retain bulk pattern validation without2500 unnecessary engine probes',()=>{
  let state:any;const api=createSCORM2004API({edition,state:{comments_from_lms:lmsCommentState()},checkpoint(value){state=value;return true;}});
  assert.equal(api.Initialize(''),'true');runInNewContext(interactionCollectionScript,{api});runInNewContext(learnerCommentScript,{api});assert.equal(api.Commit(''),'true');
  const origins=Object.fromEntries(Array.from({length:250},(_,i)=>['cmi.interactions.'+i+'.learner_response','fill-in'])),bindings=responseBindings(state,{}, {},origins);
  assert.equal(Object.keys(bindings).length,250);
  let probes=0;const Base=scorm2004Engine(edition);class Counted extends Base{constructor(...args:ConstructorParameters<typeof Base>){super(...args);probes++;}}
  const runtime=new Counted({logLevel:'NONE',autocommit:false,lmsCommitUrl:false,accumulateSessionTimeOnTerminate:false});probes=0;loadResponseState(runtime,state,bindings);
  assert.equal(probes,250);assert.equal(responseStateMatches(runtime,state),true);assert.deepEqual(runtime.renderCMIToJSONObject().cmi,state);assert.deepEqual(runtimeResponseBindings(runtime),bindings);
 });
 test(edition+': a bound learner response cannot bypass duplicate-set validation of current-type patterns; mixed historical patterns still restore exactly',()=>{
  const bindings={'cmi.interactions.0.learner_response':'fill-in'};
  for(const duplicate of ['a[,]b','b[,]a']){
   const state={interactions:{0:{id:'urn:pear:choice',type:'choice',learner_response:'{lang=en}Original',correct_responses:{0:{pattern:'a[,]b'},1:{pattern:duplicate}}}}};
   const ordinary=structuredClone(state);delete (ordinary.interactions[0] as any).learner_response;const Raw=scorm2004Engine(edition);assert.throws(()=>new Raw({logLevel:'NONE'}).loadFromJSON(ordinary));
   assert.throws(()=>createSCORM2004API({edition,state,responseBindings:bindings}));
  }
  const state={interactions:{0:{id:'urn:pear:mixed',type:'choice',learner_response:'{lang=en}Original',correct_responses:{0:{pattern:'1[:]2'},1:{pattern:'urn:pear:current'}}}}},mixed={...bindings,'cmi.interactions.0.correct_responses.0.pattern':'numeric'};
  const api=createSCORM2004API({edition,state,responseBindings:mixed});assert.equal(api.Initialize(''),'true');assert.equal(api.GetValue('cmi.interactions.0.learner_response'),'{lang=en}Original');assert.equal(api.GetValue('cmi.interactions.0.correct_responses.0.pattern'),'1[:]2');assert.equal(api.GetValue('cmi.interactions.0.correct_responses.1.pattern'),'urn:pear:current');assert.equal(api.GetValue('cmi.interactions.0.correct_responses._count'),'2');
  assert.equal(api.SetValue('cmi.interactions.0.correct_responses.2.pattern','urn:pear:current'),'false');assert.equal(api.GetLastError(),'351');assert.equal(api.GetValue('cmi.interactions.0.correct_responses._count'),'2');
 });
}
for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': accepted response binding survives type changes, exact retry and trusted close/resume',async()=>{
  for(const sequenced of [false,true])for(const field of ['learner_response','correct_responses.0.pattern'])for(const supplied of ['answer','']){
    const f=await scormLearningFixture(undefined,sequenced?sequencingPackage(edition):multiFilePackage(edition,singleSCOManifest(edition)));
    try{const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any;
      const api=createSCORM2004API({edition,...b,checkpoint(v){state=v;}});assert.equal(api.Initialize(''),'true');for(const [key,value] of [['id','urn:pear:bound'],['type','choice'],[field,supplied],['exit','suspend']])assert.equal(api.SetValue(key==='exit'?'cmi.exit':'cmi.interactions.0.'+key,value),'true');assert.equal(api.Commit(''),'true');
      const first={sequence:1,revision:b.revision,state,finished:false},original=f.player.checkpoint(launch.token,first);
      assert.equal(api.SetValue('cmi.interactions.0.type','numeric'),'true');assert.equal(api.GetLastError(),'0');assert.equal(api.GetValue('cmi.interactions.0.'+field),supplied);assert.equal(api.GetLastError(),'0');assert.equal(api.Commit(''),'true');
      const request={sequence:2,revision:b.revision+1,state,finished:false},receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(receipt.responseBindings,{['cmi.interactions.0.'+field]:'choice'});assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.deepEqual(f.player.checkpoint(launch.token,first),original);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,2);assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+2);
      if(field==='learner_response'&&supplied===''){const unannotated=createSCORM2004API({edition,state});unannotated.Initialize('');assert.equal(unannotated.GetValue('cmi.interactions.0.learner_response'),'');assert.equal(unannotated.GetLastError(),'403');}else assert.throws(()=>createSCORM2004API({edition,state}),'unannotated invalid preload remains strict');
      f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const next=f.launch(binding),resumed=f.player.bootstrap(next.token);assert.deepEqual(resumed.responseBindings,receipt.responseBindings);
      const restored=createSCORM2004API({edition,...resumed,checkpoint(v){state=v;}});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.interactions.0.type'),'numeric');assert.equal(restored.GetValue('cmi.interactions.0.'+field),supplied);assert.equal(restored.GetLastError(),'0');
      const changed=structuredClone(resumed.state);if(field==='learner_response')changed.interactions[0].learner_response='forged';else changed.interactions[0].correct_responses[0].pattern='forged';const before=f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state;
      assert.throws(()=>f.player.checkpoint(next.token,{sequence:1,revision:resumed.revision,state:changed,finished:false}),/rejected checkpoint/);assert.equal(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state,before);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,2);
      assert.throws(()=>f.player.checkpoint(next.token,{sequence:1,revision:resumed.revision,state:changed,finished:false,responseBindings:receipt.responseBindings}),'client binding metadata refused');
      const value=field==='learner_response'?'42':'1[:]2';assert.equal(restored.SetValue('cmi.interactions.0.'+field,value),'true');assert.equal(restored.Commit(''),'true');const accepted=f.player.checkpoint(next.token,{sequence:1,revision:resumed.revision,state,finished:false});assert.deepEqual(accepted.responseBindings,{});
      f.player.close(f.service.principal('learner-a'),next.launchId,'session-learner-a');const final=f.player.bootstrap(f.launch(binding).token);assert.deepEqual(final.responseBindings,{});const fresh=createSCORM2004API({edition,...final});assert.equal(fresh.Initialize(''),'true');assert.equal(fresh.GetValue('cmi.interactions.0.'+field),value);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
    }finally{f.db.close();}
  }
});
