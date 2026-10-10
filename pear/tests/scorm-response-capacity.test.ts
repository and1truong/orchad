import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {createSCORMContentHost} from '../src/server/scorm-content-host.ts';
import {responseCapacityVector} from './scorm-response-capacity-vectors.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': named mandatory response capacity commits and retries without history/proof mutation',async()=>{
  for(const type of ['performance','choice'] as const){const f=await scormLearningFixture(undefined,multiFilePackage(edition,singleSCOManifest(edition)));
    try{const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token),v=responseCapacityVector(type);let state:any;
      const api=createSCORM2004API({edition,state:b.state,checkpoint(value){state=value;}});assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:capacity'),'true');assert.equal(api.SetValue('cmi.interactions.0.type',type),'true');
      for(const [n,p] of v.patterns.entries())assert.equal(api.SetValue('cmi.interactions.0.correct_responses.'+n+'.pattern',p),'true',type+' pattern'+n);
      assert.equal(api.SetValue('cmi.interactions.0.learner_response',v.learner),'true');
      if(edition!=='2004-2')assert.equal(api.SetValue('cmi.suspend_data',v.suspend),'true');
      assert.equal(api.SetValue('cmi.exit','suspend'),'true');assert.equal(api.Commit(''),'true');
      const request={sequence:1,revision:b.revision,state,finished:false};assert.ok(Buffer.byteLength(JSON.stringify(state))>512*1024,'original ceiling exceeded');
      const receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
      const overflow=structuredClone(state);for(const n of [1,2])overflow.interactions[n]={...structuredClone(state.interactions[0]),id:'urn:pear:extra:'+n};assert.ok(Buffer.byteLength(JSON.stringify(overflow))>2*1024*1024,'new bounded ceiling exceeded');assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:overflow}),/quota/);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);
      const host=createSCORMContentHost({pearOrigin:'http://127.0.0.1:5520',contentOrigin:'http://localhost:5521',player:f.player,runtimeBundle:Buffer.from('//original fixture')});try{const http=await host.inject({method:'POST',url:'/launch/'+launch.token+'/checkpoint',headers:{host:'localhost:5521',origin:'http://localhost:5521','content-type':'application/json'},payload:request});assert.equal(http.statusCode,200);assert.deepEqual(http.json(),receipt);const refused=await host.inject({method:'POST',url:'/launch/'+launch.token+'/checkpoint',headers:{host:'localhost:5521',origin:'http://localhost:5521','content-type':'application/json'},payload:{...request,sequence:2,revision:b.revision+1,state:overflow}});assert.equal(refused.statusCode,413);assert.equal(refused.json().error,'INVALID_ARGUMENT');}finally{await host.close();}
      f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const resumed=f.player.bootstrap(f.launch(binding).token).state;
      for(const [n,p] of v.patterns.entries())assert.ok(resumed.interactions[0].correct_responses[n].pattern===p,'exact resumed pattern'+n);
      assert.ok(resumed.interactions[0].learner_response===v.learner,'exact learner response');
    }finally{f.db.close();}
  }
});
