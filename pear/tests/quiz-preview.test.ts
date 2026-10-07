
import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import type {Course} from "../src/shared/model.ts";
import {startQuizPreview,savePreviewResponse,checkPreviewResponse,submitQuizPreview,previewQuestionIds} from "../src/shared/quiz-preview.ts";
import {presentedQuizQuestions} from "../src/shared/quiz-engine.ts";
const course:Course={...structuredClone(courses["learning-vi"]),quiz:{passScore:80,maxAttempts:2,shuffleOptions:true,shuffleQuestions:true,answerRelease:"after_submission",questions:[{id:"multi",prompt:"Original preview choice",options:["Alpha","Beta","Gamma","Delta"],correct:0,correctIndices:[0,2],partialCredit:true},{id:"blank",kind:"blanks",prompt:"Original preview blanks",options:[],correct:0,prompts:["City","Word"],correctAnswers:["Paris","Áp dụng"],blankChoiceCounts:[3,0],blankChoiceOptions:["Paris","London","Berlin"]}]}};
const reverse=<T>(values:T[])=>[...values].reverse();
test("interactive preview and real backend grade the same immutable original mixed responses despite different option permutations; practice snapshot cannot mutate author data",()=>{
 let preview=startQuizPreview(course,reverse);const old=JSON.stringify(preview.course);const author=structuredClone(course);author.quiz.questions[0].options[0]="Later changed draft";assert.equal(JSON.stringify(preview.course),old);assert.notEqual(preview.course,course);
 const visible=presentedQuizQuestions(preview.course,preview.p);preview=savePreviewResponse(preview,"multi",[visible.find((q:any)=>q.id==="multi").options.indexOf("Alpha")]);preview=savePreviewResponse(preview,"blank",["Paris","Áp dụng"]);preview=submitQuizPreview(preview);assert.equal(preview.result!.score,75);assert.equal(preview.result!.passed,false);
 const f=fixture();try{
  data(f.call("editor","learning_create_course",{courseId:"preview-equivalence",course}));data(f.call("editor","learning_publish_course",{courseId:"preview-equivalence"}));const e=data(f.call("learner-a","learning_enroll",{courseId:"preview-equivalence"}));for(const l of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));const actual=data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human"));
  data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:"multi",answer:[actual.questions.find((q:any)=>q.id==="multi").options.indexOf("Alpha")]},"human"));data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:"blank",answer:["Paris","Áp dụng"]},"human"));const result=data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));assert.equal(result.score,preview.result!.score);assert.equal(result.passed,preview.result!.passed);
 }finally{f.db.close();}
});
test("local progression refuses future responses and early practice calculation; changed earlier answer invalidates later checks but retains local drafts",()=>{
 const value={...course,quiz:{...course.quiz,requireCorrectToContinue:true,answerRelease:"after_question" as const}};let state=startQuizPreview(value,reverse);const first=previewQuestionIds(state)[0];assert.deepEqual(previewQuestionIds(state),["blank"]);assert.throws(()=>savePreviewResponse(state,"multi",[0]));assert.throws(()=>submitQuizPreview(state));
 state=savePreviewResponse(state,first,["London","Áp dụng"]);state=checkPreviewResponse(state,first);assert.equal(state.checks[first],false);assert.equal(previewQuestionIds(state).length,1);
 state=savePreviewResponse(state,first,["Paris","Áp dụng"]);state=checkPreviewResponse(state,first);const visible=presentedQuizQuestions(state.course,state.p),q=visible.find((q:any)=>q.id==="multi");state=savePreviewResponse(state,"multi",["Alpha","Gamma"].map(text=>q.options.indexOf(text)));state=checkPreviewResponse(state,"multi");assert.equal(submitQuizPreview(state).result!.score,100);
 state=savePreviewResponse(state,"blank",["London","Áp dụng"]);assert.equal(Object.hasOwn(state.checks,"multi"),false);assert.ok(state.answers.multi);assert.equal(previewQuestionIds(state).length,1);
});
test("preview refuses invalid/malformed/oversized draft and response shapes instead of presenting fabricated results",()=>{
 for(const quiz of [{...course.quiz,questions:[]},{...course.quiz,questions:[course.quiz.questions[0],course.quiz.questions[0]]},{...course.quiz,questions:[{...course.quiz.questions[1],blankChoiceCounts:[2,0],blankChoiceOptions:["London","Berlin"]}]},{...course.quiz,questions:Array.from({length:51},(_,i)=>({...course.quiz.questions[0],id:"many-"+i}))}])assert.throws(()=>startQuizPreview({...course,quiz},reverse));
 const state=startQuizPreview(course,reverse);assert.throws(()=>savePreviewResponse(state,"multi",[0,0]));assert.throws(()=>savePreviewResponse(state,"blank",["Unknown","word"]));assert.throws(()=>submitQuizPreview(state));assert.deepEqual(state.answers,{});
 const emoji={...course,quiz:{...course.quiz,questions:Array.from({length:20},(_,i)=>({...course.quiz.questions[0],id:"large-"+i,prompt:"界".repeat(400)}))}};assert.throws(()=>startQuizPreview(emoji,reverse));
});
test("manual preview validates written responses but never fabricates an essay rubric score; objective-only gate composition rejects, restart is clean",()=>{
 const essay={id:"essay",kind:"long_answer" as const,prompt:"Original explanation",options:[],correct:0,rubric:"Original criterion",passRate:50,points:4};
 const value={...course,quiz:{...course.quiz,questions:[essay]}};let state=startQuizPreview(value,reverse);assert.throws(()=>savePreviewResponse(state,"essay",5));state=savePreviewResponse(state,"essay","Original written practice");const submitted=submitQuizPreview(state);assert.deepEqual(submitted.result,{score:null,passed:null,pendingManual:true});assert.throws(()=>savePreviewResponse(submitted,"essay","Changed"));
 assert.throws(()=>startQuizPreview({...value,quiz:{...value.quiz,requireCorrectToContinue:true}},reverse));const fresh=startQuizPreview(value,reverse);assert.deepEqual(fresh.answers,{});assert.equal(fresh.submitted,false);assert.equal(fresh.result,null);
});
