
import type {Course} from "./model.ts";
import {courseSchema} from "./catalog.ts";
import {validateArgs} from "@orchard/bridge-contract";
import {validateQuestionForm,validateQuizAnswer,makeQuizPresentation,objectiveFraction} from "./quiz-engine.ts";
export interface QuizPreviewState {course:Course;p:any;answers:Record<string,any>;checks:Record<string,boolean>;submitted:boolean;result:{score:number|null;passed:boolean|null;pendingManual:boolean}|null;}
export function startQuizPreview(course:Course,shuffle:<T>(values:T[])=>T[]):QuizPreviewState{
 if(!validateArgs(courseSchema.properties.quiz,course.quiz)||new TextEncoder().encode(JSON.stringify(course.quiz)).length>16*1024)throw new RangeError("Invalid or oversized quiz draft");
 if(new Set(course.quiz.questions.map(q=>q.id)).size!==course.quiz.questions.length)throw new RangeError("Duplicate preview question IDs");
 for(const q of course.quiz.questions)validateQuestionForm(q);
 if(course.quiz.requireCorrectToContinue&&course.quiz.questions.some(q=>q.kind==="long_answer"))throw new RangeError("Objective progression cannot include long answers");
 const snapshot=structuredClone(course);return {course:snapshot,p:makeQuizPresentation(snapshot,shuffle),answers:{},checks:{},submitted:false,result:null};
}
export function previewQuestionIds(state:QuizPreviewState):string[]{
 const ids=state.p.questions as string[];if(!state.course.quiz.requireCorrectToContinue||state.submitted)return ids;
 const cursor=ids.findIndex(id=>!state.checks[id]);return cursor<0?ids:ids.slice(0,cursor+1);
}
export function savePreviewResponse(state:QuizPreviewState,id:string,answer:any):QuizPreviewState{
 if(state.submitted||!previewQuestionIds(state).includes(id))throw new RangeError("Preview question is unavailable");
 const q=state.course.quiz.questions.find(q=>q.id===id);if(!q)throw new RangeError("Unknown preview question");validateQuizAnswer(q,answer);
 const checks={...state.checks};if(JSON.stringify(state.answers[id])!==JSON.stringify(answer)){
  delete checks[id];if(state.course.quiz.requireCorrectToContinue)for(const later of state.p.questions.slice(state.p.questions.indexOf(id)+1))delete checks[later];
 }
 const answers={...state.answers,[id]:structuredClone(answer)};
 if(new TextEncoder().encode(JSON.stringify(answers)).length>32*1024)throw new RangeError("Combined preview responses exceed 32 KiB");
 return {...state,answers,checks};
}
export function checkPreviewResponse(state:QuizPreviewState,id:string):QuizPreviewState{
 const q=state.course.quiz.questions.find(q=>q.id===id);
 if(state.submitted||!q||!previewQuestionIds(state).includes(id)||q.kind==="long_answer"||!state.course.quiz.requireCorrectToContinue&&state.course.quiz.answerRelease!=="after_question")throw new RangeError("Preview question cannot be checked");
 validateQuizAnswer(q,state.answers[id],true);return {...state,checks:{...state.checks,[id]:objectiveFraction(q,state.answers[id],state.p)===1}};
}
export function submitQuizPreview(state:QuizPreviewState):QuizPreviewState{
 if(state.submitted)throw new RangeError("Preview already submitted");
 if(state.course.quiz.requireCorrectToContinue&&state.p.questions.some((id:string)=>!state.checks[id]))throw new RangeError("Check every preview response as correct");
 let earned=0,total=0,pendingManual=false;
 for(const q of state.course.quiz.questions){
  validateQuizAnswer(q,state.answers[q.id],true);const max=q.points??1;total+=max;
  if(q.kind==="long_answer")pendingManual=true;else earned+=max*840*objectiveFraction(q,state.answers[q.id],state.p);
 }
 const score=pendingManual?null:Math.floor(100*earned/(total*840));
 return {...state,submitted:true,result:{score,passed:score===null?null:score>=state.course.quiz.passScore,pendingManual}};
}
