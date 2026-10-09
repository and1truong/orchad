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
const registry=JSON.parse(readFileSync(new URL('../scripts/scorm-language-registry.json',import.meta.url),'utf8'));
const subcodes: string[]=registry.ianaSubcodes;
assert.equal(subcodes.length,709);assert.equal(new Set(subcodes).size,709);
const unknown=['abc','abcd','foobar','abcdefgh','madeup','999','klingon','qaby'].flatMap(code=>['en-'+code,'FRE-'+code.toUpperCase(),'qaa-'+code+'-demo']);
function put(state: any,key: string,value: string){const parts=key.split('.').slice(1);let target=state;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)!]=value;}
for(const edition of ['2004-2','2004-3','2004-4'] as const){
 for(const raw of [true,false])test(edition+': '+(raw?'raw':'facade')+' all709 registered first subcode tokens bind;unregistered codes refuse all six fields atomically; private/additional subcodes remain exact',()=>{
  let state:any;const api=raw?new (scorm2004Engine(edition))({logLevel:'NONE',autocommit:false,lmsCommitUrl:false}):createSCORM2004API({edition,checkpoint(value){state=value;}});
  assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.objectives.0.id','urn:pear:country-objective'),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:country-interaction'),'true');assert.equal(api.SetValue('cmi.interactions.0.type','fill-in'),'true');
  const tags=[...subcodes.flatMap(c=>['en-'+c,'FRE-'+c.toUpperCase(),'qaa-'+c+'-demo']),'en-scouse','zh-min','no-bok','art-lojban','de-1996','en-Latn-US','en-US','eng-GB','fre-FR','qaa-US','SCC-us','en-US-ZZ','x-ZZ','i-klingon-ZZ'];
  const snapshot=()=>{if(raw)return (api as any).renderCMIToJSONObject().cmi;assert.equal(api.Commit(''),'true');return state;};
  for(const key of fields){const value=(language:string)=>key===fields[0]?language:'{lang='+language+'}Original historical text';
   for(const language of [...tags,'x-madeup','x-zz','fre','scc','qtz']){assert.equal(api.SetValue(key,value(language)),'true',key+':'+language);assert.equal(api.GetValue(key),value(language));}
   for(const language of unknown){const before=structuredClone(snapshot());assert.equal(api.SetValue(key,value(language)),'false',key+':'+language);assert.equal(api.GetLastError(),'406');assert.deepEqual(snapshot(),before);assert.equal(api.GetValue(key),value('qtz'));}
  }
 });
 test(edition+': strict preload and v47 exact receipt/SQLite resume preserve country/private strings and refuse forged unregistered subcodes without history/proof',async()=>{
  const values=Object.fromEntries(fields.map(key=>[key,key===fields[0]?'FRE-Latn-x-demo':'{lang=en-scouse}Original registered dialect text']));
  const preload:any={learner_preference:{language:values[fields[0]]},comments_from_learner:{0:{comment:values[fields[1]]}},comments_from_lms:{0:{comment:'{lang=i-lux}Original LMS text'}},objectives:{0:{id:'urn:pear:country-objective',description:values[fields[2]]}},interactions:{0:{id:'urn:pear:country-interaction',type:'fill-in',description:values[fields[3]],learner_response:values[fields[4]],correct_responses:{0:{pattern:values[fields[5]]}}}}};
  const loaded=createSCORM2004API({edition,state:preload});assert.equal(loaded.Initialize(''),'true');for(const [key,value] of Object.entries(values))assert.equal(loaded.GetValue(key),value);assert.equal(loaded.GetValue('cmi.comments_from_lms.0.comment'),'{lang=i-lux}Original LMS text');assert.equal(loaded.SetValue('cmi.comments_from_lms.0.comment','{lang=i-madeup}Forged'),'false');assert.equal(loaded.GetLastError(),'404');
  for(const key of [...fields,'cmi.comments_from_lms.0.comment'])for(const language of unknown){const bad=structuredClone(preload);put(bad,key,key===fields[0]?language:'{lang='+language+'}Bad text');assert.throws(()=>createSCORM2004API({edition,state:bad}),/Type Mismatch|invalid|rejected/i);}
  const dir=mkdtempSync(join(tmpdir(),'pear-iana-subcode-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,sequencingPackage(edition));let opened:ReturnType<typeof fixture>|undefined;
  try{
   const binding=f.enroll(),launch=f.launch(binding),request=sequenceCheckpoint(f,launch,{'cmi.objectives.0.id':'primary','cmi.interactions.0.id':'urn:pear:country-interaction','cmi.interactions.0.type':'fill-in',...values,'cmi.location':'country-language-page','cmi.exit':'suspend'},false),receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(receipt.officialLearningChanged,false);
   const rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   for(const key of fields)for(const language of unknown){const bad=structuredClone(request.state);put(bad,key,key===fields[0]?language:'{lang='+language+'}Bad text');assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:1,state:bad}),/data model|quota/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);}
   const envelope=JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));envelope.engine.adaptation='pear-country-registry-v47';f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope));f.db.close();opened=fixture(path);
   const player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(opened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const resumed=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),b=player.bootstrap(resumed.token),api=createSCORM2004API({edition,state:b.state});assert.equal(api.Initialize(''),'true');assert.equal(api.GetValue('cmi.entry'),'resume');assert.equal(api.GetValue('cmi.location'),'country-language-page');for(const [key,value] of Object.entries(values))assert.equal(api.GetValue(key),value);assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{opened?opened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
}
