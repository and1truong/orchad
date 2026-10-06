import React,{useEffect,useState} from "react";
import type {PortalBranding} from "../shared/portal.ts";
import {translateUI as t} from "./i18n.ts";
export function PortalSettings(p:{value:PortalBranding;version:number;busy:boolean;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;onSaved:(value:PortalBranding)=>void}){
 const [value,setValue]=useState(p.value),[message,setMessage]=useState("");
 useEffect(()=>{setValue(p.value);},[p.version]);
 return <section className="panel" aria-label={t("Organization portal settings")}><h2>{t("Organization portal settings")}</h2><p>{t("These settings change only this organization's signed-in portal presentation. Learning, access, identity providers and certificates keep their own policies.")}</p>
 {message&&<p role="status">{message}</p>}<form onSubmit={e=>{e.preventDefault();void p.run(async()=>{const r=await p.mutate("human_save_portal_branding",{branding:value});if(p.isCurrent()){p.onSaved(r.branding);setMessage(t("Organization portal settings saved"));}});}}><fieldset disabled={p.busy}>
 <legend>{t("Portal presentation")}</legend><label>{t("Portal display name")}<input required maxLength={100} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
 <label>{t("Portal tagline")}<input maxLength={280} value={value.tagline} onChange={e=>setValue({...value,tagline:e.target.value})}/></label>
 <label>{t("Portal color palette")}<select aria-label={t("Portal color palette")} value={value.palette} onChange={e=>setValue({...value,palette:e.target.value as PortalBranding["palette"]})}>{["forest","navy","ink"].map(palette=><option key={palette} value={palette}>{t(palette)}</option>)}</select></label>
 <button>{t("Save organization portal settings")}</button></fieldset></form></section>;
}
