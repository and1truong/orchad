import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {validateSCORM2004Checkpoint} from '../src/server/scorm2004-validation.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {createSCORMContentHost} from '../src/server/scorm-content-host.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {fixture} from './helpers.ts';
import {interactionCollectionScript} from './scorm-interaction-collection-vectors.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 test(edition+': mandatory250 interaction sets/10 objective IDs/10 patterns plus100 objectives preserve3500-entry provenance, atomic refusal, exact HTTP retry and SQLite resume',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-collection-spm-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,multiFilePackage(edition,singleSCOManifest(edition)));let opened:ReturnType<typeof fixture>|undefined;
  try{
   const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any,writes:any,accept=false;
   const api=createSCORM2004API({edition,...b,checkpoint(...args:any[]){state=args[0];writes=args[4];return accept;}});assert.equal(api.Initialize(''),'true');runInNewContext(interactionCollectionScript,{api});
   assert.equal(api.Commit(''),'false');assert.equal(api.GetLastError(),'391');const originalWrites=structuredClone(writes);accept=true;assert.equal(api.Commit(''),'true');assert.deepEqual(writes,originalWrites);assert.equal(writes.length,3500);
   assert.equal(api.GetValue('cmi.interactions._count'),'250');assert.equal(api.GetValue('cmi.objectives._count'),'100');for(let i=0;i<250;i++){assert.equal(api.GetValue('cmi.interactions.'+i+'.objectives._count'),'10');assert.equal(api.GetValue('cmi.interactions.'+i+'.correct_responses._count'),'10');}
   const request={sequence:1,revision:b.revision,state,finished:false,interactionWrites:writes};assert.ok(Buffer.byteLength(JSON.stringify(request))<2*1024*1024);
   assert.throws(()=>f.player.checkpoint(launch.token,{...request,interactionWrites:undefined}),/data model|reload|journal/);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,0);
   const receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(receipt.officialLearningChanged,false);assert.equal(Object.keys(receipt.responseBindings!).length,250);for(let i=0;i<250;i++)assert.equal(receipt.responseBindings!['cmi.interactions.'+i+'.learner_response'],'fill-in');
   const rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   for(const kind of ['owner','identifier','unknown','array','bytes','ordinary'] as const){
    const bad=structuredClone(state);
    if(kind==='owner')bad.learner_id='forged';if(kind==='identifier')bad.interactions[249].objectives[9].id='bad uri';if(kind==='unknown')bad.interactions[249].objectives[9].unknown='forged';if(kind==='array')bad.interactions[249].objectives=[];if(kind==='bytes')bad.suspend_data='x'.repeat(2*1024*1024);if(kind==='ordinary')bad.comments_from_learner=Object.fromEntries(Array.from({length:1000},(_,i)=>[i,{comment:'Original text',location:'page',timestamp:'2020-02-29T12:00:00Z'}]));
    assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:bad,interactionWrites:undefined}),/Server-owned|data model|Unsupported|container|quota/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);
   }
   const host=createSCORMContentHost({pearOrigin:'http://127.0.0.1:5620',contentOrigin:'http://localhost:5621',player:f.player,runtimeBundle:Buffer.from('// Original bounded collection fixture')});
   try{const response=await host.inject({method:'POST',url:'/launch/'+launch.token+'/checkpoint',headers:{host:'localhost:5621',origin:'http://localhost:5621','content-type':'application/json'},payload:request});assert.equal(response.statusCode,200);assert.deepEqual(response.json(),receipt);}finally{await host.close();}
   assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);f.db.close();opened=fixture(path);
   const player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(opened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const resumed=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),restored=createSCORM2004API({edition,...player.bootstrap(resumed.token)});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.entry'),'resume');assert.equal(restored.GetValue('cmi.interactions._count'),'250');assert.equal(restored.GetValue('cmi.objectives._count'),'100');
   for(let i=0;i<250;i++){assert.equal(restored.GetValue('cmi.interactions.'+i+'.type'),'choice');assert.equal(restored.GetValue('cmi.interactions.'+i+'.learner_response'),'{lang=en}Original collection response');for(let j=0;j<10;j++){assert.equal(restored.GetValue('cmi.interactions.'+i+'.objectives.'+j+'.id'),'urn:pear:collection-objective:'+i+':'+j);assert.equal(restored.GetValue('cmi.interactions.'+i+'.correct_responses.'+j+'.pattern'),'urn:pear:collection-choice:'+j);}}
   for(let i=0;i<100;i++)assert.equal(restored.GetValue('cmi.objectives.'+i+'.score.raw'),'50');assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{opened?opened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
 test(edition+': collection allowance stops at first250 interactions/first10 nested members; ordinary2048-field and2MiB bounds still refuse exact snapshots',()=>{
  let state:any;const api=createSCORM2004API({edition,checkpoint(s){state=s;}});assert.equal(api.Initialize(''),'true');assert.equal(api.Commit(''),'true');const seed=structuredClone(state);
  for(let i=0;i<450;i++){assert.equal(api.SetValue('cmi.interactions.'+i+'.id','urn:pear:bounds:'+i),'true');for(let j=0;j<10;j++)assert.equal(api.SetValue('cmi.interactions.'+i+'.objectives.'+j+'.id','urn:pear:bounds-objective:'+i+':'+j),'true');}assert.equal(api.Commit(''),'true');assert.ok(Buffer.byteLength(JSON.stringify(state))<2*1024*1024);assert.throws(()=>validateSCORM2004Checkpoint(state,seed,edition,false),/CMI field quota/);
  const within=structuredClone(state);for(let i=250;i<450;i++)delete within.interactions[i];assert.doesNotThrow(()=>validateSCORM2004Checkpoint(within,seed,edition,false));
  const nested=structuredClone(within);for(let i=0;i<250;i++)for(let j=10;j<20;j++)nested.interactions[i].objectives[j]={id:'urn:pear:extra-objective:'+i+':'+j};assert.throws(()=>validateSCORM2004Checkpoint(nested,seed,edition,false),/CMI field quota/);
 });
}
