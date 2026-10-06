import React,{useState} from "react";
import type {CaptionTrack} from "../shared/model.ts";
import type {Session} from "./api.ts";
import {UploadField} from "./media.tsx";
export function CaptionEditor(p:{session:Session;tracks?:CaptionTrack[];onChange:(tracks:CaptionTrack[]|undefined)=>void}){
 const [language,setLanguage]=useState<"en"|"vi">("en"),[label,setLabel]=useState("English captions");
 return <details><summary>Add or review caption tracks</summary><fieldset aria-label="Caption authoring"><legend>Original audio/video captions</legend>
  <p>Pear accepts 1–200 ordered plain-text WebVTT cues, at most 64 KiB. No STYLE, REGION, cue settings or markup.</p>
  <label>Caption language<select aria-label="Caption language" value={language} onChange={e=>{const l=e.target.value as "en"|"vi";setLanguage(l);setLabel(l==="en"?"English captions":"Phụ đề tiếng Việt");}}>
   <option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>
  <label>Caption label<input aria-label="Caption label" required maxLength={80} value={label} onChange={e=>setLabel(e.target.value)}/></label>
  <UploadField key={language} session={p.session} kind="caption" onUploaded={assetId=>{
   if(!label.trim())return;p.onChange([...(p.tracks??[]).filter(t=>t.language!==language),{assetId,language,label:label.trim()}]);
  }}/>
  {p.tracks?.map(t=><p key={t.language}>{t.label} · {t.language}
   <button type="button" onClick={()=>{const remaining=p.tracks!.filter(x=>x.language!==t.language);p.onChange(remaining.length?remaining:undefined);}}>Remove {t.language} captions</button></p>)}
 </fieldset></details>;
}
