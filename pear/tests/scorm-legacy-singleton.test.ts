import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scorm2004Engine} from '../src/shared/scorm2004-engine.ts';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
const fields=['cmi.learner_preference.language','cmi.comments_from_learner.0.comment','cmi.objectives.0.description','cmi.interactions.0.description','cmi.interactions.0.learner_response','cmi.interactions.0.correct_responses.0.pattern'];
const tags=[...'abcdefghijklmnopqrstuvwxyz'].flatMap(char=>['en-'+char,'FRE-'+char.toUpperCase()+'-demo','qaa-'+char+'-more']);
function put(state:any,key:string,value:string){const parts=key.split('.').slice(1);let target=state;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)!]=value;}
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 for(const raw of [true,false])test(edition+': '+(raw?'raw':'facade')+' first26 one-letter ordinary subcodes retain edition binding/atomic state; later/i/x/digit controls remain exact',()=>{
  let state:any;const api=raw?new (scorm2004Engine(edition))({logLevel:'NONE',autocommit:false,lmsCommitUrl:false}):createSCORM2004API({edition,checkpoint(value){state=value;}});
  assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.objectives.0.id','urn:pear:singleton-objective'),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:singleton-interaction'),'true');assert.equal(api.SetValue('cmi.interactions.0.type','fill-in'),'true');
  const snapshot=()=>{if(raw)return (api as any).renderCMIToJSONObject().cmi;assert.equal(api.Commit(''),'true');return state;};
  for(const key of fields){const value=(tag:string)=>key===fields[0]?tag:'{lang='+tag+'}Original singleton text';
   for(const tag of ['en-US-a','FRE-su-x-demo','en-Latn-US','en-scouse','en-0','qaa-9','x-a','x-0','I-MINGO-a','i-klingon-x','en-US-0']){assert.equal(api.SetValue(key,value(tag)),'true',key+':'+tag);assert.equal(api.GetValue(key),value(tag));}
   for(const tag of tags){const before=structuredClone(snapshot());if(edition==='2004-2'){assert.equal(api.SetValue(key,value(tag)),'false',tag);assert.equal(api.GetLastError(),'406');assert.deepEqual(snapshot(),before);assert.equal(api.GetValue(key),value('en-US-0'));}else{assert.equal(api.SetValue(key,value(tag)),'true');assert.equal(api.GetValue(key),value(tag));}}
  }
 });
 test(edition+': strict preload/typed server replay and v49 exact receipt SQLite resume preserve original later singleton text/authority/history without proof',async()=>{
  const values=Object.fromEntries(fields.map(key=>[key,key===fields[0]?'FRE-su-x-demo':'{lang=en-US-a}Original later singleton text']));
  const preload:any={learner_preference:{language:values[fields[0]]},comments_from_learner:{0:{comment:values[fields[1]]}},comments_from_lms:{0:{comment:'{lang=I-MINGO-a}Original LMS text'}},objectives:{0:{id:'urn:pear:singleton-objective',description:values[fields[2]]}},interactions:{0:{id:'urn:pear:singleton-interaction',type:'fill-in',description:values[fields[3]],learner_response:values[fields[4]],correct_responses:{0:{pattern:values[fields[5]]}}}}};
  const api=createSCORM2004API({edition,state:preload});assert.equal(api.Initialize(''),'true');for(const [key,value] of Object.entries(values))assert.equal(api.GetValue(key),value);assert.equal(api.GetValue('cmi.comments_from_lms.0.comment'),'{lang=I-MINGO-a}Original LMS text');assert.equal(api.SetValue('cmi.comments_from_lms.0.comment','{lang=en-a}Forged'),'false');assert.equal(api.GetLastError(),'404');
  for(const key of [...fields,'cmi.comments_from_lms.0.comment'])for(const tag of tags){const bad=structuredClone(preload);put(bad,key,key===fields[0]?tag:'{lang='+tag+'}Original preload text');if(edition==='2004-2')assert.throws(()=>createSCORM2004API({edition,state:bad}),/Type Mismatch|invalid|rejected/i);else assert.doesNotThrow(()=>createSCORM2004API({edition,state:bad}));}
  const dir=mkdtempSync(join(tmpdir(),'pear-legacy-singleton-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,sequencingPackage(edition));let opened:ReturnType<typeof fixture>|undefined;
  try{
   const binding=f.enroll(),launch=f.launch(binding),request=sequenceCheckpoint(f,launch,{'cmi.objectives.0.id':'primary','cmi.interactions.0.id':'urn:pear:singleton-interaction','cmi.interactions.0.type':'fill-in',...values,'cmi.location':'singleton-page','cmi.exit':'suspend'},false),receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(receipt.officialLearningChanged,false);
   const rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   if(edition==='2004-2')for(const key of fields)for(const tag of tags){const bad=structuredClone(request.state);put(bad,key,key===fields[0]?tag:'{lang='+tag+'}Original refused text');assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:1,state:bad}),/data model|quota/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);}
   const envelope=JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));envelope.engine.adaptation='pear-country-subcode-characters-v49';f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope));f.db.close();opened=fixture(path);
   const player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(opened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const resumed=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),b=player.bootstrap(resumed.token),restored=createSCORM2004API({edition,state:b.state});assert.equal(restored.Initialize(''),'true');assert.equal(restored.GetValue('cmi.entry'),'resume');assert.equal(restored.GetValue('cmi.location'),'singleton-page');for(const [key,value] of Object.entries(values))assert.equal(restored.GetValue(key),value);assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{opened?opened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
}
