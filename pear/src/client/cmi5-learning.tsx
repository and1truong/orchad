import {useEffect,useId,useRef,useState} from 'react';
import {request,type Session} from './api.ts';
import type {CMI5Reference} from '../shared/model.ts';

export function CMI5ReferenceEditor(p:{session:Session;value?:CMI5Reference;onChange:(v:CMI5Reference)=>void}) {
  const [page,setPage]=useState<any>(),[offset,setOffset]=useState(0),[error,setError]=useState(''),id=useId(),value=p.value??{packageId:'',sha256:'',allowWaivers:false};
  useEffect(()=>{let active=true;request<any>('/api/cmi5/packages?author=true&offset='+offset,p.session).then(v=>{if(active)setPage(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[p.session,offset]);
  return <fieldset><legend>cmi5 completion policy</legend>{error&&<p role="alert">{error}</p>}
    <label htmlFor={id}>Published cmi5 package</label><select id={id} required value={value.packageId} onChange={e=>{const row=page?.items.find((r:any)=>r.id===e.target.value);if(row)p.onChange({...value,packageId:row.id,sha256:row.sha256});}}><option value="">Choose an exact reviewed package</option>
      {value.packageId&&!page?.items.some((r:any)=>r.id===value.packageId)&&<option value={value.packageId}>{value.packageId}</option>}{page?.items.filter((r:any)=>r.state==='published').map((r:any)=><option key={r.id} value={r.id}>{r.title}</option>)}</select>
    <button type="button" disabled={!offset} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous cmi5 choices</button><button type="button" disabled={page?.nextOffset==null} onClick={()=>setOffset(page.nextOffset)}>Next cmi5 choices</button><p>{value.packageId&&'SHA-256: '+value.sha256}</p>
    <label><input type="checkbox" checked={value.allowWaivers} onChange={e=>p.onChange({...value,allowWaivers:e.target.checked})}/>Allow confirmed administrative waivers to satisfy this enrollment.</label>
    <p>Every AU must meet its imported moveOn policy and end its Normal session, or have an explicitly permitted waiver. Course quizzes remain required.</p>
  </fieldset>;
}
export function CMI5LearningPlayer(p:{session:Session;binding:{enrollmentId:string;lessonId:string}|{itemEnrollmentId:string};busy:boolean;run:(fn:()=>Promise<void>)=>Promise<boolean>;onSaved:()=>Promise<void>}) {
  const [context,setContext]=useState<any>(),[report,setReport]=useState<any>(),[launch,setLaunch]=useState<any>(),[consent,setConsent]=useState(false),[offset,setOffset]=useState(0),[error,setError]=useState('');
  const binding=JSON.stringify(p.binding),accepted=useRef<string|null>(null),session=useRef(p.session);session.current=p.session;
  useEffect(()=>{let active=true;accepted.current=null;setLaunch(undefined);setReport(undefined);setContext(undefined);setConsent(false);
    request<any>('/api/cmi5/learning-context?'+new URLSearchParams({...p.binding,offset:String(offset)}),p.session).then(async v=>{if(!active)return;setContext(v);if(v.registrationId){const r=await request<any>('/api/cmi5/registrations/'+v.registrationId,p.session);if(active)setReport(r);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
  },[p.session,binding,offset]);
  useEffect(()=>{if(!report)return;let active=true;const timer=setInterval(()=>{void request<any>('/api/cmi5/registrations/'+report.registrationId,p.session).then(async r=>{if(!active)return;setReport(r);if(r.officialLearningChanged&&accepted.current!==r.registrationId){accepted.current=r.registrationId;setContext((old:any)=>({...old,completed:true}));await p.onSaved();}}).catch(e=>{if(active)setError(e.message);});},1500);return()=>{active=false;clearInterval(timer);};},[p.session,binding,report?.registrationId]);
  async function play(au:any){await p.run(async()=>{
    const revision=await request<any>('/api/context?documentId='+encodeURIComponent(`learning:${p.session.principal.tenant}:${p.session.principal.id}`),p.session),value=await request<any>('/api/cmi5/launch',p.session,{packageId:context.packageId,auId:au.id,binding:p.binding,mode:context.completed||report?.aus.find((r:any)=>r.id===au.id)?.waived?'Review':'Normal',confirmed:consent,revision:revision.revision,key:crypto.randomUUID()});
    const saved=await request<any>('/api/cmi5/registrations/'+value.registrationId,p.session);if(session.current===p.session){setLaunch(value.url?value:undefined);setReport(saved);setError('');}
  });}
  return <section aria-label="Enrolled cmi5 player"><p>This reviewed package reports completion for this exact enrollment. Each AU follows its published moveOn policy.{'enrollmentId' in p.binding?' The course quiz remains required.':''}</p>{error&&<p role="alert">{error}</p>}{context?.completed&&<p>cmi5 completion accepted.</p>}
    <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to cmi5 progress tracking for this enrollment.</label>
    <nav aria-label="Enrolled cmi5 activities">{context?.aus.map((au:any)=><button key={au.id} disabled={p.busy||!consent||!context.runtimeEnabled||!au.playbackSupported||!!launch} onClick={()=>{void play(au);}}>{context.completed||report?.aus.find((r:any)=>r.id===au.id)?.waived?'Review':'Play or resume'} {au.title}</button>)}</nav>
    <button disabled={p.busy||!!launch||!offset} onClick={()=>setOffset(Math.max(0,offset-10))}>Previous enrolled cmi5 activities</button><button disabled={p.busy||!!launch||context?.nextAuOffset==null} onClick={()=>setOffset(context.nextAuOffset)}>Next enrolled cmi5 activities</button>
    {report&&<div aria-label="Enrolled cmi5 report"><p>Course satisfaction: {report.satisfied?'Satisfied':'Pending'}</p>{report.aus.map((au:any)=><p key={au.id}>{au.title} · Completed: {String(au.completed)} · Passed: {String(au.passed)} · Satisfied: {String(au.satisfied)}{au.waived?' · Waived: '+au.waiverReason:''}</p>)}</div>}
    {launch&&<>{launch.launchMethod==='OwnWindow'?<a href={launch.url} target="_blank" rel="noopener noreferrer">Open enrolled cmi5 activity in a new window</a>:<iframe title="Enrolled cmi5 activity" sandbox="allow-scripts allow-same-origin" src={launch.url} style={{width:'100%',height:'70vh',border:0}}/>}<p>Let the activity finish saving before closing it.</p><button disabled={p.busy} onClick={()=>{void p.run(async()=>{const r=await request<any>('/api/cmi5/sessions/'+launch.sessionId+'/close',p.session,{});if(session.current===p.session){setLaunch(undefined);setReport(r);await p.onSaved();}});}}>Close enrolled cmi5 activity</button></>}
  </section>;
}
