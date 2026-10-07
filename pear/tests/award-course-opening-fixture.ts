import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
export const courseAward=(title="Original course opening")=>({title,summary:"Original reviewed version requirement",access:"tenant",unit:"credits",target:1,ongoing:false,moderatedExternal:false,requirements:[{id:"course",title:"Exact pinned course",required:true,credits:1,alternatives:[{kind:"course",id:"learning-vi"}]}]});
export function publishCourseAward(f:ReturnType<typeof fixture>,id:string,value:any=courseAward()){data(f.call("editor","learning_save_award",{collectionId:id,award:value}));data(f.call("editor","learning_publish_collection",{collectionId:id}));return data(f.call("learner-a","learning_enroll_award",{collectionId:id}));}
export function mismatchedCourseOpening(){
 const f=fixture(),enrollmentId=data(f.call("learner-a","learning_enroll",{courseId:"learning-vi"})).enrollmentId;
 data(f.call("learner-a","human_complete_lesson",{enrollmentId,lessonId:"practice"},"human"));const attemptId=data(f.call("learner-a","learning_start_attempt",{enrollmentId})).attemptId;data(f.call("learner-a","human_save_answer",{attemptId,questionId:"q-practice",answer:1},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId,confirmed:true},"human"));
 data(f.call("editor","learning_update_course",{courseId:"learning-vi",course:{...courses["learning-vi"],title:"Original required second version"}}));data(f.call("editor","learning_publish_course",{courseId:"learning-vi"}));const e=publishCourseAward(f,"opening-award");return {...f,e,enrollmentId};
}
