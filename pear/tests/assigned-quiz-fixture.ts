import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
export function assignedQuizFixture(path=":memory:"){
 const f=fixture(path),value={...structuredClone(courses["learning-vi"]),title:"Original assigned quiz restart",language:"en",quiz:{passScore:100,maxAttempts:2,questions:[{id:"old",prompt:"Original prior quiz",options:["Alpha","Beta"],correct:0}]}};
 data(f.call("editor","learning_create_course",{courseId:"assigned-quiz-course",course:value}));data(f.call("editor","learning_publish_course",{courseId:"assigned-quiz-course"}));
 const e=data(f.call("manager","learning_assign",{courseId:"assigned-quiz-course",learnerId:"learner-a",dueDate:"2026-12-01T00:00:00.000Z"}));
 for(const lesson of value.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:lesson.id},"human"));
 const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));
 data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:"old",answer:1},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));
 const next={...value,quiz:{...value.quiz,questions:[{id:"new",prompt:"Original updated quiz",options:["Gamma","Delta"],correct:0}]}};
 data(f.call("editor","learning_update_course",{courseId:"assigned-quiz-course",course:next}));data(f.call("editor","learning_publish_course",{courseId:"assigned-quiz-course"}));
 return {...f,e,at,value,next};
}
export const offerAssigned=(f:ReturnType<typeof assignedQuizFixture>,overrides:any={})=>f.call("manager","human_offer_assigned_quiz_restart",{sourceEnrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true},"human",overrides);
export const acceptAssigned=(f:ReturnType<typeof assignedQuizFixture>,reviewId:string,overrides:any={})=>f.call("learner-a","human_accept_assigned_quiz_restart",{reviewId,targetVersion:2,confirmed:true},"human",overrides);
