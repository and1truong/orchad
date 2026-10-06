import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateRecording,casesHash,type QualityCase} from "../evaluation/quality.ts";
const cases=JSON.parse(readFileSync(new URL("../evaluation/original-quality-cases.json",import.meta.url),"utf8")).cases as QualityCase[];
function recording(){return {version:1,provenance:"synthetic_calibration",declaredRuntime:"Synthetic judge calibration only; not Lime/Mango inference",casesHash:casesHash(cases),responses:cases.map(c=>({caseId:c.id,sourceIds:c.relevantIds,selectedIds:c.relevantIds,actions:c.allowedActions.slice(0,1),abstained:c.expectAbstention,structuredClaims:{officialCompletion:false,accredited:false,marketBenchmark:false},explanation:"Original synthetic calibration response"}))};}
test("complete synthetic judge calibration never upgrades into model/reference quality evidence, even with self-declared runtime/human ratings",()=>{
 const r=recording(),result=evaluateRecording(cases,r);assert.equal(result.counts.checked,cases.length);assert.equal(result.counts.humanNotRun,cases.length);assert.equal(result.modelQuality,"NOT_VERIFIED");assert.equal(result.referenceParity,"NOT_VERIFIED");assert.equal(result.actualRuntimeVerified,false);
 const claimed={...r,provenance:"unverified_recording",declaredRuntime:"Claims actual Mango",humanReviews:cases.map(c=>({caseId:c.id,reviewer:"self-declared",groundedness:2,usefulness:2,note:"self-declared"}))};const second=evaluateRecording(cases,claimed);assert.equal(second.modelQuality,"NOT_VERIFIED");assert.equal(second.actualRuntimeVerified,false);assert.equal(second.counts.humanNotRun,0);assert.equal((second.cases[0]!.humanReview as any).provenance,"self_declared_unverified");
});
test("cross-audience references, source-free selection, official/commercial claims, model submit and missed no-match each fail the structured profile",()=>{
 for(const edit of [
  (r:any)=>{r.responses[0].sourceIds=["other-tenant-secret"];r.responses[0].selectedIds=["other-tenant-secret"];},
  (r:any)=>{r.responses[0].sourceIds=[];},
  (r:any)=>{r.responses[0].structuredClaims.officialCompletion=true;},
  (r:any)=>{r.responses[0].structuredClaims.accredited=true;},
  (r:any)=>{r.responses[0].structuredClaims.marketBenchmark=true;},
  (r:any)=>{r.responses[5].actions=["human_submit_attempt"];},
  (r:any)=>{r.responses[3].abstained=false;r.responses[3].selectedIds=["systems-basics"];r.responses[3].sourceIds=["systems-basics"];}
 ]){const r=recording();edit(r);assert.ok(evaluateRecording(cases,r).counts.failed>0);}
});
test("missing cases, wrong exact case hash, duplicate/unknown IDs, oversized input and fabricated verified provenance cannot count as completion",()=>{
 const r=recording();r.responses.pop();assert.equal(evaluateRecording(cases,r).counts.notRun,1);
 assert.throws(()=>evaluateRecording(cases,{...recording(),casesHash:"0".repeat(64)}),/exact original case set/);
 const duplicate=recording();duplicate.responses.push(duplicate.responses[0]!);assert.throws(()=>evaluateRecording(cases,duplicate),/Duplicate/);
 const unknown=recording();unknown.responses[0]!.caseId="unknown";assert.throws(()=>evaluateRecording(cases,unknown),/unknown/);
 assert.throws(()=>evaluateRecording(cases,{...recording(),provenance:"actual_verified"}),/Invalid bounded/);
 const huge=recording();huge.responses[0]!.explanation="x".repeat(2001);assert.throws(()=>evaluateRecording(cases,huge),/Invalid bounded/);
});
test("export is redacted to case IDs/metrics/reasons; raw prompts, explanations, runtime claims and reviewer notes are not echoed",()=>{
 const r=recording();r.responses[0]!.explanation="Original <script>untrusted literal private explanation</script>";r.declaredRuntime="private runtime descriptor";const output=JSON.stringify(evaluateRecording(cases,{...r,humanReviews:[{caseId:cases[0]!.id,reviewer:"private-name",groundedness:1,usefulness:1,note:"private review note"}]}));for(const secret of ["untrusted literal private explanation","private runtime descriptor","private-name","private review note",cases[0]!.prompt])assert.ok(!output.includes(secret));
});
