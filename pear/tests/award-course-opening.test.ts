import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {courseAward,publishCourseAward,mismatchedCourseOpening} from "./award-course-opening-fixture.ts";
test("wrong existing course version is disclosed and never returned as award learning or implicitly reset",()=>{
 const f=mismatchedCourseOpening();try{const before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),revision=f.service.context("learner-a").revision,r=f.call("learner-a","learning_enroll_award_course",{awardEnrollmentId:f.e.awardEnrollmentId,courseId:"learning-vi"});assert.equal(r.ok,false);assert.equal(r.error?.code,"FORBIDDEN");assert.match(r.error!.message,/Existing course version differs/);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),before);assert.equal(f.service.context("learner-a").revision,revision);assert.equal(f.db.prepare("SELECT certificate_id FROM award_enrollments WHERE id=?").get(f.e.awardEnrollmentId)!.certificate_id,null);
 }finally{f.db.close();}
});
test("existing matching course still rechecks current audience before original receipt replay",()=>{
 const f=fixture();try{const e=publishCourseAward(f,"same-course-opening"),args={awardEnrollmentId:e.awardEnrollmentId,courseId:"learning-vi"},opts={idempotencyKey:"original-opening",expectedRevision:f.service.context("learner-a").revision},first=f.call("learner-a","learning_enroll_award_course",args,"bridge",opts);data(first);assert.deepEqual(f.call("learner-a","learning_enroll_award_course",args,"bridge",opts),first);
 const group=(memberIds:string[])=>({name:"Original course opening audience",kind:"static",memberIds,mode:"ALL",rules:[]});data(f.call("admin","learning_save_group",{groupId:"opening-audience",group:group(["learner-a"])}));data(f.call("editor","learning_update_course",{courseId:"learning-vi",course:{...courses["learning-vi"],access:"groups",groupIds:["opening-audience"]}}));data(f.call("editor","learning_publish_course",{courseId:"learning-vi"}));data(f.call("admin","learning_save_group",{groupId:"opening-audience",group:group([])}));assert.equal(f.call("learner-a","learning_enroll_award_course",args,"bridge",opts).ok,false);assert.equal(f.call("learner-a","learning_enroll_award_course",args).ok,false);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments").get()!.n,1);
 data(f.call("admin","learning_save_group",{groupId:"opening-audience",group:group(["learner-a"])}));assert.deepEqual(f.call("learner-a","learning_enroll_award_course",args,"bridge",opts),first);
 }finally{f.db.close();}
});
test("conflicting nested pins require author review instead of choosing the highest course version",()=>{
 const f=fixture();try{publishCourseAward(f,"opening-child-old");data(f.call("editor","learning_update_course",{courseId:"learning-vi",course:{...courses["learning-vi"],title:"Original later nested version"}}));data(f.call("editor","learning_publish_course",{courseId:"learning-vi"}));publishCourseAward(f,"opening-child-new");const e=publishCourseAward(f,"opening-conflict",{...courseAward(),requirements:[{id:"choices",title:"Different original pins",required:true,credits:1,alternatives:[{kind:"award",id:"opening-child-old"},{kind:"award",id:"opening-child-new"}]}]});
 const r=f.call("learner-a","learning_enroll_award_course",{awardEnrollmentId:e.awardEnrollmentId,courseId:"learning-vi"});assert.equal(r.ok,false);assert.match(r.error!.message,/conflicting course versions/);assert.equal(f.db.prepare("SELECT count(*) n FROM enrollments").get()!.n,0);
 }finally{f.db.close();}
});
