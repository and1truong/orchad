import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {fileURLToPath} from "node:url";
import {Policy,ok} from "../host/policy.mjs";
import {startMcp} from "../host/mcp.mjs";
const listen=async(server,port=0)=>{
 await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});return server.address().port;
};
const close=server=>new Promise(resolve=>server.close(resolve));
test("sidecar without durable gateway exits on native parent EOF and releases MCP listener",async()=>{
 const reserved=createServer();const port=await listen(reserved);await close(reserved);
 const child=spawn(process.execPath,[fileURLToPath(new URL("../host/sidecar.mjs",import.meta.url))],{
  env:{...process.env,COCONUT_MCP_PORT:String(port),COCONUT_GATEWAY_URL:"",COCONUT_GATEWAY_TOKEN:"",COCONUT_GATEWAY_MODEL:""},
  stdio:["pipe","pipe","pipe"]});
 let output="",stderr="";child.stderr.on("data",d=>stderr+=d);
 let timer;
 try{
  await new Promise((resolve,reject)=>{
   timer=setTimeout(()=>reject(Error("Sidecar did not become ready: "+stderr.slice(-1000))),5000);
   child.once("error",reject);child.stdout.on("data",d=>{
    output+=d;if(output.includes('"kind":"ready"')){clearTimeout(timer);resolve();}
   });
  });
  const done=once(child,"exit");child.stdin.end();
  const [code]=await Promise.race([done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("Sidecar retained listener after EOF")),3000);})]);
  clearTimeout(timer);assert.equal(code,0);
  const replacement=createServer();await listen(replacement,port);await close(replacement);
 }finally{clearTimeout(timer);if(child.exitCode===null){child.kill("SIGKILL");await once(child,"exit");}}
});
test("MCP occupied listener rejects with bind error rather than dereferencing a null address",async()=>{
 const occupied=createServer();const port=await listen(occupied);
 try{const policy=new Policy(async()=>ok({}));await assert.rejects(startMcp(policy,port),{code:"EADDRINUSE"});}
 finally{await close(occupied);}
});
