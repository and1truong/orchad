import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {transcriptFixture} from "./transcript-pdf-fixture.ts";
import {CertificateFont,textDocumentPDF} from "../src/server/certificate-pdf.ts";
import {transcriptPDF} from "../src/server/transcript-pdf.ts";
import {createApp} from "../src/server/app.ts";
import {downloadOriginalPDF} from "../src/client/download-pdf.ts";
import type {Session} from "../src/client/api.ts";
const fontBytes=readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),font=new CertificateFont(fontBytes);
test("actual multi-page reader extracts own original Vietnamese ledger and literal markup; deterministic export does not issue completion/certificates or include other learner",()=>{
 const f=transcriptFixture();try{
  const p=f.service.principal("learner-a"),snapshot=data(f.call("learner-a","learning_get_transcript",{})),before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),bytes=transcriptPDF(p,f.service.reports,snapshot.snapshotHash,font),text=execFileSync("pdftotext",["-","-"],{input:bytes,encoding:"utf8"});
  assert.match(text,/Nguyễn Trường/);for(let i=0;i<16;i++)assert.match(text,new RegExp("Nội dung gốc "+i+" <script>literal<\\/script>"));assert.match(text,/in_progress/);assert.match(text,/Version 1/);assert.match(text,/Not accredited/);assert.doesNotMatch(text,/systems-basics|learner-b/);assert.ok(text.split("\f").length>2);assert.deepEqual(transcriptPDF(p,f.service.reports,snapshot.snapshotHash,font),bytes);assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),before);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
 }finally{f.db.close();}
});
test("binary own transcript route enforces epoch/current account/Host and exact own snapshot before sending any PDF",async()=>{
 const f=transcriptFixture(1),origin="http://127.0.0.1:4377",{app}=await createApp({db:f.db,origin,developmentAuth:true,certificateFont:fontBytes});
 const login=async(user:string)=>{const r=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4377",origin},payload:{username:user,password:user+"-dev"}});assert.equal(r.statusCode,200);return {host:"127.0.0.1:4377",cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-pear-epoch":r.json().sessionEpoch};};
 try{
  const headers=await login("learner-a"),hash=data(f.call("learner-a","learning_get_transcript",{})).snapshotHash,url="/api/transcript/pdf?snapshotHash="+hash,response=await app.inject({url,headers});assert.equal(response.statusCode,200,response.body);assert.equal(response.headers["content-type"],"application/pdf");assert.match(response.headers["cache-control"]!,/private.*no-store/);assert.equal(response.headers["x-content-type-options"],"nosniff");assert.equal(response.headers["content-disposition"],'attachment; filename="pear-transcript.pdf"');assert.match(execFileSync("pdftotext",["-","-"],{input:response.rawPayload,encoding:"utf8"}),/Nguyễn Trường/);
  assert.equal((await app.inject({url,headers:{...headers,"x-pear-epoch":"wrong"}})).statusCode,409);assert.equal((await app.inject({url,headers:await login("learner-b")})).statusCode,409);assert.equal((await app.inject({url,headers:{host:"127.0.0.1:4377"}})).statusCode,401);assert.notEqual((await app.inject({url,headers:{...headers,host:"evil.example"}})).statusCode,200);
  data(f.call("learner-a","human_complete_lesson",{enrollmentId:f.entries[0],lessonId:courses["learning-vi"].lessons[0]!.id},"human"));assert.equal((await app.inject({url,headers})).statusCode,409);
  f.db.prepare("UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'").run();assert.equal((await app.inject({url,headers})).statusCode,401);
 }finally{await app.close();f.db.close();}
});
test("font/script/document/page limits fail explicitly, and stale direct principal cannot produce a transcript",()=>{
 assert.throws(()=>textDocumentPDF(["Original","原始"],font,{title:"Original",maxPages:2}),/Latin\/Vietnamese/);assert.throws(()=>textDocumentPDF(["x".repeat(513)],font,{title:"Original",maxPages:2}),/document bounds/);assert.throws(()=>textDocumentPDF(Array(29).fill("Original"),font,{title:"Original",maxPages:1}),/page bounds/);
 const f=transcriptFixture(1);try{const p=f.service.principal("learner-a"),hash=data(f.call("learner-a","learning_get_transcript",{})).snapshotHash;f.db.prepare("UPDATE accounts SET auth_version=auth_version+1 WHERE id='learner-a'").run();assert.throws(()=>transcriptPDF(p,f.service.reports,hash,font),/authority changed/);}finally{f.db.close();}
});
test("detached session during real binary response prevents browser download and never automatically reissues request",async()=>{
 const original=globalThis.fetch,session={principal:{id:"original",tenant:"demo",role:"learner"},csrf:"csrf",sessionEpoch:"epoch"} as Session;let checks=0,calls=0;
 try{globalThis.fetch=async()=>{calls++;return new Response("%PDF-1.7",{headers:{"content-type":"application/pdf"}});};await assert.rejects(()=>downloadOriginalPDF("/api/transcript/pdf?snapshotHash=original","pear-transcript.pdf",session,()=>{if(++checks===2)throw Error("Workspace changed");}),/Workspace changed/);assert.equal(calls,1);assert.equal(checks,2);}finally{globalThis.fetch=original;}
});
