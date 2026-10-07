import {fixture,data} from './helpers.ts';
import {courses} from '../src/server/seed.ts';
export function awardDefinition(title='Original bound award',extras:any={}){return {title,summary:'Original criterion-bound learning',access:'tenant',unit:'credits',target:2,ongoing:false,moderatedExternal:false,requirements:[{id:'course',title:'Course criterion',required:true,credits:1,alternatives:[{kind:'course',id:'learning-vi'}]},{id:'evidence',title:'Separate required evidence',required:true,credits:1,alternatives:[{kind:'external',id:'practice'}]}],...extras};}
export function publishBindingAward(f:ReturnType<typeof fixture>,id='binding-award',value:any=awardDefinition()){data(f.call('editor','learning_save_award',{collectionId:id,award:value}));data(f.call('editor','learning_publish_collection',{collectionId:id}));}
export function bindingFixture(path=':memory:'){
 const f=fixture(path);publishBindingAward(f);const e=data(f.call('learner-a','learning_enroll_award',{collectionId:'binding-award'}));return {...f,e,address:{awardEnrollmentId:e.awardEnrollmentId,criterionPath:'course',courseId:'learning-vi'}};
}
export function finishCourse(f:ReturnType<typeof fixture>,id:string,user='learner-a'){
 data(f.call(user,'human_complete_lesson',{enrollmentId:id,lessonId:'practice'},'human'));const attemptId=data(f.call(user,'learning_start_attempt',{enrollmentId:id})).attemptId;data(f.call(user,'human_save_answer',{attemptId,questionId:'q-practice',answer:1},'human'));data(f.call(user,'human_submit_attempt',{attemptId,confirmed:true},'human'));return attemptId;
}
export function publishNext(f:ReturnType<typeof fixture>,extra:any={}){data(f.call('editor','learning_update_course',{courseId:'learning-vi',course:{...courses['learning-vi'],title:'Original revised bound course',...extra}}));return data(f.call('editor','learning_publish_course',{courseId:'learning-vi'}));}
export const groupDefinition=(memberIds=['learner-a'])=>({name:'Original bound learning group',kind:'static',memberIds,mode:'ALL',rules:[]});
export function assignedBindingFixture(dynamic=false,mode="objective"){
 const f=fixture();
 if(mode!=="objective"){
  const value:any=structuredClone(courses['learning-vi']);
  if(mode==='essay')value.quiz={passScore:100,maxAttempts:2,questions:[{id:'essay',kind:'long_answer',prompt:'Original reasoning',options:[],correct:0,points:1,rubric:'A concrete explanation'}]};
  if(mode==='event')value.lessons=[{id:'event',title:'Original workshop',text:'Original own workshop',kind:'event',prerequisiteIds:[],sessions:[{id:'original',startsAt:'2099-01-02T10:00:00Z',endsAt:'2099-01-02T11:00:00Z',cutoffAt:'2099-01-01T10:00:00Z',timezone:'UTC',capacity:2,location:'Original room',joinUrl:'https://meet.example.test/original'}]}];
  data(f.call('editor','learning_update_course',{courseId:'learning-vi',course:value}));data(f.call('editor','learning_publish_course',{courseId:'learning-vi'}));data(f.call('editor','learning_set_course_assessor',{courseId:'learning-vi',assessorId:'assessor',enabled:true}));
 }
 data(f.call('admin','learning_save_group' ,{groupId:'binding-group',group:groupDefinition()}));publishBindingAward(f);
 const plan={title:'Original award binding cycle',targetKind:'award',targetId:'binding-award',audienceKind:dynamic?'group':'individuals',learnerIds:dynamic?[]:['learner-a'],groupId:dynamic?'binding-group':'',membership:dynamic?'dynamic':'fixed',startsAt:new Date(Date.now()-1000).toISOString(),repeatDays:30,endAt:null,dueKind:'rolling',fixedDueAt:null,rollingDays:7};
 data(f.call('manager','learning_save_assignment_plan',{planId:'binding-plan',plan,reason:'Original configured award delivery'}));f.service.assignments.runBackground();const e=data(f.call('learner-a','learning_get_my_awards')).items.find((r:any)=>r.assignment_cycle_id);return {...f,e,address:{awardEnrollmentId:e.id,criterionPath:'course',courseId:'learning-vi'},plan};
}
export function courseChange(f:ReturnType<typeof fixture>,address:any,targetVersion:number,user='learner-a'){
 const v=data(f.call(user,'human_get_award_course_review',address,'human'));return {...address,sourceEnrollmentId:v.sourceEnrollmentId,targetVersion,expectedBindingRevision:v.expectedBindingRevision,confirmed:true};
}
export const ownAward=(f:ReturnType<typeof fixture>,id:string)=>data(f.call('learner-a','learning_get_my_awards')).items.find((r:any)=>r.id===id);
