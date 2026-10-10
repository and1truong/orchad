import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSCORM2004API} from '../src/shared/scorm2004-runtime.ts';
for(const edition of ['2004-2','2004-3','2004-4'] as const)for(const field of ['learner_response','correct_responses.0.pattern'])for(const finish of [false,true])test(edition+': legal consecutive '+field+' history checkpoints and retries before '+(finish?'Terminate':'Commit'),()=>{
 let accept=false;const attempts:any[]=[];
 const api=createSCORM2004API({edition,checkpoint(...args){attempts.push(structuredClone(args));return accept;}});
 assert.equal(api.Initialize(''),'true');assert.equal(api.SetValue('cmi.interactions.0.id','urn:pear:response-history'),'true');assert.equal(api.SetValue('cmi.interactions.0.type','choice'),'true');
 for(let n=0;n<5000;n++)assert.equal(api.SetValue('cmi.interactions.0.'+field,n%2?'second':'first'),'true');
 assert.equal(api.SetValue('cmi.interactions.0.'+field,'a[,]a'),'false');assert.equal(api.GetLastError(),'406');
 assert.equal(api.SetValue('cmi.interactions.0.type','numeric'),'true');
 assert.equal(api.GetValue('cmi.interactions.0.'+field),'second');assert.equal(api.GetLastError(),'0');
 const save=()=>finish?api.Terminate(''):api.Commit('');assert.equal(save(),'false');assert.equal(api.GetLastError(),finish?'111':'391');
 assert.equal(attempts.length,1,'short valid witness reaches the durable queue');assert.equal(attempts[0][4].length,4);
 accept=true;assert.equal(save(),'true');assert.equal(api.GetLastError(),'0');assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);
});
