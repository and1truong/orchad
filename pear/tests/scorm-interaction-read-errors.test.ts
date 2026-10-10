import {test} from 'node:test';
import {absentCollectionPaths} from './scorm-collection-read-vectors.ts';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
const fields = {type: 'choice', timestamp: '2000-02-29T12:00:00.00Z', weighting: '0', result: 'neutral', latency: 'PT0S'};
for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': absent interaction records are301 while unset fields remain403 and dependencies/preload are preserved', () => {
    for (const api of [new Scorm2004API({logLevel:'NONE'}), createSCORM2004API({edition})]) {
      assert.equal(api.Initialize(''), 'true');
      for (const [field,value] of Object.entries(fields)) {assert.equal(api.SetValue('cmi.interactions.0.'+field,value),'false');assert.equal(api.GetLastError(),'408');assert.equal(api.GetValue('cmi.interactions._count'),'0');}
      assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:unset'),'true');
      for (const [field,value] of Object.entries(fields)) {
        const key='cmi.interactions.0.'+field;assert.equal(api.GetValue(key),'');assert.equal(api.GetLastError(),'403',key);
        assert.equal(api.SetValue(key,''),'false');assert.equal(api.GetLastError(),'406');assert.equal(api.GetValue(key),'');assert.equal(api.GetLastError(),'403');
        assert.equal(api.SetValue(key,value),'true');assert.equal(api.GetValue(key),value);assert.equal(api.GetLastError(),'0');
      }
      assert.equal(api.SetValue('cmi.interactions.1.id','urn:pear:missing-type'),'true');
      for (const key of ['learner_response','correct_responses.0.pattern']) {assert.equal(api.SetValue('cmi.interactions.1.'+key,'answer'),'false');assert.equal(api.GetLastError(),'408');}
    }
    const seed={interactions:{0:{id:'urn:pear:set',...fields},1:{id:'urn:pear:unset'},2:{id:'urn:pear:legacy',type:'',timestamp:'',weighting:'',result:'',latency:''}}};
    const raw=new Scorm2004API({logLevel:'NONE'});raw.loadFromJSON(seed);
    for (const api of [raw,createSCORM2004API({edition,state:seed})]) {
      assert.equal(api.Initialize(''),'true');for (const row of [0,1,2,3]) for (const [field,value] of Object.entries(fields)) {assert.equal(api.GetValue('cmi.interactions.'+row+'.'+field),row===0?value:'');assert.equal(api.GetLastError(),row===0?'0':row===3?'301':'403');}
    }
    raw.reset();assert.equal(raw.Initialize(''),'true');assert.equal(raw.SetValue('cmi.interactions.0.id','urn:pear:reset'),'true');for(const field of Object.keys(fields)){assert.equal(raw.GetValue('cmi.interactions.0.'+field),'');assert.equal(raw.GetLastError(),'403');}
  });
  test(edition + ': interaction record read errors survive typed replay, exact receipt retry and resume without history/proof changes', async () => {
    const f=await scormLearningFixture(undefined,multiFilePackage(edition,singleSCOManifest(edition)));
    try {
      const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any;
      const api=createSCORM2004API({edition,state:b.state,checkpoint(value){state=value;}});assert.equal(api.Initialize(''),'true');
      assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:set'),'true');for(const [field,value] of Object.entries(fields))assert.equal(api.SetValue('cmi.interactions.0.'+field,value),'true');assert.equal(api.SetValue('cmi.interactions.1.id','urn:pear:unset'),'true');assert.equal(api.SetValue('cmi.exit','suspend'),'true');assert.equal(api.Commit(''),'true');
      for(const field of Object.keys(fields)){assert.equal(state.interactions[0][field],fields[field as keyof typeof fields]);assert.equal(state.interactions[1][field],'',field);}
      const request={sequence:1,revision:b.revision,state,finished:false},receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
      for(const [field,bad] of Object.entries({type:'bogus',timestamp:'2000-02-30T12:00:00Z',weighting:'NaN',result:'bogus',latency:'P'})){const forged=structuredClone(state);forged.interactions[1][field]=bad;assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:forged}),/data model|quota/);}
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
      const stored=f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state;assert.deepEqual(JSON.parse(stored as string).interactions,state.interactions);
      f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const resumed=createSCORM2004API({edition,state:f.player.bootstrap(f.launch(binding).token).state});assert.equal(resumed.Initialize(''),'true');for(const row of [0,1,2])for(const [field,value] of Object.entries(fields)){assert.equal(resumed.GetValue('cmi.interactions.'+row+'.'+field),row===0?value:'');assert.equal(resumed.GetLastError(),row===0?'0':row===1?'403':'301');}
      assert.equal(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state,stored);
    } finally {f.db.close();}
  });
}

for(const edition of ['2004-2','2004-3','2004-4'] as const)test(edition+': all named objective/interaction scalar and nested collection reads reject absent records301 without appending',()=>{
  const paths=absentCollectionPaths;
  for(const api of [new Scorm2004API({logLevel:'NONE'}),createSCORM2004API({edition})]){
    assert.equal(api.Initialize(''),'true');for(const path of paths){assert.equal(api.GetValue(path),'',path);assert.equal(api.GetLastError(),'301',path);}
    for(const family of ['objectives','interactions'])assert.equal(api.GetValue('cmi.'+family+'._count'),'0');
    assert.equal(api.SetValue('cmi.objectives.0.id','urn:pear:objective'),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:interaction'),'true');
    for(const path of ['cmi.interactions.0.objectives.0.id','cmi.interactions.0.correct_responses.0.pattern']){assert.equal(api.GetValue(path),'');assert.equal(api.GetLastError(),'301',path);}
    for(const suffix of ['objectives','correct_responses'])assert.equal(api.GetValue('cmi.interactions.0.'+suffix+'._count'),'0');
    assert.equal(api.SetValue('cmi.interactions.0.type','choice'),'true');assert.equal(api.SetValue('cmi.interactions.0.correct_responses.0.pattern','answer'),'true');assert.equal(api.SetValue('cmi.interactions.0.objectives.0.id','urn:pear:objective'),'true');
    assert.equal(api.GetValue('cmi.interactions.0.correct_responses.0.pattern'),'answer');assert.equal(api.GetLastError(),'0');assert.equal(api.GetValue('cmi.interactions.0.objectives.0.id'),'urn:pear:objective');assert.equal(api.GetLastError(),'0');
  }
});
