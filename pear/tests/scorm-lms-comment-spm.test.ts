import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {createSCORM2004API,scorm2004CheckpointBytes,scorm2004CheckpointLimit} from '../src/shared/scorm2004-runtime.ts';
import {validateSCORM2004Checkpoint} from '../src/server/scorm2004-validation.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {createSCORMContentHost} from '../src/server/scorm-content-host.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {fixture} from './helpers.ts';
import {learnerCommentScript,learnerCommentVerifyScript} from './scorm-learner-comment-spm-vectors.ts';
import {seedLMSComments,lmsCommentVerifyScript,lmsCommentState} from './scorm-lms-comment-spm-vectors.ts';
import {interactionCollectionScript} from './scorm-interaction-collection-vectors.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 test(edition+': 100 trusted LMS/250 full learner comments plus mandatory collection preserve3500-entry provenance, atomic refusal, exact HTTP retry and SQLite resume',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-collection-spm-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,multiFilePackage(edition,singleSCOManifest(edition)));let opened:ReturnType<typeof fixture>|undefined;
  try{
   const binding=f.enroll(),launch=f.launch(binding);seedLMSComments(f,launch.token);const b=f.player.bootstrap(launch.token);let state:any,writes:any,accept=false;
   const api=createSCORM2004API({edition,...b,checkpoint(...args:any[]){state=args[0];writes=args[4];return accept;}});assert.equal(api.Initialize(''),'true');runInNewContext(interactionCollectionScript,{api});runInNewContext(learnerCommentScript,{api});runInNewContext(learnerCommentVerifyScript,{api});runInNewContext(lmsCommentVerifyScript,{api});
   assert.equal(api.Commit(''),'false');assert.equal(api.GetLastError(),'391');const originalWrites=structuredClone(writes);accept=true;assert.equal(api.Commit(''),'true');assert.deepEqual(writes,originalWrites);assert.equal(writes.length,3500);
   assert.equal(api.GetValue('cmi.interactions._count'),'250');assert.equal(api.GetValue('cmi.objectives._count'),'100');for(let i=0;i<250;i++){assert.equal(api.GetValue('cmi.interactions.'+i+'.objectives._count'),'10');assert.equal(api.GetValue('cmi.interactions.'+i+'.correct_responses._count'),'10');}
   const request={sequence:1,revision:b.revision,state,finished:false,interactionWrites:writes};assert.ok(Buffer.byteLength(JSON.stringify(request))>6097652);assert.ok(Buffer.byteLength(JSON.stringify(request))<scorm2004CheckpointLimit(state));assert.deepEqual(state.comments_from_lms,lmsCommentState());
   assert.throws(()=>f.player.checkpoint(launch.token,{...request,interactionWrites:undefined}),/data model|reload|journal/);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,0);
   const receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(receipt.officialLearningChanged,false);assert.equal(Object.keys(receipt.responseBindings!).length,250);for(let i=0;i<250;i++)assert.equal(receipt.responseBindings!['cmi.interactions.'+i+'.learner_response'],'fill-in');
   const rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   for(const kind of ['owner','identifier','unknown','array','bytes','lms-comment','lms-location','lms-timestamp','lms-add','journal'] as const){
    const bad=structuredClone(state);
    if(kind==='owner')bad.learner_id='forged';if(kind==='identifier')bad.interactions[249].objectives[9].id='bad uri';if(kind==='unknown')bad.interactions[249].objectives[9].unknown='forged';if(kind==='array')bad.interactions[249].objectives=[];if(kind==='bytes')bad.suspend_data='x'.repeat(2*1024*1024);if(kind.startsWith('lms-')&&kind!=='lms-add')bad.comments_from_lms[99][kind.slice(4)]='forged';if(kind==='lms-add')bad.comments_from_lms[100]=lmsCommentState()[0];
    assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:bad,interactionWrites:kind==='journal'?Array(4097).fill(writes[0]):writes}),/Server-owned|data model|Unsupported|container|quota|journal/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);
   }
   const host=createSCORMContentHost({pearOrigin:'http://127.0.0.1:5620',contentOrigin:'http://localhost:5621',player:f.player,runtimeBundle:Buffer.from('// Original bounded collection fixture')});
   try{for(const kind of ['readonly','bytes','origin']){const bad=structuredClone(state);if(kind==='readonly')bad.comments_from_lms[99].comment='forged';if(kind==='bytes')bad.suspend_data='x'.repeat(scorm2004CheckpointBytes);const response=await host.inject({method:'POST',url:'/launch/'+launch.token+'/checkpoint',headers:{host:'localhost:5621',origin:kind==='origin'?'http://untrusted.invalid':'http://localhost:5621','content-type':'application/json'},payload:{...request,sequence:2,revision:b.revision+1,state:bad}});assert.equal(response.statusCode,kind==='bytes'?413:403);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);}const response=await host.inject({method:'POST',url:'/launch/'+launch.token+'/checkpoint',headers:{host:'localhost:5621',origin:'http://localhost:5621','content-type':'application/json'},payload:request});assert.equal(response.statusCode,200);assert.deepEqual(response.json(),receipt);}finally{await host.close();}
   assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);f.db.close();opened=fixture(path);
   const player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(opened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const resumed=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),restored=createSCORM2004API({edition,...player.bootstrap(resumed.token)});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.entry'),'resume');runInNewContext(learnerCommentVerifyScript,{api:restored});runInNewContext(lmsCommentVerifyScript,{api:restored});assert.equal(restored.GetValue('cmi.interactions._count'),'250');assert.equal(restored.GetValue('cmi.objectives._count'),'100');
   for(let i=0;i<250;i++){assert.equal(restored.GetValue('cmi.interactions.'+i+'.type'),'choice');assert.equal(restored.GetValue('cmi.interactions.'+i+'.learner_response'),'{lang=en}Original collection response');for(let j=0;j<10;j++){assert.equal(restored.GetValue('cmi.interactions.'+i+'.objectives.'+j+'.id'),'urn:pear:collection-objective:'+i+':'+j);assert.equal(restored.GetValue('cmi.interactions.'+i+'.correct_responses.'+j+'.pattern'),'urn:pear:collection-choice:'+j);}}
   for(let i=0;i<100;i++)assert.equal(restored.GetValue('cmi.objectives.'+i+'.score.raw'),'50');assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{opened?opened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
}
