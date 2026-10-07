import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
const child={title:"Original child practice",summary:"Original",access:"tenant",unit:"credits",target:2,ongoing:false,moderatedExternal:true,requirements:[{id:"required",title:"Required",required:true,credits:2,alternatives:[{kind:"external",id:"required-proof"}]},{id:"elective",title:"Elective",required:false,credits:5,alternatives:[{kind:"external",id:"elective-proof"}]}]};
function publish(f:ReturnType<typeof fixture>,id:string,award:any){data(f.call("editor","learning_save_award",{collectionId:id,award}));data(f.call("editor","learning_publish_collection",{collectionId:id}));}
function setup(mode="nested_earned",path=":memory:"){
 const f=fixture(path);publish(f,"credit-child",child);publish(f,"credit-root",{...child,title:"Original root",target:mode==="nested_earned"?6:1,requirements:[{id:"nested",title:"Nested",required:true,credits:1,creditMode:mode,alternatives:[{kind:"award",id:"credit-child"}]}]});
 data(f.call("admin","learning_set_award_assessor",{collectionId:"credit-root",assessorId:"assessor",enabled:true}));const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"credit-root"}));return {...f,e};
}
const own=(f:ReturnType<typeof setup>)=>data(f.call("learner-a","learning_get_my_awards")).items.find((r:any)=>r.id===f.e.awardEnrollmentId);
function evidence(f:ReturnType<typeof setup>,criterion:string,amount:number,accepted=true){
 const r=data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:f.e.awardEnrollmentId,criterionPath:"nested/credit-child@1/"+criterion,amount,evidence:"Original "+criterion+" "+amount+" "+accepted,confirmed:true},"human"));
 data(f.call("assessor","learning_assess_external_record",{recordId:r.recordId,accepted,reason:"Original human review"}));return r;
}
test("actual nested quantity counts partial accepted child credits; required child completion is independent of parent target; parent never substitutes fixed quantity",()=>{
 const f=setup();try{
  evidence(f,"elective",5);assert.equal(own(f).earned,5);assert.equal(own(f).requirements[0].completed,false);assert.equal(own(f).completed,false);
  evidence(f,"required",1,false);assert.equal(own(f).earned,5);evidence(f,"required",1);assert.equal(own(f).earned,6);assert.equal(own(f).completed,false);
  evidence(f,"required",2);const p=own(f);assert.equal(p.earned,7);assert.equal(p.requirements[0].credits,7);assert.equal(p.requirements[0].completed,true);assert.equal(p.completed,true);assert.ok(p.certificate_id);
  assert.equal(f.service.programs.certificate(f.service.principal("learner-a"),p.certificate_id).earned,7);
 }finally{f.db.close();}
});
test("existing fixed nested criteria keep original all-or-nothing quantity",()=>{
 const f=setup("fixed");try{evidence(f,"elective",5);assert.equal(own(f).earned,0);evidence(f,"required",2);assert.equal(own(f).earned,1);assert.equal(own(f).completed,true);}finally{f.db.close();}
});
test("actual nested quantities reject mixed reference kinds, units and unreachable child capacity before saving",()=>{
 const f=fixture();try{
  publish(f,"credit-child",child);publish(f,"hour-child",{...child,unit:"hours"});
  const root={...child,target:1,requirements:[{id:"nested",title:"Nested",required:true,credits:1,creditMode:"nested_earned",alternatives:[{kind:"award",id:"credit-child"}]}]};
  for(const bad of [{...root,target:8},{...root,unit:"hours"},{...root,requirements:[{...root.requirements[0],alternatives:[{kind:"external",id:"practice"}]}]},{...root,requirements:[{...root.requirements[0],alternatives:[{kind:"award",id:"credit-child"},{kind:"award",id:"hour-child"}]}]}]){
   assert.equal(f.call("editor","learning_save_award",{collectionId:"invalid-actual",award:bad}).ok,false);assert.equal(f.db.prepare("SELECT 1 FROM collections WHERE id='invalid-actual'").get(),undefined);
  }
 }finally{f.db.close();}
});
test("nested actual quantities retain pinned child publication and SQLite progress across reopen without certificate manufacture",()=>{
 const dir=mkdtempSync(join(tmpdir(),"pear-child-credits-"));let f=setup("nested_earned",join(dir,"state.sqlite"));try{
  evidence(f,"elective",5);const before=own(f);publish(f,"credit-child",{...child,requirements:[{...child.requirements[0],credits:10}]});assert.deepEqual(own(f),before);const e=f.e;f.db.close();f={...fixture(join(dir,"state.sqlite")),e};assert.deepEqual(own(f),before);assert.equal(own(f).certificate_id,null);evidence(f,"required",2);assert.equal(own(f).earned,7);
 }finally{f.db.close();rmSync(dir,{recursive:true,force:true});}
});

test("actual child alternatives count greatest accepted quantity once rather than summing duplicate practice branches",()=>{
 const f=fixture();try{
  publish(f,"credit-child",child);publish(f,"other-child",{...child,title:"Original second branch"});
  publish(f,"alternative-root",{...child,target:6,requirements:[{id:"nested",title:"Alternatives",required:false,credits:1,creditMode:"nested_earned",alternatives:[{kind:"award",id:"credit-child"},{kind:"award",id:"other-child"}]}]});
  data(f.call("admin","learning_set_award_assessor",{collectionId:"alternative-root",assessorId:"assessor",enabled:true}));const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"alternative-root"}));
  for(const id of ["credit-child","other-child"]){const r=data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:e.awardEnrollmentId,criterionPath:"nested/"+id+"@1/elective",amount:5,evidence:"Original alternative "+id,confirmed:true},"human"));data(f.call("assessor","learning_assess_external_record",{recordId:r.recordId,accepted:true,reason:"Human verification"}));}
  const p=data(f.call("learner-a","learning_get_my_awards")).items.find((r:any)=>r.id===e.awardEnrollmentId);assert.equal(p.earned,5);assert.equal(p.completed,false);assert.equal(p.requirements[0].credits,7);
 }finally{f.db.close();}
});
test("actual ongoing child contributes quantity but cannot satisfy required child completion",()=>{
 const f=fixture();try{
  publish(f,"ongoing-child",{...child,ongoing:true});publish(f,"ongoing-root",{...child,target:2,requirements:[{id:"nested",title:"Ongoing required",required:true,credits:1,creditMode:"nested_earned",alternatives:[{kind:"award",id:"ongoing-child"}]}]});data(f.call("admin","learning_set_award_assessor",{collectionId:"ongoing-root",assessorId:"assessor",enabled:true}));const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"ongoing-root"})),r=data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:e.awardEnrollmentId,criterionPath:"nested/ongoing-child@1/required",amount:2,evidence:"Original ongoing practice",confirmed:true},"human"));data(f.call("assessor","learning_assess_external_record",{recordId:r.recordId,accepted:true,reason:"Human verification"}));const p=data(f.call("learner-a","learning_get_my_awards")).items.find((r:any)=>r.id===e.awardEnrollmentId);assert.equal(p.earned,2);assert.equal(p.requiredComplete,false);assert.equal(p.completed,false);assert.equal(p.certificate_id,null);
 }finally{f.db.close();}
});
