import React,{useEffect,useState} from "react";
import {translateUI as t} from "./i18n.ts";
import {defaultDigestPreferences,type DigestPreferences} from "../shared/digest-subscriptions.ts";
export function DigestSubscriptions(p:{busy:boolean;tick:number;op:(name:string,args?:Record<string,unknown>)=>Promise<any>;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean}){
 const [settings,setSettings]=useState<any>(null),[prefs,setPrefs]=useState<DigestPreferences>({...defaultDigestPreferences}),[confirmed,setConfirmed]=useState(false),[history,setHistory]=useState<any>(null),[offset,setOffset]=useState(0),[refresh,setRefresh]=useState(0),[error,setError]=useState("");
 useEffect(()=>{let live=true;setSettings(null);setHistory(null);void Promise.all([p.op("human_get_digest_preferences"),p.op("human_get_digest_notifications",{offset})]).then(([value,rows])=>{if(live&&p.isCurrent()){setSettings(value);setPrefs(value.preferences);setHistory(rows);setError("");}}).catch(e=>{if(live&&p.isCurrent())setError(e.message);});return()=>{live=false;};},[p.tick,refresh,offset]);
 const change=(key:keyof DigestPreferences,value:any)=>{setPrefs(previous=>({...previous,[key]:value}));setConfirmed(false);};
 async function save(){await p.run(async()=>{await p.mutate("human_save_digest_preferences",{preferences:prefs,confirmed:true});if(p.isCurrent()){setConfirmed(false);setOffset(0);setRefresh(n=>n+1);}});}
 async function act(name:string,args:Record<string,unknown>){await p.run(async()=>{await p.mutate(name,args);if(p.isCurrent()){setOffset(0);setRefresh(n=>n+1);}});}
 return <section className="panel" aria-label={t("Scheduled in-app digest")}><h2>{t("Scheduled in-app digest")}</h2>
 <p>{t("Review your own schedule before enabling it. Digests stay in this app and never change official learning. Missed runs older than six hours are skipped; at most three deliveries occur in 24 hours.")}</p>
 {error&&<p role="alert">{error}</p>}{settings&&<><p>{settings.effectiveEnabled?t("Digest schedule enabled"):t("Digest schedule disabled")}</p>{settings.reviewRequired&&<p role="status">{t("Account authority changed. Review and save your schedule again.")}</p>}{settings.nextRun&&<p>{t("Next digest UTC")}: <time dateTime={settings.nextRun}>{settings.nextRun}</time></p>}
 <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={p.busy}>
 <label><input type="checkbox" checked={prefs.enabled} onChange={e=>change("enabled",e.target.checked)}/>{t("Enable my in-app digest")}</label>
 <label>{t("Schedule time zone")}<input required maxLength={100} value={prefs.timeZone} onChange={e=>change("timeZone",e.target.value)}/></label>
 <label>{t("Local hour")}<input type="number" required min={0} max={23} value={prefs.hour} onChange={e=>change("hour",Number(e.target.value))}/></label>
 <label>{t("Local minute")}<input type="number" required min={0} max={59} value={prefs.minute} onChange={e=>change("minute",Number(e.target.value))}/></label>
 <fieldset><legend>{t("Delivery weekdays")}</legend>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day,index)=><label key={day}><input type="checkbox" checked={prefs.weekdays.includes(index+1)} onChange={e=>change("weekdays",e.target.checked?[...prefs.weekdays,index+1].sort():prefs.weekdays.filter(n=>n!==index+1))}/>{t(day)}</label>)}</fieldset>
 <label>{t("Repeated local time")}<select aria-label={t("Repeated local time")} value={prefs.dstChoice} onChange={e=>change("dstChoice",e.target.value)}><option value="earlier">{t("Earlier instant")}</option><option value="later">{t("Later instant")}</option></select></label>
 <p>{t("Missing local times advance by the clock gap. Repeated local times use your selected instant.")}</p>
 <label>{t("Digest budget minutes")}<input type="number" required min={1} max={1440} value={prefs.minutes} onChange={e=>change("minutes",Number(e.target.value))}/></label>
 <label>{t("Keep digest payloads for days")}<input type="number" required min={1} max={30} value={prefs.retentionDays} onChange={e=>change("retentionDays",Number(e.target.value))}/></label>
 <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t("I reviewed this own in-app schedule and retention")}</label>
 <button disabled={!confirmed||!prefs.weekdays.length}>{t("Save digest schedule")}</button>
 </fieldset></form></>}
 {history&&<div aria-label={t("Own digest notifications")}>{history.items.length===0&&<p>{t("No retained digest notifications")}</p>}
 {history.items.map((row:any)=><article key={row.id}><h3>{t("Digest notification")}</h3><p><time dateTime={row.runAt}>{row.runAt}</time> · {t("Expires")}: {row.expiresAt}</p>
 {row.withheldItems>0&&<p>{t("Some learning is withheld because your current audience changed.")}</p>}
 {row.payload.items.map((x:any,index:number)=><p key={index}>{x.title} · {t("Version")} {x.version} · {x.dueLocal??x.intendedMinutes??""}</p>)}
 {row.readAt?<p>{t("Notification read")}</p>:<button disabled={p.busy} onClick={()=>{void act("human_read_digest_notification",{notificationId:row.id});}}>{t("Mark digest read")}</button>}</article>)}
 {offset>0&&<button disabled={p.busy} onClick={()=>setOffset(0)}>{t("First digest page")}</button>}
 {history.nextOffset!==null&&<button disabled={p.busy} onClick={()=>setOffset(history.nextOffset)}>{t("Next digest page")}</button>}
 <button disabled={p.busy||!history.total} onClick={()=>{if(window.confirm(t("Delete all my retained digest payloads? Operational audit and original-key receipts remain.")))void act("human_delete_digest_history",{confirmed:true});}}>{t("Delete my digest history")}</button></div>}
 </section>;
}
