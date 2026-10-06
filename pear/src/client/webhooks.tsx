import React,{useEffect,useState} from "react";
import {request,type Session} from "./api.ts";
import {translateUI as t} from "./i18n.ts";
const topics=["enrollment.created","enrollment.completed","content.published","content.retired"];
export function WebhookSettings(p:{session:Session;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;tick:number}){
 const [data,setData]=useState<any>(null),[deliveries,setDeliveries]=useState<any>(null),[selected,setSelected]=useState(""),[offset,setOffset]=useState(0),[deliveryOffset,setDeliveryOffset]=useState(0),[refresh,setRefresh]=useState(0),[error,setError]=useState("");
 const [endpoint,setEndpoint]=useState(""),[reason,setReason]=useState(""),[chosen,setChosen]=useState<string[]>(["enrollment.created"]);
 useEffect(()=>{let active=true;void request<any>("/api/webhooks?offset="+offset,p.session).then(r=>{if(active&&p.isCurrent()){setData(r);setError("");}}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[offset,refresh,p.tick]);
 useEffect(()=>{let active=true;setDeliveries(null);if(selected)void request<any>("/api/webhooks/"+selected+"/deliveries?offset="+deliveryOffset,p.session).then(r=>{if(active&&p.isCurrent())setDeliveries(r);}).catch(e=>{if(active&&p.isCurrent())setError(e.message);});return()=>{active=false;};},[selected,deliveryOffset,refresh,p.tick]);
 async function mutate(action:string,subscriptionId?:string,eventSequence?:number){
  await p.run(async()=>{
   const context=await request<any>("/api/context?documentId="+encodeURIComponent("library:"+p.session.principal.tenant),p.session);
   const args=action==="subscribe"?{action,endpointId:endpoint,topics:chosen,reason}:{action,subscriptionId,reason,...(eventSequence===undefined?{}:{eventSequence})};
   await request("/api/webhooks",p.session,{...args,key:crypto.randomUUID(),revision:context.revision});
   if(p.isCurrent())setRefresh(n=>n+1);
  });
 }
 return <section className="panel" aria-label={t("Reviewed webhook delivery")}><h2>{t("Organization event delivery")}</h2>
 <p>{t("Only reviewed server endpoints can receive events. Delivery is ordered and may repeat; receivers must deduplicate event IDs.")}</p>
 {error&&<p role="alert">{error}</p>}{data?.endpoints.length===0&&<p>{t("No authorized delivery endpoint is configured.")}</p>}
 <form onSubmit={e=>{e.preventDefault();void mutate("subscribe");}}><fieldset disabled={p.busy||!data?.endpoints.length}>
 <label>{t("Reviewed endpoint")}<select aria-label={t("Reviewed endpoint")} required value={endpoint} onChange={e=>setEndpoint(e.target.value)}><option value="">{t("Choose endpoint")}</option>{data?.endpoints.map((id:string)=><option key={id} value={id}>{id}</option>)}</select></label>
 <label>{t("Webhook review reason")}<input aria-label={t("Webhook review reason")} required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>
 {topics.map(topic=><label key={topic}><input type="checkbox" checked={chosen.includes(topic)} onChange={e=>setChosen(v=>e.target.checked?[...v,topic]:v.filter(t=>t!==topic))}/>{topic}</label>)}
 <button disabled={!chosen.length}>{t("Subscribe reviewed endpoint")}</button></fieldset></form>
 {data?.items.map((row:any)=><div key={row.id}><p>{row.endpointId} · {row.topics.join(", ")} · {row.live?t("Active"):t("Paused")} · {t("Event cursor")}: {row.cursor}</p>
 <button disabled={p.busy} onClick={()=>{setDeliveryOffset(0);setSelected(row.id);}}>{t("Inspect delivery status")}</button>
 <button disabled={p.busy||!row.active||!reason.trim()} onClick={()=>{void mutate("disable",row.id);}}>{t("Disable event delivery")}</button></div>)}
 {deliveries&&<div aria-label={t("Event delivery attempts")}>{deliveries.items.map((row:any)=><p key={row.eventSequence}>{row.eventSequence} · {row.state} · {row.attempts} · {row.lastStatus??"—"} {row.state==="failed"&&<button disabled={p.busy||!reason.trim()} onClick={()=>{void mutate("retry",selected,row.eventSequence);}}>{t("Retry reviewed failed event")}</button>}</p>)}
 <button disabled={p.busy||deliveryOffset===0} onClick={()=>setDeliveryOffset(Math.max(0,deliveryOffset-20))}>{t("Previous delivery records")}</button><button disabled={p.busy||deliveries.nextOffset===null} onClick={()=>setDeliveryOffset(deliveries.nextOffset)}>{t("Next delivery records")}</button></div>}
 <div className="actions"><button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>{t("Previous webhook subscriptions")}</button><button disabled={p.busy||data?.nextOffset==null} onClick={()=>setOffset(data.nextOffset)}>{t("Next webhook subscriptions")}</button></div>
 </section>;
}
