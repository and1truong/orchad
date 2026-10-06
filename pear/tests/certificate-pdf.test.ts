import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {createApp} from "../src/server/app.ts";
import {CertificateFont,certificatePDF} from "../src/server/certificate-pdf.ts";
const fontBytes=readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),font=new CertificateFont(fontBytes);
function complete(){
 const f=fixture(),course={...structuredClone(courses["learning-vi"]),title:"Kiến thức gốc <script>không chạy</script>"};
 f.db.prepare("UPDATE accounts SET name='Nguyễn Trường' WHERE id='learner-a'").run();
 data(f.call("editor","learning_create_course",{courseId:"pdf-course",course}));data(f.call("editor","learning_publish_course",{courseId:"pdf-course"}));const e=data(f.call("learner-a","learning_enroll",{courseId:"pdf-course"}));for(const l of course.lessons)data(f.call("learner-a","human_complete_lesson",{enrollmentId:e.enrollmentId,lessonId:l.id},"human"));const at=data(f.call("learner-a","learning_start_attempt",{enrollmentId:e.enrollmentId}));for(const q of course.quiz.questions)data(f.call("learner-a","human_save_answer",{attemptId:at.attemptId,questionId:q.id,answer:q.correct},"human"));data(f.call("learner-a","human_submit_attempt",{attemptId:at.attemptId,confirmed:true},"human"));const id=f.db.prepare("SELECT id FROM certificates WHERE enrollment_id=?").get(e.enrollmentId)!.id as string;return {...f,id};
}
test("actual PDF reader extracts original Vietnamese learner/title and literal markup; identical authoritative certificate produces identical bounded bytes",()=>{
 const f=complete();try{
  const c=f.service.certificate("learner-a",f.id),before=f.db.prepare("SELECT * FROM attempts").all(),bytes=certificatePDF(c,false,font),text=execFileSync("pdftotext",["-","-"],{input:bytes,encoding:"utf8"});assert.ok(bytes.length<4*1024*1024);assert.equal(bytes.subarray(0,8).toString(),"%PDF-1.7");assert.match(text,/Nguyễn Trường/);assert.match(text,/Kiến thức gốc <script>không chạy<\/script>/);assert.match(text,/Not accredited/);assert.match(text,new RegExp(f.id));assert.deepEqual(certificatePDF(c,false,font),bytes);assert.deepEqual(f.db.prepare("SELECT * FROM attempts").all(),before);assert.throws(()=>f.service.certificate("learner-b",f.id));
 }finally{f.db.close();}
});
test("trusted font validation rejects malformed/restricted embedding; unsupported script is explicit instead of silent transliteration",()=>{
 assert.throws(()=>new CertificateFont(Buffer.alloc(100)));assert.throws(()=>new CertificateFont(Buffer.alloc(2*1024*1024+1)));
 const restricted=Buffer.from(fontBytes),n=restricted.readUInt16BE(4);for(let i=0;i<n;i++){const at=12+i*16;if(restricted.toString("ascii",at,at+4)==="OS/2")restricted.writeUInt16BE(2,restricted.readUInt32BE(at+8)+8);}assert.throws(()=>new CertificateFont(restricted),/forbids/);
 assert.throws(()=>certificatePDF({learnerName:"Original",title:"原始",version:1,issued_at:"2026-10-06",id:"original",issuer:"Pear"},false,font),/Latin\/Vietnamese/);
});
test("authenticated binary PDF route checks owner, live account, Host/session and configured font before export; reads do not change official state",async()=>{
 const f=complete(),origin="http://127.0.0.1:4370",{app}=await createApp({db:f.db,origin,developmentAuth:true,certificateFont:fontBytes});
 async function login(user:string){const r=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4370",origin},payload:{username:user,password:user+"-dev"}});assert.equal(r.statusCode,200);return {host:"127.0.0.1:4370",cookie:String(r.headers["set-cookie"]).split(";")[0]!,"x-pear-epoch":r.json().sessionEpoch};}
 try{
  const headers=await login("learner-a"),url="/api/certificates/"+f.id+"/pdf",before=f.db.prepare("SELECT * FROM certificates").all(),response=await app.inject({url,headers});
  assert.equal(response.statusCode,200,response.body);assert.equal(response.headers["content-type"],"application/pdf");assert.match(response.headers["content-disposition"]!,/attachment/);assert.match(response.headers["cache-control"]!,/no-store/);assert.match(execFileSync("pdftotext",["-","-"],{input:response.rawPayload,encoding:"utf8"}),/Nguyễn Trường/);assert.deepEqual(f.db.prepare("SELECT * FROM certificates").all(),before);
  assert.equal((await app.inject({url,headers:{...headers,"x-pear-epoch":"wrong"}})).statusCode,409);
  assert.equal((await app.inject({url,headers:await login("learner-b")})).statusCode,403);assert.equal((await app.inject({url,headers:{host:"127.0.0.1:4370"}})).statusCode,401);assert.notEqual((await app.inject({url,headers:{...headers,host:"evil.example"}})).statusCode,200);
  f.db.prepare("UPDATE accounts SET active=0,auth_version=auth_version+1 WHERE id='learner-a'").run();assert.equal((await app.inject({url,headers})).statusCode,401);
 }finally{await app.close();f.db.close();}
});
test("custom award PDF contains actual authoritative earned quantity, original unit label and explicit synthetic issuer",()=>{
 const f=fixture();try{
  const award={title:"Chứng chỉ thực hành gốc",summary:"Original",access:"tenant",unit:"custom",unitSingular:"giờ thực hành",unitPlural:"giờ thực hành",target:2,ongoing:false,moderatedExternal:false,requirements:[{id:"practice",title:"Practice",required:true,credits:2,alternatives:[{kind:"external",id:"original-proof"}]}]};data(f.call("editor","learning_save_award",{collectionId:"pdf-award",award}));data(f.call("editor","learning_publish_collection",{collectionId:"pdf-award"}));const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"pdf-award"}));data(f.call("learner-a","human_submit_external_record",{awardEnrollmentId:e.awardEnrollmentId,criterionPath:"practice",amount:2,evidence:"Original explicit self attestation",confirmed:true},"human"));const id=f.db.prepare("SELECT certificate_id FROM award_enrollments WHERE id=?").get(e.awardEnrollmentId)!.certificate_id as string,c=f.service.programs.certificate(f.service.principal("learner-a"),id),text=execFileSync("pdftotext",["-","-"],{input:certificatePDF(c,true,font),encoding:"utf8"});assert.match(text,/Earned 2 giờ thực hành/);assert.match(text,/Chứng chỉ thực hành gốc/);assert.match(text,/Pear synthetic development portal/);assert.match(text,/Not accredited/);
 }finally{f.db.close();}
});

test("production without an explicitly configured font keeps JSON/text proof and denies PDF without guessing a system font",async()=>{
 const f=complete(),origin="http://127.0.0.1:4370",dev=await createApp({db:f.db,origin,developmentAuth:true});let production:any;
 try{
  const login=await dev.app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4370",origin},payload:{username:"learner-a",password:"learner-a-dev"}});assert.equal(login.statusCode,200);const headers={host:"127.0.0.1:4370",cookie:String(login.headers["set-cookie"]).split(";")[0]!,"x-pear-epoch":login.json().sessionEpoch};await dev.app.close();production=(await createApp({db:f.db,origin})).app;
  const json=await production.inject({url:"/api/certificates/"+f.id,headers});assert.equal(json.statusCode,200,json.body);assert.equal(json.json().pdfAvailable,false);const pdf=await production.inject({url:"/api/certificates/"+f.id+"/pdf",headers});assert.equal(pdf.statusCode,403);assert.match(pdf.json().error.message,/not configured/);
 }finally{if(production)await production.close();else await dev.app.close();f.db.close();}
});
