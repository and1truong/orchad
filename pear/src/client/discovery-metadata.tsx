import {translateUI} from "./i18n.ts";
import React from "react";
import {accessibilityFeatures,type DiscoveryMetadata} from "../shared/discovery.ts";
const empty=():DiscoveryMetadata=>({skills:[],industries:[],outcomes:[],accessibility:{features:[],provenance:"author_declared"}});
export function DiscoveryMetadataEditor({value,onChange}:{value?:DiscoveryMetadata;onChange:(value?:DiscoveryMetadata)=>void}){
 const md=value??empty();
 return <fieldset><legend>{translateUI("Optional discovery metadata")}</legend>
  {(["skills","industries","outcomes"] as const).map(key=><label key={key}>{translateUI("Discovery")}{" "}{key} · one per line
   <textarea aria-label={translateUI("Discovery")+" "+translateUI(key)+" · "+translateUI("one per line")} maxLength={key==="outcomes"?2400:640}
    value={md[key].join("\n")} onChange={e=>onChange({...md,[key]:e.target.value.split("\n").map(v=>v.trim()).filter(Boolean)})}/>
  </label>)}
  <p>{translateUI("Accessibility features are author-declared metadata. They do not establish audited compliance.")}</p>
  {accessibilityFeatures.map(feature=><label className="choice" key={feature}>
   <input type="checkbox" aria-label={translateUI("Author-declared")+" "+translateUI(feature)}
    checked={md.accessibility.features.includes(feature)} onChange={e=>onChange({...md,accessibility:{
     provenance:"author_declared",features:e.target.checked?[...md.accessibility.features,feature]:md.accessibility.features.filter(v=>v!==feature)
    }})}/>{translateUI("Author-declared")}{" "}{translateUI(feature)}
  </label>)}
  <button type="button" onClick={()=>onChange(undefined)}>{translateUI("Clear optional discovery metadata")}</button>
 </fieldset>;
}
