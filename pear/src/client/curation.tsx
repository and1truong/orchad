import React,{useEffect,useState} from "react";
type Ops={op:(name:string,args?:Record<string,unknown>)=>Promise<any>;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;
 run:(fn:()=>Promise<void>)=>Promise<boolean>;busy:boolean;tick:number;isCurrent:()=>boolean};
const empty={endorsed:false,featured:false,spotlight:false,retiring:false};
export function CurationPanel(p:Ops){
 const [kind,setKind]=useState("course"),[id,setId]=useState("systems-basics"),[replacement,setReplacement]=useState("learning-vi"),
  [policy,setPolicy]=useState(empty),[reason,setReason]=useState(""),[review,setReview]=useState<any>(null),[status,setStatus]=useState("");
 const invalidate=()=>{setReview(null);setStatus("");};
 return <section className="panel" aria-label="Content curation">
  <h2>Content curation and retirement</h2>
  <fieldset disabled={p.busy}>
   <label>Curation content type<select aria-label="Curation content type" value={kind} onChange={e=>{setKind(e.target.value);invalidate();}}>
    <option value="course">Course</option><option value="item">Standalone item</option></select></label>
   <label>Curation content ID<input value={id} maxLength={64} onChange={e=>{setId(e.target.value);invalidate();}} /></label>
   <button type="button" onClick={()=>void p.run(async()=>{
    const result=await p.op("learning_get_curation",{kind,contentId:id});
    if(!p.isCurrent())return;setPolicy({endorsed:!!result.policy.endorsed,featured:!!result.policy.featured,spotlight:!!result.policy.spotlight,retiring:!!result.policy.retiring});
    setStatus("Current state: "+result.state+" · Version "+result.version);
   })}>Load curation policy</button>
   {(Object.keys(empty) as (keyof typeof empty)[]).map(key=><label className="choice" key={key}>
    <input type="checkbox" checked={policy[key]} onChange={e=>setPolicy({...policy,[key]:e.target.checked})}/>
    {key==="retiring"?"Mark retiring":key==="endorsed"?"Organization endorsed":key==="featured"?"Organization featured":"Organization spotlight"}
   </label>)}
   <label>Curation change reason<input maxLength={600} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <button type="button" disabled={!id||!reason.trim()} onClick={()=>void p.run(async()=>{
    await p.mutate("learning_save_curation",{kind,contentId:id,policy,reason});if(p.isCurrent())setStatus("Curation saved");
   })}>Save curation policy</button>
   <label>Replacement content ID<input maxLength={64} value={replacement} onChange={e=>{setReplacement(e.target.value);invalidate();}}/></label>
   <button type="button" disabled={!id||!replacement} onClick={()=>void p.run(async()=>{
    const result=await p.op("learning_preview_retirement",{kind,contentId:id,replacementId:replacement});
    if(p.isCurrent())setReview(result);
   })}>Preview retirement impact</button>
   {review&&<div aria-label="Reviewed retirement impact">
    <h3>{review.source.title} → {review.replacement.title}</h3>
    <p>{review.impact.pinnedEnrollments} pinned enrollments · {review.impact.completedEnrollments} completed ·
      {review.impact.pinnedCourseVersions} course versions · {review.impact.pinnedCollectionVersions} collection versions ·
      {review.impact.assignmentPlans} assignment plans</p>
    {review.warnings.map((warning:string)=><p key={warning}>{warning}</p>)}
   </div>}
   <button type="button" disabled={!review||!reason.trim()} onClick={()=>void p.run(async()=>{
    await p.mutate("learning_retire_with_replacement",{kind,contentId:id,replacementId:replacement,previewHash:review.previewHash,reason});
    if(p.isCurrent()){setReview(null);setStatus("Retired with reviewed replacement; existing learning preserved");}
   })}>Retire with reviewed replacement</button>
  </fieldset>
  {status&&<p role="status">{status}</p>}
 </section>;
}
export function CuratedContent(p:Ops&{onChoose:(kind:string,id:string)=>void}){
 const [items,setItems]=useState<any[]>([]),[offset,setOffset]=useState(0),[next,setNext]=useState<number|null>(null);
 const [kind,setKind]=useState("course"),[id,setId]=useState(""),[alternative,setAlternative]=useState<any>(null),[error,setError]=useState("");
 useEffect(()=>{let current=true;void p.op("learning_get_curated_content",{offset,limit:20}).then(r=>{
  if(current&&p.isCurrent()){setItems(r.items);setNext(r.nextOffset);setError("");}
 }).catch(e=>{if(current&&p.isCurrent()){setItems([]);setNext(null);setError(e.message);}});
 return()=>{current=false;};},[p.tick,offset]);
 return <section className="panel" aria-label="Organization curated content">
  <h2>Organization picks</h2>
  {error&&<p role="status">{error}</p>}
  {!items.length&&<p>No organization promotions on this page.</p>}
  {items.map(item=><div key={item.kind+":"+item.id}>
   <h3>{item.title}</h3><p>{item.reasons.join(" · ")} · {item.language} · Version {item.version}{item.retiring?" · Retiring":""}</p>
   <button type="button" disabled={p.busy} onClick={()=>p.onChoose(item.kind,item.id)}>Preview organization pick</button>
  </div>)}
  <div className="actions"><button disabled={p.busy||offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous organization picks</button>
   <button disabled={p.busy||next===null} onClick={()=>setOffset(next!)}>Next organization picks</button></div>
  <form aria-label="Retired content alternatives" onSubmit={e=>{e.preventDefault();void p.run(async()=>{
   setAlternative(null);const result=await p.op("learning_get_retirement_alternative",{kind,contentId:id});if(p.isCurrent())setAlternative(result);
  });}}>
   <label>Retired content type<select aria-label="Retired content type" value={kind} onChange={e=>{setKind(e.target.value);setAlternative(null);}}>
    <option value="course">Course</option><option value="item">Standalone item</option></select></label>
   <label>Retired content ID<input required maxLength={64} value={id} onChange={e=>{setId(e.target.value);setAlternative(null);}}/></label>
   <button disabled={p.busy}>Find reviewed alternative</button>
  </form>
  {alternative&&(alternative.available?<div><h3>{alternative.replacement.title}</h3><p>Explicit alternative · existing learning remains pinned</p>
   <button disabled={p.busy} onClick={()=>p.onChoose(alternative.replacement.kind,alternative.replacement.id)}>Preview reviewed alternative</button></div>
   :<p>{alternative.reason}</p>)}
 </section>;
}
