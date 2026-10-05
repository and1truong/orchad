import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runScenario} from '@orchard/bridge-contract/scenario/run-scenario.mjs';
import {Policy,ok,sidebar} from '../host/policy.mjs';
import {makeCounter} from '../fixtures/counter.mjs';
const scenario=JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@orchard/bridge-contract/scenario/bridge-scenario.json'),'utf8'));
const target={...scenario.target};
test('canonical bridge scenario: coconut Policy + makeCounter',async()=>{
  let dispatched=0,approveNext=true,rev=0;
  const page=makeCounter();
  const p=new Policy(async(t,op,call)=>{if(op==='invoke')dispatched++;return op==='invoke'?page.invoke(call):ok(await page[op]());},{timeout:1000});
  p.bind({...target});
  p.heartbeat();
  await p.execute(sidebar,'host_list_tools',target);
  // Read consent is explicit in this host: the trusted surface grants all
  // tools listed, pinned to their descriptor identity.
  p.consentReads(sidebar,target.targetId,'all');
  const host={
    target,
    readsConsented:true, // consent was granted above; writes still need approval
    listTargets:()=>p.execute(sidebar,'host_list_targets',{}),
    getContext:(t)=>p.execute(sidebar,'host_get_context',t),
    listTools:(t)=>p.execute(sidebar,'host_list_tools',t),
    call:async(call,o)=>{
      p.heartbeat();
      approveNext=o.approve;
      const run=p.execute(sidebar,'host_call_tool',{...target,call},o.signal);
      for(let i=0;i<200&&!p.pending.size;i++)await new Promise(r=>setImmediate(r));
      if(p.pending.size)p.decide([...p.pending.keys()][0],approveNext);
      const r=await run;
      if(r.ok&&Number.isInteger(r.revision))rev=r.revision;
      return r;
    },
    dispatched:()=>dispatched,
    revision:()=>rev,
  };
  const failures=await runScenario(scenario,host,(n,s,d)=>console.log(`  ${s.toUpperCase()} ${n}${d?' — '+d:''}`));
  assert.deepEqual(failures,[]);
});
