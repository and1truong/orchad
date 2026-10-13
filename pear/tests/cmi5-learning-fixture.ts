import {cmi5Fixture} from './cmi5-fixture.ts';
import {data} from './helpers.ts';
import {courses} from '../src/server/seed.ts';
import type {CMI5Reference} from '../src/shared/model.ts';

export async function cmi5LearningFixture(path?:string,allowWaivers=false) {
  const s=await cmi5Fixture(path),pkg=await s.publish(),ref:CMI5Reference={packageId:pkg.packageId,sha256:pkg.sha256,allowWaivers};
  const course=(reference=ref)=>({...structuredClone(courses['learning-vi']),title:'Original cmi5 bound course',lessons:[{id:'package',title:'Original package lesson',text:'Complete the original activities.',kind:'cmi5',prerequisiteIds:[],cmi5:reference}]});
  data(s.call('editor','learning_update_course',{courseId:'learning-vi',course:course()}));data(s.call('editor','learning_publish_course',{courseId:'learning-vi'}));
  const enroll=()=>({enrollmentId:data(s.call('learner-a','learning_enroll',{courseId:'learning-vi'})).enrollmentId,lessonId:'package'});
  function launch(binding?:Record<string,unknown>,auId='https://content.example.test/au/intro',mode='Normal') {return s.cmi5.launch(s.learner,s.learnerLogin.browser,{...s.args(s.learner,false),packageId:pkg.packageId,auId,mode,...(binding?{binding}:{})});}
  function start(launch:any){const r=s.runtime(launch);s.cmi5.write(r.header,r.statement('initialized'));return r;}
  function outcome(r:ReturnType<typeof start>,pass=true,end=true) {const batch=[r.statement('completed',{completion:true,duration:'PT1M'})];if(r.data.masteryScore!==undefined)batch.push(r.statement(pass?'passed':'failed',{success:pass,duration:'PT1M',score:{scaled:pass?0.9:0.5}}));if(end)batch.push(r.statement('terminated',{duration:'PT1M'}));return s.cmi5.write(r.header,batch);}
  function finish(binding:Record<string,unknown>) {const intro=launch(binding);outcome(start(intro));const practice=launch(binding,'https://content.example.test/au/practice');outcome(start(practice));return practice;}
  function quiz(enrollmentId:string){const attemptId=data(s.call('learner-a','learning_start_attempt',{enrollmentId})).attemptId;data(s.call('learner-a','human_save_answer',{attemptId,questionId:'q-practice',answer:1},'human'));return data(s.call('learner-a','human_submit_attempt',{attemptId,confirmed:true},'human'));}
  const item={title:'Original cmi5 item',summary:'Original reusable cmi5 activities',language:'en',provider:'Original',license:'self-authored',aiProcessingAllowed:true,kind:'cmi5',text:'Complete these activities',cmi5:ref};
  function enrollItem(id='cmi5-item'){data(s.call('editor','learning_create_content_item',{itemId:id,item}));data(s.call('editor','learning_publish_content_item',{itemId:id}));return {itemEnrollmentId:data(s.call('learner-a','learning_enroll_item',{itemId:id})).itemEnrollmentId};}
  return {...s,pkg,ref,course,enroll,launch,start,outcome,finish,quiz,item,enrollItem};
}
