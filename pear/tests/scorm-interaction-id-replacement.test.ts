import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {trustedSequencing,saveSequencing} from '../src/server/scorm-sequencing.ts';
import {inspectSCORMPackage} from '../src/server/scorm-package-reader.ts';
import {sequencingManifest} from './scorm-sequencing-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';

for(const edition of ['2004-2','2004-3','2004-4'] as const){
 test(edition+': shared interaction ID replacement retains tracked data, packed counts and objective immutability',()=>{
  for(const facade of [false,true]){
   let saved:any;const api:any=facade?createSCORM2004API({edition,checkpoint(s){saved=structuredClone(s);}}):new Scorm2004API({logLevel:'NONE'});
   assert.equal(api.Initialize(''),'true');
   for(const [key,value] of [['cmi.interactions.0.id','urn:pear:old'],['cmi.interactions.0.type','choice'],['cmi.interactions.0.objectives.0.id','urn:pear:ref'],['cmi.interactions.0.learner_response','a'],['cmi.interactions.0.correct_responses.0.pattern','a'],['cmi.interactions.0.result','correct'],['cmi.interactions.0.description','tracked'],['cmi.interactions.1.id','urn:pear:second'],['cmi.objectives.0.id','urn:pear:fixed'],['cmi.objectives.0.score.scaled','0.5']])assert.equal(api.SetValue(key,value),'true',key);
   const snapshot=()=>{if(!facade)return structuredClone(api.renderCMIToJSONObject().cmi);assert.equal(api.Commit(''),'true');return structuredClone(saved);};
   const before=snapshot();
   for(const id of ['urn:pear:new','https://example.test/new%20id','urn:pear:old']){
    assert.equal(api.SetValue('cmi.interactions.0.id',id),'true');assert.equal(api.GetLastError(),'0');assert.equal(api.GetValue('cmi.interactions.0.id'),id);
    const expected=structuredClone(before);expected.interactions[0].id=id;assert.deepEqual(snapshot(),expected);assert.equal(api.GetValue('cmi.interactions._count'),'2');
    for(const bad of ['bad%','1:invalid','a\n']){assert.equal(api.SetValue('cmi.interactions.0.id',bad),'false');assert.equal(api.GetLastError(),'406');assert.deepEqual(snapshot(),expected);}
   }
   assert.equal(api.SetValue('cmi.interactions.3.id','urn:pear:gap'),'false');assert.equal(api.GetLastError(),'351');assert.deepEqual(snapshot(),before);
   assert.equal(api.SetValue('cmi.objectives.0.id','urn:pear:changed'),'false');assert.equal(api.GetLastError(),'351');assert.deepEqual(snapshot(),before);
  }
  const seed={interactions:{0:{id:'urn:pear:old',type:'choice',learner_response:'a'}}};
  const shared=new Scorm2004API({logLevel:'NONE'});shared.loadFromJSON(seed);shared.loadFromJSON({interactions:{0:{id:'urn:pear:new'}}});shared.Initialize('');assert.equal(shared.GetValue('cmi.interactions.0.id'),'urn:pear:new');assert.equal(shared.GetValue('cmi.interactions.0.learner_response'),'a');
 });
 test(edition+': replaced ID survives bound ACK/retry/resume without changing earlier receipts, time or proof',async()=>{
  const f=await scormLearningFixture(undefined,multiFilePackage(edition,singleSCOManifest(edition)));
  try{const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any;
   const api=createSCORM2004API({edition,state:b.state,checkpoint(s){state=structuredClone(s);}});assert.equal(api.Initialize(''),'true');
   for(const [key,value] of [['cmi.interactions.0.id','urn:pear:old'],['cmi.interactions.0.type','choice'],['cmi.interactions.0.learner_response','a'],['cmi.interactions.0.correct_responses.0.pattern','a'],['cmi.exit','suspend'],['cmi.session_time','PT12S']])assert.equal(api.SetValue(key,value),'true');
   assert.equal(api.Commit(''),'true');const first={sequence:1,revision:b.revision,state:structuredClone(state),finished:false},receipt=f.player.checkpoint(launch.token,first),prior=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').get();
   assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:new'),'true');assert.equal(api.Commit(''),'true');const request={sequence:2,revision:b.revision+1,state:structuredClone(state),finished:false},next=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),next);assert.deepEqual(f.player.checkpoint(launch.token,first),receipt);
   assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints ORDER BY sequence LIMIT 1').get(),prior);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,2);assert.equal(f.db.prepare('SELECT reported_seconds FROM scorm_sco_attempts').get()!.reported_seconds,12);
   const forged=structuredClone(state);forged.interactions[0].id='bad%';assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:3,revision:b.revision+2,state:forged}),/data model/);assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+2);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
   f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const resumed=createSCORM2004API({edition,state:f.player.bootstrap(f.launch(binding).token).state});assert.equal(resumed.Initialize(''),'true');assert.equal(resumed.GetValue('cmi.interactions.0.id'),'urn:pear:new');assert.equal(resumed.GetValue('cmi.interactions.0.learner_response'),'a');assert.equal(resumed.GetValue('cmi.interactions.0.correct_responses.0.pattern'),'a');assert.equal(resumed.GetValue('cmi.interactions._count'),'1');assert.equal(resumed.GetValue('cmi.total_time'),'PT12S');
  }finally{f.db.close();}
 });
}

test('v39 accepts exact v34/v35/v36/v37/v38 sequencing envelopes while keeping identity and unknown-adaptation refusal',async(t)=>{
 const {manifest}=await inspectSCORMPackage(multiFilePackage('2004-4',sequencingManifest('2004-4'))),scope={attemptId:'original-attempt',sha256:'a'.repeat(64)};
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,9)});
 const engine=trustedSequencing(manifest,'{}',scope),saved=JSON.parse(saveSequencing(engine,manifest,scope)),restored=trustedSequencing(manifest,JSON.stringify(saved),scope).serializeSequencingState();for(const marker of ['pear-logout-exitall-v34','pear-interaction-id-v35','pear-urn-nul-v36','pear-collection-read-errors-v37','pear-sequencing-response-sets-v38']){saved.engine.adaptation=marker;
 assert.equal(trustedSequencing(manifest,JSON.stringify(saved),scope).serializeSequencingState(),restored);}
 assert.throws(()=>trustedSequencing(manifest,JSON.stringify(saved),{...scope,attemptId:'different-attempt'}),/identity changed/);
 saved.engine.adaptation='unreviewed';assert.throws(()=>trustedSequencing(manifest,JSON.stringify(saved),scope),/identity changed/);
});
