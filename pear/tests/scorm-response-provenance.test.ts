import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': first-checkpoint response write provenance survives type change and exact retry/resume',async()=>{
  for(const sequenced of [false,true])for(const field of ['learner_response','correct_responses.0.pattern'])for(const supplied of ['answer','']){
    const f=await scormLearningFixture(undefined,sequenced?sequencingPackage(edition):multiFilePackage(edition,singleSCOManifest(edition)));
    try{const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any,writes:any,accept=false;
      const api=createSCORM2004API({edition,...b,checkpoint(...args:any[]){state=args[0];writes=args[4];return accept;}});assert.equal(api.Initialize(''),'true');
      for(const [key,value]of [['id','urn:pear:provenance'],['type','choice'],[field,supplied],['type','numeric']])assert.equal(api.SetValue('cmi.interactions.0.'+key,value),'true');
      assert.equal(api.SetValue('cmi.exit','suspend'),'true');assert.equal(api.Commit(''),'false');assert.equal(api.GetLastError(),'391');const originalWrites=structuredClone(writes);accept=true;assert.equal(api.Commit(''),'true');assert.deepEqual(writes,originalWrites);assert.equal(api.GetValue('cmi.interactions.0.'+field),supplied);assert.equal(api.GetLastError(),'0');assert.ok(Array.isArray(writes));
      const request={sequence:1,revision:b.revision,state,finished:false,interactionWrites:writes},receipt=(()=>{
        const bad=structuredClone(state);if(field==='learner_response')bad.interactions[0].learner_response='forged';else bad.interactions[0].correct_responses[0].pattern='forged';
        for(const interactionWrites of [undefined,null,{},[],[['cmi.learner_id','forged']],[[writes[0][0],writes[0][1]],['cmi.interactions.0.type','numeric'],...writes.slice(2)],Array(4097).fill(['cmi.interactions.0.type','choice'])])assert.throws(()=>f.player.checkpoint(launch.token,{...request,interactionWrites}),/rejected|reload|journal/);
        assert.throws(()=>f.player.checkpoint(launch.token,{...request,state:bad}),/journal/);assert.throws(()=>f.player.checkpoint(launch.token,{...request,responseBindings:{['cmi.interactions.0.'+field]:'choice'}}));assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,0);
        return f.player.checkpoint(launch.token,request);
      })();
      assert.deepEqual(receipt.responseBindings,{['cmi.interactions.0.'+field]:'choice'});assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);
      assert.equal(api.Commit(''),'true');assert.equal(writes,undefined);const second=f.player.checkpoint(launch.token,{sequence:2,revision:b.revision+1,state,finished:false});assert.deepEqual(second.responseBindings,receipt.responseBindings);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
      f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const next=f.player.bootstrap(f.launch(binding).token),restored=createSCORM2004API({edition,...next});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.interactions.0.type'),'numeric');assert.equal(restored.GetValue('cmi.interactions.0.'+field),supplied);assert.equal(restored.GetLastError(),'0');assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
    }finally{f.db.close();}
  }
});

for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': first Terminate journal passes trusted sequencing replay and resumes preserved response',async()=>{
 const f=await scormLearningFixture(undefined,sequencingPackage(edition));
 try{const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any,writes:any;
 const api=createSCORM2004API({edition,...b,checkpoint(...args:any[]){state=args[0];writes=args[4];}});assert.equal(api.Initialize(''),'true');
 for(const [key,value]of [['id','urn:pear:first-end'],['type','choice'],['learner_response','answer'],['type','numeric']])assert.equal(api.SetValue('cmi.interactions.0.'+key,value),'true');
 assert.equal(api.SetValue('cmi.exit','suspend'),'true');assert.equal(api.Terminate(''),'true');assert.ok(Array.isArray(writes));
 const request={sequence:1,revision:b.revision,state,finished:true,interactionWrites:writes},receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.deepEqual(receipt.responseBindings,{'cmi.interactions.0.learner_response':'choice'});
 f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const restored=createSCORM2004API({edition,...f.player.bootstrap(f.launch(binding).token)});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.interactions.0.learner_response'),'answer');assert.equal(restored.GetLastError(),'0');assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
 }finally{f.db.close();}
});
