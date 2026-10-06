import React,{useEffect,useState} from "react";
import {request,type Session} from "./api.ts";
import {translateUI} from "./i18n.ts";
export function IdentityLinks(p:{session:Session;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;tick:number}){
 const [data,setData]=useState<any>(null),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [userId,setUser]=useState(""),[subject,setSubject]=useState(""),[reason,setReason]=useState(""),[action,setAction]=useState("link");
 useEffect(()=>{let active=true;void request<any>("/api/identity-links?offset="+offset,p.session).then(r=>{if(active&&p.isCurrent()){setData(r);setError("");}}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[offset,refresh,p.tick]);
 return <section className="panel" aria-label={translateUI("Organization identity settings")}><h2>{translateUI("Reviewed SSO account mappings")}</h2>
  <p>{translateUI("Only a tenant administrator may map an issuer subject to an existing active account. Claims never grant roles. Mapping changes revoke that user's sessions.")}</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {data&&!data.configured&&<p>{translateUI("OIDC is not configured. An authorized provider sandbox and secure server configuration are still required.")}</p>}
  <form onSubmit={e=>{e.preventDefault();void p.run(async()=>{
   const context=await request<any>("/api/context?documentId="+encodeURIComponent("library:"+p.session.principal.tenant),p.session);
   await request("/api/identity-links",p.session,{userId,subject,reason,action,revision:context.revision,key:crypto.randomUUID()});
   if(p.isCurrent()){setNotice(translateUI("Identity mapping saved; target sessions revoked."));setRefresh(n=>n+1);}
  });}}>
   <fieldset disabled={p.busy||!data?.configured}>
    <label>{translateUI("Existing account ID")}<input aria-label={translateUI("Existing account ID")} required maxLength={64} value={userId} onChange={e=>setUser(e.target.value)}/></label>
    <label>{translateUI("Issuer subject")}<input aria-label={translateUI("Issuer subject")} required maxLength={255} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
    <label>{translateUI("Identity mapping reason")}<input aria-label={translateUI("Identity mapping reason")} required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <label>{translateUI("Identity mapping action")}<select aria-label={translateUI("Identity mapping action")} value={action} onChange={e=>setAction(e.target.value)}>
     <option value="link">{translateUI("Link reviewed identity")}</option><option value="unlink">{translateUI("Unlink and revoke sessions")}</option>
    </select></label>
    <button>{translateUI("Save reviewed identity mapping")}</button>
   </fieldset>
  </form>
  {data?.items.map((row:any)=><p key={row.issuer+row.subject}>{row.issuer} · {row.subject} → {row.userId}</p>)}
  <div className="actions"><button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{translateUI("Previous identity mappings")}</button>
   <button disabled={p.busy||data?.nextOffset==null} onClick={()=>setOffset(data.nextOffset)}>{translateUI("Next identity mappings")}</button></div>
 </section>;
}
