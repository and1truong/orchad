import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
export function courseRestartFixture(mode="objective",path=":memory:",assigned=false){
 const f=fixture(path),value:any={...structuredClone(courses["learning-vi"]),title:"Original prior full course"};
 if(mode==="essay")value.quiz={passScore:100,maxAttempts:2,questions:[{id:"essay",kind:"long_answer",prompt:"Original reasoning",options:[],correct:0,points:1,rubric:"One point for a concrete explanation"}]};
 if(mode==="submission")value.lessons=[{id:"submission",title:"Original submission",text:"Original own evidence",kind:"submission",prerequisiteIds:[],submission:{rubric:"Original reasoning",maxAttempts:2,passScore:70}}];
 if(mode==="event")value.lessons=[{id:"event",title:"Original workshop",text:"Original own workshop",kind:"event",prerequisiteIds:[],sessions:[{id:"original",startsAt:"2099-01-02T10:00:00Z",endsAt:"2099-01-02T11:00:00Z",cutoffAt:"2099-01-01T10:00:00Z",timezone:"UTC",capacity:2,location:"Original room",joinUrl:"https://meet.example.test/original"}]}];
 data(f.call("editor","learning_create_course",{courseId:"fresh-course",course:value}));data(f.call("editor","learning_publish_course",{courseId:"fresh-course"}));data(f.call("editor","learning_set_course_assessor",{courseId:"fresh-course",assessorId:"assessor",enabled:true}));const e=assigned?data(f.call("manager","learning_assign",{courseId:"fresh-course",learnerId:"learner-a",dueDate:"2026-12-01T00:00:00.000Z"})):data(f.call("learner-a","learning_enroll",{courseId:"fresh-course"}));let at:any=null;
 if(["objective","essay"].includes(mode)){
  for(const l of value.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));
  const q=value.quiz.questions[0];data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:q.id,answer:mode==="essay"?"Original pending human reasoning":0},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));
 }
 const next={...value,title:"Original latest full course",summary:"Original reviewed full course change",lessons:[...value.lessons,{id:"new",title:"Original new lesson",kind:"text",text:"Original new required content",prerequisiteIds:[]}]};
 data(f.call("editor","learning_update_course",{courseId:"fresh-course",course:next}));data(f.call("editor","learning_publish_course",{courseId:"fresh-course"}));
 return {...f,e,at,value,next};
}
export const reviewFresh=(f:ReturnType<typeof courseRestartFixture>)=>data(f.call("learner-a","human_get_latest_course_restart",{enrollmentId:f.e.enrollmentId},"human"));
export const restartFresh=(f:ReturnType<typeof courseRestartFixture>,overrides:any={})=>f.call("learner-a","human_restart_latest_course",{enrollmentId:f.e.enrollmentId,targetVersion:2,confirmed:true},"human",overrides);
