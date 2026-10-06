import {test} from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {diagnosticText,humanError} from "../src/client/diagnostics.ts";
import {getUILocale,setUILocale} from "../src/client/i18n.ts";
import {request,createBridge,type Session} from "../src/client/api.ts";
test("human locale preserves machine codes, known corrective diagnostic and unknown authored/prototype-key literals without HTML execution",()=>{
 assert.equal(humanError("FORBIDDEN","Enrollment access denied","en"),"FORBIDDEN: Enrollment access denied");
 assert.equal(humanError("FORBIDDEN","Enrollment access denied","vi"),"FORBIDDEN: Bạn không có quyền truy cập bản đăng ký này.");
 for(const text of ["__proto__","constructor","toString","Original <img src=x onerror=alert(1)>","Course unavailable · original authored ID"])assert.equal(diagnosticText(text,"vi"),text);
 assert.equal(diagnosticText("Host mismatch","vi"),"Địa chỉ máy chủ không khớp.");assert.match(renderToStaticMarkup(createElement("p",null,diagnosticText("Original <img src=x onerror=alert(1)>","vi"))),/&lt;img/);
});
test("human request localizes actual failed response while bridge exception and Result remain byte-equivalent English in Vietnamese UI",async()=>{
 const original=globalThis.fetch,locale=getUILocale(),session={principal:{id:"original",tenant:"demo",role:"learner"},csrf:"csrf",sessionEpoch:"epoch"} as Session,wire={ok:false,revision:null,data:null,error:{code:"FORBIDDEN",message:"Enrollment access denied",retryable:false}};
 try{
  setUILocale("vi");globalThis.fetch=async()=>new Response(JSON.stringify(wire),{status:403,headers:{"content-type":"application/json"}});
  await assert.rejects(()=>request("/api/original",session),{message:"FORBIDDEN: Bạn không có quyền truy cập bản đăng ký này."});
  const bridge=createBridge(session,()=>"learning:demo:original",()=>assert.fail("Denied bridge must not notify a mutation"));
  await assert.rejects(()=>bridge.describe(),{message:"FORBIDDEN: Enrollment access denied"});
  const result=await bridge.invoke({requestId:"original-wire",documentId:"learning:demo:original",toolName:"learning_start_attempt",arguments:{enrollmentId:"original"},expectedRevision:0,idempotencyKey:"original-key"});assert.equal(JSON.stringify(result),JSON.stringify(wire));
 }finally{globalThis.fetch=original;setUILocale(locale);}
});
test("lost human write response is an explicit unknown outcome without automatic replay, and bridge preserves its existing reconciliation result",async()=>{
 const original=globalThis.fetch,locale=getUILocale(),session={principal:{id:"original",tenant:"demo",role:"learner"},csrf:"csrf",sessionEpoch:"epoch"} as Session;let calls=0;
 try{
  setUILocale("vi");globalThis.fetch=async()=>{calls++;throw new TypeError("Failed to fetch");};
  await assert.rejects(()=>request("/api/human/invoke",session,{idempotencyKey:"original-write",expectedRevision:0}),{message:"Chưa biết thao tác đã được ghi nhận chưa. Hãy làm mới dữ liệu trước khi xác nhận thao tác tiếp."});assert.equal(calls,1);
  await assert.rejects(()=>request("/api/context",session),{message:"Không thể kết nối để gửi yêu cầu."});assert.equal(calls,2);
  const bridge=createBridge(session,()=>"learning:demo:original",()=>assert.fail("Unknown outcome is not confirmed mutation"));const result=await bridge.invoke({requestId:"original",documentId:"learning:demo:original",toolName:"learning_start_attempt",arguments:{enrollmentId:"original"},expectedRevision:0,idempotencyKey:"original-key"});assert.equal(result.ok,false);assert.equal(result.error!.message,"Dispatch outcome unknown; reconcile progress and original operation key before retrying");assert.equal(calls,3);
 }finally{globalThis.fetch=original;setUILocale(locale);}
});
