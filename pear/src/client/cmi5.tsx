import {useEffect,useId,useRef,useState} from 'react';
import {request,type Session} from './api.ts';
import {cmi5WaiverReasons} from '../shared/cmi5.ts';

export function CMI5Packages(p:{session:Session;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<boolean>;isCurrent:()=>boolean;tick:number;author?:boolean}) {
  const [data,setData]=useState<any>(),[registrations,setRegistrations]=useState<any>(),[report,setReport]=useState<any>(),[launch,setLaunch]=useState<any>();
  const [offset,setOffset]=useState(0),[recordOffset,setRecordOffset]=useState(0),[refresh,setRefresh]=useState(0),[file,setFile]=useState<File|null>(null);
  const [auPages,setAUPages]=useState<Record<string,any>>({});
  const [provenance,setProvenance]=useState(''),[reason,setReason]=useState(''),[reviewed,setReviewed]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const [waiverReason,setWaiverReason]=useState(''),[waiverConfirmed,setWaiverConfirmed]=useState(false);
  const waiverReasonId=useId();
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const current=()=>alive.current&&p.isCurrent();
  useEffect(()=>{setWaiverReason('');setWaiverConfirmed(false);},[report?.registrationId]);
  useEffect(()=>{
    let active=true;
    void Promise.all([request<any>('/api/cmi5/packages?author='+!!p.author+'&offset='+offset,p.session),request<any>('/api/cmi5/registrations?admin='+!!p.author+'&offset='+recordOffset,p.session)])
      .then(([packages,records])=>{if(active&&current()){setData(packages);setRegistrations(records);setError('');}}).catch(e=>{if(active&&current())setError(e.message);});
    return()=>{active=false;};
  },[p.session,p.tick,refresh,offset,recordOffset]);
  useEffect(()=>{
    if(!report)return;let active=true;
    const timer=setInterval(()=>{void request<any>('/api/cmi5/registrations/'+report.registrationId+'?admin='+!!p.author,p.session).then(v=>{if(active&&current())setReport(v);}).catch(e=>{if(active&&current())setError(e.message);});},1500);
    return()=>{active=false;clearInterval(timer);};
  },[p.session,report?.registrationId,p.author]);
  async function context(author=false) {return request<any>('/api/context?documentId='+encodeURIComponent(author?'library:'+p.session.principal.tenant:`learning:${p.session.principal.tenant}:${p.session.principal.id}`),p.session);}
  async function open(row:any,au:any,registrationId?:string) {await p.run(async()=>{
    const ctx=await context(),v=await request<any>('/api/cmi5/launch',p.session,{packageId:row.id,auId:au.id,mode:p.author?'Browse':au.waived?'Review':'Normal',...(registrationId?{registrationId}:{}),confirmed:consent,revision:ctx.revision,key:crypto.randomUUID()});
    const saved=await request<any>('/api/cmi5/registrations/'+v.registrationId,p.session);
    if(current()){setLaunch(v.url?v:undefined);setReport(saved);setRefresh(n=>n+1);setStatus(v.url?'Activity launched. Progress appears after the activity saves it.':'Launch recorded; reopen the saved registration to continue.');}
  });}
  async function review(row:any,action:string) {await p.run(async()=>{
    const ctx=await context(true);await request('/api/cmi5/review',p.session,{packageId:row.id,sha256:row.sha256,action,reason,confirmed:reviewed,revision:ctx.revision,key:crypto.randomUUID()});if(current())setRefresh(n=>n+1);
  });}
  async function activityPage(row:any,offset:number) {await p.run(async()=>{
    const page=await request<any>('/api/cmi5/packages/'+row.id+'/activities?author='+!!p.author+'&offset='+offset,p.session);if(current())setAUPages(old=>({...old,[row.id]:page}));
  });}
  async function waive(au:any) {await p.run(async()=>{
    const ctx=await context(true),result=await request<any>('/api/cmi5/waive',p.session,{registrationId:report.registrationId,auId:au.id,reason:waiverReason,confirmed:waiverConfirmed,revision:ctx.revision,key:crypto.randomUUID()});
    if(current()){setReport(result);setWaiverConfirmed(false);setWaiverReason('');setStatus('Waiver recorded. Reported completion and pass results are unchanged.');}
  });}
  async function exportZip(row:any) {await p.run(async()=>{
    const response=await fetch('/api/cmi5/packages/'+row.id+'/export',{credentials:'same-origin',headers:{'X-Pear-Epoch':p.session.sessionEpoch}});
    if(!response.ok)throw Error('Package export failed');const blob=await response.blob();if(!current())return;
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=row.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });}
  return <section className="panel" aria-label="cmi5 packages"><h2>cmi5 learning packages</h2>
    <p>Launch reviewed activities and track completion, pass results and course satisfaction. Enrolled packages can count toward learning when their published policy is met; practice packages do not grant credit.</p>
    {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
    {data&&!data.runtimeEnabled&&<p>cmi5 playback is unavailable.</p>}
    {p.author&&<><form onSubmit={e=>{e.preventDefault();void p.run(async()=>{
      if(!file||file.size>(file.name.endsWith('.xml') ? 1024*1024 : 32*1024*1024))throw Error('Choose a cmi5 ZIP up to 32 MiB or XML up to 1 MiB');const ctx=await context(true);
      const q=new URLSearchParams({filename:file.name,provenance,confirmed:String(reviewed),revision:String(ctx.revision),key:crypto.randomUUID()});
      const response=await fetch('/api/cmi5/import?'+q,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.name.endsWith('.xml')?'application/xml':'application/zip','X-CSRF-Token':p.session.csrf,'X-Pear-Epoch':p.session.sessionEpoch},body:file}),result=await response.json();
      if(!response.ok)throw Error(result.error?.message??'Import failed');if(current()){setRefresh(n=>n+1);setStatus('Package imported into quarantine. Review the exact files before publishing.');}
    });}}><fieldset disabled={p.busy||!data?.runtimeEnabled}>
      <label>cmi5 ZIP or XML<input type="file" accept=".zip,.xml,application/zip,application/xml,text/xml" required onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
      <label>cmi5 content rights and provenance<input required maxLength={500} value={provenance} onChange={e=>setProvenance(e.target.value)}/></label>
      <label><input type="checkbox" required checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I confirm cmi5 content rights and will review the exact package.</label>
      <button>Import cmi5 package</button>
    </fieldset></form><label>cmi5 review reason<input maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label></>}
    <label><input type="checkbox" disabled={p.busy} checked={consent} onChange={e=>setConsent(e.target.checked)}/>I consent to this cmi5 activity's reported tracking.</label>
    {data?.items.map((row:any)=><article key={row.id}><h3>{row.title}</h3><p>{row.state}{p.author?' · SHA-256 '+row.sha256:''}</p>
      {p.author&&<><button disabled={p.busy||!data.runtimeEnabled||!reviewed||!reason.trim()||row.state!=='quarantined'} onClick={()=>{void review(row,'publish');}}>Publish reviewed cmi5 package</button>
        <button disabled={p.busy||!data.runtimeEnabled||!reviewed||!reason.trim()||row.state!=='published'} onClick={()=>{void review(row,'retire');}}>Retire cmi5 package</button>
        <button disabled={p.busy||!data.runtimeEnabled||!reviewed||!reason.trim()||row.state==='revoked'} onClick={()=>{void review(row,'revoke');}}>Revoke cmi5 package</button>
        <button disabled={p.busy} onClick={()=>{void exportZip(row);}}>Export original cmi5 package</button></>}
      {row.state==='published'&&(auPages[row.id]??row).aus.map((au:any)=><button key={au.id} disabled={p.busy||!consent||!data.runtimeEnabled||au.playbackSupported===false} onClick={()=>{void open(row,au);}}>{p.author?'Preview':'Start'} {au.title}</button>)}
      {row.state==='published'&&row.auTotal>10&&<><button disabled={p.busy||(auPages[row.id]??row).auOffset===0} onClick={()=>{void activityPage(row,Math.max(0,(auPages[row.id]??row).auOffset-10));}}>Previous activities</button><button disabled={p.busy||(auPages[row.id]??row).nextAuOffset==null} onClick={()=>{void activityPage(row,(auPages[row.id]??row).nextAuOffset);}}>Next activities</button></>}
    </article>)}
    <button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous cmi5 packages</button><button disabled={p.busy||data?.nextOffset==null} onClick={()=>setOffset(data.nextOffset)}>Next cmi5 packages</button>
    <h3>Saved cmi5 registrations</h3>
    {registrations?.items.map((r:any)=><button key={r.id} disabled={p.busy} onClick={()=>{void p.run(async()=>{const v=await request<any>('/api/cmi5/registrations/'+r.id+'?admin='+!!p.author,p.session);if(current())setReport(v);});}}>{r.title} · {r.mode}{p.author?' · '+r.learner:''}</button>)}
    <button disabled={p.busy||recordOffset===0} onClick={()=>setRecordOffset(Math.max(0,recordOffset-20))}>Previous cmi5 registrations</button><button disabled={p.busy||registrations?.nextOffset==null} onClick={()=>setRecordOffset(registrations.nextOffset)}>Next cmi5 registrations</button>
    {report&&<div aria-label="cmi5 report"><h3>{report.title}</h3><p>Course satisfaction: {report.satisfied?'Satisfied':'Pending'} · {report.statementCount} recorded statements</p>
      {report.learningBound&&<p>Enrolled completion: {report.officialLearningChanged?'Accepted':'Pending'}.{report.learningKind==='course'?' Course quiz requirements still apply.':''}{!report.waiverAllowed?' This enrollment requires AU evidence and does not permit administrative waivers.':''}</p>}
      {p.author&&report.mode==='Normal'&&<><label htmlFor={waiverReasonId}>cmi5 waiver reason</label><select id={waiverReasonId} value={waiverReason} disabled={p.busy} onChange={e=>{setWaiverReason(e.target.value);setWaiverConfirmed(false);}}><option value="">Choose a reason</option>{cmi5WaiverReasons.map(reason=><option key={reason}>{reason}</option>)}</select><label><input type="checkbox" disabled={p.busy} checked={waiverConfirmed} onChange={e=>setWaiverConfirmed(e.target.checked)}/>I confirm the alternative evidence for this cmi5 waiver.</label></>}
      {report.aus.map((au:any)=><div key={au.id}><p>{au.title} · Completed: {String(au.completed)} · Passed: {String(au.passed)} · Satisfied: {String(au.satisfied)}{au.waived?' · Waived: '+au.waiverReason:''}{au.score?' · Score: '+JSON.stringify(au.score):''}{au.duration?' · Duration: '+au.duration:''}</p>
        <button disabled={p.busy||!consent||!data?.runtimeEnabled||!['published','retired'].includes(report.packageState)||!registrations?.items.some((r:any)=>r.id===report.registrationId&&r.learner===p.session.principal.id)} onClick={()=>{void open({id:report.packageId},au,report.registrationId);}}>{au.waived?'Review':'Resume'} {au.title}</button>
        {p.author&&report.mode==='Normal'&&<button disabled={p.busy||!data?.runtimeEnabled||!['published','retired'].includes(report.packageState)||!report.waiverAllowed||au.satisfied||!waiverReason||!waiverConfirmed} onClick={()=>{void waive(au);}}>Waive {au.title}</button>}</div>)}
      {report.sessions.map((s:any)=><p key={s.id}>{s.waiver?'LMS waiver session':'Session '+s.status}{!s.waiver&&s.expires<=Date.now()?' (expired)':''}</p>)}
    </div>}
    {launch&&<>{launch.launchMethod==='OwnWindow'?<a href={launch.url} target="_blank" rel="noopener noreferrer">Open cmi5 activity in a new window</a>:<iframe key={launch.sessionId} title="cmi5 activity" sandbox="allow-scripts allow-same-origin" src={launch.url} style={{width:'100%',height:'70vh',border:0}}/>}
      <p>Let the activity finish saving before ending the session. An unfinished session is recorded as interrupted.</p>
      <button disabled={p.busy} onClick={()=>{void p.run(async()=>{const v=await request<any>('/api/cmi5/sessions/'+launch.sessionId+'/close',p.session,{});if(current()){setLaunch(undefined);setReport(v);}});}}>End cmi5 session</button></>}
  </section>;
}
