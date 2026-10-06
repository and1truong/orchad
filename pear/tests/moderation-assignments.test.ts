import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {ModerationAssignments} from "../src/server/moderation-assignments.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
const award={title:"Original primary assessment",summary:"Original practice",access:"tenant",unit:"credits",target:1,ongoing:false,moderatedExternal:true,primaryModeration:true,requirements:[{id:"practice",title:"Practice",required:true,credits:1,alternatives:[{kind:"external",id:"original-proof"}]}]};
function setup(path=":memory:"){
 const f=fixture(path);
 if(!f.db.prepare("SELECT 1 FROM accounts WHERE id='assessor-two'").get()) {
 f.db.prepare("INSERT INTO accounts SELECT 'assessor-two',tenant,'Second assessor',role,manager_id,active,auth_version,password_hash,salt FROM accounts WHERE id='assessor'").run();
 f.db.prepare("INSERT INTO workspaces(id,tenant,owner) VALUES('learning:demo:assessor-two','demo','assessor-two')").run();
 }
 data(f.call("editor","learning_save_award",{collectionId:"primary-award",award}));data(f.call("editor","learning_publish_collection",{collectionId:"primary-award"}));
 for(const assessorId of ["assessor","assessor-two"])data(f.call("admin","learning_set_award_assessor",{collectionId:"primary-award",assessorId,enabled:true}));
 const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"primary-award"}));
 const record=data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:e.awardEnrollmentId,criterionPath:"practice",amount:1,evidence:"PRIVATE ORIGINAL EVIDENCE",confirmed:true},"human"));
 return {...f,e,record};
}
const assign=(f:ReturnType<typeof setup>,assessorId="assessor",expectedVersion=0,overrides:any={})=>f.call("admin","human_assign_external_assessor",{recordId:f.record.recordId,assessorId,expectedVersion,reason:"PRIVATE ASSIGNMENT REASON"},"human",overrides);
const grade=(f:ReturnType<typeof setup>,user="assessor",overrides:any={})=>f.call(user,"learning_assess_external_record",{recordId:f.record.recordId,accepted:true,reason:"Human primary decision"},"bridge",overrides);
const queue=(f:ReturnType<typeof setup>,user:string,source:"human"|"bridge"="human")=>data(f.call(user,"learning_get_external_records",{collectionId:"primary-award"},source)).items;
test("required primary starts unassigned; only designated delegated human assessor may see private evidence and grade, while admin retains oversight",()=>{
 const f=setup();try{
  for(const user of ["admin","assessor","assessor-two"])assert.equal(grade(f,user).ok,false);
  assert.equal(queue(f,"assessor").length,0);assert.equal(queue(f,"assessor-two","bridge").length,0);assert.equal(queue(f,"admin")[0].primaryRequired,true);
  data(assign(f));assert.equal(queue(f,"assessor")[0].evidence,"PRIVATE ORIGINAL EVIDENCE");assert.equal(queue(f,"assessor-two").length,0);assert.equal(JSON.stringify(queue(f,"assessor","bridge")).includes("PRIVATE ORIGINAL"),false);
  assert.equal(grade(f,"admin").ok,false);assert.equal(grade(f,"assessor-two").ok,false);data(grade(f));assert.ok(f.db.prepare("SELECT completed_at FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId)!.completed_at);assert.equal(assign(f,"assessor-two",1).ok,false);
 }finally{f.db.close();}
});
test("reassignment is versioned, preserves official state, strips stale notice identities and denies old assignment receipt after move",()=>{
 const f=setup();try{
  const revision=f.service.context("admin","library:demo").revision,override={idempotencyKey:"primary-original",expectedRevision:revision},first=assign(f,"assessor",0,override);data(first);assert.deepEqual(assign(f,"assessor",0,override),first);
  const own=data(f.call("assessor","human_get_assessment_notices",{},"human"));assert.equal(own.items[0].recordId,f.record.recordId);assert.equal(f.call("assessor-two","human_read_assessment_notice",{noticeId:own.items[0].id},"human").ok,false);
  data(assign(f,"assessor-two",1));assert.equal(assign(f,"assessor",0,override).ok,false);assert.equal(grade(f).ok,false);assert.equal(assign(f,"assessor",1).ok,false);
  const old=data(f.call("assessor","human_get_assessment_notices",{},"human"));assert.ok(old.items.every((n:any)=>n.kind==="removed"&&n.recordId===null&&n.awardId===null));data(f.call("assessor","human_read_assessment_notice",{noticeId:old.items[0].id},"human"));assert.ok(data(f.call("assessor","human_get_assessment_notices",{},"human")).items.find((n:any)=>n.id===old.items[0].id).readAt);
  assert.equal(f.db.prepare("SELECT state FROM external_records WHERE id=?").get(f.record.recordId)!.state,"pending");assert.equal(f.db.prepare("SELECT certificate_id FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId)!.certificate_id,null);data(grade(f,"assessor-two"));
 }finally{f.db.close();}
});
test("assignment enforces human source, administrator, delegated active tenant identity and live authority before idempotent receipt",()=>{
 const f=setup();try{
  assert.equal(f.call("admin","human_assign_external_assessor",{recordId:f.record.recordId,assessorId:"assessor",expectedVersion:0,reason:"Reason"}).ok,false);
  assert.equal(f.call("assessor","human_assign_external_assessor",{recordId:f.record.recordId,assessorId:"assessor",expectedVersion:0,reason:"Reason"},"human").ok,false);
  assert.equal(assign(f,"learner-b").ok,false);
  f.db.prepare("UPDATE accounts SET tenant='elsewhere' WHERE id='assessor-two'").run();assert.equal(assign(f,"assessor-two").ok,false);f.db.prepare("UPDATE accounts SET tenant='demo' WHERE id='assessor-two'").run();
  const revision=f.service.context("admin","library:demo").revision,override={idempotencyKey:"live-primary",expectedRevision:revision};data(assign(f,"assessor",0,override));
  data(f.call("admin","learning_set_award_assessor",{collectionId:"primary-award",assessorId:"assessor",enabled:false}));assert.equal(assign(f,"assessor",0,override).ok,false);assert.equal(queue(f,"assessor").length,0);assert.equal(grade(f).ok,false);
  assert.ok(data(f.call("assessor","human_get_assessment_notices",{},"human")).items.every((n:any)=>n.recordId===null));
 }finally{f.db.close();}
});
test("assignment, notice, revision and audit roll back together; successful audit contains no reason or evidence",()=>{
 const f=setup();try{
  const before=f.db.prepare("SELECT * FROM external_primary_assignments").all(),revision=f.service.context("admin","library:demo").revision;
  f.db.exec("CREATE TRIGGER primary_abort BEFORE INSERT ON audit WHEN NEW.tool='human_assign_external_assessor' BEGIN SELECT RAISE(ABORT,'primary audit fixture'); END;");
  assert.equal(assign(f).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM external_primary_assignments").all(),before);assert.equal(f.db.prepare("SELECT count(*) n FROM moderation_assignment_notices").get()!.n,0);assert.equal(f.service.context("admin","library:demo").revision,revision);f.db.exec("DROP TRIGGER primary_abort");
  data(assign(f));const audits=f.db.prepare("SELECT arguments FROM audit WHERE tool='human_assign_external_assessor'").all();assert.equal(audits.length,1);assert.equal(JSON.stringify(audits).includes("PRIVATE"),false);
 }finally{f.db.close();}
});
test("pinned primary rule survives later publication disabling it and SQLite reopen",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-primary-"));let f=setup(join(dir,"state.sqlite"));try{
  data(assign(f));data(f.call("editor","learning_save_award",{collectionId:"primary-award",award:{...award,primaryModeration:false}}));data(f.call("editor","learning_publish_collection",{collectionId:"primary-award"}));
  assert.equal(grade(f,"assessor-two").ok,false);const record=f.record,e=f.e;f.db.close();f={...fixture(join(dir,"state.sqlite")),record,e};assert.equal(new ModerationAssignments(f.db).metadata(record.recordId).primaryAssessorId,"assessor");assert.equal(grade(f,"assessor-two").ok,false);data(grade(f));
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
test("primary moderation requires moderated policy and cannot turn self-attestation into assigned official grading",()=>{
 const f=fixture();try{assert.equal(f.call("editor","learning_save_award",{collectionId:"bad-primary",award:{...award,moderatedExternal:false}}).ok,false);assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='bad-primary'").get(),undefined);}finally{f.db.close();}
});
