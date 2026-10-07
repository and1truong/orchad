import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {createHash} from "node:crypto";
import {ReportService} from "./reports.ts";
import {boundedPage,reject} from "./errors.ts";
export class InsightService{
 constructor(readonly db:DatabaseSync){}
 read(p:Principal,a:{offset?:number;limit?:number;snapshotHash?:string}){
  const ledger=new ReportService(this.db).ownLedger(p),skills=new Map<string,any>();
  let untaggedContentRecords=0,recordsWithTimer=0,observedMilliseconds=0,intendedCourseMinutes=0;
  const snapshotRecords=ledger.map(r=>{
   if(r.kind==="award")return {...r,skills:[]};
   const value=JSON.parse(String(this.db.prepare(r.kind==="course"?"SELECT content FROM course_versions WHERE course_id=? AND version=?":"SELECT content FROM content_item_versions WHERE item_id=? AND version=?").get(r.contentId,r.version)!.content));
   const tags=[...new Map((value.discovery?.skills??[]).map((label:string)=>[label.normalize("NFKC").trim().toLowerCase(),label.trim()])).entries()] as [string,string][];
   if(!tags.length)untaggedContentRecords++;
   const measured=this.db.prepare("SELECT elapsed_ms FROM study_totals WHERE tenant=? AND learner=? AND kind=? AND target_id=?").get(p.tenant,p.id,r.kind,r.id) as any;
   if(measured){recordsWithTimer++;observedMilliseconds+=measured.elapsed_ms;}
   if(r.kind==="course")intendedCourseMinutes+=r.estimatedMinutes??0;
   for(const [key,label]of tags){
    let skill=skills.get(key);if(!skill){skill={skill:label,key,enrollmentRecords:0,completedRecords:0,openRecords:0,examples:[],exampleLimit:5,provenance:"author_declared_content_tags",mastery:null};skills.set(key,skill);}
    skill.enrollmentRecords++;if(r.status==="completed")skill.completedRecords++;if(["in_progress","overdue"].includes(r.status))skill.openRecords++;
    if(skill.examples.length<5)skill.examples.push({kind:r.kind,contentId:r.contentId,version:r.version,enrollmentId:r.id,title:r.title,status:r.status});
   }
   return {...r,skills:tags.map(([key,label])=>({key,label})),timerRecorded:!!measured};
  });
  const rows=[...skills.values()].sort((x,y)=>y.completedRecords-x.completedRecords||y.enrollmentRecords-x.enrollmentRecords||x.key.localeCompare(y.key)).map(({key,...row})=>row);
  const summary={
   enrollmentRecords:ledger.length,distinctContentIdentities:new Set(ledger.map(r=>r.kind+":"+r.contentId)).size,
   courseRecords:ledger.filter(r=>r.kind==="course").length,officialCourseCompletions:ledger.filter(r=>r.kind==="course"&&r.status==="completed").length,
   selfConfirmedItemCompletions:ledger.filter(r=>r.kind==="item"&&r.status==="completed").length,
   awardCompletions:ledger.filter(r=>r.kind==="award"&&r.status==="completed").length,
   openRecords:ledger.filter(r=>["in_progress","overdue"].includes(r.status)).length,overdueRecords:ledger.filter(r=>r.status==="overdue").length,
   intendedCourseMinutes,observedSeconds:Math.floor(observedMilliseconds/1000),recordsWithTimer,untaggedContentRecords,declaredSkillCount:rows.length,
  };
  const snapshotHash=createHash("sha256").update(JSON.stringify({tenant:p.tenant,principal:p.id,authVersion:p.auth_version,records:snapshotRecords,summary,rows})).digest("hex");
  if(a.snapshotHash&&a.snapshotHash!==snapshotHash)reject("STALE_CONTEXT","Own insight ledger changed; refresh the first page");
  return {...boundedPage(rows,a.offset??0,a.limit??20),summary,snapshotHash,definitions:{
   enrollmentRecords:"Own versioned learning records, including recurring cycles; not unique people or unique content.",
   officialCourseCompletions:"Course completions committed by Pear under the pinned human learning and assessment policy.",
   selfConfirmedItemCompletions:"Standalone reading confirmed by the learner; not official course assessment or mastery.",
   awardCompletions:"Completions of pinned synthetic award requirements; ongoing incomplete awards remain open.",
   skillExposure:"Counts own course/item enrollment records tagged by their pinned content author. No skill proficiency or mastery is inferred.",
   intendedCourseMinutes:"Sum of declared full-course durations per enrollment record; not elapsed or remaining time.",
   observedSeconds:"Sum of recorded opt-in server timer intervals for own course/item records; not verified attention.",
  },limitations:["Author-declared skills only; missing tags are counted explicitly.","No licensed external benchmark, skill assessment, accreditation or inferred proficiency.","External xAPI/SCORM reported results are excluded from these official ledger metrics."],generatedAt:new Date().toISOString()};
 }
}
