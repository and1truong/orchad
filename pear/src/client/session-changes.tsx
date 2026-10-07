import React,{useEffect,useState} from "react";
import {translateUI as t} from "./i18n.ts";
type Ops={busy:boolean;tick:number;op:(name:string,args:Record<string,unknown>)=>Promise<any>;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean};
export function SessionNotices(p:Ops){
 const [rows,setRows]=useState<any[]>([]),[offset,setOffset]=useState(0),[next,setNext]=useState<number|null>(null),[error,setError]=useState("");
 useEffect(()=>{let live=true;void p.op("learning_get_session_notices",{offset,limit:20}).then(r=>{if(live&&p.isCurrent()){setRows(r.items);setNext(r.nextOffset);setError("");}}).catch(e=>{if(live&&p.isCurrent())setError(e.message);});return()=>{live=false;};},[p.tick,offset]);
 return <section className="panel" aria-label={t("Session change notices")}><h2>{t("Session change notices")}</h2>
 <p>{t("Changed sessions cancel previous bookings. Choose an available session to book again; attendance and credit remain unchanged.")}</p>
 {error&&<p role="alert">{error}</p>}
 {rows.map(r=><article key={r.id}><h3>{r.data.title}</h3><p>{t(r.kind==="cancel"?"Session cancelled":"Session schedule changed")}</p>
 {r.data.startsAt&&<p>{new Intl.DateTimeFormat(undefined,{timeZone:r.data.timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(r.data.startsAt))} · {r.data.timezone}</p>}
 <p>{r.sessionId} · {t("Previous booking")} {r.data.previousBookingId}</p>
 {!r.readAt?<button disabled={p.busy} onClick={()=>void p.run(async()=>{await p.mutate("learning_read_session_notice",{noticeId:r.id});})}>{t("Mark session notice read")}</button>:<p>{t("Session notice read")}</p>}</article>)}
 <button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{t("Previous notices")}</button>
 <button disabled={p.busy||next===null} onClick={()=>setOffset(next!)}>{t("Next notices")}</button></section>;
}
export function SessionManagement(p:Ops){
 const [course,setCourse]=useState(""),[loaded,setLoaded]=useState(""),[rows,setRows]=useState<any[]>([]),[offset,setOffset]=useState(0),[next,setNext]=useState<number|null>(null),[selected,setSelected]=useState<any>(null),[definition,setDefinition]=useState<any>(null),[action,setAction]=useState("reschedule"),[reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{if(!loaded)return;let live=true;void p.run(async()=>{const r=await p.op("learning_get_session_changes",{courseId:loaded,offset,limit:8});if(live&&p.isCurrent()){setRows(r.items);setNext(r.nextOffset);}});return()=>{live=false;};},[p.tick,loaded,offset]);
 return <section className="panel" aria-label={t("Session schedule management")}><h2>{t("Session schedule management")}</h2>
 <form aria-label={t("Find course sessions")} onSubmit={e=>{e.preventDefault();setSelected(null);setOffset(0);setLoaded(course);}}><label>{t("Session course ID")}<input required maxLength={64} value={course} onChange={e=>setCourse(e.target.value)}/></label><button disabled={p.busy}>{t("Load course sessions")}</button></form>
 {rows.map(r=><article key={r.session.id}><p>{r.session.id} · {r.session.startsAt} · {t(r.state==="cancelled"?"Session cancelled":"Session scheduled")} · {r.booked} {t("active bookings")}</p>
 <button disabled={p.busy||Date.now()>=Date.parse(r.session.startsAt)} onClick={()=>{setSelected(r);setDefinition({...r.session});setReason("");setAction(r.state==="cancelled"?"reschedule":"cancel");setConfirmed(false);}}>{t("Change session schedule")}</button></article>)}
 <button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-8))}>{t("Previous sessions")}</button><button disabled={p.busy||next===null} onClick={()=>setOffset(next!)}>{t("Next sessions")}</button>
 {selected&&<form aria-label={t("Session change")} onSubmit={e=>{e.preventDefault();void p.run(async()=>{if(!confirmed)throw new Error(t("Confirm cancellation of existing bookings"));await p.mutate("learning_change_session",{sessionId:selected.session.id,action,reason,...(action==="reschedule"?{session:definition}:{})});if(p.isCurrent())setSelected(null);});}}><fieldset disabled={p.busy}>
 <legend>{t("Session change")} · {selected.session.id}</legend>
 <label>{t("Session action")}<select aria-label={t("Session action")} value={action} onChange={e=>{setAction(e.target.value);setConfirmed(false);}}><option value="reschedule">{t("Reschedule session")}</option>{selected.state!=="cancelled"&&<option value="cancel">{t("Cancel session")}</option>}</select></label>
 {action==="reschedule"&&<>{[["startsAt","Session start",40],["endsAt","Session end",40],["cutoffAt","Booking cutoff",40],["timezone","Session timezone",80],["location","Session location",200],["joinUrl","Session meeting URL",2048]].map(([key,label,max])=><label key={String(key)}>{t(String(label))}<input required={key!=="joinUrl"} maxLength={Number(max)} value={definition[key]??""} onChange={e=>setDefinition({...definition,[key]:e.target.value})}/></label>)}
 <label>{t("Session capacity")}<input type="number" min={1} max={500} required value={definition.capacity} onChange={e=>setDefinition({...definition,capacity:Number(e.target.value)})}/></label></>}
 <label>{t("Session change reason")}<textarea required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <label><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("Confirm cancellation of existing bookings")}</label>
 <p>{t("Learners receive private in-app notices and must book again. No attendance or completion is recorded.")}</p><button>{t("Apply session change")}</button><button type="button" onClick={()=>setSelected(null)}>{t("Close session change")}</button>
 </fieldset></form>}</section>;
}
