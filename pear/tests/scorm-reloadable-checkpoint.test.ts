import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': unreloadable type-change checkpoint is refused atomically and remains recoverable',async()=>{
  for(const sequenced of [false,true])for(const uncommitted of ['uncommitted-answer','']){
    const f=await scormLearningFixture(undefined,sequenced?sequencingPackage(edition):multiFilePackage(edition,singleSCOManifest(edition)));
    try{const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any,calls=0;
      const api=createSCORM2004API({edition,state:b.state,sequencingTree:b.sequencingTree,sequencingSnapshot:b.sequencingSnapshot,checkpoint(v){state=v;calls++;}});
      assert.equal(api.Initialize(''),'true');for(const [key,value] of [['id','urn:pear:reload'],['type','choice'],['learner_response','answer']])assert.equal(api.SetValue('cmi.interactions.0.'+key,value),'true');
      assert.equal(api.SetValue('cmi.exit','suspend'),'true');assert.equal(api.Commit(''),'true');
      const request={sequence:1,revision:b.revision,state,finished:false},receipt=f.player.checkpoint(launch.token,request),stored=f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state;
      assert.equal(api.SetValue('cmi.interactions.0.learner_response',uncommitted),'true');assert.equal(api.SetValue('cmi.interactions.0.type','numeric'),'true');assert.equal(api.GetLastError(),'0');assert.equal(api.GetValue('cmi.interactions.0.learner_response'),uncommitted);
      assert.equal(api.Commit(''),'false');assert.equal(api.GetLastError(),'391');if(sequenced)assert.equal(api.SetValue('adl.nav.request','continue'),'true');assert.equal(api.Terminate(''),'false');assert.equal(api.GetLastError(),'111');assert.equal(calls,1,'no unreloadable snapshot queued');if(sequenced)assert.equal(api.SetValue('adl.nav.request','_none_'),'true');
      const invalid=structuredClone(state);invalid.interactions[0].type='numeric';invalid.interactions[0].learner_response=uncommitted;
      assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:invalid}),/(cannot be reloaded|rejected checkpoint)/);
      assert.equal(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state,stored);assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
      assert.equal(api.SetValue('cmi.interactions.0.learner_response','42'),'true');assert.equal(api.Commit(''),'true');assert.equal(calls,2);
      const next={...request,sequence:2,revision:b.revision+1,state},accepted=f.player.checkpoint(launch.token,next);assert.deepEqual(f.player.checkpoint(launch.token,next),accepted);
      assert.equal(api.SetValue('cmi.interactions.1.id','urn:pear:pattern'),'true');assert.equal(api.SetValue('cmi.interactions.1.type','sequencing'),'true');assert.equal(api.SetValue('cmi.interactions.1.correct_responses.0.pattern','a[,]b'),'true');assert.equal(api.SetValue('cmi.interactions.1.type','numeric'),'true');assert.equal(api.Commit(''),'false');assert.equal(api.GetLastError(),'391');assert.equal(calls,2);
      assert.equal(api.SetValue('cmi.interactions.1.type','sequencing'),'true');assert.equal(api.Commit(''),'true');f.player.checkpoint(launch.token,{...next,sequence:3,revision:b.revision+2,state});
      f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const resumed=f.player.bootstrap(f.launch(binding).token);
      const restored=createSCORM2004API({edition,state:resumed.state,sequencingTree:resumed.sequencingTree,sequencingSnapshot:resumed.sequencingSnapshot});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.interactions.0.type'),'numeric');assert.equal(restored.GetValue('cmi.interactions.0.learner_response'),'42');assert.equal(restored.GetValue('cmi.interactions.1.correct_responses.0.pattern'),'a[,]b');assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,3);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
    }finally{f.db.close();}
  }
});
