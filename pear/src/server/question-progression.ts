import type {DatabaseSync} from "node:sqlite";
import {createHash} from "node:crypto";
import {canonical} from "@orchard/bridge-contract";
import type {Course} from "../shared/model.ts";
import {objectiveFraction,validateAnswer,presentation,releasedOptionFeedback} from "./assessments.ts";
import {reject} from "./errors.ts";
// All methods run through LearningService's live owner/tenant/content authority.
// Mutations share its IMMEDIATE transaction, revision, receipt and audit boundary.
export class QuestionProgression {
 constructor(readonly db:DatabaseSync){}
 private row(at:any,id:string){return this.db.prepare("SELECT * FROM quiz_question_states WHERE attempt_id=? AND question_id=?").get(at.id,id) as any;}
 private order(at:any,v:Course):string[]{return at.presentation?JSON.parse(at.presentation).questions:v.quiz.questions.map(q=>q.id);}
 fingerprint(at:any,id:string){const answers=JSON.parse(at.answers);return createHash("sha256").update(canonical({answer:answers[id]??null,answerVersion:this.row(at,id)?.answer_version??0})).digest("hex");}
 eligible(at:any,v:Course){
  const ids=this.order(at,v);if(!v.quiz.requireCorrectToContinue||at.submitted)return ids;
  const cursor=ids.findIndex(id=>{const row=this.row(at,id);return !row||row.checked_version!==row.answer_version||row.correct!==1;});
  return cursor<0?ids:ids.slice(0,cursor+1);
 }
 canSubmit(at:any,v:Course){return !v.quiz.requireCorrectToContinue||this.order(at,v).every(id=>{const row=this.row(at,id);return row&&row.checked_version===row.answer_version&&row.correct===1;});}
 authorize(at:any,v:Course,a:any){
  if(at.submitted)reject("FORBIDDEN","Submitted question checks are immutable");
  if(!v.quiz.requireCorrectToContinue&&v.quiz.answerRelease!=="after_question")reject("FORBIDDEN","Question checks are not configured");
  const q=v.quiz.questions.find(q=>q.id===a.questionId);
  if(!q||(q.kind??"mcq")==="long_answer")reject("FORBIDDEN","Only configured objective questions may be checked");
  if(!this.eligible(at,v).includes(q.id))reject("FORBIDDEN","Complete earlier questions first");
  const answers=JSON.parse(at.answers);if(!Object.hasOwn(answers,q.id))reject("INVALID_ARGUMENT","Save the response before checking");
  validateAnswer(q,answers[q.id],true);
  if(a.fingerprint!==this.fingerprint(at,q.id))reject("STALE_CONTEXT","Saved response changed; refresh before checking");
 }
 authorizeSave(at:any,v:Course,id:string){
  if(!this.eligible(at,v).includes(id))reject("FORBIDDEN","Complete earlier questions first");
 }
 save(at:any,v:Course,id:string,answer:any){
  if(!this.eligible(at,v).includes(id))reject("FORBIDDEN","Complete earlier questions first");
  if(canonical(JSON.parse(at.answers)[id]??null)===canonical(answer))return;
  this.db.prepare("INSERT INTO quiz_question_states(attempt_id,question_id,answer_version) VALUES(?,?,1) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer_version=answer_version+1,checked_version=NULL,correct=NULL,checked_at=NULL").run(at.id,id);
  if(v.quiz.requireCorrectToContinue){
   const order=this.order(at,v);for(const later of order.slice(order.indexOf(id)+1))this.db.prepare("UPDATE quiz_question_states SET answer_version=answer_version+1,checked_version=NULL,correct=NULL,checked_at=NULL WHERE attempt_id=? AND question_id=?").run(at.id,later);
  }
 }
 check(at:any,v:Course,a:any){
  this.authorize(at,v,a);const q=v.quiz.questions.find(q=>q.id===a.questionId)!,answers=JSON.parse(at.answers);
  const p=at.presentation?JSON.parse(at.presentation):presentation({...v,quiz:{...v.quiz,shuffleOptions:false,shuffleQuestions:false}});
  const correct=objectiveFraction(q,answers[q.id],p)===1;
  this.db.prepare("INSERT INTO quiz_question_states(attempt_id,question_id,answer_version,checked_version,correct,checked_at) VALUES(?,?,0,0,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET checked_version=answer_version,correct=excluded.correct,checked_at=excluded.checked_at").run(at.id,q.id,correct?1:0,new Date().toISOString());
  return {attemptId:at.id,questionId:q.id,checked:true,correct,officialGradeChanged:false};
 }
 human(at:any,v:Course){
  const eligible=this.eligible(at,v),answers=JSON.parse(at.answers);
  if(!v.quiz.requireCorrectToContinue&&v.quiz.answerRelease!=="after_question")return {canSubmit:true,questionChecks:[]};
  return {canSubmit:this.canSubmit(at,v),questionChecks:at.submitted?[]:eligible.map(id=>{const row=this.row(at,id),q=v.quiz.questions.find(q=>q.id===id)!;
   const checked=!!row&&row.checked_version===row.answer_version;
   return {questionId:id,checkable:!at.submitted&&(v.quiz.requireCorrectToContinue||v.quiz.answerRelease==="after_question")&&(q.kind??"mcq")!=="long_answer",fingerprint:!at.submitted&&Object.hasOwn(answers,id)?this.fingerprint(at,id):null,checked,correct:checked?!!row.correct:null};
  })};
 }
 feedback(at:any,v:Course){
  if(v.quiz.answerRelease!=="after_question"||at.submitted)return [];
  const answers=JSON.parse(at.answers),p=at.presentation?JSON.parse(at.presentation):presentation({...v,quiz:{...v.quiz,shuffleOptions:false,shuffleQuestions:false}});
  return v.quiz.questions.filter(q=>{const row=this.row(at,q.id);return (q.kind??"mcq")!=="long_answer"&&row&&row.checked_version===row.answer_version;}).map(q=>({questionId:q.id,correct:q.correct,correctIndices:q.correctIndices,matches:q.matches,correctAnswers:q.correctAnswers,options:q.options,optionFeedback:releasedOptionFeedback(q,answers[q.id],p)}));
 }
}
