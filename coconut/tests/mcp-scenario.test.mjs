import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {startMcp} from '../host/mcp.mjs';
import {Policy,ok} from '../host/policy.mjs';
import {makeCounter} from '../fixtures/counter.mjs';
import {runScenario} from '../../acceptance/run-scenario.mjs';
// Canonical scenario over the REAL MCP transport (no GUI): the strongest
// integrated evidence this POC can give without a Tauri webview.
const scenario=JSON.parse(readFileSync(new URL('../../acceptance/bridge-scenario.json',import.meta.url),'utf8'));
const target={...scenario.target};
test('canonical bridge scenario over real MCP transport',async()=>{
  let dispatched=0,approveNext=true,rev=0;
  const page=makeCounter();
  const policy=new Policy(async(t,op,call)=>{if(op==='invoke')dispatched++;return op==='invoke'?page.invoke(call):ok(await page[op]());},{timeout:5000});
  policy.bind({...target});policy.heartbeat();
  const pair=policy.pair('scenario-mcp',['read','write'],[target.targetId]);
  const server=await startMcp(policy,0);
  const realPort=server.port;
  const client=new Client({name:'scenario',version:'1.0.0'});
  const transport=new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${realPort}/mcp`),{requestInit:{headers:{Authorization:`Bearer ${pair.token}`}}});
  const invoke=async(name,args,signal)=>{
    const r=await client.callTool({name,arguments:args},undefined,signal?{signal}:undefined);
    return r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text').text);
  };
  const host={
    target,
    readsConsented:false,
    listTargets:()=>invoke('host_list_targets',{}),
    getContext:(t)=>invoke('host_get_context',t),
    listTools:(t)=>invoke('host_list_tools',t),
    call:async(call,o)=>{
      policy.heartbeat();approveNext=o.approve;
      const run=invoke('host_call_tool',{...target,call},o.signal);
      // Wait briefly for an approval card; if the caller aborts first the
      // server-side signal cancels the pending call instead.
      const decided={v:false};
      const poll=(async()=>{for(let i=0;i<2000&&!decided.v&&!o.signal.aborted;i++){
        await new Promise(r=>setImmediate(r));
        const a=[...policy.pending.values()][0];
        if(a){policy.decide(a.id,approveNext);decided.v=true;}
      }})();
      const r=await run.catch(async(e)=>{
        for(const a of[...policy.pending.values()])policy.decide(a.id,false);
        // Client-side abort surfaces as a rejected callTool promise; the
        // contract-level meaning is a CANCELLED result with zero dispatch.
        if(o.signal.aborted)return{ok:false,revision:null,data:null,error:{code:'CANCELLED',message:String(e&&e.message||e)}};
        throw e;
      });
      await poll;
      if(r.ok&&Number.isInteger(r.revision))rev=r.revision;
      return r;
    },
    dispatched:()=>dispatched,revision:()=>rev,
  };
  try{
    await client.connect(transport);
    const failures=await runScenario(scenario,host,(n,s,d)=>console.log(`  ${s.toUpperCase()} ${n}${d?' — '+d:''}`));
    assert.deepEqual(failures,[]);
  }finally{await client.close();await server.close();}
});
