import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
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
const alphabet='abcdefghijklmnopqrstuvwxyz0123456789';
const pairs=[...alphabet].flatMap(a=>[...alphabet].map(b=>a+b)).filter(code=>/[0-9]/.test(code));
assert.equal(pairs.length,620);assert.equal(new Set(pairs).size,620);
const unknown=pairs.flatMap(code=>['en-'+code,'FRE-'+code.toUpperCase(),'qaa-'+code+'-demo']);
// Full raw/facade matrix below; bounded representative preload/typed replay across both digit positions/cases.
const forged=['00','09','90','99','a0','0a','z9','9z','A1','1A'].flatMap(code=>['en-'+code,'FRE-'+code,'qaa-'+code+'-demo']);
function put(state: any,key: string,value: string){const parts=key.split('.').slice(1);let target=state;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)!]=value;}
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 for(const raw of [true,false])test(edition+': '+(raw?'raw':'facade')+' all620 mixed/digit first country pairs refuse all six fields atomically; private/additional subcodes remain exact',()=>{
  let state:any;const api=raw?new (scorm2004Engine(edition))({logLevel:'NONE',autocommit:false,lmsCommitUrl:false}):createSCORM2004API({edition,checkpoint(value){state=value;}});
  assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.objectives.0.id','urn:pear:country-objective'),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:country-interaction'),'true');assert.equal(api.SetValue('cmi.interactions.0.type','fill-in'),'true');
  const tags=['en-US','FRE-su-x-demo','SCC-us','qaa-ZR','en-001','FRE-419','en-Latn-US','en-scouse','en-US-11','en-US-a1','x-11','x-a1','i-klingon-11','I-MINGO-a1'];
  const snapshot=()=>{if(raw)return (api as any).renderCMIToJSONObject().cmi;assert.equal(api.Commit(''),'true');return state;};
  for(const key of fields){const value=(language:string)=>key===fields[0]?language:'{lang='+language+'}Original historical text';
   for(const language of [...tags,'x-madeup','x-zz','fre','scc','qtz']){assert.equal(api.SetValue(key,value(language)),'true',key+':'+language);assert.equal(api.GetValue(key),value(language));}
   for(const language of unknown){const before=structuredClone(snapshot());assert.equal(api.SetValue(key,value(language)),'false',key+':'+language);assert.equal(api.GetLastError(),'406');assert.deepEqual(snapshot(),before);assert.equal(api.GetValue(key),value('qtz'));}
  }
 });
 test(edition+': strict preload and v48 exact receipt/SQLite resume preserve country/private/numeric-region strings and refuse forged mixed/digit first country pairs without history/proof',async()=>{
  const values=Object.fromEntries(fields.map(key=>[key,key===fields[0]?'FRE-su-x-demo':'{lang=en-001}Original registered numeric region text']));
  const preload:any={learner_preference:{language:values[fields[0]]},comments_from_learner:{0:{comment:values[fields[1]]}},comments_from_lms:{0:{comment:'{lang=i-lux}Original LMS text'}},objectives:{0:{id:'urn:pear:country-objective',description:values[fields[2]]}},interactions:{0:{id:'urn:pear:country-interaction',type:'fill-in',description:values[fields[3]],learner_response:values[fields[4]],correct_responses:{0:{pattern:values[fields[5]]}}}}};
  const loaded=createSCORM2004API({edition,state:preload});assert.equal(loaded.Initialize(''),'true');for(const [key,value] of Object.entries(values))assert.equal(loaded.GetValue(key),value);assert.equal(loaded.GetValue('cmi.comments_from_lms.0.comment'),'{lang=i-lux}Original LMS text');assert.equal(loaded.SetValue('cmi.comments_from_lms.0.comment','{lang=i-madeup}Forged'),'false');assert.equal(loaded.GetLastError(),'404');
  for(const key of [...fields,'cmi.comments_from_lms.0.comment'])for(const language of forged){const bad=structuredClone(preload);put(bad,key,key===fields[0]?language:'{lang='+language+'}Bad text');assert.throws(()=>createSCORM2004API({edition,state:bad}),/Type Mismatch|invalid|rejected/i);}
  const dir=mkdtempSync(join(tmpdir(),'pear-country-characters-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,sequencingPackage(edition));let opened:ReturnType<typeof fixture>|undefined;
  try{
   const binding=f.enroll(),launch=f.launch(binding),request=sequenceCheckpoint(f,launch,{'cmi.objectives.0.id':'primary','cmi.interactions.0.id':'urn:pear:country-interaction','cmi.interactions.0.type':'fill-in',...values,'cmi.location':'country-language-page','cmi.exit':'suspend'},false),receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(receipt.officialLearningChanged,false);
   const rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   for(const key of fields)for(const language of forged){const bad=structuredClone(request.state);put(bad,key,key===fields[0]?language:'{lang='+language+'}Bad text');assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:1,state:bad}),/data model|quota/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);}
   const envelope=JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));envelope.engine.adaptation='pear-iana-subcode-registry-v48';f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope));f.db.close();opened=fixture(path);
   const player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(opened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const resumed=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),b=player.bootstrap(resumed.token),api=createSCORM2004API({edition,state:b.state});assert.equal(api.Initialize(''),'true');assert.equal(api.GetValue('cmi.entry'),'resume');assert.equal(api.GetValue('cmi.location'),'country-language-page');for(const [key,value] of Object.entries(values))assert.equal(api.GetValue(key),value);assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{opened?opened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
}
