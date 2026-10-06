
import {test} from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {QuestionPrompt} from "../src/client/question-prompt.tsx";
import {questionBlocks,questionInline} from "../src/shared/question-text.ts";
import {validateQuestionForm} from "../src/shared/quiz-engine.ts";
import {hostSafeSchema} from "@orchard/bridge-contract";
import {allCatalog,humanTools} from "../src/shared/catalog.ts";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
const question={id:"formatted",title:"Original titled question",prompt:"**Original bold** and *original italic* and __original underline__\n\n- Original bullet\n- Second bullet\n\n1. Original numbered\n2. Second numbered\n\n<img src=x onerror=alert(1)> https://example.invalid/",promptFormat:"original_markup" as const,options:["Original right","Original wrong"],correct:0};
test("bounded original question formatting produces only explicit React text/format/list nodes; raw HTML/URLs and unmatched markers stay literal",()=>{
 const html=renderToStaticMarkup(React.createElement(QuestionPrompt,{q:question}));
 assert.match(html,/<strong>Original bold<\/strong>/);assert.match(html,/<em>original italic<\/em>/);assert.match(html,/<u>original underline<\/u>/);assert.match(html,/<ul><li>Original bullet<\/li><li>Second bullet<\/li><\/ul>/);assert.match(html,/<ol><li>Original numbered<\/li><li>Second numbered<\/li><\/ol>/);
 assert.equal(html.includes("<img"),false);assert.equal(html.includes("<a "),false);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.equal(html.includes("https://example.invalid/"),true);
 assert.deepEqual(questionInline("Original **unclosed"),[{kind:"text",text:"Original **unclosed"}]);assert.equal(questionBlocks("First paragraph\n\nSecond paragraph").length,2);
 const plain=renderToStaticMarkup(React.createElement(QuestionPrompt,{q:{...question,promptFormat:"plain"}}));assert.equal(plain.includes("<strong>"),false);assert.equal(plain.includes("**Original bold**"),true);
 const deep=questionInline("**literal**",4);assert.deepEqual(deep,[{kind:"text",text:"**literal**"}]);const many=questionBlocks(Array.from({length:33},()=>"literal").join("\n"));assert.equal(many.length,1);
});
test("question titles/formats preserve canonical schema depth and reject blank/overlong/unknown or excessive line forms",()=>{
 validateQuestionForm({...question,title:"界".repeat(255)});validateQuestionForm({...question,prompt:Array.from({length:32},()=>"x").join("\n")});
 for(const q of [{...question,title:"x".repeat(256)},{...question,title:"   "},{...question,promptFormat:"arbitrary_html"},{...question,prompt:Array.from({length:33},()=>"x").join("\n")}])assert.throws(()=>validateQuestionForm(q as any));
 for(const role of ["admin","content_admin","manager","assessor","learner"] as const)for(const descriptor of [...allCatalog(role),...humanTools])assert.equal(hostSafeSchema(descriptor.inputSchema),true,descriptor.name);
});
test("titled formatted original questions publish immutable versions, grade normally, preserve original pin and remain withheld under model-processing restrictions",()=>{
 const f=fixture();try{
  const course={...structuredClone(courses["learning-vi"]),title:"Original formatted quiz",quiz:{passScore:100,maxAttempts:2,questions:[question]}};
  data(f.call("editor","learning_create_course",{courseId:"formatted-course",course}));data(f.call("editor","learning_publish_course",{courseId:"formatted-course"}));const e=data(f.call("learner-a","learning_enroll",{courseId:"formatted-course"}));
  const before=f.db.prepare("SELECT content FROM course_versions WHERE course_id='formatted-course' AND version=1").get()!.content;
  const changed={...course,quiz:{...course.quiz,questions:[{...question,title:"Later title",prompt:"Later **prompt**"}]}};data(f.call("editor","learning_update_course",{courseId:"formatted-course",course:changed}));data(f.call("editor","learning_publish_course",{courseId:"formatted-course"}));assert.equal(f.db.prepare("SELECT content FROM course_versions WHERE course_id='formatted-course' AND version=1").get()!.content,before);
  for(const l of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId})),read=data(f.call("learner-a","learning_get_attempt",{attemptId:at.attemptId},"human"));assert.equal(read.questions[0].title,question.title);assert.equal(read.questions[0].prompt,question.prompt);
  data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:question.id,answer:0},"human"));assert.equal(data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human")).score,100);
  const privateCourse={...course,aiProcessingAllowed:false};data(f.call("editor","learning_create_course",{courseId:"private-formatted",course:privateCourse}));data(f.call("editor","learning_publish_course",{courseId:"private-formatted"}));const privateE=data(f.call("learner-b","learning_enroll",{courseId:"private-formatted"}));for(const l of course.lessons)data(f.call("learner-b","human_complete_lesson",{enrollmentId:privateE.enrollmentId,lessonId:l.id},"human"));const privateA=data(f.call("learner-b","learning_start_attempt",{enrollmentId:privateE.enrollmentId}));const bridge=data(f.call("learner-b","learning_get_attempt",{attemptId:privateA.attemptId}));assert.equal(bridge.contentWithheld,true);assert.equal(JSON.stringify(bridge).includes("Original bold"),false);assert.equal(JSON.stringify(bridge).includes(question.title),false);
 }finally{f.db.close();}
});
