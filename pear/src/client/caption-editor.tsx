import {translateUI} from "./i18n.ts";
import React,{useState} from "react";
import type {CaptionTrack} from "../shared/model.ts";
import type {Session} from "./api.ts";
import {UploadField} from "./media.tsx";
export function CaptionEditor(p:{session:Session;tracks?:CaptionTrack[];onChange:(tracks:CaptionTrack[]|undefined)=>void}){
 const [language,setLanguage]=useState<"en"|"vi">("en"),[label,setLabel]=useState("English captions");
 return <details><summary>{translateUI("Add or review caption tracks")}</summary><fieldset aria-label={translateUI("Caption authoring")}><legend>{translateUI("Original audio/video captions")}</legend>
  <p>{translateUI("Pear accepts 1–200 ordered plain-text WebVTT cues, at most 64 KiB. No STYLE, REGION, cue settings or markup.")}</p>
  <label>{translateUI("Caption language")}<select aria-label={translateUI("Caption language")} value={language} onChange={e=>{const l=e.target.value as "en"|"vi";setLanguage(l);setLabel(l==="en"?"English captions":"Phụ đề tiếng Việt");}}>
   <option value="en">{translateUI("English")}</option><option value="vi">{translateUI("Tiếng Việt")}</option></select></label>
  <label>{translateUI("Caption label")}<input aria-label={translateUI("Caption label")} required maxLength={80} value={label} onChange={e=>setLabel(e.target.value)}/></label>
  <UploadField key={language} session={p.session} kind="caption" onUploaded={assetId=>{
   if(!label.trim())return;p.onChange([...(p.tracks??[]).filter(t=>t.language!==language),{assetId,language,label:label.trim()}]);
  }}/>
  {p.tracks?.map(t=><p key={t.language}>{t.label} · {t.language}
   <button type="button" onClick={()=>{const remaining=p.tracks!.filter(x=>x.language!==t.language);p.onChange(remaining.length?remaining:undefined);}}>{translateUI("Remove")}{" "}{t.language} captions</button></p>)}
 </fieldset></details>;
}
