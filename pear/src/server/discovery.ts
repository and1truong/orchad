import {ContentAccess} from "./content-access.ts";
import {TranslationService} from "./translations.ts";
import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {normalize,relevance} from "../shared/discovery.ts";
import {reject,boundedPage} from "./errors.ts";
export class DiscoveryService {
 constructor(readonly db:DatabaseSync){}
 private candidates(p:Principal,source:string){
  return (this.db.prepare("SELECT c.id,c.latest_version AS version,v.content FROM courses c JOIN course_versions v ON v.course_id=c.id AND v.version=c.latest_version WHERE c.tenant=? AND c.state='published' ORDER BY c.id").all(p.tenant) as any[]).filter(row=>new ContentAccess(this.db).visible(p,"course",row.id,JSON.parse(row.content))).map(row=>{
   const c=JSON.parse(row.content),md=c.discovery??{skills:[],industries:[],outcomes:[],accessibility:{features:[],provenance:"author_declared"}};
   const rating=this.db.prepare("SELECT COUNT(*) AS count,AVG(rating) AS average FROM course_feedback WHERE tenant=? AND course_id=? AND version=?").get(p.tenant,row.id,row.version) as any;
   const publication=this.db.prepare("SELECT published_at FROM content_publications WHERE tenant=? AND kind='course' AND content_id=? AND version=?").get(p.tenant,row.id,row.version) as any;
   const policy=this.db.prepare("SELECT endorsed,featured,spotlight,retiring FROM content_curation WHERE tenant=? AND kind='course' AND content_id=?").get(p.tenant,row.id) as any;
   return {identityId:new TranslationService(this.db).identityId(p,"course",row.id),id:row.id,version:row.version,title:c.title,summary:c.summary,topic:c.topic,language:c.language,duration:c.duration,level:c.level,
    provider:c.provider,license:c.license,aiProcessingAllowed:c.aiProcessingAllowed,completionPolicy:c.completionPolicy,
    discovery:{...md,outcomes:source==="bridge"&&!c.aiProcessingAllowed?[]:md.outcomes},outcomesWithheld:source==="bridge"&&!c.aiProcessingAllowed,formats:[...new Set(c.lessons.map((l:any)=>l.kind))],
    rating:{count:Number(rating.count),average:rating.average===null?null:Math.round(rating.average*100)/100},
    publishedAt:publication?.published_at??null,publicationProvenance:publication?.published_at?"pear_transaction":"unknown_legacy",
    curation:{endorsed:!!policy?.endorsed,featured:!!policy?.featured,spotlight:!!policy?.spotlight,retiring:!!policy?.retiring},
    quiz:{passScore:c.quiz.passScore,maxAttempts:c.quiz.maxAttempts,questionCount:c.quiz.questions.length}};
  });
 }
 private text(c:any){return [c.title,c.summary,c.topic,...c.discovery.skills,...c.discovery.outcomes].join(" ");}
 search(p:Principal,a:any,source:string){
  if(a.minDuration&&a.maxDuration&&a.minDuration>a.maxDuration)reject("INVALID_ARGUMENT","Duration range is reversed");
  if(a.publishedSince&&(!/^\d{4}-\d{2}-\d{2}$/.test(a.publishedSince)||
    !Number.isFinite(Date.parse(a.publishedSince+"T00:00:00Z"))||
    new Date(a.publishedSince+"T00:00:00Z").toISOString().slice(0,10)!==a.publishedSince))
    reject("INVALID_ARGUMENT","Use a valid UTC publication date");
  const rows=this.candidates(p,source).map(c=>({...c,relevance:relevance(a.query??"",this.text(c),a.queryMode??"keyword")}))
   .filter(c=>(!a.query||c.relevance.score>0)&&(!a.topic||c.topic===a.topic)&&(!a.language||c.language===a.language)&&
    (!a.level||c.level===a.level)&&(!a.provider||c.provider===a.provider)&&(!a.minDuration||c.duration>=a.minDuration)&&(!a.maxDuration||c.duration<=a.maxDuration)&&
    (!a.skills||a.skills.every((skill:string)=>c.discovery.skills.some((s:string)=>normalize(s)===normalize(skill))))&&
    (!a.industry||c.discovery.industries.some((s:string)=>normalize(s)===normalize(a.industry)))&&
    (!a.format||c.formats.includes(a.format))&&(!a.accessibility||a.accessibility.every((v:string)=>c.discovery.accessibility.features.includes(v)))&&
    (!a.ratingAtLeast||(c.rating.count>0&&c.rating.average!==null&&c.rating.average>=a.ratingAtLeast))&&
    (!a.publishedSince||(c.publishedAt!==null&&c.publishedAt.slice(0,10)>=a.publishedSince))&&
    (!a.promotion||(c.curation as Record<string,boolean>)[a.promotion])&&(a.aiProcessingAllowed===undefined||c.aiProcessingAllowed===a.aiProcessingAllowed));
  const key=a.sort??"relevance",descending=a.descending??(key==="relevance"||key==="rating"||key==="published");
  const value=(c:any)=>key==="relevance"?c.relevance.score:key==="title"?normalize(c.title):key==="rating"?c.rating.average:key==="published"?c.publishedAt:c.duration;
  rows.sort((a,b)=>{const x=value(a),y=value(b);if(x===null)return y===null?a.id.localeCompare(b.id):1;if(y===null)return -1;
    const delta=x<y?-1:x>y?1:0;return delta?(descending?-delta:delta):a.id<b.id?-1:a.id>b.id?1:0;});
  const preferred=a.language??(this.db.prepare("SELECT preferred_language FROM user_profiles WHERE user_id=?").get(p.id) as any)?.preferred_language??"en";
  const identities=new Map<string,(typeof rows)[number]>();
  for(const row of rows){const previous=identities.get(row.identityId);if(!previous||previous.language!==preferred&&row.language===preferred)identities.set(row.identityId,row);}
  const unique=rows.filter(row=>identities.get(row.identityId)===row);
  return {...boundedPage(unique,a.offset??0,a.limit??10),retrieval:a.queryMode==="concepts"?"controlled_concepts_v1":"keyword",
    accessibilityPolicy:"Author-declared metadata, not audited compliance; unknown publication dates never satisfy date filters."};
 }
 read(p:Principal,name:string,a:any,source:string){
  if(name==="learning_compare_courses"){
   if(new Set(a.courseIds).size!==a.courseIds.length)reject("INVALID_ARGUMENT","Compare distinct course IDs");
   const candidates=this.candidates(p,source);
   const rows=a.courseIds.map((id:string)=>{const c=candidates.find(c=>c.id===id);if(!c)reject("NOT_FOUND","Comparison source unavailable");return c;});
   return {items:rows,accessibilityPolicy:"Author-declared; not audited",automaticEnrollment:false};
  }
  const profile=this.db.prepare("SELECT preferred_language,interests FROM user_profiles WHERE user_id=?").get(p.id) as any;
  const interests=JSON.parse(profile?.interests??"[]") as string[],language=profile?.preferred_language??"en";
  const enrolled=new Set((this.db.prepare("SELECT course_id FROM enrollments WHERE tenant=? AND learner=?").all(p.tenant,p.id) as any[]).map(e=>e.course_id));
  const candidates=this.candidates(p,source),enrolledIdentities=new Set(candidates.filter(c=>enrolled.has(c.id)).map(c=>c.identityId));
  const rows=candidates.filter(c=>!enrolledIdentities.has(c.identityId)).map(c=>{
   const matched=interests.filter(interest=>relevance(interest,this.text(c),"concepts").score>0);
   const reasons=[...matched.map(interest=>"Declared interest: "+interest),
     ...(c.language===language?["Preferred language: "+language]:[]),
     ...(c.curation.spotlight?["Organization spotlight"]:[]),...(c.curation.featured?["Organization featured"]:[])];
   return {...c,reasons,sourceIds:[c.id],rankingScore:matched.length*10+(c.language===language?3:0)+(c.curation.spotlight?2:0)+(c.curation.featured?1:0)};
  }).filter(c=>c.reasons.length>0).sort((a,b)=>b.rankingScore-a.rankingScore||(a.id<b.id?-1:a.id>b.id?1:0));
  const seen=new Set<string>(),unique=rows.filter(row=>{if(seen.has(row.identityId))return false;seen.add(row.identityId);return true;});
  return {...boundedPage(unique,a.offset??0,a.limit??10),method:"Explicit profile/organization rules; no inferred skill or market benchmark",
    noMatchReason:rows.length?null:"No currently available not-yet-enrolled content matches declared preferences."};
 }
}
