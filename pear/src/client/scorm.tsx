import React,{useEffect,useRef,useState} from "react";
import {request,type Session} from "./api.ts";
import {translateUI as t} from "./i18n.ts";
import {validSCORMState} from "../shared/scorm-state.ts";
export function PackageLearning(p:{session:Session;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;tick:number;author?:boolean}){
 const [data,setData]=useState<any>(null),[records,setRecords]=useState<any>(null),[refresh,setRefresh]=useState(0),[offset,setOffset]=useState(0),[recordOffset,setRecordOffset]=useState(0),[error,setError]=useState(""),[status,setStatus]=useState("");
 const [launch,setLaunch]=useState<any>(null),[consent,setConsent]=useState(false),[file,setFile]=useState<File|null>(null),[language,setLanguage]=useState("en"),[reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 const frame=useRef<HTMLIFrameElement>(null),currentLaunch=useRef<any>(null),pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;currentLaunch.current=null;};},[]);
 useEffect(()=>{let active=true;void Promise.all([request<any>("/api/scorm/packages?author="+!!p.author+"&offset="+offset,p.session),request<any>("/api/scorm/records?offset="+recordOffset,p.session)]).then(([packages,owned])=>{if(active&&p.isCurrent()){setData(packages);setRecords(owned);setError("");}}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[offset,recordOffset,refresh,p.tick]);
 useEffect(()=>{
  function message(event:MessageEvent){
   const active=currentLaunch.current,b=event.data,target=frame.current?.contentWindow;
   if(!active||!target||event.source!==target||event.origin!=="null"||!b||b.kind!=="pear-scorm12-commit"||b.launchId!==active.launchId||b.nonce!==active.nonce||b.recordId!==active.recordId||typeof b.key!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(b.key)||!Number.isSafeInteger(b.recordRevision)||!validSCORMState(b.state))return;
   const reply=(value:any)=>{if(alive.current&&currentLaunch.current===active&&frame.current?.contentWindow===target)target.postMessage({kind:"pear-scorm12-ack",launchId:active.launchId,nonce:active.nonce,key:b.key,...value},"*");};
   if(p.busy||pending.current||!p.isCurrent()){reply({ok:false});return;}
   pending.current=true;setStatus(t("Package commit is pending server acknowledgment."));let replied=false;
   void p.run(async()=>{
    try{
     const result=await request<any>("/api/scorm/commit",p.session,{launchId:active.launchId,recordId:active.recordId,nonce:active.nonce,key:b.key,recordRevision:b.recordRevision,state:b.state});
     if(alive.current&&p.isCurrent()&&currentLaunch.current===active){active.recordRevision=result.recordRevision;setStatus(t("Package state saved by the server; official learning is unchanged."));setRefresh(n=>n+1);reply({ok:true,recordRevision:result.recordRevision});replied=true;}
    }catch(e){reply({ok:false});replied=true;if(alive.current&&p.isCurrent())setStatus(t("Package state was not acknowledged; reopen and reconcile before continuing."));throw e;}
   }).then(ok=>{if(!ok&&!replied)reply({ok:false});}).finally(()=>{pending.current=false;});
  }
  window.addEventListener("message",message);return()=>window.removeEventListener("message",message);
 },[p.session,p.busy,p.tick]);
 async function start(packageId:string){
  await p.run(async()=>{
   const context=await request<any>("/api/context?documentId="+encodeURIComponent("learning:"+p.session.principal.tenant+":"+p.session.principal.id),p.session);
   const result=await request<any>("/api/scorm/start",p.session,{packageId,confirmed:consent,key:crypto.randomUUID(),revision:context.revision});
   if(alive.current&&p.isCurrent()){if(!result.url){setStatus(t("Launch was already recorded; review a new launch to reopen."));return;}currentLaunch.current=result;setLaunch(result);setStatus(t("Package tracking is reported separately from official learning."));}
  });
 }
 async function review(row:any,action:string){await p.run(async()=>{
  const context=await request<any>("/api/context?documentId="+encodeURIComponent("library:"+p.session.principal.tenant),p.session);
  await request("/api/scorm/review",p.session,{action,packageId:row.id,sha256:row.sha256,confirmed,reason,key:crypto.randomUUID(),revision:context.revision});
  if(alive.current&&p.isCurrent())setRefresh(n=>n+1);
 });}
 async function exportZip(row:any){await p.run(async()=>{
  const response=await fetch("/api/scorm/packages/"+row.id+"/export",{credentials:"same-origin",headers:{"X-Pear-Epoch":p.session.sessionEpoch}});
  if(!response.ok)throw Error(t("Package export was denied."));const blob=await response.blob();
  if(!alive.current||!p.isCurrent())return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=row.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });}
 return <section className="panel" aria-label={t(p.author?"Imported package administration":"Imported package learning")}><h2>{t(p.author?"Reviewed SCORM package imports":"Imported learning packages")}</h2>
 <p>{t("Restricted SCORM 1.2 inline profile. Package status, score and time are reported separately; they never create Pear certificates or official quiz credit.")}</p>
 {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
 {data&&!data.runtimeEnabled&&<p>{t("Production scanning, storage and runtime adapter are not configured.")}</p>}
 {p.author&&<><form onSubmit={e=>{e.preventDefault();void p.run(async()=>{
  if(!file||file.size>8*1024*1024||!confirmed)throw Error(t("Choose a bounded self-authored ZIP and confirm review."));
  const context=await request<any>("/api/context?documentId="+encodeURIComponent("library:"+p.session.principal.tenant),p.session),query=new URLSearchParams({filename:file.name,language,confirmed:String(confirmed),key:crypto.randomUUID(),revision:String(context.revision)});
  const response=await fetch("/api/scorm/import?"+query,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/zip","X-CSRF-Token":p.session.csrf,"X-Pear-Epoch":p.session.sessionEpoch},body:file}),result=await response.json();
  if(!response.ok)throw Error(result.error?.message??t("Package import failed."));
  if(alive.current&&p.isCurrent()){setRefresh(n=>n+1);setStatus(t("Package imported into quarantine; review exact code and hash before publishing."));}
 });}}><fieldset disabled={p.busy||!data?.runtimeEnabled}>
 <label>{t("Self-authored SCORM ZIP")}<input aria-label={t("Self-authored SCORM ZIP")} type="file" accept=".zip,application/zip" required onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
 <label>{t("Package language")}<select aria-label={t("Package language")} value={language} onChange={e=>setLanguage(e.target.value)}><option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>
 <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("I confirm self-authored rights and will review the exact package code.")}</label>
 <button>{t("Import package into quarantine")}</button></fieldset></form>
 <label>{t("Package code review reason")}<input aria-label={t("Package code review reason")} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label></>}
 {!p.author&&<label><input type="checkbox" disabled={p.busy} checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t("I consent to this package's separate reported tracking.")}</label>}
 {data?.items.map((row:any)=><article key={row.id}><h3>{row.title}</h3><p>{row.language} · {row.profile} · {row.state} · SHA-256 {row.sha256}</p>
 {p.author?<><button disabled={p.busy||!data.runtimeEnabled||!confirmed||!reason.trim()||row.state==="retired"} onClick={()=>{void review(row,row.state==="quarantined"?"publish":"retire");}}>{t(row.state==="quarantined"?"Publish reviewed package":"Retire package")}</button><button disabled={p.busy||!data.runtimeEnabled} onClick={()=>{void exportZip(row);}}>{t("Export original package ZIP")}</button></>:<button disabled={p.busy||!consent||!data.runtimeEnabled} onClick={()=>{void start(row.id);}}>{t("Launch package with separate tracking")}</button>}</article>)}
 {!p.author&&records?.items.map((row:any)=><article key={row.id}><h3>{row.title}</h3><p>{t("Package reported status")}: {row.state["cmi.core.lesson_status"]} · {t("Package reported score")}: {row.state["cmi.core.score.raw"]||"—"} · {t("Package reported seconds")}: {row.reportedSeconds}</p>
 <button disabled={p.busy||!consent||!data?.runtimeEnabled} onClick={()=>{void start(row.packageId);}}>{t("Resume saved package")}</button></article>)}
 {launch&&<><iframe style={{width:"100%",height:"28rem",border:"1px solid #ddd"}} ref={frame} key={launch.launchId} title={t("Isolated SCORM package")} sandbox="allow-scripts" src={launch.url}/><button disabled={p.busy||pending.current} onClick={()=>{currentLaunch.current=null;setLaunch(null);setStatus("");}}>{t("Close package")}</button></>}
 <button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{t("Previous packages")}</button><button disabled={p.busy||data?.nextOffset==null} onClick={()=>setOffset(data.nextOffset)}>{t("Next packages")}</button>
 {!p.author&&<><button disabled={p.busy||recordOffset===0} onClick={()=>setRecordOffset(Math.max(0,recordOffset-20))}>{t("Previous package records")}</button><button disabled={p.busy||records?.nextOffset==null} onClick={()=>setRecordOffset(records.nextOffset)}>{t("Next package records")}</button></>}
 </section>;
}
