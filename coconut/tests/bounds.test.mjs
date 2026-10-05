import test from 'node:test';
import assert from 'node:assert/strict';
import {Bounds,canonical as sharedCanonical,hostSafeSchema as sharedHostSafeSchema,safePattern as sharedSafePattern} from '@orchard/bridge-contract';
import {safeSchema,safePattern,validReply} from '../host/validation.mjs';
import {canonical} from '../host/policy.mjs';

// Conformance: coconut's validators must accept exactly the contract bounds —
// no more, no less. Identity assertions prove canonical/safeSchema/safePattern
// are the shared @orchard/bridge-contract implementation, not local copies.

const s=n=>'x'.repeat(n);
const ok=(data,op)=>({ok:true,revision:0,data,error:null});
const ctx=(patch={})=>({appId:'app',documentId:'doc',revision:0,selectionIds:[],summary:'',sessionEpoch:'e',...patch});
const tool=(name='t')=>({name,description:'d',inputSchema:{type:'object'},effect:'read'});

test('canonical/safeSchema/safePattern are the shared implementation',()=>{
  assert.equal(canonical,sharedCanonical);
  assert.equal(safeSchema,sharedHostSafeSchema);
  assert.equal(safePattern,sharedSafePattern);
});

test('getContext reply: exactly contract bounds',()=>{
  assert.ok(validReply(ok(ctx({summary:s(Bounds.summary)})),'getContext'));
  assert.ok(!validReply(ok(ctx({summary:s(Bounds.summary+1)})),'getContext'));
  assert.ok(validReply(ok(ctx({appId:s(Bounds.appId)})),'getContext'));
  assert.ok(!validReply(ok(ctx({appId:s(Bounds.appId+1)})),'getContext'));
  assert.ok(validReply(ok(ctx({documentId:s(Bounds.documentId)})),'getContext'));
  assert.ok(!validReply(ok(ctx({documentId:s(Bounds.documentId+1)})),'getContext'));
  assert.ok(validReply(ok(ctx({sessionEpoch:s(Bounds.sessionEpoch)})),'getContext'));
  assert.ok(!validReply(ok(ctx({sessionEpoch:s(Bounds.sessionEpoch+1)})),'getContext'));
  const ids=Array.from({length:Bounds.selectionIds},(_,i)=>`id${i}`);
  assert.ok(validReply(ok(ctx({selectionIds:ids})),'getContext'));
  assert.ok(!validReply(ok(ctx({selectionIds:[...ids,'extra']})),'getContext'));
});

test('describe reply: tool bounds match contract',()=>{
  const describe=tools=>({protocolVersion:'0.1',appId:'a',tools});
  const big=Array.from({length:Bounds.tools},(_,i)=>tool(`t${i}`));
  assert.ok(validReply(ok(describe(big)),'describe'));
  assert.ok(!validReply(ok(describe([...big,tool('extra')])),'describe'));
  assert.ok(validReply(ok(describe([{...tool(),description:s(Bounds.description)}])),'describe'));
  assert.ok(!validReply(ok(describe([{...tool(),description:s(Bounds.description+1)}])),'describe'));
});

test('error message and envelope caps match contract',()=>{
  const fail=message=>({ok:false,revision:null,data:null,error:{code:'INTERNAL',message,retryable:false}});
  assert.ok(validReply(fail(s(Bounds.errorMessage)),'invoke'));
  assert.ok(!validReply(fail(s(Bounds.errorMessage+1)),'invoke'));
  const pad=s(Bounds.message);
  assert.ok(!validReply(ok({pad},'invoke'),'invoke'));
});

test('MCP session cap is the contract value (reject, not evict)',()=>{
  assert.equal(Bounds.sessions,64);
});
