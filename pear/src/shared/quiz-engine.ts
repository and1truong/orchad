import type {Course,Question} from "./model.ts";
import {dropdownChoices,questionSchema} from "./assessments.ts";
import {validateArgs} from "@orchard/bridge-contract";
const norm=(value:string)=>value.normalize("NFKC").trim().toLocaleLowerCase("en");
const kind=(q:Question)=>q.kind??"mcq";
function reject(_code:string,message:string):never {throw new RangeError(message);}
export function validateQuestionForm(q: Question) {
  if(!validateArgs(questionSchema,q))throw new RangeError("Invalid question schema");
  if(q.title!==undefined&&!q.title.trim())throw new RangeError("Question title cannot be blank");
  if(q.promptFormat==="original_markup"&&q.prompt.split("\n").length>32)throw new RangeError("Formatted question prompt exceeds 32 lines");
  const k = kind(q);
  if(k!=="mcq"&&(q.correctIndices||q.partialCredit!==undefined||q.feedbackSelected||q.feedbackNotSelected))reject("INVALID_ARGUMENT","Choice settings require MCQ");
  if(k!=="blanks"&&(q.blankChoiceCounts||q.blankChoiceOptions))reject("INVALID_ARGUMENT","Dropdown choices require blanks");
  if(k!=="long_answer"&&q.passRate!==undefined)reject("INVALID_ARGUMENT","Question pass rate requires manual long answer");
  if(q.correctIndices&&(new Set(q.correctIndices).size!==q.correctIndices.length||q.correctIndices.some(i=>i>=q.options.length)))reject("INVALID_ARGUMENT","Distinct correct choice indices required");
  if(q.partialCredit&&!((q.correctIndices?.length??0)>=2))reject("INVALID_ARGUMENT","Partial credit requires at least two correct choices");
  if((q.feedbackSelected||q.feedbackNotSelected)&&(!q.feedbackSelected||!q.feedbackNotSelected||q.feedbackSelected.length!==q.options.length||q.feedbackNotSelected.length!==q.options.length))reject("INVALID_ARGUMENT","Feedback requires both branches per option");
  const choices=dropdownChoices(q);
  if((q.blankChoiceCounts||q.blankChoiceOptions)&&(!q.blankChoiceCounts||!q.blankChoiceOptions||q.blankChoiceCounts.length!==q.prompts?.length||q.blankChoiceCounts.reduce((a,b)=>a+b,0)!==q.blankChoiceOptions.length))reject("INVALID_ARGUMENT","Dropdown layout requires exact bounded counts");
  if(choices&&(choices.length!==q.prompts?.length||choices.some((choices,i)=>choices.length>0&&(choices.length<2||new Set(choices.map(norm)).size!==choices.length||choices.some(value=>!norm(value))||!choices.some(value=>norm(value)===norm(q.correctAnswers?.[i]??""))))))reject("INVALID_ARGUMENT","Dropdown blanks require distinct options including the accepted answer");
  if (!q.prompt.trim()) reject("INVALID_ARGUMENT", "Question prompt required");
  if (
    q.prompts &&
    (q.prompts.some((v) => !v.trim()) ||
      new Set(q.prompts.map(norm)).size !== q.prompts.length)
  )
    reject("INVALID_ARGUMENT", "Distinct nonempty prompt labels required");
  if (k === "mcq") {
    if (
      q.options.length < 2 ||
      q.options.length > 6 ||
      q.correct >= q.options.length ||
      q.prompts ||
      q.matches ||
      q.correctAnswers ||
      q.rubric
    )
      reject("INVALID_ARGUMENT", "Invalid MCQ choices/key");
  } else if (k === "matching") {
    if (
      q.options.length < 2 ||
      q.options.length > 8 ||
      !q.prompts ||
      !q.matches ||
      q.prompts.length !== q.options.length ||
      q.matches.length !== q.options.length ||
      new Set(q.matches).size !== q.matches.length ||
      q.matches.some((i) => i >= q.options.length) ||
      new Set(q.options).size !== q.options.length ||
      q.correctAnswers ||
      q.rubric
    )
      reject(
        "INVALID_ARGUMENT",
        "Matching requires distinct choices and a complete one-to-one key",
      );
  } else if (k === "blanks") {
    if (
      q.options.length ||
      !q.prompts ||
      !q.correctAnswers ||
      q.prompts.length !== q.correctAnswers.length ||
      q.correctAnswers.some((v) => !norm(v)) ||
      q.matches ||
      q.rubric
    )
      reject(
        "INVALID_ARGUMENT",
        "Blanks require a nonempty answer for each prompt",
      );
  } else if (k === "long_answer") {
    if (
      q.options.length ||
      !q.rubric?.trim() ||
      q.prompts ||
      q.matches ||
      q.correctAnswers
    )
      reject(
        "INVALID_ARGUMENT",
        "Essay requires rubric without objective answer key",
      );
  }
}
export function validateQuizAnswer(q: Question, answer: any, complete = false) {
  const k = kind(q);
  const valid =
    k === "mcq"
      ? q.correctIndices ? Array.isArray(answer)&&answer.length<=q.options.length&&(!complete||answer.length>0)&&new Set(answer).size===answer.length&&answer.every(i=>Number.isInteger(i)&&i>=0&&i<q.options.length) : Number.isInteger(answer) && answer >= 0 && answer < q.options.length
      : k === "matching"
        ? Array.isArray(answer) &&
          answer.length === q.prompts!.length &&
          new Set(answer.filter((i) => i !== -1)).size ===
            answer.filter((i) => i !== -1).length &&
          answer.every(
            (i) =>
              Number.isInteger(i) &&
              i >= (complete ? 0 : -1) &&
              i < q.options.length,
          )
        : k === "blanks"
          ? Array.isArray(answer) &&
            answer.length === q.prompts!.length &&
            answer.every(
              (s,i) =>
                typeof s === "string" &&
                (!complete || s.trim().length > 0) &&
                s.length <= 200 && (!dropdownChoices(q)?.[i]?.length || !s && !complete || dropdownChoices(q)![i]!.includes(s)),
            )
          : typeof answer === "string" &&
            (!complete || answer.trim().length > 0) &&
            answer.length <= 4000;
  if (!valid)
    reject("INVALID_ARGUMENT", "Answer does not match the question type");
}
export function objectiveFraction(q:Question,answer:any,p:any){
 const k=kind(q),order=p.options[q.id];
 if(k==="mcq"){
  if(!q.correctIndices)return order[answer]===q.correct?1:0;
  const selected=(answer as number[]).map(index=>order[index]);
  if(q.partialCredit)return selected.filter(index=>q.correctIndices!.includes(index)).length/q.correctIndices.length;
  return selected.length===q.correctIndices.length&&selected.every(index=>q.correctIndices!.includes(index))?1:0;
 }
 if(k==="matching")return (answer as number[]).filter((x,i)=>order[x]===q.matches![i]).length/answer.length;
 if(k==="blanks")return (answer as string[]).filter((x,i)=>norm(x)===norm(q.correctAnswers![i])).length/answer.length;
 throw new RangeError("Manual question requires authorized review");
}
export function releasedOptionFeedback(q:Question,answer:any,p:any){
 if(!q.feedbackSelected||!q.feedbackNotSelected)return [];
 const selected=Array.isArray(answer)?answer.map(index=>p.options[q.id][index]):[p.options[q.id][answer]];
 return q.feedbackSelected.map((feedback,index)=>({optionIndex:index,selected:selected.includes(index),message:selected.includes(index)?feedback:q.feedbackNotSelected![index]}));
}

export function makeQuizPresentation(course:Course,shuffle:<T>(values:T[])=>T[]){
 return {questions:course.quiz.shuffleQuestions?shuffle(course.quiz.questions.map(q=>q.id)):course.quiz.questions.map(q=>q.id),blanks:Object.fromEntries(course.quiz.questions.map(q=>[q.id,(dropdownChoices(q)??[]).map(choices=>shuffle(choices.map((_,i)=>i)))])),options:Object.fromEntries(course.quiz.questions.map(q=>[q.id,course.quiz.shuffleOptions?shuffle(q.options.map((_,i)=>i)):q.options.map((_,i)=>i)]))};
}
export function presentedQuizQuestions(course:Course,p:any){
 return p.questions.map((id:string)=>{
  const q=course.quiz.questions.find(q=>q.id===id)!;
  const {correct,correctIndices,feedbackSelected,feedbackNotSelected,blankChoiceCounts,blankChoiceOptions,matches,correctAnswers,rubric,...safe}=q;
  return {...safe,kind:kind(q),multiple:!!correctIndices,...(q.blankChoiceCounts?{blankChoices:dropdownChoices(q)!.map((choices,i)=>(p.blanks?.[q.id]?.[i]??choices.map((_,n)=>n)).map((n:number)=>choices[n]))}:{}),options:p.options[id].map((i:number)=>q.options[i])};
 });
}
