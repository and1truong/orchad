import React,{useState} from "react";
import {translateUI as t} from "./i18n.ts";
export function QuizUpgrade(p:{enrollmentId:string;busy:boolean;op:(name:string,args:Record<string,unknown>)=>Promise<any>;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;onCreated:()=>void}){
 const [review,setReview]=useState<any>(null),[confirmed,setConfirmed]=useState(false);
 return <section aria-label={t("Latest objective quiz review")}><button type="button" disabled={p.busy} onClick={()=>void p.run(async()=>{const r=await p.op("human_get_latest_quiz_options",{enrollmentId:p.enrollmentId});if(p.isCurrent()){setReview(r);setConfirmed(false);}})}>{t("Review latest objective quiz")}</button>
 {review&&<form aria-label={t("Review quiz version change")} onSubmit={event=>{event.preventDefault();if(!review.available||!confirmed)return;void p.run(async()=>{await p.mutate("human_restart_latest_quiz",{enrollmentId:p.enrollmentId,targetVersion:review.targetVersion,confirmed:true});if(p.isCurrent()){setReview(null);p.onCreated();}});}}>
 <p>{t("Keep the enrolled version, or explicitly restart the latest objective quiz. Identical completed lessons are retained in a new record; answers reset and prior attempts remain in withdrawn history.")}</p>
 <p>v{review.originalVersion} → v{review.targetVersion} · {review.completedLessonCount} {t("identical completed lessons")}</p>
 {!review.available&&<p>{t("Quiz-only upgrade unavailable. Assigned learning, essays, events, submissions and changes outside the quiz require a separate reviewed workflow.")}</p>}
 <label><input type="checkbox" disabled={!review.available||p.busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{t("I choose the latest objective quiz and reset my answers.")}</label><button disabled={!review.available||!confirmed||p.busy}>{t("Restart with latest objective quiz")}</button><button type="button" onClick={()=>setReview(null)}>{t("Keep enrolled quiz version")}</button>
 </form>}</section>;
}
