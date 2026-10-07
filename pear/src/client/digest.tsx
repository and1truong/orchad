import React,{useState} from "react";
import {translateUI as t} from "./i18n.ts";
export function LearningDigest(p:{busy:boolean;op:(name:string,args?:Record<string,unknown>)=>Promise<any>;isCurrent:()=>boolean}){
 const [minutes,setMinutes]=useState(20),[timeZone,setTimeZone]=useState(()=>Intl.DateTimeFormat().resolvedOptions().timeZone),[data,setData]=useState<any>(null),[pending,setPending]=useState(false),[error,setError]=useState("");
 async function read(){setPending(true);setData(null);setError("");try{const r=await p.op("learning_get_digest",{minutes,timeZone,limit:5});if(p.isCurrent())setData(r);}catch(e){if(p.isCurrent())setError(e instanceof Error?e.message:String(e));}finally{if(p.isCurrent())setPending(false);}}
 return <section className="panel" aria-label={t("My learning digest")}><h2>{t("My learning digest")}</h2>
 <p>{t("Read a bounded next-step digest when you choose. This does not send notifications or update your learning.")}</p>
 <form onSubmit={e=>{e.preventDefault();void read();}}><fieldset disabled={p.busy||pending}>
 <label>{t("Time budget in minutes")}<input aria-label={t("Time budget in minutes")} type="number" min={1} max={1440} required value={minutes} onChange={e=>{setMinutes(Number(e.target.value));setData(null);}}/></label>
 <label>{t("Digest time zone")}<input aria-label={t("Digest time zone")} required maxLength={100} value={timeZone} onChange={e=>{setTimeZone(e.target.value);setData(null);}}/></label>
 <button>{t("Read my digest")}</button></fieldset></form>
 {error&&<p role="alert">{error}</p>}
 {data&&<div aria-label={t("Digest results")}><p>{data.timeZone} · {data.unreadNotificationCount} {t("unread notifications")}</p>
 {data.items.map((x:any)=><article key={x.kind+":"+(x.enrollmentId??x.awardEnrollmentId??x.id)}><h3>{x.title}</h3><p>{x.kind} · {x.id} · {t("Version")} {x.version}</p><p>{x.reason}</p>
 {x.dueLocal&&<p>{x.overdue?t("Overdue"):t("Due")}: {x.dueLocal} ({data.timeZone})</p>}
 {x.intendedMinutes!==null&&<p>{t("Intended duration")}: {x.intendedMinutes} {t("minutes")}; {x.fitsWholeContentBudget?t("within whole-content budget"):t("longer than whole-content budget")}</p>}
 <p>{t(x.action==="open_lesson"?"Continue next eligible lesson":x.action==="review_assessment"?"Review official assessment":x.action==="open_award"?"Review award requirements":"Preview recommended course")}</p></article>)}
 {data.noMatchReason&&<p>{data.noMatchReason}</p>}{data.morePending&&<p>{t("More learning is available in your full learning lists.")}</p>}
 <p>{t("Intended duration is not remaining time, observed study or mastery. Official assessment and completion stay in the human learning controls.")}</p></div>}
 </section>;
}
