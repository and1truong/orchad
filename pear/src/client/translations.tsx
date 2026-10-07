import React,{useEffect,useState} from "react";
import {request,type Session} from "./api.ts";
import {getUILocale,translateUI as t} from "./i18n.ts";
export function LanguageVariants(p:{kind:"course"|"item";sourceId:string;busy:boolean;op:(name:string,a:any)=>Promise<any>;isCurrent:()=>boolean;onChoose:(id:string)=>void}){
 const [preferred,setPreferred]=useState(getUILocale),[data,setData]=useState<any>(null),[error,setError]=useState("");
 useEffect(()=>{let active=true;setData(null);void p.op("learning_get_language_variants",{kind:p.kind,sourceId:p.sourceId,preferredLanguage:preferred}).then(r=>{if(active&&p.isCurrent()){setData(r);setError("");}}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[p.kind,p.sourceId,preferred]);
 return <section className="panel" aria-label={t("Reviewed content language variants")}><h3>{t("Content language variants")}</h3>
 <label>{t("Preferred variant language")}<select aria-label={t("Preferred variant language")} disabled={p.busy} value={preferred} onChange={e=>setPreferred(e.target.value as "en"|"vi")}><option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>
 {error&&<p role="alert">{error}</p>}{data&&<><p>{t("Content identity")}: {data.identityId}</p>
 {data.fallback&&<p role="status">{t(data.fallbackReason)}</p>}
 {data.variants.map((row:any)=><div key={row.id}><p>{row.title} · {row.language} · {t(row.disclosure)} {row.id===data.preferredId&&<strong>{t("Preferred reviewed variant")}</strong>}</p>
 {row.qualityReview&&<p>{row.qualityReview}</p>}<button disabled={p.busy||row.id===p.sourceId} onClick={()=>p.onChoose(row.id)}>{t("Preview this language variant")}</button></div>)}
 {data.unavailable?.map((row:any)=><p key={row.language}>{row.language} · {t(row.reason)}</p>)}
 <p>{t("Choosing a variant opens a preview. It never moves existing enrollment, answers, progress or credit. Supported reviewed languages: en, vi.")}</p></>}
 </section>;
}
export function TranslationSettings(p:{session:Session;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;tick:number}){
 const [data,setData]=useState<any>(null),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[error,setError]=useState("");
 const [kind,setKind]=useState("course"),[originalId,setOriginal]=useState(""),[sourceId,setSource]=useState(""),[originalVersion,setOriginalVersion]=useState(1),[sourceVersion,setSourceVersion]=useState(1),[provenance,setProvenance]=useState("human_authored"),[qualityReview,setReview]=useState(""),[reason,setReason]=useState("");
 useEffect(()=>{let active=true;void request<any>("/api/translations?offset="+offset,p.session).then(r=>{if(active&&p.isCurrent()){setData(r);setError("");}}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[offset,refresh,p.tick]);
 async function mutate(action:string,variantId?:string){await p.run(async()=>{
  const context=await request<any>("/api/context?documentId="+encodeURIComponent("library:"+p.session.principal.tenant),p.session);
  const args=action==="link"?{action,kind,originalId,sourceId,originalVersion,sourceVersion,provenance,qualityReview,reason}:{action,variantId,reason};
  await request("/api/translations",p.session,{...args,key:crypto.randomUUID(),revision:context.revision});if(p.isCurrent())setRefresh(n=>n+1);
 });}
 return <section className="panel" aria-label={t("Translation review settings")}><h2>{t("Reviewed derivative provenance")}</h2>
 <p>{t("Only self-authored published sources with different languages may be linked. Review the exact original and derivative versions; this does not translate content automatically.")}</p>
 {error&&<p role="alert">{error}</p>}
 <form onSubmit={e=>{e.preventDefault();void mutate("link");}}><fieldset disabled={p.busy}>
 <label>{t("Translation content kind")}<select aria-label={t("Translation content kind")} value={kind} onChange={e=>setKind(e.target.value)}><option value="course">{t("Course")}</option><option value="item">{t("Standalone item")}</option></select></label>
 <label>{t("Original content ID")}<input aria-label={t("Original content ID")} required maxLength={64} value={originalId} onChange={e=>setOriginal(e.target.value)}/></label>
 <label>{t("Derivative content ID")}<input aria-label={t("Derivative content ID")} required maxLength={64} value={sourceId} onChange={e=>setSource(e.target.value)}/></label>
 <label>{t("Reviewed original version")}<input aria-label={t("Reviewed original version")} required type="number" min={1} value={originalVersion} onChange={e=>setOriginalVersion(Number(e.target.value))}/></label>
 <label>{t("Reviewed derivative version")}<input aria-label={t("Reviewed derivative version")} required type="number" min={1} value={sourceVersion} onChange={e=>setSourceVersion(Number(e.target.value))}/></label>
 <label>{t("Derivative provenance")}<select aria-label={t("Derivative provenance")} value={provenance} onChange={e=>setProvenance(e.target.value)}><option value="human_authored">{t("Human-authored derivative")}</option><option value="ai_assisted_reviewed">{t("AI-assisted and human-reviewed derivative")}</option></select></label>
 <label>{t("Human translation quality review")}<textarea aria-label={t("Human translation quality review")} required maxLength={500} value={qualityReview} onChange={e=>setReview(e.target.value)}/></label>
 <label>{t("Translation review reason")}<input aria-label={t("Translation review reason")} required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <button>{t("Link reviewed language variant")}</button></fieldset></form>
 {data?.items.map((row:any)=><div key={row.id}><p>{row.originalId} v{row.originalVersion} → {row.sourceId} v{row.sourceVersion} · {row.language} · {row.provenance} · {row.active?t("Active"):t("Revoked")}</p>
 <button disabled={p.busy||!row.active||!reason.trim()} onClick={()=>{void mutate("disable",row.id);}}>{t("Disable reviewed variant")}</button></div>)}
 <button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{t("Previous translation reviews")}</button><button disabled={p.busy||data?.nextOffset==null} onClick={()=>setOffset(data.nextOffset)}>{t("Next translation reviews")}</button></section>;
}
