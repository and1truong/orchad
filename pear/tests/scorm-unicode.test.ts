import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scormCharacters} from '../src/shared/scorm-characterstring.ts';
import {createSCORM12API} from '../src/shared/scorm-runtime.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {sequencingManifest, sharedDataManifest} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';

test('characterstring scalar count preserves combining characters and refuses lone surrogate units', () => {
  assert.equal(scormCharacters('A🙂𐀀e\u0301'),5);
  for (const value of ['\ud800','\udfff','x\ud800y','\ud800\ud800','\udc00\ud800']) assert.equal(scormCharacters(value),Infinity);
  assert.equal(scormCharacters(''),0);assert.equal(scormCharacters('\ud800\udc00'),1);
});

test('malformed Unicode does not override readonly or undefined-element errors',()=>{
  const old=createSCORM12API(),current=createSCORM2004API({edition:'2004-4'});assert.equal(old.LMSInitialize(''),'true');assert.equal(current.Initialize(''),'true');
  for(const value of ['\ud800','\udfff']){
    assert.equal(old.LMSSetValue('cmi.core.student_id',value),'false');assert.equal(old.LMSGetLastError(),'403');
    assert.equal(current.SetValue('cmi.learner_id',value),'false');assert.equal(current.GetLastError(),'404');
    assert.equal(current.SetValue('adl.data.0.id',value),'false');assert.equal(current.GetLastError(),'404');
    assert.equal(current.SetValue('cmi.undefined_field',value),'false');assert.equal(current.GetLastError(),'401');
  }
});
for (const edition of ['1.2','2004-2','2004-3','2004-4'] as const) test(`${edition}: supplementary suspend-data boundary survives durable ACK, close/resume and strict forged-value denial`, async () => {
  const f=await scormLearningFixture(undefined,edition==='1.2'?multiFilePackage():multiFilePackage(edition,sequencingManifest(edition)));
  try {
    const binding=f.enroll(),first=f.launch(binding),b=f.player.bootstrap(first.token),limit=edition==='1.2'?4096:edition==='2004-2'?4000:64000;
    const value='🙂'.repeat(limit);let state:any;
    if(edition==='1.2') {
      const api=createSCORM12API({state:b.state,checkpoint(s){state=s;}});assert.equal(api.LMSInitialize(''),'true');assert.equal(api.LMSSetValue('cmi.suspend_data',value),'true');assert.equal(api.LMSGetValue('cmi.suspend_data'),value);
      assert.equal(api.LMSSetValue('cmi.suspend_data',value+'🙂'),'false');assert.equal(api.LMSGetLastError(),'405');assert.equal(api.LMSSetValue('cmi.suspend_data','\ud800'),'false');assert.equal(api.LMSGetValue('cmi.suspend_data'),value);assert.equal(api.LMSCommit(''),'true');
    } else {
      const api=createSCORM2004API({edition,state:b.state,sequencingTree:b.sequencingTree,sequencingSnapshot:b.sequencingSnapshot,checkpoint(s){state=s;}});assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.suspend_data',value),'true');assert.equal(api.GetValue('cmi.suspend_data'),value);
      assert.equal(api.SetValue('cmi.suspend_data',value+'🙂'),'false');assert.equal(api.GetLastError(),'406');assert.equal(api.SetValue('cmi.suspend_data','\ud800'),'false');assert.equal(api.GetValue('cmi.suspend_data'),value);assert.equal(api.Commit(''),'true');
    }
    const request={sequence:1,revision:0,state,finished:false},receipt=f.player.checkpoint(first.token,request);assert.deepEqual(f.player.checkpoint(first.token,request),receipt);
    for(const invalid of ['\ud800',value+'🙂']) assert.throws(()=>f.player.checkpoint(first.token,{...request,sequence:2,revision:1,state:{...state,suspend_data:invalid}}),/quota|data model/);
    assert.equal(f.player.status(f.service.principal('learner-a'),first.launchId,'session-learner-a').revision,1);
    f.player.close(f.service.principal('learner-a'),first.launchId,'session-learner-a');const next=f.launch(binding);assert.equal(f.player.bootstrap(next.token).state.suspend_data,value);
    assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
  } finally {f.db.close();}
});

test('2004 plain location and comment location support their Unicode character bounds without normalization', () => {
  const api=createSCORM2004API({edition:'2004-4'});assert.equal(api.Initialize(''),'true');
  for(const [key,limit] of [['cmi.location',1000],['cmi.comments_from_learner.0.location',250]] as const) {const value='🙂'.repeat(limit);assert.equal(api.SetValue(key,value),'true');assert.equal(api.GetValue(key),value);assert.equal(api.SetValue(key,value+'x'),'false');assert.equal(api.GetValue(key),value);}
});
for(const global of [false,true]) test(`fourth-edition ${global?'system':'local'} shared store supports 64000 supplementary characters and refuses malformed/oversized writes atomically`,async()=>{
  const original=sharedDataManifest().replace('targetID="urn:pear:private-writer" readSharedData="false" writeSharedData="true"','targetID="urn:pear:private-writer" readSharedData="false" writeSharedData="false"');
  const manifest=global?original.replace('runtime:sharedDataGlobalToSystem="false"',''):original;
  const f=await scormLearningFixture(undefined,multiFilePackage('2004-4',manifest));
  try {
    const first=f.launch(f.enroll()),b=f.player.bootstrap(first.token),api=createSCORM2004API({edition:'2004-4',state:b.state,sequencingTree:b.sequencingTree,sequencingSnapshot:b.sequencingSnapshot});assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('adl.data.1.store','\ud800'),'false');assert.equal(api.GetLastError(),'404');
    const value='🙂'.repeat(64000),request=sequenceCheckpoint(f,first,{'adl.data.0.store':value},false),receipt=f.player.checkpoint(first.token,request);assert.deepEqual(f.player.checkpoint(first.token,request),receipt);
    for(const invalid of [value+'x','\udc00']) assert.throws(()=>f.player.checkpoint(first.token,{...request,sequence:2,revision:1,sharedData:{'urn:pear:shared-notes':invalid}}),/value rejected/);
    if(global) assert.equal(f.db.prepare('SELECT store FROM scorm_system_data').get()!.store,value);
    assert.equal(f.player.status(f.service.principal('learner-a'),first.launchId,'session-learner-a').revision,1);
  }finally{f.db.close();}
});
