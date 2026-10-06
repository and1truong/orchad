import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fixture,data} from "./helpers.ts";
import {awardItemsFixture,trackAwardItem,confirmAwardItem,currentItemAward,originalAwardItem} from "./award-items-fixture.ts";
test("actual human-confirmed pinned standalone reading completes its configured award, never fabricating a course score or assessment attempt",()=>{
 const f=awardItemsFixture();try{
  const item=trackAwardItem(f);assert.equal(currentItemAward(f).earned,0);assert.equal(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:f.e.awardEnrollmentId,criterionPath:"reading",amount:2,evidence:"Not a substitute for this pinned item",confirmed:true},"human").ok,false);assert.equal(f.call("learner-a","human_complete_item",{itemEnrollmentId:item.itemEnrollmentId,confirmed:true}).ok,false);assert.equal(f.call("learner-b","human_complete_item",{itemEnrollmentId:item.itemEnrollmentId,confirmed:true},"human").ok,false);
  data(confirmAwardItem(f,item.itemEnrollmentId));const award=currentItemAward(f);assert.equal(award.earned,2);assert.equal(award.completed,true);assert.ok(award.certificate_id);assert.equal(award.requirements[0].alternatives[0].proof,"human_confirmed_standalone_reading");assert.equal(award.requirements[0].alternatives[0].assessmentScore,false);assert.equal(f.db.prepare("SELECT count(*) n FROM attempts").get()!.n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments").get()!.n,0);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
 }finally{f.db.close();}
});
test("exact published item version is required; another learner or a different version cannot satisfy the pinned award; published edits preserve old proof",()=>{
 const f=awardItemsFixture();try{
  const other=trackAwardItem(f,"learner-b");data(confirmAwardItem(f,other.itemEnrollmentId,"learner-b"));assert.equal(currentItemAward(f).earned,0);
  data(f.call("editor","learning_update_content_item",{itemId:"award-reading",item:{...originalAwardItem,text:"Original later body"}}));data(f.call("editor","learning_publish_content_item",{itemId:"award-reading"}));const newer=trackAwardItem(f,"learner-a",2);data(confirmAwardItem(f,newer.itemEnrollmentId));assert.equal(currentItemAward(f).earned,0);
  const old=trackAwardItem(f);data(confirmAwardItem(f,old.itemEnrollmentId));assert.equal(currentItemAward(f).earned,2);assert.equal(currentItemAward(f).requirements[0].alternatives[0].version,1);
 }finally{f.db.close();}
});
test("unpublished/private/cross-tenant items cannot be laundered into an award, and current group loss cannot complete pending award from newly confirmed inaccessible proof",()=>{
 const f=awardItemsFixture();try{
  assert.equal(f.call("editor","learning_save_award",{collectionId:"bad-tenant",award:{...f.award,requirements:[{...f.award.requirements[0],alternatives:[{kind:"item",id:"not-authorized"}]}]}}).ok,false);
  data(f.call("editor","learning_create_content_item",{itemId:"private-award-reading",item:{...originalAwardItem,access:"author"}}));data(f.call("editor","learning_publish_content_item",{itemId:"private-award-reading"}));assert.equal(f.call("editor","learning_save_award",{collectionId:"private-laundering",award:{...f.award,requirements:[{...f.award.requirements[0],alternatives:[{kind:"item",id:"private-award-reading"}]}]}}).ok,false);
  data(f.call("editor","learning_create_content_item",{itemId:"unpublished-award-reading",item:originalAwardItem}));data(f.call("editor","learning_save_award",{collectionId:"unpublished-root",award:{...f.award,requirements:[{...f.award.requirements[0],alternatives:[{kind:"item",id:"unpublished-award-reading"}]}]}}));assert.equal(f.call("editor","learning_publish_collection",{collectionId:"unpublished-root"}).ok,false);
  const group=(ids:string[])=>({name:"Original controlled reading",kind:"static",memberIds:ids,mode:"ALL",rules:[]});data(f.call("admin","learning_save_group",{groupId:"reading-group",group:group(["learner-a"])}));data(f.call("editor","learning_update_content_item",{itemId:"award-reading",item:{...originalAwardItem,access:"groups",groupIds:["reading-group"]}}));data(f.call("editor","learning_publish_content_item",{itemId:"award-reading"}));const old=trackAwardItem(f);data(f.call("admin","learning_save_group",{groupId:"reading-group",group:group([])}));
  // Pinned v1 remains readable by its original learner, but current v2 audience bars new award proof.
  data(confirmAwardItem(f,old.itemEnrollmentId));assert.equal(currentItemAward(f).earned,0);assert.equal(currentItemAward(f).completed,false);assert.equal(f.db.prepare("SELECT certificate_id FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId)!.certificate_id,null);
 }finally{f.db.close();}
});
test("item completion, award certificate and cycle notification roll back on audit failure; old completion cannot satisfy a later cycle",()=>{
 const f=awardItemsFixture();try{
  const item=trackAwardItem(f),before=JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all());f.db.exec("CREATE TRIGGER reject_award_item_audit BEFORE INSERT ON audit WHEN NEW.tool='human_complete_item' BEGIN SELECT RAISE(ABORT,'original item proof'); END;");assert.equal(confirmAwardItem(f,item.itemEnrollmentId).ok,false);assert.equal(f.db.prepare("SELECT completed_at FROM item_enrollments WHERE id=?").get(item.itemEnrollmentId)!.completed_at,null);assert.equal(f.db.prepare("SELECT certificate_id FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId)!.certificate_id,null);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all()),before);f.db.exec("DROP TRIGGER reject_award_item_audit");data(confirmAwardItem(f,item.itemEnrollmentId));
  const completedAt=String(f.db.prepare("SELECT completed_at FROM item_enrollments WHERE id=?").get(item.itemEnrollmentId)!.completed_at),start=new Date(Date.parse(completedAt)+86400000).toISOString(),plan={title:"Original later item award cycle",targetKind:"award",targetId:"item-award",audienceKind:"individuals",learnerIds:["learner-a"],groupId:"",membership:"fixed",startsAt:start,repeatDays:0,endAt:null,dueKind:"none",fixedDueAt:null,rollingDays:0};data(f.call("manager","learning_save_assignment_plan",{planId:"item-cycle",plan,reason:"Original later cycle proof"}));f.service.assignments.runBackground(start);const cycle=data(f.call("learner-a","learning_get_my_awards")).items.find((e:any)=>e.assignment_cycle_id);assert.equal(cycle.earned,0);assert.equal(cycle.completed,false);assert.equal(cycle.certificate_id,null);
 }finally{f.db.close();}
});
test("nested actual child credits and required item rules reconcile with real reading, and issued original proof survives SQLite reopen",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-award-items-")),path=join(dir,"db.sqlite");let f=awardItemsFixture(path);try{
  const parent={...f.award,title:"Original parent reading award",requirements:[{id:"child",title:"Original nested reading",required:true,credits:1,creditMode:"nested_earned",alternatives:[{kind:"award",id:"item-award"}]}]};data(f.call("editor","learning_save_award",{collectionId:"item-parent",award:parent}));data(f.call("editor","learning_publish_collection",{collectionId:"item-parent"}));const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"item-parent"})),item=trackAwardItem(f);data(confirmAwardItem(f,item.itemEnrollmentId));const child=currentItemAward(f),root=f.db.prepare("SELECT * FROM award_enrollments WHERE id=?").get(e.awardEnrollmentId)!;assert.ok(root.certificate_id);assert.equal(data(f.call("learner-a","learning_get_my_awards")).items.find((e:any)=>e.id===root.id).earned,2);f.db.close();
  const reopened=fixture(path);try{assert.deepEqual(reopened.db.prepare("SELECT * FROM award_enrollments WHERE id=?").get(root.id),root);assert.equal(reopened.db.prepare("SELECT certificate_id FROM award_enrollments WHERE id=?").get(child.id)!.certificate_id,child.certificate_id);assert.deepEqual(reopened.db.prepare("PRAGMA foreign_key_check").all(),[]);}finally{reopened.db.close();}
 }finally{try{f.db.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});

test("item credit reaches target but cannot skip required course; ongoing never completes and one-item rule completes only after actual human reading",()=>{
 const f=awardItemsFixture();try{
  const definitions=[
   {id:"required-root",award:{...f.award,requirements:[{...f.award.requirements[0],required:false},{id:"course",title:"Original required course",required:true,credits:1,alternatives:[{kind:"course",id:"systems-basics"}]}]}},
   {id:"ongoing-root",award:{...f.award,ongoing:true}},
   {id:"one-item-root",award:{...f.award,completionMode:"one_item",target:9999,requirements:[{...f.award.requirements[0],required:false}]}}
  ];
  for(const d of definitions){data(f.call("editor","learning_save_award",{collectionId:d.id,award:d.award}));data(f.call("editor","learning_publish_collection",{collectionId:d.id}));data(f.call("learner-a","learning_enroll_award",{collectionId:d.id}));}
  const item=trackAwardItem(f);data(confirmAwardItem(f,item.itemEnrollmentId));const roots=data(f.call("learner-a","learning_get_my_awards")).items,required=roots.find((r:any)=>r.award_id==="required-root"),ongoing=roots.find((r:any)=>r.award_id==="ongoing-root"),one=roots.find((r:any)=>r.award_id==="one-item-root");
  assert.equal(required.earned,2);assert.equal(required.requiredComplete,false);assert.equal(required.completed,false);assert.equal(required.certificate_id,null);assert.equal(ongoing.earned,2);assert.equal(ongoing.completed,false);assert.equal(ongoing.certificate_id,null);assert.equal(one.completed,true);assert.ok(one.certificate_id);
 }finally{f.db.close();}
});
