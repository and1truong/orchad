import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {data} from './helpers.ts';
import {cmi5LearningFixture} from './cmi5-learning-fixture.ts';
import {cmi5Fixture} from './cmi5-fixture.ts';
import {CMI5Service} from '../src/server/cmi5.ts';
import {awardDefinition,publishBindingAward,ownAward,courseChange} from './award-binding-fixture.ts';

test('exact course binding requires all moveOn and Normal termination, then stores one immutable proof and preserves the human quiz certificate gate',async()=>{
  const f=await cmi5LearningFixture();try {
    const binding=f.enroll();assert.equal(f.call('learner-a','human_complete_lesson',binding,'human').ok,false);assert.equal(f.call('learner-a','learning_start_attempt',{enrollmentId:binding.enrollmentId}).ok,false);
    const intro=f.launch(binding),r=f.start(intro);f.outcome(r,true,false);assert.equal(f.cmi5.report(f.learner,intro.registrationId).aus[0].satisfied,true);assert.equal(f.cmi5.learningContext(f.learner,binding).completed,false);
    f.cmi5.write(r.header,r.statement('terminated',{duration:'PT1M'}));const practice=f.launch(binding,'https://content.example.test/au/practice');assert.equal(practice.registrationId,intro.registrationId);const r2=f.start(practice);f.outcome(r2,true,false);assert.equal(f.cmi5.report(f.learner,practice.registrationId).satisfied,true);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n,0);
    const end=r2.statement('terminated',{duration:'PT1M'});f.cmi5.write(r2.header,end);f.cmi5.write(r2.header,end);assert.equal(f.cmi5.learningContext(f.learner,binding).completed,true);assert.equal(f.cmi5.report(f.learner,intro.registrationId).officialLearningChanged,true);
    const proof=JSON.parse(String(f.db.prepare('SELECT proof FROM cmi5_completion_proofs').get()!.proof));assert.equal(proof.sha256,f.ref.sha256);assert.equal(proof.context.enrollmentId,binding.enrollmentId);assert.equal(proof.aus.length,2);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n,1);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n,0);
    assert.equal(data(f.call('learner-a','learning_get_lesson',binding,'human')).completed,true);assert.equal(f.quiz(binding.enrollmentId).passed,true);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n,1);
    assert.throws(()=>f.db.exec("UPDATE cmi5_completion_proofs SET proof='{}'"),/immutable/);assert.throws(()=>f.db.exec('DELETE FROM cmi5_learning_bindings'),/immutable/);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await f.close();}
});
test('practice, Review, wrong actor/tenant/pins and a missing authorization adapter cannot grant or bypass an enrollment binding',async()=>{
  const f=await cmi5LearningFixture();try {
    const binding=f.enroll(),practice=f.launch();f.outcome(f.start(practice));assert.equal(data(f.call('learner-a','learning_get_lesson',binding,'human')).completed,false);
    for(const ref of [{...f.ref,sha256:'0'.repeat(64)},{...f.ref,packageId:crypto.randomUUID()}])assert.equal(f.call('editor','learning_update_course',{courseId:'learning-vi',course:f.course(ref)}).ok,false);
    for(const b of [{...binding,unknown:'x'},{...binding,enrollmentId:'foreign'},{...binding,itemEnrollmentId:'wrong'}])assert.throws(()=>f.launch(b));
    assert.throws(()=>f.cmi5.learningContext(f.service.principal('learner-b'),binding));assert.throws(()=>f.launch(binding,undefined,'Browse'));
    const review=f.launch(binding,undefined,'Review'),r=f.start(review);assert.throws(()=>f.outcome(r),/cannot report/);f.cmi5.write(r.header,r.statement('terminated',{duration:'PT1M'}));assert.equal(f.cmi5.learningContext(f.learner,binding).completed,false);
    const current=f.launch(binding),rr=f.start(current);assert.throws(()=>new CMI5Service(f.db,f.origin,f.contentOrigin).authenticate(rr.header),/authorization adapter/);
    assert.throws(()=>f.cmi5.launch(f.learner,f.learnerLogin.browser,{...f.args(f.learner,false),packageId:f.pkg.packageId,auId:current.auId,mode:'Normal',registrationId:practice.registrationId,binding}),/binding/);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n,0);
  }finally{await f.close();}
});
test('projection audit failure rolls back final termination, proof, satisfaction and lesson ledger; the same UUID then succeeds once',async()=>{
  const f=await cmi5LearningFixture();try {
    const binding=f.enroll(),intro=f.launch(binding);f.outcome(f.start(intro));const next=f.launch(binding,'https://content.example.test/au/practice'),r=f.start(next);f.outcome(r,true,false);
    const end=r.statement('terminated',{duration:'PT1M'}),rev=f.service.context(f.learner.id,'learning:demo:learner-a').revision,count=f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n;
    f.db.exec("CREATE TRIGGER reject_cmi5_projection BEFORE INSERT ON audit WHEN NEW.tool='runtime_cmi5_learning_completion' BEGIN SELECT RAISE(ABORT,'projection failed'); END");assert.throws(()=>f.cmi5.write(r.header,end),/projection failed/);assert.equal(f.cmi5.authenticate(r.header).status,'initialized');assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_statements').get()!.n,count);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n,0);assert.equal(f.service.context(f.learner.id,'learning:demo:learner-a').revision,rev);assert.equal(data(f.call('learner-a','learning_get_lesson',binding,'human')).completed,false);
    f.db.exec('DROP TRIGGER reject_cmi5_projection');f.cmi5.write(r.header,end);assert.equal(f.cmi5.learningContext(f.learner,binding).completed,true);
  }finally{await f.close();}
});
test('standalone retakes create independent bindings and current audience/package revocation closes old capabilities without deleting proofs',async()=>{
  const f=await cmi5LearningFixture();try {
    const binding=f.enrollItem();assert.equal(f.call('learner-a','human_complete_item',{...binding,confirmed:true},'human').ok,false);const final=f.finish(binding),r=f.runtime(f.launch(binding,undefined,'Review'));
    const fresh=data(f.call('learner-a','human_retake_completed_item',{...binding,version:1,confirmed:true},'human')),next={itemEnrollmentId:fresh.itemEnrollmentId};assert.notEqual(next.itemEnrollmentId,binding.itemEnrollmentId);assert.throws(()=>f.cmi5.authenticate(r.header),/successor/);assert.equal(f.cmi5.learningContext(f.learner,next).completed,false);const newLaunch=f.launch(next);assert.notEqual(newLaunch.registrationId,final.registrationId);assert.equal(f.cmi5.learningContext(f.learner,next).completed,false);
    f.cmi5.review(f.admin,{...f.args(),packageId:f.pkg.packageId,sha256:f.pkg.sha256,action:'retire',reason:'Pinned learners may finish'});assert.equal(f.call('learner-b','learning_enroll_item',{itemId:'cmi5-item'}).ok,false);f.outcome(f.start(newLaunch));const nextAU=f.launch(next,'https://content.example.test/au/practice');f.outcome(f.start(nextAU));assert.equal(f.cmi5.learningContext(f.learner,next).completed,true);
    f.cmi5.review(f.admin,{...f.args(),packageId:f.pkg.packageId,sha256:f.pkg.sha256,action:'revoke',reason:'Security revocation'});assert.throws(()=>f.cmi5.learningContext(f.learner,next),/immutable/);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n,2);
  }finally{await f.close();}
});
test('waivers grant official credit only under the immutable authored opt-in policy and never manufacture reported pass/completion',async()=>{
  for(const permitted of [false,true]) {
    const f=await cmi5LearningFixture(undefined,permitted);try {
      const binding=f.enroll(),launch=f.launch(binding);for(const auId of [launch.auId,'https://content.example.test/au/practice']){const action=()=>f.cmi5.waive(f.admin,{...f.args(),registrationId:launch.registrationId,auId,reason:'Administrative'});if(permitted)action();else assert.throws(action,/does not permit waivers/);}
      const report=f.cmi5.report(f.learner,launch.registrationId);assert.equal(report.satisfied,permitted);assert.equal(report.waiverAllowed,permitted);assert.equal(report.aus[0].completed,false);assert.equal(report.aus[0].passed,false);assert.equal(report.officialLearningChanged,permitted);assert.equal(data(f.call('learner-a','learning_get_lesson',binding,'human')).completed,permitted);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM certificates').get()!.n,0);
    }finally{await f.close();}
  }
});
test('bound binary State and an immutable completion proof survive SQLite reopen with the original enrollment context',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'cmi5-learning-')),path=join(dir,'db.sqlite');let f=await cmi5LearningFixture(path);let reopened:Awaited<ReturnType<typeof cmi5Fixture>>|undefined;
  try {
    const binding=f.enroll(),launch=f.launch(binding),r=f.start(launch),state={...r.query,stateId:'binary-proof'};f.cmi5.state(r.header,state,'PUT',Buffer.from([0,255,128]),{'content-type':'application/octet-stream'});f.outcome(r);const final=f.launch(binding,'https://content.example.test/au/practice');f.outcome(f.start(final));const proof=f.db.prepare('SELECT * FROM cmi5_completion_proofs').get();await f.close();reopened=await cmi5Fixture(path);assert.deepEqual(reopened.db.prepare('SELECT * FROM cmi5_completion_proofs').get(),proof);assert.equal(reopened.cmi5.learningContext(reopened.learner,binding).registrationId,final.registrationId);assert.equal(reopened.cmi5.learningContext(reopened.learner,binding).completed,true);
    const review=reopened.cmi5.launch(reopened.learner,reopened.learnerLogin.browser,{...reopened.args(reopened.learner,false),packageId:f.pkg.packageId,auId:launch.auId,binding,mode:'Review'}),rr=reopened.runtime(review);assert.deepEqual(reopened.cmi5.state(rr.header,{...rr.query,stateId:state.stateId},'GET',undefined).raw,Buffer.from([0,255,128]));
  }finally{if(reopened)await reopened.close();rmSync(dir,{recursive:true,force:true});}
});
test('a genuinely populated schema-53 upgrade retains unbound registrations and binary State without inventing an official binding',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'cmi5-schema53-')),path=join(dir,'db.sqlite');let f=await cmi5Fixture(path);try {
    const pkg=await f.publish(),launch=f.launch(pkg.packageId),r=f.runtime(launch),q={...r.query,stateId:'legacy-binary'};f.cmi5.state(r.header,q,'PUT',Buffer.from([0,255]),{'content-type':'application/octet-stream'});const registration=f.db.prepare('SELECT * FROM cmi5_registrations').get();
    f.db.exec('DROP TABLE cmi5_completion_proofs; DROP TABLE cmi5_learning_bindings; DELETE FROM schema_version WHERE version=54');await f.close();f=await cmi5Fixture(path);
    assert.deepEqual(f.db.prepare('SELECT * FROM cmi5_registrations').get(),registration);assert.deepEqual(f.cmi5.state(r.header,q,'GET',undefined).raw,Buffer.from([0,255]));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_learning_bindings').get()!.n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n,0);assert.equal(f.db.prepare('SELECT MAX(version) AS n FROM schema_version').get()!.n,54);assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{await f.close();rmSync(dir,{recursive:true,force:true});}
});
test('a prior failed termination cannot authorize a new in-flight passing session before its own accepted termination',async()=>{
  const f=await cmi5LearningFixture();try {
    const binding=f.enroll(),first=f.launch(binding),r=f.start(first);f.cmi5.write(r.header,[r.statement('failed',{success:false,duration:'PT1M',score:{scaled:0.5}}),r.statement('terminated',{duration:'PT1M'})]);
    f.outcome(f.start(f.launch(binding,'https://content.example.test/au/practice')));
    const next=f.launch(binding),rr=f.start(next);f.outcome(rr,true,false);assert.equal(f.cmi5.report(f.learner,next.registrationId).satisfied,true);assert.equal(f.cmi5.learningContext(f.learner,binding).completed,false);
    f.cmi5.write(rr.header,rr.statement('terminated',{duration:'PT1M'}));assert.equal(f.cmi5.learningContext(f.learner,binding).completed,true);
  }finally{await f.close();}
});
test('reusable cmi5 policy is copied authoritatively and module prerequisites/current audience are checked on every AU request',async()=>{
  const f=await cmi5LearningFixture();try {
    data(f.call('editor','learning_create_content_item',{itemId:'reuse-cmi5',item:f.item}));data(f.call('editor','learning_publish_content_item',{itemId:'reuse-cmi5'}));
    const source=f.course({...f.ref,sha256:'0'.repeat(64),allowWaivers:true}),lesson={...source.lessons[0]!,contentRef:{itemId:'reuse-cmi5',version:1}};
    const course={...source,lessons:[{id:'reading',title:'Before package',text:'Original prerequisite',kind:'text',prerequisiteIds:[]},lesson],modules:[{id:'before',title:'Prerequisite',lessonIds:['reading'],prerequisiteIds:[]},{id:'package-module',title:'Package',lessonIds:['package'],prerequisiteIds:['before']}]};
    data(f.call('editor','learning_update_course',{courseId:'learning-vi',course}));data(f.call('editor','learning_publish_course',{courseId:'learning-vi'}));const binding=f.enroll();assert.throws(()=>f.launch(binding),/prerequisite/i);
    data(f.call('learner-a','human_complete_lesson',{enrollmentId:binding.enrollmentId,lessonId:'reading'},'human'));const launch=f.launch(binding),r=f.start(launch);assert.equal(f.cmi5.learningContext(f.learner,binding).allowWaivers,false);
    const audience={...course,access:'author'};data(f.call('admin','learning_update_course',{courseId:'learning-vi',course:audience}));data(f.call('admin','learning_publish_course',{courseId:'learning-vi'}));assert.throws(()=>f.cmi5.authenticate(r.header),/audience/);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cmi5_completion_proofs').get()!.n,0);
  }finally{await f.close();}
});
test('nested award criteria and reviewed requalification retain separate course pins, proofs and certificates without copying cmi5 progress',async()=>{
  const f=await cmi5LearningFixture();try {
    const child=(title:string)=>awardDefinition(title,{target:1,requirements:[awardDefinition().requirements[0]]});publishBindingAward(f,'cmi5-old',child('Original old child'));
    data(f.call('editor','learning_update_course',{courseId:'learning-vi',course:f.course()}));data(f.call('editor','learning_publish_course',{courseId:'learning-vi'}));publishBindingAward(f,'cmi5-new',child('Original new child'));
    publishBindingAward(f,'cmi5-root',awardDefinition('Original nested cmi5',{target:3,requirements:[{id:'old',title:'Old pin',required:true,credits:1,alternatives:[{kind:'award',id:'cmi5-old'}]},{id:'new',title:'New pin',required:true,credits:1,alternatives:[{kind:'award',id:'cmi5-new'}]},{id:'external',title:'Separate evidence',required:true,credits:1,alternatives:[{kind:'external',id:'practice'}]}]}));
    const root=data(f.call('learner-a','learning_enroll_award',{collectionId:'cmi5-root'})),base={awardEnrollmentId:root.awardEnrollmentId,courseId:'learning-vi'},old={...base,criterionPath:'old/cmi5-old@1/course'},current={...base,criterionPath:'new/cmi5-new@1/course'};
    const one=data(f.call('learner-a','learning_enroll_award_course',old)),two=data(f.call('learner-a','learning_enroll_award_course',current));assert.notEqual(one.version,two.version);
    const b1={enrollmentId:one.enrollmentId,lessonId:'package'},b2={enrollmentId:two.enrollmentId,lessonId:'package'},final=f.finish(b1);f.quiz(one.enrollmentId);assert.equal(ownAward(f,root.awardEnrollmentId).earned,1);assert.equal(f.cmi5.learningContext(f.learner,b2).completed,false);f.finish(b2);f.quiz(two.enrollmentId);assert.equal(ownAward(f,root.awardEnrollmentId).earned,2);
    const proofs=f.db.prepare('SELECT * FROM cmi5_completion_proofs ORDER BY registration_id').all(),certs=f.db.prepare('SELECT * FROM certificates ORDER BY id').all(),fresh=data(f.call('learner-a','human_requalify_award_course',courseChange(f,old,two.version),'human'));
    assert.throws(()=>f.cmi5.launch(f.learner,f.learnerLogin.browser,{...f.args(f.learner,false),packageId:f.pkg.packageId,auId:final.auId,registrationId:final.registrationId,mode:'Review'}),/current bound/);
    assert.equal(f.cmi5.learningContext(f.learner,{enrollmentId:fresh.enrollmentId,lessonId:'package'}).completed,false);assert.deepEqual(f.db.prepare('SELECT * FROM cmi5_completion_proofs ORDER BY registration_id').all(),proofs);assert.deepEqual(f.db.prepare('SELECT * FROM certificates ORDER BY id').all(),certs);
  }finally{await f.close();}
});
