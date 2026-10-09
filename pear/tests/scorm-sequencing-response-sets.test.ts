import {test} from 'node:test';
import assert from 'node:assert/strict';
import Scorm2004API from 'scorm-again/scorm2004';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {multiFilePackage} from './scorm-package-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import {sequencingResponsePatterns as patterns} from './scorm-sequencing-response-vectors.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) {
  test(edition + ': sequencing response patterns reject duplicate arrays on append/replacement but preserve order and repeated members', () => {
    for (const api of [new Scorm2004API({logLevel:'NONE'}), createSCORM2004API({edition})]) {
      assert.equal(api.Initialize(''), 'true');
      const base='cmi.interactions.0';
      assert.equal(api.SetValue(base+'.id','urn:pear:ordered'),'true');
      assert.equal(api.SetValue(base+'.type','sequencing'),'true');
      assert.equal(api.SetValue(base+'.correct_responses.0.pattern',patterns[0]),'true');
      assert.equal(api.SetValue(base+'.correct_responses.1.pattern',patterns[0]),'false');
      assert.equal(api.GetLastError(),'351');assert.equal(api.GetValue(base+'.correct_responses._count'),'1');
      for (const [n,p] of patterns.entries()) assert.equal(api.SetValue(base+'.correct_responses.'+n+'.pattern',p),'true',JSON.stringify(p));
      for (const n of [1,patterns.length]) {assert.equal(api.SetValue(base+'.correct_responses.'+n+'.pattern',patterns[0]),'false');assert.equal(api.GetLastError(),'351');}
      assert.equal(api.SetValue(base+'.correct_responses.'+patterns.length+'.pattern',''),'false');assert.equal(api.GetLastError(),'351');
      for (const [n,p] of patterns.entries()) {assert.equal(api.GetValue(base+'.correct_responses.'+n+'.pattern'),p);assert.equal(api.GetLastError(),'0');}
      assert.equal(api.GetValue(base+'.correct_responses._count'),String(patterns.length));
      assert.equal(api.SetValue(base+'.learner_response','a[,]a'),'true');assert.equal(api.GetValue(base+'.learner_response'),'a[,]a');
      // Retain existing choice-set semantics and matching's permitted repeats.
      for(const [row,type] of [[1,'choice'],[2,'matching']] as const){const b='cmi.interactions.'+row;assert.equal(api.SetValue(b+'.id','urn:pear:'+type),'true');assert.equal(api.SetValue(b+'.type',type),'true');const p=type==='choice'?'a[,]b':'a[.]b';assert.equal(api.SetValue(b+'.correct_responses.0.pattern',p),'true');assert.equal(api.SetValue(b+'.correct_responses.1.pattern',type==='choice'?'b[,]a':p),type==='choice'?'false':'true');assert.equal(api.GetLastError(),type==='choice'?'351':'0');}
    }
    for(const p of [patterns[0],'']){const state={interactions:{0:{id:'urn:pear:ordered',type:'sequencing',correct_responses:{0:{pattern:p},1:{pattern:p}}}}};assert.throws(()=>new Scorm2004API({logLevel:'NONE'}).loadFromJSON(state),/./);assert.throws(()=>createSCORM2004API({edition,state}),/./);}
  });

  test(edition + ': zero-member sequencing pattern survives preload as one supplied record with zero-error read', () => {
    const state={interactions:{0:{id:'urn:pear:empty',type:'sequencing',correct_responses:{0:{pattern:''}}}}};
    const raw=new Scorm2004API({logLevel:'NONE'});raw.loadFromJSON(state);
    for(const api of [raw,createSCORM2004API({edition,state})]){assert.equal(api.Initialize(''),'true');assert.equal(api.GetValue('cmi.interactions.0.correct_responses._count'),'1');assert.equal(api.GetValue('cmi.interactions.0.correct_responses.0.pattern'),'');assert.equal(api.GetLastError(),'0');assert.equal(api.SetValue('cmi.interactions.0.correct_responses.0.pattern',''),'true');}
  });

  test(edition + ': ordered response uniqueness survives typed replay, exact receipt retry and close/resume without changing history or proof', async () => {
    const f=await scormLearningFixture(undefined,multiFilePackage(edition,singleSCOManifest(edition)));
    try {
      const binding=f.enroll(),launch=f.launch(binding),b=f.player.bootstrap(launch.token);let state:any;
      const api=createSCORM2004API({edition,state:b.state,checkpoint(value){state=value;}});assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:ordered'),'true');assert.equal(api.SetValue('cmi.interactions.0.type','sequencing'),'true');
      for(const [n,p] of patterns.entries())assert.equal(api.SetValue('cmi.interactions.0.correct_responses.'+n+'.pattern',p),'true');
      assert.equal(api.SetValue('cmi.exit','suspend'),'true');assert.equal(api.Commit(''),'true');
      const request={sequence:1,revision:b.revision,state,finished:false},receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);
      const stored=f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state;
      for(const [n,p] of [[1,patterns[0]],[patterns.length,patterns[0]],[patterns.length,'']] as const){const forged=structuredClone(state);forged.interactions[0].correct_responses[n]={pattern:p};assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:b.revision+1,state:forged}),/data model/);assert.equal(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state,stored);}
      assert.equal(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision,b.revision+1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);
      f.player.close(f.service.principal('learner-a'),launch.launchId,'session-learner-a');const resumed=createSCORM2004API({edition,state:f.player.bootstrap(f.launch(binding).token).state});assert.equal(resumed.Initialize(''),'true');for(const [n,p] of patterns.entries()){assert.equal(resumed.GetValue('cmi.interactions.0.correct_responses.'+n+'.pattern'),p);assert.equal(resumed.GetLastError(),'0');}assert.equal(resumed.GetValue('cmi.interactions.0.correct_responses._count'),String(patterns.length));
    } finally {f.db.close();}
  });
}
