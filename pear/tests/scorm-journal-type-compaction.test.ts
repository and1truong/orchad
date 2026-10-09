import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) for (const finish of [false,true]) test(edition + ': legal consecutive type history can be checkpointed before the first save ' + (finish?'Terminate':'Commit'), () => {
  let writes: [string,string][] | undefined;
  const api = createSCORM2004API({edition,checkpoint(_state,_finished,_nav,_shared,journal){writes=journal;}});
  assert.equal(api.Initialize(''),'true');
  assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:type-history'),'true');
  assert.equal(api.SetValue('cmi.interactions.0.type','choice'),'true');
  for (const key of ['cmi.interactions.0.learner_response','cmi.interactions.0.correct_responses.0.pattern']) assert.equal(api.SetValue(key,'retained'),'true');
  for (let n=0;n<5000;n++) assert.equal(api.SetValue('cmi.interactions.0.type',n%2?'choice':'sequencing'),'true');
  assert.equal(api.SetValue('cmi.interactions.0.type','numeric'),'true');
  assert.equal(finish?api.Terminate(''):api.Commit(''),'true');
  assert.equal(api.GetLastError(),'0');assert.ok(writes&&writes.length<=5);
});

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': compact journal preserves intervening response origins through refusal, exact receipt retry and durable resume', async () => {
  for (const sequenced of [false,true]) for (const finish of [false,true]) {
    const f = await scormLearningFixture(undefined, sequenced ? sequencingPackage(edition) : multiFilePackage(edition,singleSCOManifest(edition)));
    try {
      const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any,writes:any,accept=false;
      const api=createSCORM2004API({edition,...b,checkpoint(...args:any[]){state=args[0];writes=args[4];return accept;}});
      assert.equal(api.Initialize(''),'true');
      for(const [key,value] of [['id','urn:pear:type-origins'],['type','choice'],['learner_response','retained'],['correct_responses.0.pattern','retained'],['type','sequencing'],['learner_response','a[,]a']]) assert.equal(api.SetValue('cmi.interactions.0.'+key,value),'true');
      for(let n=0;n<5000;n++)assert.equal(api.SetValue('cmi.interactions.0.type',n%2?'choice':'sequencing'),'true');
      assert.equal(api.SetValue('cmi.interactions.0.type','unknown'),'false');assert.equal(api.GetLastError(),'406');
      assert.equal(api.SetValue('cmi.interactions.0.type','numeric'),'true');assert.equal(api.SetValue('cmi.exit','suspend'),'true');
      const save=()=>finish?api.Terminate(''):api.Commit('');assert.equal(save(),'false');assert.equal(api.GetLastError(),finish?'111':'391');
      const original=structuredClone(writes);accept=true;assert.equal(save(),'true');assert.deepEqual(writes,original);assert.equal(writes.length,7);
      const request={sequence:1,revision:b.revision,state,finished:finish,interactionWrites:writes};
      // Removing the middle type write would validate the duplicate-member
      // response as choice rather than its successful sequencing origin.
      const forged=writes.filter((_write:any,n:number)=>n!==4);
      assert.throws(()=>f.player.checkpoint(launch.token,{...request,interactionWrites:forged}),/journal/);
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision);
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,0);
      const receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
      assert.deepEqual(receipt.responseBindings,{'cmi.interactions.0.learner_response':'sequencing','cmi.interactions.0.correct_responses.0.pattern':'choice'});
      f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');
      const resumed=createSCORM2004API({edition,...f.player.bootstrap(f.launch(binding).token)});assert.equal(resumed.Initialize(''),'true');
      assert.equal(resumed.GetValue('cmi.interactions.0.type'),'numeric');assert.equal(resumed.GetValue('cmi.interactions.0.learner_response'),'a[,]a');assert.equal(resumed.GetLastError(),'0');
      assert.equal(resumed.GetValue('cmi.interactions.0.correct_responses.0.pattern'),'retained');assert.equal(resumed.GetLastError(),'0');
      assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
    } finally {f.db.close();}
  }
});
