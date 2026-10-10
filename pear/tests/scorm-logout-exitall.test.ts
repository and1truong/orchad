import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sequencingManifest} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
for (const edition of ['2004-2','2004-3','2004-4'] as const) {
 test(edition + ': logout overrides Continue/choice/SuspendAll/none and ends the trusted sequencing session', async () => {
  for (const nav of ['continue', '{target=practice}choice', 'suspendAll', '_none_']) {
   const f=await scormLearningFixture(undefined,multiFilePackage(edition,sequencingManifest(edition)));
   try {
    const binding=f.enroll(),launch=f.launch(binding,'intro');
    const request=sequenceCheckpoint(f,launch,{'cmi.location':'expired-page','cmi.suspend_data':'old-data','cmi.session_time':'PT12S','cmi.exit':'logout','cmi.completion_status':'completed','cmi.success_status':'passed','cmi.score.scaled':'0.9','adl.nav.request':nav});
    const result=f.player.checkpoint(launch.token,request); assert.deepEqual(f.player.checkpoint(launch.token,request),result); assert.equal(result.nextScoId,null,nav);
    const envelope=JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state)),snapshot=JSON.parse(envelope.snapshot);
    assert.equal(snapshot.sequencing.currentActivity,null); assert.equal(snapshot.sequencing.suspendedActivity,null);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_sco_attempts').get()!.n,1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1); assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
   } finally {f.db.close();}
  }
 });
 test(edition + ': the actual shared engine forces ExitAll on logout without changing the authored request before termination', async () => {
  const f=await scormLearningFixture(undefined,multiFilePackage(edition,sequencingManifest(edition)));
  try {
   const b=f.player.bootstrap(f.launch(f.enroll(),'intro').token);
   const raw=new Scorm2004API({logLevel:'NONE',autocommit:false,lmsCommitUrl:false,accumulateSessionTimeOnTerminate:false,sequencing:{activityTree:b.sequencingTree as any}});
   assert.equal(raw.deserializeSequencingState(b.sequencingSnapshot!),true);raw.loadFromJSON(b.state);assert.equal(raw.Initialize(''),'true');
   for(const [key,value] of Object.entries({'cmi.exit':'logout','cmi.completion_status':'completed','cmi.success_status':'passed','cmi.score.scaled':'0.9','adl.nav.request':'continue'})) assert.equal(raw.SetValue(key,value),'true');
   assert.equal(raw.adl.nav.request,'continue'); assert.equal(raw.Terminate(''),'true');
   assert.equal(raw.getSequencingState()?.currentActivity,null);
   assert.equal(raw.getSequencingService()?.getSequencingState().isInitialized,false);
   const snapshot=JSON.parse(raw.serializeSequencingState());assert.equal(snapshot.sequencing.suspendedActivity,null);
  } finally {f.db.close();}
 });
}
