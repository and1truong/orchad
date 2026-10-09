import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {scormLearningFixture} from './scorm-learning-fixture.ts';
import {sequencingPackage} from './scorm-sequencing-fixture.ts';
import {sequenceCheckpoint} from './scorm-checkpoint-fixture.ts';
import {fixture} from './helpers.ts';
import {SCORMPlayerService} from '../src/server/scorm-player-service.ts';
import {SCORMLearningBindings} from '../src/server/scorm-learning-bindings.ts';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
import {scorm2004Engine} from '../src/shared/scorm2004-engine.ts';
const fields=['cmi.learner_preference.language','cmi.comments_from_learner.0.comment','cmi.objectives.0.description','cmi.interactions.0.description','cmi.interactions.0.learner_response','cmi.interactions.0.correct_responses.0.pattern'];
for(const edition of ['2004-2','2004-3','2004-4'] as const) for(const raw of [true,false]) for(const key of fields) test(edition+': '+(raw?'raw':'facade')+' ISO primary zz refusal in '+key,()=>{
 const api=raw?new (scorm2004Engine(edition))({logLevel:'NONE',autocommit:false,lmsCommitUrl:false}):createSCORM2004API({edition});assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.objectives.0.id','urn:pear:iso-language-objective'),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:iso-language-interaction'),'true');assert.equal(api.SetValue('cmi.interactions.0.type','fill-in'),'true');
 const lang=key==='cmi.learner_preference.language',compose=(primary:string)=>lang?primary:'{lang='+primary+'}Original text';
 for(const primary of ['en','eng','fre','fra','qaa','qtz','bh','sh','iw','in','ji','jw','mo','mol','scc','scr','jaw','VI-vn-X-DEMO','x-private','i-klingon']){const value=compose(primary);assert.equal(api.SetValue(key,value),'true',value);assert.equal(api.GetValue(key),value);}
 for(const primary of ['zz','ZZ','zz-US','zzz','ZZZ','zzz-a','q`z','qua','a','A','abcd','abcdefgh','abcd-US']){assert.equal(api.SetValue(key,compose(primary)),'false',primary);assert.equal(api.GetLastError(),'406');assert.equal(api.GetValue(key),compose('i-klingon'));}
});

function put(state: any, key: string, value: string) {const parts=key.split('.').slice(1);let target=state;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)!]=value;}
const values = Object.fromEntries(fields.map(key=>[key,key==='cmi.learner_preference.language'?'MO-us':'{lang=SCC}Original historical text']));
for(const edition of ['2004-2','2004-3','2004-4'] as const) {
 test(edition+': complete pinned ISO facts/local range preserve case, while reserved ordinary primary codes refuse406',()=>{
  const facts=JSON.parse(readFileSync(new URL('../scripts/scorm-language-registry.json',import.meta.url),'utf8'));
  assert.equal(facts.alpha2.length,190);assert.equal(facts.alpha3.length,506);assert.deepEqual(facts.historicalAlpha3,['jaw','mol','scc','scr']);
  const codes=[...facts.alpha2,...facts.alpha3,...facts.historicalAlpha3];assert.equal(new Set(codes).size,700);
  for(let second=97;second<=116;second++)for(let third=97;third<=122;third++)codes.push('q'+String.fromCharCode(second,third));assert.equal(codes.length,1220);
  const api=new (scorm2004Engine(edition))({logLevel:'NONE',autocommit:false,lmsCommitUrl:false});assert.equal(api.Initialize(''),'true');
  for(const code of codes){const value=code.toUpperCase()+'-a';assert.equal(api.SetValue(fields[0],value),'true',code);assert.equal(api.GetValue(fields[0]),value);}
  for(const value of ['i-klingon','x-private','x']){assert.equal(api.SetValue(fields[0],value),'true');assert.equal(api.GetValue(fields[0]),value);}
 });
 test(edition+': strict preload checks all localized fields including LMS comments without rewriting historical codes',()=>{
  const state:any={learner_preference:{language:values[fields[0]]},comments_from_learner:{0:{comment:values[fields[1]]}},comments_from_lms:{0:{comment:'{lang=jaw}Historical LMS text'}},objectives:{0:{id:'urn:pear:iso-objective',description:values[fields[2]]}},interactions:{0:{id:'urn:pear:iso-interaction',type:'fill-in',description:values[fields[3]],learner_response:values[fields[4]],correct_responses:{0:{pattern:values[fields[5]]}}}}};
  const api=createSCORM2004API({edition,state});assert.equal(api.Initialize(''),'true');for(const [key,value] of Object.entries(values))assert.equal(api.GetValue(key),value);assert.equal(api.GetValue('cmi.comments_from_lms.0.comment'),'{lang=jaw}Historical LMS text');assert.equal(api.SetValue('cmi.comments_from_lms.0.comment','{lang=en}Rewrite'),'false');assert.equal(api.GetLastError(),'404');
  for(const key of [...fields,'cmi.comments_from_lms.0.comment'])for(const primary of ['zz','zzz','a','abcdefgh']){const bad=structuredClone(state);put(bad,key,key===fields[0]?primary:'{lang='+primary+'}Bad text');assert.throws(()=>createSCORM2004API({edition,state:bad}),/Type Mismatch|invalid|rejected/i);}
 });
 test(edition+': typed registry refusal/v43 exact receipt SQLite reopen/resume leave accepted language/history and official state intact',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'pear-iso-language-')),path=join(dir,'db.sqlite'),f=await scormLearningFixture(path,sequencingPackage(edition));let opened:ReturnType<typeof fixture>|undefined;
  try {
   const binding=f.enroll(),launch=f.launch(binding),request=sequenceCheckpoint(f,launch,{'cmi.objectives.0.id':'primary','cmi.interactions.0.id':'urn:pear:iso-interaction','cmi.interactions.0.type':'fill-in',...values,'cmi.location':'iso-language-page','cmi.exit':'suspend'},false),receipt=f.player.checkpoint(launch.token,request);assert.deepEqual(f.player.checkpoint(launch.token,request),receipt);assert.equal(receipt.officialLearningChanged,false);
   const rows=f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),receipts=f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),audit=f.db.prepare('SELECT count(*) n FROM audit').get()!.n;
   for(const key of fields)for(const primary of ['zz','zzz','a','abcdefgh']){const bad=structuredClone(request.state);put(bad,key,key===fields[0]?primary:'{lang='+primary+'}Bad text');assert.throws(()=>f.player.checkpoint(launch.token,{...request,sequence:2,revision:1,state:bad}),/data model|quota/);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_sco_attempts').all(),rows);assert.deepEqual(f.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(f.db.prepare('SELECT count(*) n FROM audit').get()!.n,audit);}
   const envelope=JSON.parse(String(f.db.prepare('SELECT sequencing_state FROM scorm_engine_attempts').get()!.sequencing_state));envelope.engine.adaptation='pear-legacy-absolute-part-v43';f.db.prepare('UPDATE scorm_engine_attempts SET sequencing_state=?').run(JSON.stringify(envelope));f.db.close();opened=fixture(path);
   const player=new SCORMPlayerService(opened.db,new SCORMLearningBindings(opened.db,opened.service));assert.deepEqual(player.checkpoint(launch.token,request),receipt);player.close(opened.service.principal('learner-a'),launch.launchId,'session-learner-a');
   const resumed=player.launch(opened.service.principal('learner-a'),'session-learner-a',{packageId:f.pkg.id,version:1,mode:'normal',binding,confirmed:true,revision:opened.service.context('learner-a','learning:demo:learner-a').revision,key:crypto.randomUUID()}),b=player.bootstrap(resumed.token),api=createSCORM2004API({edition,state:b.state});assert.equal(api.Initialize(''),'true');assert.equal(api.GetValue('cmi.entry'),'resume');assert.equal(api.GetValue('cmi.location'),'iso-language-page');for(const [key,value] of Object.entries(values))assert.equal(api.GetValue(key),value);assert.deepEqual(opened.db.prepare('SELECT * FROM scorm_engine_checkpoints').all(),receipts);assert.equal(opened.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n,0);assert.equal(opened.db.prepare('SELECT count(*) n FROM certificates').get()!.n,0);
  }finally{opened?opened.db.close():f.db.close();rmSync(dir,{recursive:true,force:true});}
 });
}
