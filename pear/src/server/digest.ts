import type {DatabaseSync} from "node:sqlite";
import type {Principal,Course} from "../shared/model.ts";
import {requiredLessonIds} from "../shared/progression.ts";
import {DiscoveryService} from "./discovery.ts";
import {reject} from "./errors.ts";
export class DigestService{
 constructor(readonly db:DatabaseSync,readonly now=()=>new Date()){}
 read(p:Principal,a:any,source:string){
  const timeZone=a.timeZone??"UTC",minutes=a.minutes??20,limit=a.limit??5;
  try{new Intl.DateTimeFormat("en",{timeZone}).format(new Date());}catch{reject("INVALID_ARGUMENT","Use a recognized IANA time zone");}
  const now=this.now(),generatedAt=now.toISOString();
  const deadline=(value:string|null)=>value?{dueAt:value,dueLocal:new Intl.DateTimeFormat("en",{timeZone,dateStyle:"medium",timeStyle:"short"}).format(new Date(value)),overdue:value<generatedAt}:{dueAt:null,dueLocal:null,overdue:false};
  const courses=this.db.prepare("SELECT e.*,v.content FROM enrollments e JOIN course_versions v ON v.course_id=e.course_id AND v.version=e.version JOIN courses c ON c.id=e.course_id AND c.tenant=e.tenant WHERE e.learner=? AND e.tenant=? AND e.status!='completed' AND e.assignment_state='active' ORDER BY e.due_date IS NULL,e.due_date,e.assigned_by IS NULL,e.id LIMIT 6").all(p.id,p.tenant) as any[];
  const awards=this.db.prepare("SELECT e.*,v.content,cy.due_date FROM award_enrollments e JOIN collection_versions v ON v.collection_id=e.award_id AND v.version=e.version JOIN collections c ON c.id=e.award_id AND c.tenant=e.tenant LEFT JOIN assignment_cycles cy ON cy.id=e.assignment_cycle_id WHERE e.learner=? AND e.tenant=? AND e.completed_at IS NULL AND e.assignment_state='active' ORDER BY cy.due_date IS NULL,cy.due_date,e.assigned_by IS NULL,e.id LIMIT 6").all(p.id,p.tenant) as any[];
  const items:any[]=[
   ...courses.map(e=>{
    const content=JSON.parse(e.content) as Course,done=JSON.parse(e.completed_lessons) as string[];
    const lesson=content.lessons.find(l=>!done.includes(l.id)&&requiredLessonIds(content,l).every(id=>done.includes(id)));
    return {kind:"course",id:e.course_id,enrollmentId:e.id,version:e.version,title:content.title,source:e.assigned_by?"assigned":"self",...deadline(e.due_date),intendedMinutes:content.duration,remainingMinutes:null,fitsWholeContentBudget:content.duration<=minutes,action:lesson?"open_lesson":"review_assessment",lessonId:lesson?.id??null,reason:lesson?"First incomplete lesson with satisfied prerequisites":"Review the official assessment in the human player"};
   }),
   ...awards.map(e=>{const c=JSON.parse(e.content);return {kind:"award",id:e.award_id,awardEnrollmentId:e.id,version:e.version,title:c.title,source:e.assigned_by?"assigned":"self",...deadline(e.due_date??null),intendedMinutes:null,remainingMinutes:null,fitsWholeContentBudget:null,action:"open_award",reason:"Review your pinned requirements and evidence status; credits are not inferred from this digest"};})
  ];
  const rank=(x:any)=>x.overdue?0:x.dueAt?1:x.source==="assigned"?2:3;
  items.sort((x,y)=>rank(x)-rank(y)||(x.dueAt??"9999").localeCompare(y.dueAt??"9999")||x.kind.localeCompare(y.kind)||x.id.localeCompare(y.id)||String(x.enrollmentId??x.awardEnrollmentId).localeCompare(String(y.enrollmentId??y.awardEnrollmentId)));
  const profile=this.db.prepare("SELECT preferred_language FROM user_profiles WHERE user_id=?").get(p.id) as any;
  const recommended=new DiscoveryService(this.db).read(p,"learning_get_recommendations",{limit:10},source);
  const candidates=recommended.items.filter((x:any)=>x.duration<=minutes);
  const steps=items.slice(0,limit);
  for(const c of candidates){if(steps.length===limit)break;steps.push({kind:"recommendation",id:c.id,version:c.version,title:c.title,source:"declared_preferences",intendedMinutes:c.duration,remainingMinutes:null,fitsWholeContentBudget:true,action:"preview_course",reason:c.reasons.join("; "),dueAt:null,dueLocal:null,overdue:false});}
  const unread=this.db.prepare("SELECT COUNT(*) AS n FROM learning_notifications WHERE learner=? AND tenant=? AND read_at IS NULL").get(p.id,p.tenant)!.n;
  return {generatedAt,timeZone,budgetMinutes:minutes,preferredLanguage:profile?.preferred_language??"en",items:steps,morePending:items.length>limit||courses.length===6||awards.length===6,unreadNotificationCount:unread,noMatchReason:steps.length?null:"No active learning or budget-fitting match among the first ten declared-preference recommendations.",policy:"On-demand own learner metadata only. Intended duration is not remaining time, observed study or mastery. No automated delivery, scheduling, enrollment, acknowledgment, completion or official grading.",recommendationWindow:10};
 }
}
