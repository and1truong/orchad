import React,{useEffect,useState} from "react";
import {request,type Session} from "./api.ts";
import {translateUI as t} from "./i18n.ts";
export function ExternalActivity(p:{session:Session;busy:boolean;isCurrent:()=>boolean;tick:number}){
 const [page,setPage]=useState<any>(null),[offset,setOffset]=useState(0),[error,setError]=useState("");
 useEffect(()=>{let active=true;void request<any>("/api/external-activity?offset="+offset,p.session).then(r=>{if(active&&p.isCurrent()){setPage(r);setError("");}}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[offset,p.tick]);
 return <section className="panel" aria-label={t("External reported activity")}><h2>{t("External reported activity")}</h2>
 <p>{t("Connector-reported completion, success, score and duration are separate from Pear official completion, assessment score, observed timers and award credit.")}</p>
 {error&&<p role="alert">{error}</p>}{page?.items.length===0&&<p>{t("No external reported activity is available.")}</p>}
 {page?.items.map((row:any)=><article key={row.courseId+row.version+row.registration}><h3>{row.courseId} · v{row.version}</h3>
 <p>{t("Reported completion")}: {row.reportedCompletion===null?t("Unknown"):row.reportedCompletion?t("Yes"):t("No")} · {t("Reported success")}: {row.reportedSuccess===null?t("Unknown"):row.reportedSuccess?t("Yes"):t("No")}</p>
 <p>{t("Reported score")}: {row.reportedScore?JSON.stringify(row.reportedScore):t("Unknown")} · {t("Reported duration")}: {row.reportedDuration??t("Unknown")}</p>
 <p>{t("External registration")}: {row.registration} · {t("Statement count")}: {row.statementCount} · {row.lastTimestamp}</p></article>)}
 <button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{t("Previous external activity")}</button><button disabled={p.busy||page?.nextOffset==null} onClick={()=>setOffset(page.nextOffset)}>{t("Next external activity")}</button>
 </section>;
}
