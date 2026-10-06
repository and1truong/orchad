import React,{useEffect,useState} from "react";
import {request,type Session} from "./api.ts";
import {translateUI as t} from "./i18n.ts";
export function ProvisioningClients(p:{session:Session;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;tick:number}){
 const [data,setData]=useState<any>(null),[error,setError]=useState(""),[refresh,setRefresh]=useState(0),[offset,setOffset]=useState(0);
 const [name,setName]=useState(""),[reason,setReason]=useState(""),[days,setDays]=useState(7),[write,setWrite]=useState(false),[events,setEvents]=useState(false),[external,setExternal]=useState(false),[externalWrite,setExternalWrite]=useState(false),[secret,setSecret]=useState<string|null>(null);
 useEffect(()=>{let active=true;void request<any>("/api/provisioning-clients?offset="+offset,p.session).then(value=>{if(active&&p.isCurrent()){setData(value);setError("");}}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[refresh,offset,p.tick]);
 async function mutate(action:string,clientId?:string){
  await p.run(async()=>{
   const context=await request<any>("/api/context?documentId="+encodeURIComponent("library:"+p.session.principal.tenant),p.session);
   const args=action==="issue"?{action,name,reason,ttlDays:days,scopes:[...(external||externalWrite?["xapi.read"]:[]),...(externalWrite?["xapi.write"]:[]),...(events?["events.read"]:[]),...(!events||write?["provisioning.read"]:[]),...(write?["provisioning.write"]:[])]}:{action,clientId,reason};
   const result=await request<any>("/api/provisioning-clients",p.session,{...args,key:crypto.randomUUID(),revision:context.revision});
   if(p.isCurrent()){setSecret(result.token??null);setRefresh(n=>n+1);}
  });
 }
 return <section className="panel" aria-label={t("Provisioning credentials")}><h2>{t("Reviewed provisioning clients")}</h2>
 <p>{t("Credentials are restricted to client-owned users and static groups. They cannot grant roles, link SSO identities or change learning records.")}</p>
 {error&&<p role="alert">{error}</p>}{data&&!data.enabled&&<p>{t("Provisioning requires explicit secure server configuration.")}</p>}
 <form onSubmit={e=>{e.preventDefault();void mutate("issue");}}><fieldset disabled={p.busy||!data?.enabled}>
 <label>{t("Provisioning client name")}<input aria-label={t("Provisioning client name")} required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>{t("Provisioning review reason")}<input aria-label={t("Provisioning review reason")} required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <label>{t("Credential duration in days")}<input aria-label={t("Credential duration in days")} type="number" min={1} max={30} value={days} onChange={e=>setDays(Number(e.target.value))}/></label>
 <label><input type="checkbox" checked={write} onChange={e=>setWrite(e.target.checked)}/>{t("Allow provisioning writes")}</label>
 <label><input type="checkbox" checked={events} onChange={e=>setEvents(e.target.checked)}/>{t("Allow organization event reads")}</label>
 <label><input type="checkbox" checked={external} onChange={e=>setExternal(e.target.checked)}/>{t("Allow external activity reads")}</label>
 <label><input type="checkbox" checked={externalWrite} onChange={e=>setExternalWrite(e.target.checked)}/>{t("Allow external activity statement writes")}</label>
 <button>{t("Issue reviewed credential")}</button></fieldset></form>
 {secret&&<aside aria-label={t("One-time provisioning secret")}><p>{t("Save this secret now. It is not stored in the browser and cannot be displayed again.")}</p>
 <code data-testid="provisioning-secret">{secret}</code><button disabled={p.busy} onClick={()=>setSecret(null)}>{t("Hide provisioning secret")}</button></aside>}
 {data?.items.map((row:any)=><div key={row.id}><p>{row.name} · {row.scopes.join(", ")} · {row.expiresAt} · {row.active?t("Active"):t("Revoked")}</p>
 <button disabled={p.busy||!row.active||!reason.trim()||!data.enabled} onClick={()=>{void mutate("revoke",row.id);}}>{t("Revoke provisioning credential")}</button></div>)}
 <div className="actions"><button disabled={p.busy||offset===0} onClick={()=>{setSecret(null);setOffset(Math.max(0,offset-20));}}>{t("Previous provisioning clients")}</button>
 <button disabled={p.busy||data?.nextOffset==null} onClick={()=>{setSecret(null);setOffset(data.nextOffset);}}>{t("Next provisioning clients")}</button></div></section>;
}
