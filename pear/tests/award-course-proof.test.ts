import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
function publish(f:ReturnType<typeof fixture>,id:string,required=false){
 const award={title:"Original exact course proof",summary:"Original versioned proof",access:"tenant",unit:"credits",target:2,ongoing:false,moderatedExternal:false,requirements:[{id:"course",title:"Pinned course",required:true,credits:2,alternatives:[{kind:"course",id:"learning-vi"}]},...(required?[{id:"external",title:"Independent required evidence",required:true,credits:1,alternatives:[{kind:"external",id:"practice"}]}]:[])]};
 data(f.call("editor","learning_save_award",{collectionId:id,award}));data(f.call("editor","learning_publish_collection",{collectionId:id}));return data(f.call("learner-a","learning_enroll_award",{collectionId:id})).awardEnrollmentId;
}
function complete(f:ReturnType<typeof fixture>,user="learner-a"){
 const id=data(f.call(user,"learning_enroll",{courseId:"learning-vi"})).enrollmentId;data(f.call(user,"human_complete_lesson",{enrollmentId:id,lessonId:"practice"},"human"));const attemptId=data(f.call(user,"learning_start_attempt",{enrollmentId:id})).attemptId;data(f.call(user,"human_save_answer",{attemptId,questionId:"q-practice",answer:1},"human"));return {id,attemptId};
}
const submit=(f:ReturnType<typeof fixture>,attemptId:string,user="learner-a")=>f.call(user,"human_submit_attempt",{attemptId,confirmed:true},"human");
const own=(f:ReturnType<typeof fixture>,id:string)=>data(f.call("learner-a","learning_get_my_awards")).items.find((e:any)=>e.id===id);
test("old course completion cannot satisfy a newly pinned award version, while immutable original award proof remains valid",()=>{
 const f=fixture();try{const original=publish(f,"original-course-proof"),a=complete(f);data(submit(f,a.attemptId));assert.equal(own(f,original).completed,true);const certificate=own(f,original).certificate_id;
 data(f.call("editor","learning_update_course",{courseId:"learning-vi",course:{...courses["learning-vi"],title:"Original revised course"}}));data(f.call("editor","learning_publish_course",{courseId:"learning-vi"}));const later=publish(f,"later-course-proof");assert.equal(own(f,later).requirements[0].alternatives[0].version,2);assert.equal(own(f,later).earned,0);assert.equal(own(f,later).completed,false);assert.equal(own(f,later).certificate_id,null);assert.equal(own(f,original).certificate_id,certificate);assert.equal(f.db.prepare("SELECT version FROM enrollments WHERE id=?").get(a.id)!.version,1);
 }finally{f.db.close();}
});
test("a newer version and another learner's exact version cannot satisfy an old pinned course criterion",()=>{
 const f=fixture();try{const award=publish(f,"old-course-proof"),other=complete(f,"learner-b");data(submit(f,other.attemptId,"learner-b"));assert.equal(own(f,award).earned,0);
 data(f.call("editor","learning_update_course",{courseId:"learning-vi",course:{...courses["learning-vi"],title:"Later course version"}}));data(f.call("editor","learning_publish_course",{courseId:"learning-vi"}));const newer=complete(f);data(submit(f,newer.attemptId));assert.equal(f.db.prepare("SELECT version FROM enrollments WHERE id=?").get(newer.id)!.version,2);assert.equal(own(f,award).requirements[0].alternatives[0].version,1);assert.equal(own(f,award).earned,0);assert.equal(own(f,award).certificate_id,null);
 }finally{f.db.close();}
});
test("current course audience loss withholds credit from pending awards; restoring rights reconciles real proof without copying a score",()=>{
 const f=fixture();try{const award=publish(f,"pending-course-proof",true),a=complete(f);data(submit(f,a.attemptId));assert.equal(own(f,award).earned,2);assert.equal(own(f,award).completed,false);const group=(memberIds:string[])=>({name:"Original course audience",kind:"static",memberIds,mode:"ALL",rules:[]});data(f.call("admin","learning_save_group",{groupId:"proof-audience",group:group(["learner-a"])}));data(f.call("editor","learning_update_course",{courseId:"learning-vi",course:{...courses["learning-vi"],access:"groups",groupIds:["proof-audience"]}}));data(f.call("editor","learning_publish_course",{courseId:"learning-vi"}));data(f.call("admin","learning_save_group",{groupId:"proof-audience",group:group([])}));
 data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:award,criterionPath:"external",amount:1,evidence:"Original independent evidence",confirmed:true},"human"));assert.equal(own(f,award).earned,1);assert.equal(own(f,award).requiredComplete,false);assert.equal(own(f,award).certificate_id,null);
 data(f.call("admin","learning_save_group",{groupId:"proof-audience",group:group(["learner-a"])}));f.service.programs.refreshLearner("demo","learner-a");assert.equal(own(f,award).earned,3);assert.equal(own(f,award).completed,true);assert.equal(f.db.prepare("SELECT count(*) n FROM attempts WHERE submitted=1").get()!.n,1);assert.equal(f.db.prepare("SELECT version FROM enrollments WHERE id=?").get(a.id)!.version,1);
 }finally{f.db.close();}
});
test("official course submission and derived award certificate roll back together on audit failure",()=>{
 const f=fixture();try{const award=publish(f,"atomic-course-proof"),a=complete(f),before=JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all());f.db.exec("CREATE TRIGGER reject_course_proof BEFORE INSERT ON audit WHEN NEW.tool='human_submit_attempt' BEGIN SELECT RAISE(ABORT,'original course proof rollback'); END;");assert.equal(submit(f,a.attemptId).ok,false);assert.equal(f.db.prepare("SELECT status FROM enrollments WHERE id=?").get(a.id)!.status,"in_progress");assert.equal(own(f,award).earned,0);assert.equal(own(f,award).certificate_id,null);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM workspaces ORDER BY id").all()),before);f.db.exec("DROP TRIGGER reject_course_proof");data(submit(f,a.attemptId));assert.equal(own(f,award).completed,true);assert.ok(own(f,award).certificate_id);
 }finally{f.db.close();}
});
