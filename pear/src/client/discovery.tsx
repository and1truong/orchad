import React,{useEffect,useState} from "react";
import {accessibilityFeatures} from "../shared/discovery.ts";
type Props={op:(name:string,args?:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;busy:boolean;tick:number;
 isCurrent:()=>boolean;onChoose:(id:string)=>void};
export function Discovery(p:Props){
 const [filters,setFilters]=useState<Record<string,string>>({query:"",queryMode:"keyword",sort:"relevance"}),
  [features,setFeatures]=useState<string[]>([]),[descending,setDescending]=useState(true),
  [rows,setRows]=useState<any[]>([]),[history,setHistory]=useState<number[]>([]),[offset,setOffset]=useState(0),[next,setNext]=useState<number|null>(null),
  [selected,setSelected]=useState<string[]>([]),[comparison,setComparison]=useState<any>(null),[recommendations,setRecommendations]=useState<any>(null);
 const text=(name:string,label:string,type="text")=><label key={name}>{label}
  <input aria-label={label} type={type} maxLength={name==="query"?160:100} value={filters[name]??""}
    onChange={e=>setFilters({...filters,[name]:e.target.value})}/></label>;
 const select=(name:string,label:string,values:string[],blank=true)=><label key={name}>{label}
  <select aria-label={label} value={filters[name]??""} onChange={e=>setFilters({...filters,[name]:e.target.value})}>
   {blank&&<option value="">Any</option>}{values.map(value=><option value={value} key={value}>{value}</option>)}
  </select></label>;
 const args=(page:number)=>{
  const a:Record<string,unknown>={offset:page,limit:20,descending};
  for(const [key,value] of Object.entries(filters))if(value&&key!=="skills"&&key!=="processing")
   a[key]=["minDuration","maxDuration","ratingAtLeast"].includes(key)?Number(value):value;
  if(filters.skills?.trim())a.skills=filters.skills.split("\n").map(v=>v.trim()).filter(Boolean);
  if(features.length)a.accessibility=features;
  if(filters.processing)a.aiProcessingAllowed=filters.processing==="allowed";
  return a;
 };
 const search=async(page:number,direction:"reset"|"next"|"previous"="reset")=>{
  const result=await p.op("learning_search",args(page));
  if(!p.isCurrent())return;setRows(result.items);setHistory(h=>direction==="next"?[...h,offset]:direction==="previous"?h.slice(0,-1):[]);setOffset(page);setNext(result.nextOffset);setComparison(null);
 };
 useEffect(()=>{let current=true;void p.op("learning_get_recommendations",{limit:10}).then(r=>{
  if(current&&p.isCurrent())setRecommendations(r);
 }).catch(()=>{if(current&&p.isCurrent())setRecommendations(null);});return()=>{current=false;};},[p.tick]);
 return <section className="panel" aria-label="Advanced course discovery">
  <h2>Filter and compare courses</h2>
  <p>Controlled concepts are a transparent local retrieval rule system. Accessibility claims are author-declared.
    Publication dates refer to Pear transactions; legacy unknown dates remain unknown.</p>
  <form aria-label="Advanced search filters" onSubmit={e=>{e.preventDefault();setSelected([]);void p.run(()=>search(0));}}>
   <fieldset disabled={p.busy}>
    {text("query","Advanced search keywords")}
    {select("queryMode","Retrieval mode",["keyword","concepts"],false)}
    {text("topic","Exact topic")}{text("provider","Exact provider")}
    {select("language","Advanced content language",["en","vi"])}{select("level","Advanced level",["beginner","intermediate","advanced"])}
    {text("minDuration","Minimum intended minutes","number")}{text("maxDuration","Maximum intended minutes","number")}
    <label>Required skills · one per line<textarea aria-label="Required skills · one per line" maxLength={640} value={filters.skills??""}
     onChange={e=>setFilters({...filters,skills:e.target.value})}/></label>
    {text("industry","Industry")}{select("format","Lesson format",["text","video","link","audio","document","interactive","submission","event"])}
    {select("ratingAtLeast","Minimum mean rating",["1","2","3","4","5"])}{text("publishedSince","Pear published since (UTC)","date")}
    {select("promotion","Organization promotion",["endorsed","featured","spotlight"])}
    {select("processing","Model processing policy",["allowed","human_only"])}
    {accessibilityFeatures.map(feature=><label className="choice" key={feature}>
     <input type="checkbox" aria-label={"Require declared "+feature} checked={features.includes(feature)}
      onChange={e=>setFeatures(e.target.checked?[...features,feature]:features.filter(v=>v!==feature))}/>Require declared {feature}
    </label>)}
    {select("sort","Discovery sort",["relevance","title","duration","rating","published"],false)}
    <label className="choice"><input type="checkbox" checked={descending} onChange={e=>setDescending(e.target.checked)}/>Descending discovery order</label>
    <button>Search reviewed filters</button>
   </fieldset>
  </form>
  {rows.map(row=><section className="learning-row" key={row.id}>
   <div><h3>{row.title}</h3><p>{row.duration} intended minutes · {row.language} · Version {row.version}</p>
    <p>{row.discovery.skills.join(" · ")} · {row.discovery.industries.join(" · ")}</p>
    <p>Mean rating: {row.rating.average??"Unrated"} ({row.rating.count}) · Pear published: {row.publishedAt??"Unknown legacy date"}</p>
    <p>{row.discovery.outcomes.join(" · ")}</p>
   </div>
   <label className="choice"><input type="checkbox" aria-label={"Compare "+row.title} checked={selected.includes(row.id)}
     disabled={p.busy||(!selected.includes(row.id)&&selected.length>=4)} onChange={e=>setSelected(e.target.checked?[...selected,row.id]:selected.filter(id=>id!==row.id))}/>Compare</label>
   <button disabled={p.busy} onClick={()=>p.onChoose(row.id)}>Preview filtered course</button>
  </section>)}
  <div className="actions">
   <button disabled={p.busy||history.length===0} onClick={()=>void p.run(()=>search(history[history.length-1],"previous"))}>Previous filtered courses</button>
   <button disabled={p.busy||next===null} onClick={()=>void p.run(()=>search(next!,"next"))}>Next filtered courses</button>
   <button disabled={p.busy||selected.length<2} onClick={()=>void p.run(async()=>{
    const r=await p.op("learning_compare_courses",{courseIds:selected});if(p.isCurrent())setComparison(r);
   })}>Compare selected courses</button>
  </div>
  {comparison&&<div className="table-wrap" aria-label="Reviewed course comparison">
   <table><caption>Current authorized course metadata · no automatic enrollment</caption>
    <thead><tr><th scope="col">Course</th><th scope="col">Intended minutes</th><th scope="col">Outcomes</th><th scope="col">Declared accessibility</th></tr></thead>
    <tbody>{comparison.items.map((row:any)=><tr key={row.id}><th scope="row">{row.title} · Version {row.version}</th><td>{row.duration}</td>
     <td>{row.discovery.outcomes.join(" · ")}</td><td>{row.discovery.accessibility.features.join(" · ")||"Unknown"}</td></tr>)}</tbody>
   </table>
  </div>}
  {recommendations&&<section aria-label="Grounded profile recommendations"><h3>Recommendations from your declared profile</h3>
   <p>{recommendations.method}</p>{recommendations.noMatchReason&&<p>{recommendations.noMatchReason}</p>}
   {recommendations.items.map((row:any)=><div key={row.id}><p><strong>{row.title}</strong></p><p>{row.reasons.join(" · ")} · Source {row.id}</p>
    <button disabled={p.busy} onClick={()=>p.onChoose(row.id)}>Preview profile recommendation</button></div>)}
  </section>}
 </section>;
}
