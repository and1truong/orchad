import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sequencingManifest} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': lost resume launch response and repeated exact registration keys keep trusted resume entry until content acknowledges',async()=>{
 for(const exit of ['normal','']){
  const f=await scormLearningFixture(undefined,multiFilePackage(edition,sequencingManifest(edition)));
  try{const binding=f.enroll(),initial=f.launch(binding,'intro'),request=sequenceCheckpoint(f,initial,{'cmi.location':'suspended-page','cmi.suspend_data':'own-data','cmi.exit':exit,'cmi.completion_status':'incomplete','cmi.session_time':'PT12S','adl.nav.request':'suspendAll'});f.player.checkpoint(initial.token,request);
   const args={packageId:f.pkg.id,version:1,mode:'normal' as const,confirmed:true,revision:f.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID(),binding,scoId:'intro'};
   const first=f.player.launch(f.service.principal('learner-a'),'session-learner-a',args),one=f.player.bootstrap(first.token);
   const history=f.db.prepare('SELECT runtime_state,revision,reported_seconds FROM scorm_sco_attempts').get()!;
   assert.equal(one.state.entry,'resume');
   let latest=first;
   for(let n=0;n<3;n++){const next=f.player.launch(f.service.principal('learner-a'),'session-learner-a',args),b=f.player.bootstrap(next.token);assert.equal(b.state.entry,'resume');assert.equal(b.state.location,'suspended-page');assert.equal(b.state.suspend_data,'own-data');assert.equal(b.state.total_time,'PT12S');assert.equal(b.revision,one.revision);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n,1);assert.deepEqual(f.db.prepare('SELECT runtime_state,revision,reported_seconds FROM scorm_sco_attempts').get(),history);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);latest=next;}
   assert.throws(()=>f.player.bootstrap(first.token),/closed/);
   f.player.checkpoint(latest.token,sequenceCheckpoint(f,latest,{'cmi.exit':'normal'},false));
   const acknowledged=f.player.bootstrap(f.player.launch(f.service.principal('learner-a'),'session-learner-a',{...args,key:crypto.randomUUID(),revision:f.service.context('learner-a','learning:demo:learner-a').revision}).token);
   assert.equal(acknowledged.state.entry,'');assert.equal(acknowledged.state.location,'suspended-page');assert.equal(acknowledged.state.total_time,'PT12S');assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,2);
  }finally{f.db.close();}
 }
});
