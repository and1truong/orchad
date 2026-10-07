import React,{useState} from "react";
import {translateUI as t} from "./i18n.ts";
type Props={busy:boolean;op:(name:string,args:Record<string,unknown>)=>Promise<any>;isCurrent:()=>boolean};
export function OwnInsights(p:Props){
 const [data,setData]=useState<any>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 async function read(offset=0){
  setLoading(true);setError("");try{const result=await p.op("learning_get_my_insights",{offset,limit:10,...(offset&&data?{snapshotHash:data.snapshotHash}:{})});if(p.isCurrent())setData(result);}catch(e){if(p.isCurrent()){setData(null);setError(e instanceof Error?e.message:String(e));}}finally{if(p.isCurrent())setLoading(false);}
 }
 return <section className="panel" aria-label={t("My learning insights")}><h2>{t("My learning insights")}</h2>
 <p>{t("Read your own learning ledger and author-declared skill exposure. These counts do not assess proficiency or compare you with other people.")}</p>
 <button disabled={p.busy||loading} onClick={()=>void read()}>{t("Read my learning insights")}</button>{error&&<p role="alert">{error}</p>}
 {data&&<div aria-label={t("Own insight results")}><dl>
 {[
 ["Learning records",data.summary.enrollmentRecords],["Official course completions",data.summary.officialCourseCompletions],["Self-confirmed reading completions",data.summary.selfConfirmedItemCompletions],["Award completions",data.summary.awardCompletions],["Overdue learning records",data.summary.overdueRecords],
 ["Declared full-course minutes",data.summary.intendedCourseMinutes],["Observed timer seconds",data.summary.observedSeconds],["Records with a recorded timer",data.summary.recordsWithTimer],["Content records without skill tags",data.summary.untaggedContentRecords]
 ].map(([label,value])=><React.Fragment key={String(label)}><dt>{t(String(label))}</dt><dd>{value}</dd></React.Fragment>)}</dl>
 <p>{t("Duration is intended full-course time. Timers record opt-in intervals, not attention. Standalone reading is learner-confirmed. Skill tags are author declarations, not mastery.")}</p>
 <h3>{t("Declared skill exposure")}</h3>
 {data.items.map((row:any)=><article key={row.skill}><h4>{row.skill}</h4><p>{row.enrollmentRecords} {t("tagged learning records")} · {row.completedRecords} {t("completed tagged records")}</p>
 <ul>{row.examples.map((e:any)=><li key={e.kind+e.enrollmentId}>{e.title} · {t("Version")} {e.version} · {e.status} · {e.contentId}</li>)}</ul>{row.enrollmentRecords>row.examples.length&&<p>{t("Showing up to five pinned source examples.")}</p>}</article>)}
 <button disabled={p.busy||loading||data.offset===0} onClick={()=>void read(Math.max(0,data.offset-10))}>{t("Previous skills")}</button><button disabled={p.busy||loading||data.nextOffset===null} onClick={()=>void read(data.nextOffset)}>{t("Next skills")}</button>
 <p>{t("No external benchmark, accredited issuer or skill proficiency measurement is available.")}</p></div>}</section>;
}
