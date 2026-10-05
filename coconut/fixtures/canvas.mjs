// TEST DOUBLE ONLY. Mirrors the real Guava tool catalog
// (../../guava/tool-catalog.json) with a small in-memory domain so host
// policy can exercise all seven tools — including every mutation — without a
// Guava server. Envelope rules match Guava's backend exactly: reads require
// expectedRevision/idempotencyKey null; mutations require an integer
// expectedRevision plus an idempotency key, deduped per document on
// (toolName, arguments, expectedRevision). No production authentication or
// backend authorization.
import {readFileSync} from 'node:fs';
export const catalog=JSON.parse(readFileSync(new URL('../../guava/tool-catalog.json',import.meta.url),'utf8'));
const READS=new Set(catalog.filter(t=>t.effect==='read').map(t=>t.name));
export function makeCanvas(){
 let revision=0,documentId='demo-document',sessionEpoch=null,seq=0;
 const dedup=new Map(),history=new Map();
 const graph={nodes:[{id:'n1',type:'note',label:'Seed',body:'',position:{x:0,y:0},evidenceIds:['ev-1']}],edges:[]};
 const evidence=[{id:'ev-1',title:'Seed record',content:'alpha evidence about the incident',timestamp:'2026-01-01T00:00:00Z',source:{kind:'log'},tags:['seed','incident']}];
 const fail=code=>({ok:false,revision,data:null,error:{code,message:code,retryable:false}});
 const okv=data=>({ok:true,revision,data,error:null});
 const cloneGraph=()=>({nodes:graph.nodes.map(n=>({...n,position:{...n.position},evidenceIds:[...n.evidenceIds]})),edges:graph.edges.map(e=>({...e}))});
 const apply=ops=>{const g=cloneGraph();
  for(const o of ops){switch(o.op){
   case 'add_node':if(g.nodes.length>=500)throw 'BOUND';g.nodes.push(o.node);break;
   case 'update_node':{const n=g.nodes.find(x=>x.id===o.id);if(!n)throw 'NOT_FOUND';Object.assign(n,o.changes);break;}
   case 'delete_node':if(g.edges.some(e=>e.source===o.id||e.target===o.id))throw 'INVALID';if(!g.nodes.some(x=>x.id===o.id))throw 'NOT_FOUND';g.nodes=g.nodes.filter(x=>x.id!==o.id);break;
   case 'add_edge':if(g.edges.length>=1000)throw 'BOUND';g.edges.push(o.edge);break;
   case 'update_edge':{const e=g.edges.find(x=>x.id===o.id);if(!e)throw 'NOT_FOUND';Object.assign(e,o.changes);break;}
   case 'delete_edge':if(!g.edges.some(x=>x.id===o.id))throw 'NOT_FOUND';g.edges=g.edges.filter(x=>x.id!==o.id);break;
   case 'auto_layout':g.nodes.forEach((n,i)=>{n.position={x:i,y:i};});break;
   default:throw 'INVALID_ARGUMENT';}}
  graph.nodes=g.nodes;graph.edges=g.edges;};
 const domain=(name,a)=>{
  switch(name){
   case 'canvas_get_graph':{const no=a.nodeOffset??0,eo=a.edgeOffset??0,nl=a.nodeLimit??100,el=a.edgeLimit??200;return {nodes:graph.nodes.slice(no,no+nl),edges:graph.edges.slice(eo,eo+el),revision,truncated:no+nl<graph.nodes.length||eo+el<graph.edges.length};}
   case 'canvas_get_neighbors':{const depth=a.depth??1,seen=new Set(a.nodeIds),edges=[];for(let d=0;d<depth;d++)for(const e of graph.edges)if(seen.has(e.source)&&!seen.has(e.target)&&seen.size<100){seen.add(e.target);edges.push(e);}else if(seen.has(e.target)&&!seen.has(e.source)&&seen.size<100){seen.add(e.source);edges.push(e);}return {nodes:graph.nodes.filter(n=>seen.has(n.id)).slice(0,100),edges,truncated:seen.size>=100};}
   case 'evidence_search':{const off=a.offset??0,lim=a.limit??40,q=(a.query??'').toLowerCase();const hits=evidence.filter(e=>(!a.sourceKind||e.source.kind===a.sourceKind)&&(!a.tag||e.tags.includes(a.tag))&&(!q||e.title.toLowerCase().includes(q)||e.content.toLowerCase().includes(q)));return {results:hits.slice(off,off+lim),total:hits.length};}
   case 'evidence_get':{const found=a.evidenceIds.map(id=>evidence.find(e=>e.id===id));if(found.some(x=>!x))return {error:'NOT_FOUND'};return {evidence:found};}
   case 'canvas_apply_patch':apply(a.operations);return {mutationId:'m-'+ ++seq};
   case 'canvas_undo':{const h=history.get(a.mutationId);if(!h)return {error:'NOT_FOUND'};if(h.after!==revision||h.undone)return {error:'STALE_CONTEXT'};history.get(a.mutationId).undone=true;graph.nodes=h.before.nodes;graph.edges=h.before.edges;return {undone:a.mutationId};}
   case 'investigation_propose_conclusion':{const id='c-'+ ++seq;graph.nodes.push({id,type:'conclusion',label:a.summary.slice(0,160),body:a.summary,position:{x:0,y:0},evidenceIds:a.supportingEvidenceIds});return {mutationId:'m-'+ ++seq,nodeId:id};}
   default:return {error:'UNSUPPORTED'};}};
 return {
  describe:async()=>({protocolVersion:'0.1',appId:'demo-canvas',tools:structuredClone(catalog)}),
  getContext:async()=>({appId:'demo-canvas',documentId,revision,selectionIds:[],summary:`Canvas ${documentId}: ${graph.nodes.length} nodes, ${evidence.length} evidence`,sessionEpoch}),
  switchDocument:(id='demo-document-2')=>{documentId=id;revision=0;dedup.clear();history.clear();graph.nodes=[];graph.edges=[];return id;},
  setSession:v=>{sessionEpoch=v;},
  invoke:async c=>{
   if(c.documentId!==documentId)return fail('NOT_FOUND');
   const tool=catalog.find(t=>t.name===c.toolName);if(!tool)return fail('UNSUPPORTED');
   const write=!READS.has(c.toolName);
   if(write?!Number.isInteger(c.expectedRevision)||c.expectedRevision<0||typeof c.idempotencyKey!=='string'||!c.idempotencyKey:c.expectedRevision!==null||c.idempotencyKey!==null)return fail('INVALID_ARGUMENT');
   if(!write){const r=domain(c.toolName,c.arguments);return r?.error?fail(r.error):okv(r);}
   const semantic=JSON.stringify([c.documentId,c.toolName,c.arguments,c.expectedRevision]);
   if(dedup.has(c.idempotencyKey)){const rec=dedup.get(c.idempotencyKey);return rec.semantic===semantic?rec.result:fail('IDEMPOTENCY_CONFLICT');}
   if(c.expectedRevision!==revision)return fail('STALE_CONTEXT');
   const before=cloneGraph();let data;try{data=domain(c.toolName,c.arguments);}catch(e){return fail(String(e)==='BOUND'?'INVALID_ARGUMENT':String(e));}
   if(data?.error)return fail(data.error);
   revision++;const mutationId=data.mutationId;if(mutationId)history.set(mutationId,{before,after:revision,undone:false});
   const result=okv(data);dedup.set(c.idempotencyKey,{semantic,result});return result;}};
}
