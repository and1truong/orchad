import type {DatabaseSync} from "node:sqlite";
import type {Principal,Course,Question} from "../shared/model.ts";
import {canonical} from "@orchard/bridge-contract";
import {validateQuestion} from "./assessments.ts";
import {ContentAccess} from "./content-access.ts";
import {boundedPage,reject} from "./errors.ts";
type Bank={title:string;access:"tenant"|"author";aiProcessingAllowed:boolean;questions:Question[]};
export class QuestionBankService{
 constructor(readonly db:DatabaseSync){}
 private live(p:Principal){
  const live=this.db.prepare("SELECT tenant,role,active,auth_version FROM accounts WHERE id=?").get(p.id) as any;
  if(!live?.active||live.tenant!==p.tenant||live.auth_version!==p.auth_version||live.role!==p.role)reject("UNAUTHORIZED","Question bank authority changed");
  if(!["admin","content_admin"].includes(live.role))reject("FORBIDDEN","Question bank author required");
 }
 private row(p:Principal,id:string){
  this.live(p);
  const row=this.db.prepare("SELECT * FROM question_banks WHERE id=? AND tenant=?").get(id,p.tenant) as any;
  if(!row)reject("NOT_FOUND","Scoped question bank unavailable");
  const latest=this.version(row,row.latest_version);
  if(p.role!=="admin"&&row.owner!==p.id&&latest.access==="author")reject("NOT_FOUND","Question bank outside author audience");
  return row;
 }
 private version(row:any,version:number):Bank{
  const value=this.db.prepare("SELECT content FROM question_bank_versions WHERE bank_id=? AND version=?").get(row.id,version) as any;
  if(!value)reject("NOT_FOUND","Question bank version unavailable");return JSON.parse(value.content);
 }
 private readable(p:Principal,row:any,version:number){const bank=this.version(row,version);if(p.role!=="admin"&&bank.access==="author"&&row.owner!==p.id)reject("NOT_FOUND","Private bank version unavailable");return bank;}
 authorize(p:Principal,name:string,a:any){
  if(name.startsWith("learning_")&&["learning_get_question_bank","learning_save_question_bank","learning_retire_question_bank","learning_apply_question_bank"].includes(name)){
   if(!["admin","content_admin"].includes(p.role))reject("FORBIDDEN","Question bank author required");
   if(name==="learning_save_question_bank"&&!this.db.prepare("SELECT 1 FROM question_banks WHERE id=?").get(a.bankId))return;
   const row=this.row(p,name==="learning_apply_question_bank"?a.source.bankId:a.bankId);
   if(["learning_save_question_bank","learning_retire_question_bank"].includes(name)&&p.role!=="admin"&&row.owner!==p.id)reject("FORBIDDEN","Question bank original owner required");
   if(name==="learning_apply_question_bank")this.selected(p,a.source,a.courseId);
  }
 }
 read(p:Principal,name:string,a:any,source:string){
  this.live(p);
  if(name==="learning_get_question_banks"){
   const rows=(this.db.prepare("SELECT * FROM question_banks WHERE tenant=? ORDER BY id").all(p.tenant) as any[]).flatMap(row=>{
    const latest=this.version(row,row.latest_version);if(p.role!=="admin"&&row.owner!==p.id&&latest.access==="author")return [];
    return [{id:row.id,owner:row.owner,state:row.state,version:row.latest_version,title:latest.title,access:latest.access,aiProcessingAllowed:latest.aiProcessingAllowed,questionCount:latest.questions.length,questionIds:latest.questions.map(q=>q.id)}];
   });return boundedPage(rows,a.offset??0,a.limit??20);
  }
  const row=this.row(p,a.bankId),version=a.version??row.latest_version,bank=this.readable(p,row,version);
  return source==="bridge"&&!bank.aiProcessingAllowed?{id:row.id,version,title:bank.title,questionIds:bank.questions.map(q=>q.id),aiProcessingAllowed:false,contentWithheld:true}:{id:row.id,version,state:row.state,...bank};
 }
 selected(p:Principal,ref:{bankId:string;version:number;questionIds:string[]},courseId:string){
  const row=this.row(p,ref.bankId),bank=this.readable(p,row,ref.version);
  if(row.state!=="published")reject("FORBIDDEN","Question bank is retired for new draft use");
  const course=this.db.prepare("SELECT draft FROM courses WHERE id=? AND tenant=?").get(courseId,p.tenant) as any;
  if(!course)reject("NOT_FOUND","Question bank course draft unavailable");
  const draft=JSON.parse(course.draft),access=new ContentAccess(this.db);access.author(p,"course",courseId,draft);
  if(bank.access==="author"&&(draft.access!=="author"||access.owner(p,"course",courseId)!==row.owner))reject("FORBIDDEN","Private bank cannot be redistributed to a wider course audience");
  if(new Set(ref.questionIds).size!==ref.questionIds.length)reject("INVALID_ARGUMENT","Distinct bank question IDs required");
  const questions=ref.questionIds.map(id=>bank.questions.find(q=>q.id===id));if(questions.some(q=>!q))reject("INVALID_ARGUMENT","Question ID missing from selected bank version");
  return {bank,questions:structuredClone(questions as Question[])};
 }
 resolve(p:Principal,c:Course,courseId?:string){
  const ref=c.quiz.questionBankRef;if(!ref)return;
  if(!courseId)reject("INVALID_ARGUMENT","Create the course draft before applying a question bank");
  const {bank,questions}=this.selected(p,ref,courseId!);
  const owner=new ContentAccess(this.db).owner(p,"course",courseId!);
  if(bank.access==="author"&&(c.access!=="author"||owner!==this.row(p,ref.bankId).owner))reject("FORBIDDEN","Private bank requires the same owned author course audience");
  if(canonical(c.quiz.questions)!==canonical(questions))reject("INVALID_ARGUMENT","Pinned bank questions differ; explicitly detach the bank before manual edits");
  c.aiProcessingAllowed=c.aiProcessingAllowed&&bank.aiProcessingAllowed;
 }
 write(p:Principal,name:string,a:any){
  this.live(p);
  if(name==="learning_retire_question_bank"){const row=this.row(p,a.bankId);this.db.prepare("UPDATE question_banks SET state='retired' WHERE id=?").run(row.id);return {bankId:row.id,state:"retired",existingSnapshotsPreserved:true};}
  if(name!=="learning_save_question_bank")reject("UNSUPPORTED","Unknown question bank write");
  const bank=structuredClone(a.bank) as Bank;
  if(a.sourceCourseId){
   const source=this.db.prepare("SELECT draft FROM courses WHERE id=? AND tenant=?").get(a.sourceCourseId,p.tenant) as any;
   if(!source)reject("NOT_FOUND","Question bank source course unavailable");
   const draft=JSON.parse(source.draft);new ContentAccess(this.db).author(p,"course",a.sourceCourseId,draft);
   if(["author","groups"].includes(draft.access)&&bank.access!=="author")reject("FORBIDDEN","Private source questions require a private bank");
   if(canonical(bank.questions)!==canonical(draft.quiz.questions))reject("INVALID_ARGUMENT","Source draft questions changed; review the source again");
   bank.aiProcessingAllowed=bank.aiProcessingAllowed&&draft.aiProcessingAllowed;
  }
  for(const q of bank.questions)validateQuestion(q);
  if(new Set(bank.questions.map(q=>q.id)).size!==bank.questions.length||Buffer.byteLength(JSON.stringify(bank))>32*1024)reject("INVALID_ARGUMENT","Distinct bounded bank questions required");
  let row=this.db.prepare("SELECT * FROM question_banks WHERE id=?").get(a.bankId) as any;
  if(row){this.authorize(p,name,a);if(row.latest_version>=100)reject("INVALID_ARGUMENT","Bank version history limit reached");}
  else{
   if((this.db.prepare("SELECT COUNT(*) AS n FROM question_banks WHERE tenant=?").get(p.tenant) as any).n>=128)reject("INVALID_ARGUMENT","Question bank quota reached");
   this.db.prepare("INSERT INTO question_banks VALUES(?,?,?,'published',0)").run(a.bankId,p.tenant,p.id);row={id:a.bankId,latest_version:0};
  }
  const version=row.latest_version+1;this.db.prepare("INSERT INTO question_bank_versions VALUES(?,?,?)").run(row.id,version,JSON.stringify(bank));this.db.prepare("UPDATE question_banks SET latest_version=?,state='published' WHERE id=?").run(version,row.id);
  return {bankId:row.id,version,questionCount:bank.questions.length,state:"published"};
 }
}
