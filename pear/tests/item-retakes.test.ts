import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fixture,data} from "./helpers.ts";
import {originalAwardItem,trackAwardItem,confirmAwardItem} from "./award-items-fixture.ts";
import {itemRetakeFixture,retakeItem} from "./item-retake-fixture.ts";
test("explicit same-version human retake preserves original completed row and starts empty; default tracking resumes current successor and real confirmation remains separate",()=>{
 const f=itemRetakeFixture();try{
  const old=f.db.prepare("SELECT * FROM item_enrollments WHERE id=?").get(f.item.itemEnrollmentId)!,awards=JSON.stringify(f.db.prepare("SELECT * FROM award_enrollments").all()),args={itemEnrollmentId:f.item.itemEnrollmentId,version:1,confirmed:true};
  assert.equal(f.call("learner-a","human_retake_completed_item",args).ok,false);assert.equal(f.call("learner-b","human_retake_completed_item",args,"human").ok,false);assert.equal(f.call("learner-a","human_retake_completed_item",{...args,confirmed:false},"human").ok,false);assert.equal(f.call("learner-a","human_retake_completed_item",{...args,version:2},"human").ok,false);
  const result=data(retakeItem(f)),row=f.db.prepare("SELECT * FROM item_enrollments WHERE id=?").get(result.itemEnrollmentId)!;assert.equal(row.version,1);assert.equal(row.retake_of,old.id);assert.equal(row.completed_at,null);assert.deepEqual(f.db.prepare("SELECT * FROM item_enrollments WHERE id=?").get(old.id),old);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM award_enrollments").all()),awards);assert.equal(f.db.prepare("SELECT count(*) n FROM study_totals WHERE item_enrollment_id=?").get(row.id)!.n,0);
  assert.equal(trackAwardItem(f).itemEnrollmentId,row.id);assert.equal(retakeItem(f).ok,false);assert.equal(f.call("learner-a","human_retake_completed_item",{itemEnrollmentId:row.id,version:1,confirmed:true},"human").ok,false);data(confirmAwardItem(f,String(row.id)));assert.ok(f.db.prepare("SELECT completed_at FROM item_enrollments WHERE id=?").get(row.id)!.completed_at);assert.equal(f.db.prepare("SELECT count(*) n FROM attempts").get()!.n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
 }finally{f.db.close();}
});
test("original retake key is exact, current-audience/retirement/account bound and cannot produce duplicate successor; wrong version conflicts before replay",()=>{
 const f=itemRetakeFixture();try{
  const call={requestId:"item-retake",documentId:f.service.personal(f.service.principal("learner-a")),toolName:"human_retake_completed_item",arguments:{itemEnrollmentId:f.item.itemEnrollmentId,version:1,confirmed:true},expectedRevision:f.service.context("learner-a").revision,idempotencyKey:"item-retake-original"};
  const result=f.service.invoke("learner-a",call,"human");data(result);assert.deepEqual(f.service.invoke("learner-a",call,"human"),result);assert.equal(f.service.invoke("learner-a",{...call,arguments:{...call.arguments,version:2}},"human").ok,false);assert.equal(retakeItem(f).ok,false);
  const group={name:"Original retake access",kind:"static",memberIds:["manager"],mode:"ALL",rules:[]};data(f.call("admin","learning_save_group",{groupId:"retake-access",group}));data(f.call("editor","learning_update_content_item",{itemId:"award-reading",item:{...originalAwardItem,access:"groups",groupIds:["retake-access"]}}));data(f.call("editor","learning_publish_content_item",{itemId:"award-reading"}));assert.equal(f.service.invoke("learner-a",call,"human").ok,false);
  data(f.call("admin","learning_save_group",{groupId:"retake-access",group:{...group,memberIds:["manager","learner-a"]}}));assert.deepEqual(f.service.invoke("learner-a",call,"human"),result);data(f.call("editor","learning_retire_content_item",{itemId:"award-reading"}));assert.equal(f.service.invoke("learner-a",call,"human").ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM item_enrollments WHERE retake_of=?").get(f.item.itemEnrollmentId)!.n,1);
 }finally{f.db.close();}
});
test("retake audit failure atomically rolls back successor/revision/receipt while prior item and issued award remain unchanged",()=>{
 const f=itemRetakeFixture();try{
  const before=JSON.stringify({items:f.db.prepare("SELECT * FROM item_enrollments").all(),awards:f.db.prepare("SELECT * FROM award_enrollments").all(),revisions:f.db.prepare("SELECT * FROM workspaces ORDER BY id").all(),receipts:f.db.prepare("SELECT * FROM idempotency").all()});f.db.exec("CREATE TRIGGER reject_item_retake BEFORE INSERT ON audit WHEN NEW.tool='human_retake_completed_item' BEGIN SELECT RAISE(ABORT,'original retake fixture'); END;");
  assert.equal(retakeItem(f).ok,false);assert.equal(JSON.stringify({items:f.db.prepare("SELECT * FROM item_enrollments").all(),awards:f.db.prepare("SELECT * FROM award_enrollments").all(),revisions:f.db.prepare("SELECT * FROM workspaces ORDER BY id").all(),receipts:f.db.prepare("SELECT * FROM idempotency").all()}),before);
 }finally{f.db.close();}
});
test("actual later award cycle rejects older proof, fresh retake alone grants none, and a new real confirmation produces exactly one cycle completion notice",()=>{
 const f=itemRetakeFixture();try{
  const now=Date.now(),priorTime=new Date(now-2000).toISOString(),start=new Date(now-1000).toISOString(); // Trusted original history fixture; production writes still use server time.
  f.db.prepare("UPDATE item_enrollments SET completed_at=? WHERE id=?").run(priorTime,f.item.itemEnrollmentId);const prior=f.db.prepare("SELECT * FROM item_enrollments WHERE id=?").get(f.item.itemEnrollmentId),plan={title:"Original later reading cycle",targetKind:"award",targetId:"item-award",audienceKind:"individuals",learnerIds:["learner-a"],groupId:"",membership:"fixed",startsAt:start,repeatDays:0,endAt:null,dueKind:"none",fixedDueAt:null,rollingDays:0};data(f.call("manager","learning_save_assignment_plan",{planId:"retake-cycle",plan,reason:"Original later proof"}));f.service.assignments.runBackground(start);
  const cycle=f.db.prepare("SELECT e.* FROM award_enrollments e JOIN assignment_cycles c ON c.id=e.assignment_cycle_id WHERE c.plan_id='retake-cycle'").get()!;assert.equal(cycle.completed_at,null);const fresh=data(retakeItem(f));assert.equal(f.db.prepare("SELECT completed_at FROM award_enrollments WHERE id=?").get(cycle.id)!.completed_at,null);data(confirmAwardItem(f,fresh.itemEnrollmentId));assert.ok(f.db.prepare("SELECT completed_at FROM award_enrollments WHERE id=?").get(cycle.id)!.completed_at);f.service.assignments.refreshCompletionNotifications("demo","learner-a");assert.equal(f.db.prepare("SELECT count(*) n FROM learning_notifications WHERE cycle_id=? AND kind='completed'").get(cycle.assignment_cycle_id)!.n,1);assert.deepEqual(f.db.prepare("SELECT * FROM item_enrollments WHERE id=?").get(f.item.itemEnrollmentId),prior);
 }finally{f.db.close();}
});
test("nonempty 040 to 041 migration preserves real reading and study references; successor chain and both transcript rows survive reopen with foreign keys",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-item-retake-")),path=join(dir,"db.sqlite");let f=itemRetakeFixture(path);try{
  const id=f.item.itemEnrollmentId;f.db.prepare("INSERT INTO study_totals(tenant,learner,kind,target_id,item_enrollment_id) VALUES('demo','learner-a','item',?,?)").run(id,id);const original=f.db.prepare("SELECT id,tenant,learner,item_id,version,enrolled_at,completed_at FROM item_enrollments WHERE id=?").get(id)!,totals=f.db.prepare("SELECT * FROM study_totals").all();
  // Faithful pre-041 table with a real dependent study FK. No retakes exist in this migration fixture.
  f.db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE; CREATE TEMP TABLE original_items AS SELECT id,tenant,learner,item_id,version,enrolled_at,completed_at FROM item_enrollments; DROP TABLE item_enrollments;");
  f.db.exec(readFileSync(new URL("../migrations/012.sql",import.meta.url),"utf8").replace("INSERT INTO schema_version VALUES(12);",""));f.db.exec("INSERT INTO item_enrollments SELECT * FROM original_items; DROP TABLE original_items; DELETE FROM schema_version WHERE version=41; COMMIT; PRAGMA foreign_keys=ON;");f.db.close();const reopened=fixture(path);try{
   assert.deepEqual(reopened.db.prepare("SELECT id,tenant,learner,item_id,version,enrolled_at,completed_at FROM item_enrollments WHERE id=?").get(id),original);assert.deepEqual(reopened.db.prepare("SELECT * FROM study_totals").all(),totals);assert.deepEqual(reopened.db.prepare("PRAGMA foreign_key_check").all(),[]);const fresh=data(reopened.call("learner-a","human_retake_completed_item",{itemEnrollmentId:id,version:1,confirmed:true},"human"));reopened.db.close();
   const again=fixture(path);try{assert.equal(again.db.prepare("SELECT retake_of FROM item_enrollments WHERE id=?").get(fresh.itemEnrollmentId)!.retake_of,id);const transcript=data(again.call("learner-a","learning_get_transcript")).items.filter((r:any)=>r.kind==="item");assert.equal(transcript.length,2);assert.equal(transcript.filter((r:any)=>r.status==="completed").length,1);assert.equal(transcript.filter((r:any)=>r.status==="in_progress").length,1);assert.deepEqual(again.db.prepare("PRAGMA foreign_key_check").all(),[]);}finally{again.db.close();}
  }finally{try{reopened.db.close();}catch{}}
 }finally{try{f.db.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});
