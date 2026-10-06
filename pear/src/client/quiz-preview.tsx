
import React,{useState} from "react";
import type {Course} from "../shared/model.ts";
import {startQuizPreview,savePreviewResponse,checkPreviewResponse,submitQuizPreview,previewQuestionIds,type QuizPreviewState} from "../shared/quiz-preview.ts";
import {presentedQuizQuestions,releasedOptionFeedback} from "../shared/quiz-engine.ts";
import {AssessmentQuestion,completeResponse} from "./assessment-player.tsx";
import {translateUI} from "./i18n.ts";
function shuffle<T>(values:T[]):T[]{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
function initialize(course:Course):{state:QuizPreviewState|null;error:string}{try{return {state:startQuizPreview(course,shuffle),error:""};}catch(error){return {state:null,error:error instanceof Error?error.message:"Invalid quiz draft"};}}
export function QuizPreview({course}:{course:Course}){
 const [current,setCurrent]=useState(()=>initialize(course));
 const state=current.state;
 function change(action:(state:QuizPreviewState)=>QuizPreviewState){setCurrent(previous=>{if(!previous.state)return previous;try{return {state:action(previous.state),error:""};}catch(error){return {...previous,error:error instanceof Error?error.message:"Preview response rejected"};}});}
 return <section className="panel" aria-label={translateUI("Interactive quiz preview")}>
  <h4>{translateUI("Interactive quiz preview")}</h4><p>{translateUI("Practice with this unsaved snapshot. No enrollment, attempt, official score or certificate is created.")}</p>
  <button type="button" className="ghost" onClick={()=>setCurrent(initialize(course))}>{translateUI("Restart preview with current draft")}</button>
  {current.error&&<p role="alert">{current.error}</p>}
  {state&&<>{presentedQuizQuestions(state.course,state.p).filter((q:any)=>previewQuestionIds(state).includes(q.id)).map((q:any)=><div key={q.id}>
   <AssessmentQuestion q={q} answer={state.answers[q.id]} disabled={state.submitted} save={answer=>change(value=>savePreviewResponse(value,q.id,answer))}/>
   {!state.submitted&&q.kind!=="long_answer"&&(state.course.quiz.requireCorrectToContinue||state.course.quiz.answerRelease==="after_question")&&<>
    <button type="button" disabled={!completeResponse(q,state.answers[q.id])} onClick={()=>change(value=>checkPreviewResponse(value,q.id))}>{translateUI("Check preview response")}</button>
    {Object.hasOwn(state.checks,q.id)&&<p>{translateUI(state.checks[q.id]?"Preview response correct":"Preview response incorrect")}</p>}
   </>}
  </div>)}
  {!state.submitted&&<button type="button" disabled={state.course.quiz.questions.some(q=>!completeResponse(presentedQuizQuestions(state.course,state.p).find((row:any)=>row.id===q.id),state.answers[q.id]))||!!state.course.quiz.requireCorrectToContinue&&state.p.questions.some((id:string)=>!state.checks[id])} onClick={()=>change(submitQuizPreview)}>{translateUI("Calculate practice result")}</button>}
  {state.result&&<p role="status">{state.result.pendingManual?translateUI("Preview awaits human assessment; no simulated essay score."):translateUI("Practice result")+": "+state.result.score+"% · "+translateUI(state.result.passed?"Practice passed":"Practice failed")}</p>}
  {state.course.quiz.questions.filter(q=>q.kind!=="long_answer"&&(!state.submitted&&state.course.quiz.answerRelease==="after_question"&&Object.hasOwn(state.checks,q.id)||state.submitted&&!state.result?.pendingManual&&(state.course.quiz.answerRelease==="after_submission"||state.course.quiz.answerRelease==="after_pass"&&state.result?.passed||state.course.quiz.answerRelease==="after_question"))).map(q=><p key={"feedback:"+q.id}>{translateUI("Preview answer feedback")}: {q.correctAnswers?.join(" · ")??(q.matches?q.matches.map(index=>q.options[index]).join(" · "):(q.correctIndices??[q.correct]).map(index=>q.options[index]).join(" · "))} {releasedOptionFeedback(q,state.answers[q.id],state.p).map(entry=>entry.message).filter(Boolean).join(" · ")}</p>)}
  </>}
 </section>;
}
