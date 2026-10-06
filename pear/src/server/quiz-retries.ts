
import type {DatabaseSync} from "node:sqlite";
import type {Course,Question} from "../shared/model.ts";
import {objectiveFraction,makeQuizPresentation} from "../shared/quiz-engine.ts";
import {reject} from "./errors.ts";
const identity=<T>(values:T[])=>values;
const storedPresentation=(at:any,v:Course)=>at.presentation?JSON.parse(at.presentation):makeQuizPresentation({...v,quiz:{...v.quiz,shuffleOptions:false,shuffleQuestions:false}},identity);
export function remapQuizResponse(q:Question,answer:any,old:any,next:any){
 const before=old.options[q.id],after=next.options[q.id],index=(selected:number)=>after.indexOf(before[selected]);
 if((q.kind??"mcq")==="mcq")return q.correctIndices?(answer as number[]).map(index).sort((a,b)=>a-b):index(answer);
 if(q.kind==="matching")return (answer as number[]).map(index);
 return structuredClone(answer);
}
export class QuizRetries {
 constructor(readonly db:DatabaseSync){}
 carried(at:any):string[]{return (this.db.prepare("SELECT question_id FROM quiz_retry_carries WHERE attempt_id=? ORDER BY question_id").all(at.id) as any[]).map(row=>row.question_id);}
 authorizeSave(at:any,id:string){if(this.carried(at).includes(id))reject("FORBIDDEN","Earlier correct responses are retained unchanged in this retry");}
 initialize(at:any,v:Course){
  if(!v.quiz.showPreviousResponses&&!v.quiz.retryIncorrectOnly)return;
  const prior=this.db.prepare("SELECT * FROM attempts WHERE enrollment_id=? AND number<? AND submitted=1 AND grading_state='graded' ORDER BY number DESC LIMIT 1").get(at.enrollment_id,at.number) as any;
  if(!prior)return;
  this.db.prepare("INSERT INTO quiz_attempt_previous VALUES(?,?)").run(at.id,prior.id);
  if(!v.quiz.retryIncorrectOnly)return;
  const previous=JSON.parse(prior.answers),before=storedPresentation(prior,v),next=storedPresentation(at,v),answers:Record<string,any>={};
  for(const q of v.quiz.questions){
   if(q.kind==="long_answer")reject("INVALID_ARGUMENT","Incorrect-only retry requires objective questions");
   if(!Object.hasOwn(previous,q.id)||objectiveFraction(q,previous[q.id],before)!==1)continue;
   answers[q.id]=remapQuizResponse(q,previous[q.id],before,next);this.db.prepare("INSERT INTO quiz_retry_carries VALUES(?,?,?)").run(at.id,q.id,prior.id);
  }
  this.db.prepare("UPDATE attempts SET answers=? WHERE id=?").run(JSON.stringify(answers),at.id);
 }
 previous(at:any,v:Course){
  if(!v.quiz.showPreviousResponses)return null;
  const row=this.db.prepare("SELECT a.* FROM quiz_attempt_previous p JOIN attempts a ON a.id=p.source_attempt_id WHERE p.attempt_id=? AND a.enrollment_id=?").get(at.id,at.enrollment_id) as any;
  if(!row)return null;
  const answers=JSON.parse(row.answers),before=storedPresentation(row,v),next=storedPresentation(at,v);
  return {attemptId:row.id,number:row.number,answers:Object.fromEntries(v.quiz.questions.filter(q=>Object.hasOwn(answers,q.id)).map(q=>[q.id,remapQuizResponse(q,answers[q.id],before,next)]))};
 }
}
