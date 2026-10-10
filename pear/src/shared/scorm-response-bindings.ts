import Scorm2004API from 'scorm-again/scorm2004';

export type ResponseBindings = Record<string,string>;
const types=['true-false','choice','fill-in','long-fill-in','matching','performance','sequencing','likert','numeric','other'];
const snapshots=new WeakMap<Scorm2004API,ResponseBindings>();
const engine=()=>new Scorm2004API({logLevel:'NONE',autocommit:false,lmsCommitUrl:false,accumulateSessionTimeOnTerminate:false});
function responses(state:Record<string,any>){
  const values:Record<string,{value:string;type:string}>=Object.create(null);
  for(const [n,r] of Object.entries(state.interactions??{}) as [string,any][]){
    const base='cmi.interactions.'+n;
    if(typeof r.learner_response==='string')values[base+'.learner_response']={value:r.learner_response,type:r.type};
    for(const [i,p] of Object.entries(r.correct_responses??{}) as [string,any][])if(typeof p.pattern==='string')values[base+'.correct_responses.'+i+'.pattern']={value:p.pattern,type:r.type};
  }
  return values;
}
/** Origins are derived from successful ordered engine writes, never asserted client metadata. */
export function responseBindings(state:Record<string,any>,previous:Record<string,any>,prior:ResponseBindings={},origins:ResponseBindings={}):ResponseBindings{
  const old=responses(previous);
  return Object.fromEntries(Object.entries(responses(state)).flatMap(([path,v])=>{
    const origin=origins[path]??(old[path]?.value===v.value?prior[path]??old[path]?.type:undefined);
    return origin&&origin!==v.type?[[path,origin]]:[];
  }));
}
export function runtimeResponseBindings(runtime:Scorm2004API){return {...snapshots.get(runtime)};}
export function setRuntimeResponseBindings(runtime:Scorm2004API,bindings:ResponseBindings){snapshots.set(runtime,{...bindings});}
export function responseStateMatches(runtime:Scorm2004API,state:Record<string,any>){
  const wanted=responses(state),actual=responses(runtime.renderCMIToJSONObject().cmi as Record<string,any>);
  return Object.keys(wanted).length===Object.keys(actual).length&&Object.entries(wanted).every(([path,r])=>actual[path]?.value===r.value&&actual[path]?.type===r.type);
}
/** Metadata comes from host bootstrap/accepted receipts, never from checkpoint input. */
export function loadResponseState(runtime:Scorm2004API,state:Record<string,any>,bindings:ResponseBindings={}){
  if(!bindings||typeof bindings!=='object'||Array.isArray(bindings)||Object.keys(bindings).length>2048)throw Error('Invalid response bindings');
  if(!Object.keys(bindings).length){runtime.loadFromJSON(state);snapshots.set(runtime,{});return;}
  const values=responses(state),copy=structuredClone(state),records=new Set<string>();
  for(const [path,type] of Object.entries(bindings)){
    const m=/^cmi\.interactions\.(0|[1-9]\d{0,2})\.(learner_response|correct_responses\.(0|[1-9]\d{0,2})\.pattern)$/.exec(path);
    if(!m||!types.includes(type)||!values[path])throw Error('Invalid response binding');records.add(m[1]);
  }
  for(const n of records){delete copy.interactions[n].learner_response;copy.interactions[n].correct_responses={};}
  runtime.loadFromJSON(copy);
  for(const n of records){
    const r=state.interactions[n],record=runtime.cmi.interactions.childArray[Number(n)] as any,base='cmi.interactions.'+n;
    record._learner_response=undefined;record.correct_responses.childArray=[];
    if(typeof r.learner_response==='string'){
      const probe=engine();probe.loadFromJSON({interactions:{0:{id:r.id,type:bindings[base+'.learner_response']??r.type,learner_response:r.learner_response}}});
      // Restore only a string validated under its host-recorded original type.
      record._learner_response=(probe.cmi.interactions.childArray[0] as any)._learner_response;
      (runtime as any)._setCMIElements.add(base+'.learner_response');
    }
    const patterns=Object.entries(r.correct_responses??{}).sort(([a],[b])=>Number(a)-Number(b));
    for(const [index,p] of patterns as [string,any][]){
      if(Number(index)!==record.correct_responses.childArray.length)throw Error('Invalid response index');
      const probe=engine();probe.loadFromJSON({interactions:{0:{id:r.id,type:bindings[base+'.correct_responses.'+index+'.pattern']??r.type,correct_responses:{0:{pattern:p.pattern}}}}});
      const pattern=(probe.cmi.interactions.childArray[0] as any).correct_responses.childArray[0];
      pattern._interactionType=r.type;record.correct_responses.childArray.push(pattern);
      (runtime as any)._setCMIElements.add(base+'.correct_responses.'+index+'.pattern');
    }
  }
  snapshots.set(runtime,{...bindings});
}
