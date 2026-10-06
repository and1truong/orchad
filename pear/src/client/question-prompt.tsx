
import React from "react";
import {questionBlocks,type InlineText} from "../shared/question-text.ts";
function inline(nodes:InlineText[]):React.ReactNode{return nodes.map((node,index)=>node.kind==="text"?<React.Fragment key={index}>{node.text}</React.Fragment>:node.kind==="strong"?<strong key={index}>{inline(node.children)}</strong>:node.kind==="em"?<em key={index}>{inline(node.children)}</em>:<u key={index}>{inline(node.children)}</u>);}
export function QuestionPrompt({q}:{q:any}){
 if(q.promptFormat!=="original_markup")return <p className="lesson-text">{q.prompt}</p>;
 return <div className="lesson-text">{questionBlocks(q.prompt).map((block,index)=>block.kind==="paragraph"?<p key={index}>{block.lines.map((line,i)=><React.Fragment key={i}>{i>0&&<br/>}{inline(line)}</React.Fragment>)}</p>:block.kind==="ordered"?<ol key={index}>{block.items.map((item,i)=><li key={i}>{inline(item)}</li>)}</ol>:<ul key={index}>{block.items.map((item,i)=><li key={i}>{inline(item)}</li>)}</ul>)}</div>;
}
