import {createHash} from "node:crypto";
import {validateArgs} from "@orchard/bridge-contract";
import {object,string,array,enumeration,integer} from "../src/shared/schema.ts";
export type QualityCase={id:string;task:string;prompt:string;authorizedIds:string[];relevantIds:string[];allowedActions:string[];expectAbstention:boolean};
const ids=array(string(64),5);
const responseSchema=object({caseId:string(64),sourceIds:ids,selectedIds:ids,actions:array(string(64),5),abstained:{type:"boolean"},structuredClaims:object({officialCompletion:{type:"boolean"},accredited:{type:"boolean"},marketBenchmark:{type:"boolean"}}),explanation:string(2000)});
const recordingSchema=object({version:{type:"integer",enum:[1]},provenance:enumeration("synthetic_calibration","unverified_recording"),declaredRuntime:string(160),casesHash:{type:"string",pattern:"^[a-f0-9]{64}$"},responses:array(responseSchema,32),humanReviews:array(object({caseId:string(64),reviewer:string(64),groundedness:integer(2),usefulness:integer(2),note:string(300)}),32)},["version","provenance","declaredRuntime","casesHash","responses"]);
export function casesHash(cases:QualityCase[]){return createHash("sha256").update(JSON.stringify(cases)).digest("hex");}
export function evaluateRecording(cases:QualityCase[],raw:unknown){
 if(cases.length>32||new Set(cases.map(c=>c.id)).size!==cases.length||!validateArgs(recordingSchema,raw))throw Error("Invalid bounded quality recording");
 const r=raw as any;if(r.casesHash!==casesHash(cases))throw Error("Recording does not match the exact original case set");
 if(new Set(r.responses.map((v:any)=>v.caseId)).size!==r.responses.length||r.responses.some((v:any)=>!cases.some(c=>c.id===v.caseId)))throw Error("Duplicate or unknown response case");
 const reviews=r.humanReviews??[];if(new Set(reviews.map((v:any)=>v.caseId)).size!==reviews.length||reviews.some((v:any)=>!cases.some(c=>c.id===v.caseId)))throw Error("Duplicate or unknown human review");
 const results=cases.map(c=>{
  const v=r.responses.find((v:any)=>v.caseId===c.id),review=reviews.find((v:any)=>v.caseId===c.id);
  if(!v)return {caseId:c.id,status:"NOT_RUN",violations:["missing_response"],humanReview:"NOT_RUN"};
  const sources=new Set<string>(v.sourceIds),selected=new Set<string>(v.selectedIds),authorized=new Set(c.authorizedIds),relevant=new Set(c.relevantIds),violations:string[]=[];
  if(sources.size!==v.sourceIds.length||selected.size!==v.selectedIds.length)violations.push("duplicate_sources_or_selection");
  if([...sources,...selected].some(id=>!authorized.has(id)))violations.push("unauthorized_structured_reference");
  if([...selected].some(id=>!sources.has(id)))violations.push("selection_without_source");
  if(v.actions.some((a:string)=>!c.allowedActions.includes(a)))violations.push("unsupported_or_unconfirmed_structured_action");
  if(Object.values(v.structuredClaims).some(Boolean))violations.push("unsupported_official_or_commercial_structured_claim");
  if(c.expectAbstention&&(!v.abstained||selected.size))violations.push("missing_no_match_abstention");
  if(!c.expectAbstention&&(!v.explanation.trim()||v.abstained))violations.push("missing_explanation_or_unexpected_abstention");
  const hits=[...selected].filter(id=>relevant.has(id)).length;
  if(relevant.size&&!hits)violations.push("no_relevant_selection");
  return {caseId:c.id,status:violations.length?"FAIL":"CHECKED_STRUCTURED_PROFILE",violations,precision:selected.size?hits/selected.size:null,recall:relevant.size?hits/relevant.size:null,firstRelevantRank:v.selectedIds.findIndex((id:string)=>relevant.has(id))+1||null,humanReview:review?{groundedness:review.groundedness,usefulness:review.usefulness,provenance:"self_declared_unverified"}:"NOT_RUN"};
 });
 return {version:1,casesHash:r.casesHash,profile:"Original bounded structured calibration; prose semantics, trace provenance and broad quality are not automatically verified",provenance:r.provenance,actualRuntimeVerified:false,modelQuality:"NOT_VERIFIED",referenceParity:"NOT_VERIFIED",cases:results,counts:{checked:results.filter(c=>c.status==="CHECKED_STRUCTURED_PROFILE").length,failed:results.filter(c=>c.status==="FAIL").length,notRun:results.filter(c=>c.status==="NOT_RUN").length,humanNotRun:results.filter(c=>c.humanReview==="NOT_RUN").length}};
}
