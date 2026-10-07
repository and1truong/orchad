
import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {awardUnitLabel,type Award} from "../src/shared/programs.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const value:Award={title:"Original one-criterion award",summary:"Original program",access:"tenant",unit:"custom",unitSingular:"practice point",unitPlural:"practice points",completionMode:"one_item",target:999,ongoing:false,moderatedExternal:true,requirements:[{id:"first",title:"Original first criterion",required:false,credits:2,alternatives:[{kind:"external",id:"first-practice"}]},{id:"second",title:"Original second criterion",required:false,credits:1,alternatives:[{kind:"external",id:"second-practice"}]}]};
function setup(award:Award=value,path=":memory:"){
 const f=fixture(path);data(f.call("editor","learning_save_award",{collectionId:"rules-award",award}));data(f.call("editor","learning_publish_collection",{collectionId:"rules-award"}));data(f.call("admin","learning_set_award_assessor",{collectionId:"rules-award",assessorId:"assessor",enabled:true}));const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"rules-award"}));return {...f,e};
}
const own=(f:ReturnType<typeof setup>)=>data(f.call("learner-a","learning_get_my_awards")).items.find((a:any)=>a.id===f.e.awardEnrollmentId);
const submit=(f:ReturnType<typeof setup>,path:string,amount:number,evidence="Original confirmed practice")=>data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:f.e.awardEnrollmentId,criterionPath:path,amount,evidence,confirmed:true},"human"));
const review=(f:ReturnType<typeof setup>,id:string,accepted=true)=>f.call("assessor","learning_assess_external_record",{recordId:id,accepted,reason:"Original human review"});
test("one-item award waits for a complete accepted criterion, ignoring numeric target; pending/rejected/partial evidence cannot produce completion or certificate",()=>{
 const f=setup();try{
  const first=submit(f,"first",1);assert.equal(own(f).earned,0);assert.equal(own(f).completed,false);data(review(f,first.recordId));assert.equal(own(f).earned,1);assert.equal(own(f).completed,false);
  const rejected=submit(f,"second",1);data(review(f,rejected.recordId,false));assert.equal(own(f).completed,false);
  assert.equal(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:f.e.awardEnrollmentId,criterionPath:"second",amount:1,evidence:"Original confirmed practice",confirmed:true},"human").ok,false);
  const second=submit(f,"second",1,"Corrected original second practice");data(review(f,second.recordId));const progress=own(f);assert.equal(progress.completed,true);assert.equal(progress.earned,2);assert.equal(progress.requirements[0].completed,false);assert.equal(progress.requirements[1].completed,true);assert.ok(progress.certificate_id);
  const certificate=f.service.programs.certificate(f.service.principal("learner-a"),progress.certificate_id);assert.equal(certificate.unitLabel,"practice points");assert.equal(certificate.accredited,false);assert.equal(certificate.completionMode,"one_item");
 }finally{f.db.close();}
});
test("custom quantity names preserve target-plus-required arithmetic and ongoing one-item still never completes automatically",()=>{
 const target=setup({...value,completionMode:"target",target:1,requirements:value.requirements.map((r,i)=>({...r,required:i===0}))});try{
  const elective=submit(target,"second",1);data(review(target,elective.recordId));assert.equal(own(target).earned,1);assert.equal(own(target).completed,false);const required=submit(target,"first",2);data(review(target,required.recordId));assert.equal(own(target).completed,true);
 }finally{target.db.close();}
 const ongoing=setup({...value,ongoing:true});try{const one=submit(ongoing,"second",1);data(review(ongoing,one.recordId));assert.equal(own(ongoing).requirements[1].completed,true);assert.equal(own(ongoing).completed,false);assert.equal(own(ongoing).certificate_id,null);}finally{ongoing.db.close();}
 assert.equal(awardUnitLabel(value,1),"practice point");assert.equal(awardUnitLabel(value,0),"practice points");assert.equal(awardUnitLabel(value,2),"practice points");assert.equal(awardUnitLabel({unit:"credits"},1),"credits");
});
test("original custom labels require bounded nonblank singular/plural and one-item rejects required flags; bad configurations never create a draft",()=>{
 const f=fixture();try{
  for(const award of [{...value,unitSingular:undefined},{...value,unitPlural:" "},{...value,unitSingular:"x".repeat(41)},{...value,unit:"hours"},{...value,requirements:value.requirements.map(r=>({...r,required:true}))},{...value,completionMode:"invented"}]){
   const call=f.call("editor","learning_save_award",{collectionId:"invalid-rules",award});assert.equal(call.ok,false);assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='invalid-rules'").get(),undefined);
  }
 }finally{f.db.close();}
});
test("one-item moderation completion and custom certificate share audit rollback, authority and original-key receipts; other learner cannot read proof",()=>{
 const f=setup();try{
  const submitted=submit(f,"second",1),before=f.db.prepare("SELECT * FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId),revision=f.service.context("assessor","library:demo").revision;
  f.db.exec("CREATE TRIGGER reject_award_rule BEFORE INSERT ON audit WHEN NEW.tool='learning_assess_external_record' BEGIN SELECT RAISE(ABORT,'award rule fixture'); END;");assert.equal(review(f,submitted.recordId).ok,false);assert.deepEqual(f.db.prepare("SELECT * FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId),before);assert.equal(f.db.prepare("SELECT state FROM external_records WHERE id=?").get(submitted.recordId)!.state,"pending");assert.equal(f.service.context("assessor","library:demo").revision,revision);f.db.exec("DROP TRIGGER reject_award_rule");
  const args={recordId:submitted.recordId,accepted:true,reason:"Original human review"},overrides={idempotencyKey:"one-item-proof",expectedRevision:revision},result=f.call("assessor","learning_assess_external_record",args,"bridge",overrides);data(result);assert.deepEqual(f.call("assessor","learning_assess_external_record",args,"bridge",overrides),result);const progress=own(f);assert.throws(()=>f.service.programs.certificate(f.service.principal("learner-b"),progress.certificate_id));
  data(f.call("admin","learning_set_award_assessor",{collectionId:"rules-award",assessorId:"assessor",enabled:false}));assert.equal(f.call("assessor","learning_assess_external_record",args,"bridge",overrides).ok,false);
 }finally{f.db.close();}
});
test("immutable enrolled custom labels and one-item rule survive publication edits and actual SQLite reopen",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-award-rules-"));let f=setup(value,join(dir,"store.sqlite"));try{
  const submitted=submit(f,"second",1);data(review(f,submitted.recordId));const before=own(f),certificate=f.service.programs.certificate(f.service.principal("learner-a"),before.certificate_id);
  data(f.call("editor","learning_save_award",{collectionId:"rules-award",award:{...value,completionMode:"target",target:3,unitSingular:"later unit",unitPlural:"later units"}}));data(f.call("editor","learning_publish_collection",{collectionId:"rules-award"}));assert.equal(own(f).unitPlural,"practice points");const e=f.e;f.db.close();const reopened=fixture(join(dir,"store.sqlite"));f={...reopened,e};assert.deepEqual(own(f),before);assert.deepEqual(f.service.programs.certificate(f.service.principal("learner-a"),before.certificate_id),certificate);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});
