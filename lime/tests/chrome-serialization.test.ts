import test from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import vm from "node:vm";
import {fileURLToPath} from "node:url";
test("production-bundled MAIN dispatcher survives Chrome-style function copying for nullable read and CAS write envelopes",async()=>{
 const built=await build({entryPoints:[fileURLToPath(new URL("../src/extension/page-adapter.ts",import.meta.url))],bundle:true,write:false,format:"iife",globalName:"adapter",target:"chrome120"});
 const extension:any={console,TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,crypto,structuredClone};
 vm.createContext(extension);vm.runInContext(built.outputFiles[0].text,extension);
 const calls:any[]=[],page:any={console,TextEncoder};
 page.window=page;page.top=page;
 page.agentBridgeV1={
  describe:async()=>({protocolVersion:"0.1",appId:"orchard-pear",tools:[]}),
  getContext:async()=>({appId:"orchard-pear",documentId:"learning:demo:learner",revision:2,selectionIds:[],summary:"Original source"}),
  invoke:async(call:any)=>{calls.push(call);return {ok:true,revision:call.expectedRevision===null?2:3,data:{title:"Luyện nhớ chủ động",courseId:"original",version:1},error:null};}
 };
 vm.createContext(page);
 // Chrome copies func into another world. Only its own source and explicit
 // arguments cross the boundary; no extension closures are available.
 const copied=vm.runInContext("("+extension.adapter.dispatcher.toString()+")",page);
 const call={requestId:"read",documentId:"learning:demo:learner",toolName:"learning_get_lesson",arguments:{enrollmentId:"own",lessonId:"practice"},expectedRevision:null,idempotencyKey:null};
 const read=JSON.parse(JSON.stringify(await copied("invoke",JSON.stringify(call))));assert.equal(read.ok,true);assert.equal(read.data.title,"Luyện nhớ chủ động");assert.equal(calls[0].expectedRevision,null);assert.equal(calls[0].idempotencyKey,null);
 const write=JSON.parse(JSON.stringify(await copied("invoke",JSON.stringify({...call,requestId:"write",toolName:"learning_set_bookmark",arguments:{courseId:"original",saved:true},expectedRevision:2,idempotencyKey:"original-key"}))));assert.equal(write.revision,3);
 assert.equal((await copied("getContext")).revision,2);assert.equal((await copied("describe")).protocolVersion,"0.1");
 await assert.rejects(()=>copied("invoke",JSON.stringify({...call,expectedRevision:undefined})));
 page.agentBridgeV1.invoke=async()=>({ok:true,revision:2,data:{text:"x".repeat(65536)},error:null});await assert.rejects(()=>copied("invoke",call),/Oversized/);
});