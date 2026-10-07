import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {transcriptFixture} from "./transcript-pdf-fixture.ts";
import {CertificateFont} from "../src/server/certificate-pdf.ts";
import {reportPDF} from "../src/server/report-pdf.ts";
import {freshReport} from "../src/shared/reports.ts";
import {createApp} from "../src/server/app.ts";
const fontBytes=readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),font=new CertificateFont(fontBytes);
function args(f:ReturnType<typeof transcriptFixture>,user="admin",rows="filtered",columns="visible"){
 const p=f.service.principal(user),spec={...freshReport(),title:"Original scoped report",query:"Nội dung gốc",columns:["title","learnerName"] as any};
 const a={spec,rows,columns,snapshotHash:f.service.reports.read(p,"learning_export_report",{spec,rows,columns,offset:0,limit:1}).snapshotHash};return {p,a};
}
test("four exact row/column export scopes produce actual readable PDFs without expanding audience or official state",()=>{
 const f=transcriptFixture(1);try{
  const before=JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all());
  for(const rows of ["filtered","all"])for(const columns of ["visible","all"]){
   const {p,a}=args(f,"admin",rows,columns),bytes=reportPDF(p,f.service.reports,a,font),text=execFileSync("pdftotext",["-","-"],{input:bytes,encoding:"utf8"});
   assert.match(text,/Nội dung gốc 0 <script>literal<\/script>/);assert.match(text,/Nguyễn Trường/);assert.match(text,new RegExp("Rows "+rows+" · Columns "+columns));
   if(rows==="all")assert.match(text,/Reliable systems basics/);else assert.doesNotMatch(text,/Reliable systems basics/);
   if(columns==="visible")assert.doesNotMatch(text,/learnerId:/);else assert.match(text,/learnerId: learner-a/);
   assert.deepEqual(reportPDF(p,f.service.reports,a,font),bytes);
  }
  assert.equal(JSON.stringify(f.db.prepare("SELECT * FROM enrollments ORDER BY id").all()),before);assert.equal(f.db.prepare("SELECT count(*) n FROM certificates").get()!.n,0);
 }finally{f.db.close();}
});
test("manager all export stays in current direct reports, and revoked relationship/scope/roles deny old snapshot",()=>{
 const f=transcriptFixture(1);try{
  const {p,a}=args(f,"manager","all","all"),text=execFileSync("pdftotext",["-","-"],{input:reportPDF(p,f.service.reports,a,font),encoding:"utf8"});assert.match(text,/learnerId: learner-a/);assert.doesNotMatch(text,/learner-b|systems-basics/);
  for(const user of ["learner-a","editor","assessor","outsider"])assert.throws(()=>reportPDF(f.service.principal(user),f.service.reports,a,font),/role required/);
  assert.throws(()=>reportPDF(p,f.service.reports,{...a,spec:{...a.spec,learnerId:"learner-b"}},font),/outside current audience/);
  assert.throws(()=>reportPDF(p,f.service.reports,{...a,rows:"filtered"},font),/scope changed/);
  f.db.prepare("UPDATE accounts SET manager_id=NULL WHERE id='learner-a'").run();assert.throws(()=>reportPDF(p,f.service.reports,a,font),/scope changed/);f.db.prepare("UPDATE accounts SET role='learner' WHERE id='manager'").run();assert.throws(()=>reportPDF(p,f.service.reports,a,font),/authority changed/);
 }finally{f.db.close();}
});
test("real report PDF POST requires current epoch/CSRF/Host/origin and role; mismatched snapshot/scope never returns PDF",async()=>{
 const f=transcriptFixture(1),origin="http://127.0.0.1:4379",{app}=await createApp({db:f.db,origin,developmentAuth:true,certificateFont:fontBytes});
 const login=async(user:string)=>{const r=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4379",origin},payload:{username:user,password:user+"-dev"}});assert.equal(r.statusCode,200);return {host:"127.0.0.1:4379",origin,cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-pear-epoch":r.json().sessionEpoch,"x-csrf-token":r.json().csrf};};
 try{
  const headers=await login("manager"),{a}=args(f,"manager"),send=(payload=a,h=headers)=>app.inject({method:"POST",url:"/api/reports/pdf",headers:h,payload}),response=await send();assert.equal(response.statusCode,200,response.body);assert.equal(response.headers["content-type"],"application/pdf");assert.match(response.headers["cache-control"]!,/private.*no-store/);assert.equal(response.headers["x-content-type-options"],"nosniff");assert.equal(response.headers["content-disposition"],'attachment; filename="pear-report.pdf"');assert.match(execFileSync("pdftotext",["-","-"],{input:response.rawPayload,encoding:"utf8"}),/Nguyễn Trường/);
  assert.equal((await send(a,{...headers,"x-csrf-token":"wrong"})).statusCode,403);assert.equal((await send(a,{...headers,"x-pear-epoch":"wrong"})).statusCode,409);assert.equal((await send(a,{...headers,origin:"https://evil.example"})).statusCode,403);assert.notEqual((await send(a,{...headers,host:"evil.example"})).statusCode,200);assert.equal((await send(a,await login("learner-a"))).statusCode,403);assert.equal((await send({...a,columns:"all"})).statusCode,409);assert.equal((await send({...a,snapshotHash:"guessed"})).statusCode,400);
 }finally{await app.close();f.db.close();}
});
test("strict server export validates duplicate columns, date/scope and document bounds without executing arbitrary inputs",()=>{
 const f=transcriptFixture(1);try{
  const {p,a}=args(f);assert.throws(()=>reportPDF(p,f.service.reports,{...a,spec:{...a.spec,columns:["title","title"]}},font),/duplicate columns/);assert.throws(()=>reportPDF(p,f.service.reports,{...a,rows:"SQL"},font),/exact report export scope/);assert.throws(()=>reportPDF(p,f.service.reports,{...a,spec:{...a.spec,completedFrom:"2026-02-30"}},font),/Invalid UTC report date/);assert.throws(()=>reportPDF(p,f.service.reports,{...a,spec:{...a.spec,title:"原始"}},font),/scope changed/);
 }finally{f.db.close();}
});
