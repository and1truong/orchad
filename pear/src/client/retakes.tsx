import React,{useState} from "react";
import {translateUI as t} from "./i18n.ts";
export function CourseRetake(p:{enrollmentId:string;busy:boolean;op:(name:string,args:Record<string,unknown>)=>Promise<any>;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;onCreated:()=>void}){
 const [review,setReview]=useState<any>(null),[mode,setMode]=useState("enrolled"),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState("");
 const chosen=review?.options.find((v:any)=>v.mode===mode);
 return <section aria-label={t("Completed course retake")}>
 <button type="button" className="ghost" disabled={p.busy} onClick={()=>void p.run(async()=>{const r=await p.op("human_get_course_retake_options",{enrollmentId:p.enrollmentId});if(p.isCurrent()){setReview(r);setConfirmed(false);setMode(r.options[0]?.mode??"enrolled");setMessage("");}})}>{t("Review course retake")}</button>
 {message&&<p role="status">{message}</p>}
 {review&&<form aria-label={t("Review completed course retake")} onSubmit={e=>{e.preventDefault();if(!chosen?.available||!confirmed)return;void p.run(async()=>{const r=await p.mutate("human_retake_completed_course",{enrollmentId:p.enrollmentId,mode,targetVersion:chosen.version,confirmed:true});if(p.isCurrent()){setReview(null);setMessage(t("Fresh learning record created")+" · v"+r.version);p.onCreated();}});}}>
 <p>{t("A retake creates a new self-directed record. Prior completion, attempts and certificates remain unchanged. Progress, answers, bookings and assignment deadlines are not copied.")}</p>
 {review.existingRetake?<p>{t("A retake already exists. Continue that learning record.")} · v{review.existingRetake.version}</p>:<fieldset disabled={p.busy}>
 <legend>{t("Retake version choice")}</legend><label>{t("Retake course version")}<select aria-label={t("Retake course version")} value={mode} onChange={e=>{setMode(e.target.value);setConfirmed(false);}}>{review.options.map((v:any)=><option key={v.mode} value={v.mode}>{t(v.mode==="enrolled"?"Previously completed version":"Latest published version")} · v{v.version} · {v.title}</option>)}</select></label>
 {!chosen?.available&&<p>{t("This course is not accepting a new learning record.")}</p>}
 <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("I choose this version for a fresh learning record.")}</label><button disabled={!confirmed||!chosen?.available}>{t("Create fresh course retake")}</button>
 </fieldset>}
 <button type="button" className="ghost" onClick={()=>setReview(null)}>{t("Close retake review")}</button>
 </form>}</section>;
}
