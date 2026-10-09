import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sequencingManifest} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const) test(edition + ': acknowledged time-out/logout ends on human close or replacement launch without fabricating a SCO Terminate receipt',async()=>{
 for(const exit of ['time-out','logout'])for(const close of [true,false]) {
  const f=await scormLearningFixture(undefined,multiFilePackage(edition,sequencingManifest(edition)));
  try {
   const binding=f.enroll(),launch=f.launch(binding,'intro');
   const request=sequenceCheckpoint(f,launch,{'cmi.location':'expired-page','cmi.suspend_data':'expired-data','cmi.exit':exit,'cmi.completion_status':'incomplete','cmi.session_time':'PT12S','adl.nav.request':'suspendAll'},false);
   const receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
   const old=f.db.prepare('SELECT * FROM scorm_sco_attempts').get()!;
   if(close){f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');
    const ended=String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state),snapshot=JSON.parse(JSON.parse(ended).snapshot);
    assert.equal(snapshot.sequencing.currentActivity,null);assert.equal(snapshot.sequencing.suspendedActivity,null);
    f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');assert.equal(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state,ended);
   }
   const b=f.player.bootstrap(f.launch(binding,'intro').token);assert.equal(b.state.entry,'ab-initio');assert.equal(b.revision,0);assert.equal(b.state.total_time,'PT0S');for(const field of ['location','suspend_data'])assert.equal(Object.hasOwn(b.state,field),false);
   assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n,2);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts WHERE sco_attempt_number=1').get(),old);
   assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.throws(()=>f.player.checkpoint(launch.token,request),/closed/);
  }finally{f.db.close();}
 }
});
for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': failed time-out removal rolls back engine/capability/history/receipt before exact accepted retry',async()=>{
 for(const exit of ['time-out','logout'])for(const close of [true,false]){
  const f=await scormLearningFixture(undefined,multiFilePackage(edition,sequencingManifest(edition)));
  try{const binding=f.enroll(),launch=f.launch(binding,'intro'),request=sequenceCheckpoint(f,launch,{'cmi.exit':exit,'cmi.location':'old-page','cmi.session_time':'PT12S','cmi.completion_status':'incomplete'},false),receipt=f.player.checkpoint(launch.token,request);
   const history=f.db.prepare('SELECT * FROM scorm_sco_attempts').get(),snapshot=f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state;
   f.db.exec("CREATE TRIGGER reject_removal BEFORE INSERT ON audit WHEN NEW.tool='"+(close?'human_scorm_engine_close':'human_scorm_engine_launch')+"' BEGIN SELECT RAISE(ABORT,'removal audit failed'); END");
   const remove=()=>close?f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a'):f.launch(binding,'intro');
   assert.throws(remove,/removal audit failed/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').get(),history);assert.equal(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state,snapshot);assert.equal(f.db.prepare('SELECT closed FROM scorm_engine_launches').get()!.closed,0);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_launches').get()!.n,1);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
   f.db.exec('DROP TRIGGER reject_removal');remove();assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
  }finally{f.db.close();}
 }
});
