import React,{useEffect,useState} from "react";
import {translateUI} from "./i18n.ts";
type Actions={busy:boolean;op:(name:string,args?:Record<string,unknown>)=>Promise<any>;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;};
export function PrimaryAssignment({record,actions,onUpdate}:{record:any;actions:Actions;onUpdate:()=>Promise<void>}){
 const [assessor,setAssessor]=useState(record.primaryAssessorId??""),[reason,setReason]=useState("");
 useEffect(()=>{setAssessor(record.primaryAssessorId??"");setReason("");},[record.id,record.assignmentVersion,record.primaryAssessorId]);
 return <form aria-label={translateUI("Primary assessor assignment")} onSubmit={event=>{event.preventDefault();void actions.run(async()=>{await actions.mutate("human_assign_external_assessor",{recordId:record.id,assessorId:assessor,expectedVersion:record.assignmentVersion,reason});await onUpdate();});}}>
  <fieldset disabled={actions.busy}><legend>{translateUI("Assign or reassign primary assessor")}</legend>
  <p>{translateUI("Choose an active assessor already delegated to this award. Assignment does not grant rights or accept evidence.")}</p>
  <label>{translateUI("Primary assessor account ID")}<input required maxLength={64} value={assessor} onChange={event=>setAssessor(event.target.value)}/></label>
  <label>{translateUI("Primary assignment reason")}<textarea required maxLength={300} value={reason} onChange={event=>setReason(event.target.value)}/></label>
  <button>{translateUI("Save primary assignment")}</button></fieldset>
 </form>;
}
export function AssessmentNotices({actions,tick}:{actions:Actions;tick:number}){
 const [page,setPage]=useState<any>({items:[],nextOffset:null}),[offset,setOffset]=useState(0),[error,setError]=useState("");
 useEffect(()=>{let current=true;actions.op("human_get_assessment_notices",{offset,limit:20}).then(value=>{if(current){setPage(value);setError("");}},failure=>{if(current)setError(failure instanceof Error?failure.message:"Assessment notices unavailable");});return()=>{current=false;};},[tick,offset]);
 return <section className="panel" aria-label={translateUI("Own assessment assignment notices")}><h3>{translateUI("Own assessment assignment notices")}</h3>
  <p>{translateUI("In-app assignment facts only. No email, channel delivery or official assessment is performed.")}</p>{error&&<p role="alert">{error}</p>}
  {page.items.map((notice:any)=><div key={notice.id}><p>{translateUI(notice.kind==="assigned"?"Assigned to primary assessment":"Primary assignment removed")} {notice.recordId??""} {notice.awardId??""}</p>{!notice.readAt&&<button type="button" disabled={actions.busy} onClick={()=>void actions.run(async()=>{await actions.mutate("human_read_assessment_notice",{noticeId:notice.id});setPage(await actions.op("human_get_assessment_notices",{offset,limit:20}));})}>{translateUI("Mark assessment notice read")}</button>}</div>)}
  <button type="button" disabled={offset===0||actions.busy} onClick={()=>setOffset(Math.max(0,offset-20))}>{translateUI("Previous notices")}</button><button type="button" disabled={page.nextOffset===null||actions.busy} onClick={()=>setOffset(page.nextOffset)}>{translateUI("Next notices")}</button>
 </section>;
}
