
import React from "react";
import {translateUI} from "./i18n.ts";
export function PreviousResponse({q,previous}:{q:any;previous:any}){
 if(!previous||!Object.hasOwn(previous.answers,q.id))return null;
 const answer=previous.answers[q.id],k=q.kind??"mcq";
 return <details><summary>{translateUI("Previous response")} · {translateUI("Attempt")} {previous.number}</summary>
  {k==="mcq"?<p>{(Array.isArray(answer)?answer:[answer]).map((index:number)=>q.options[index]).join(" · ")}</p>
   :k==="long_answer"?<p className="lesson-text">{answer}</p>
   :<ul>{(answer as any[]).map((value:any,index:number)=><li key={index}>{q.prompts[index]}: {k==="matching"?q.options[value]:value}</li>)}</ul>}
 </details>;
}
