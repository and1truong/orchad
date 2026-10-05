import {z} from 'zod';
const codes=z.enum(['INVALID_ARGUMENT','UNAUTHORIZED','FORBIDDEN','NOT_FOUND','STALE_CONTEXT','IDEMPOTENCY_CONFLICT','APPROVAL_DENIED','CANCELLED','TIMEOUT','TARGET_CLOSED','UNSUPPORTED','INTERNAL']);
const result=z.object({ok:z.boolean(),revision:z.number().int().nonnegative().nullable(),data:z.unknown().nullable(),error:z.object({code:codes,message:z.string().max(4096),retryable:z.boolean()}).nullable()}).refine(x=>x.ok?x.error===null:x.error!==null);
const context=z.object({appId:z.string().max(256),documentId:z.string().max(256),revision:z.number().int().nonnegative(),selectionIds:z.array(z.string().max(256)).max(256),summary:z.string().max(16000),sessionEpoch:z.string().max(256).nullable().optional()});
const describe=z.object({protocolVersion:z.literal('0.1'),appId:z.string().max(256),tools:z.array(z.object({name:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),description:z.string().max(4096),inputSchema:z.union([z.object({type:z.literal('object').optional()}).passthrough(),z.boolean()]),effect:z.enum(['read','write','destructive']),outputSchema:z.union([z.record(z.unknown()),z.boolean()]).optional()})).max(64)});
export function validReply(value,op){if(JSON.stringify(value).length>65536||!result.safeParse(value).success)return false;if(!value.ok)return true;return op==='describe'?describe.safeParse(value.data).success:op==='getContext'?context.safeParse(value.data).success:true;}
// '$id'/'$schema'/'$ref'/'$defs' are excluded: Ajv registers $id process-wide
// on the single shared instance, so a page could permanently poison other
// targets' tools or recurse references; '$schema' can select an unsupported
// draft and break compilation. 'format' is excluded so validation semantics
// stay identical across hosts (it is annotation-only). patternProperties,
// propertyNames, dependentSchemas/dependentRequired, contains, if/then/else
// and unevaluated* are excluded to keep the dialect a small closed set.
const SAFE_KEYS=new Set(['type','properties','required','additionalProperties','items','prefixItems','enum','const','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','minItems','maxItems','minProperties','maxProperties','description','title','default','examples','deprecated','readOnly','writeOnly','$comment','pattern','uniqueItems','oneOf','anyOf','allOf','not']);
function repeatedGroup(p){
 // Conservative scan for a ')'-closed group that (a) contains an unbounded
 // quantifier anywhere inside and (b) is itself quantified — the classic
 // catastrophic-backtracking shape ((a+)+, (a*)*, (\d{2,}){3}). Character
 // classes and escapes are skipped so '[(+)]' or '\(' are not miscounted.
 const unbounded=s=>{const m=/^(?:([+*])|\{(\d+)(,(\d*))?\})/.exec(s);if(!m)return s[0]==='{';if(m[1])return true;return m[3]===','&&m[4]==='';};
 for(let i=0;i<p.length;i++){
  if(p[i]==='\\'){i++;continue;}
  if(p[i]==='['){i++;if(p[i]==='^')i++;while(i<p.length&&p[i]!==']'){if(p[i]==='\\')i++;i++;}continue;}
  if(p[i]!=='(')continue;
  let inner=false,depth=1,j=i+1;
  for(;j<p.length&&depth;j++){
   if(p[j]==='\\'){j++;continue;}
   if(p[j]==='['){j++;if(p[j]==='^')j++;while(j<p.length&&p[j]!==']'){if(p[j]==='\\')j++;j++;}continue;}
   if(p[j]==='(')depth++;else if(p[j]===')')depth--;
   if(depth&&unbounded(p.slice(j)))inner=true;
  }
  if(inner&&unbounded(p.slice(j)))return true;
 }
 return false;
}
// Page-declared patterns execute inside the trusted sidecar for every
// argument check. Length is capped and backreferences/nested unbounded
// repeats are refused; the heuristic intentionally fails closed on odd
// shapes rather than proving linearity.
export function safePattern(p){if(typeof p!=='string'||!p.length||p.length>256)return false;if(/\\[1-9]|\\k</.test(p))return false;if(repeatedGroup(p))return false;try{new RegExp(p);}catch{return false}return true;}
// Page-declared schemas are untrusted input, but they are compiled and
// executed by Ajv in the trusted sidecar before approval. The dialect below
// is the bounded subset the host compiles: combinators are allowed with a
// fan-out cap, uniqueItems only on small arrays, patterns under the bounded
// regex policy above, plus global subschema-count, depth and byte caps, so a
// hostile schema fails closed instead of wedging or crashing the process.
export function safeSchema(schema,depth=0,budget){
 if(depth===0)budget={count:0};
 if(++budget.count>128)return false;
 if(schema===true||schema===false)return true;
 if(schema===null||typeof schema!=='object'||Array.isArray(schema))return false;
 if(depth===0&&JSON.stringify(schema).length>8192)return false;
 if(depth>6)return false;
 for(const k of Object.keys(schema))if(!SAFE_KEYS.has(k))return false;
 const sub=v=>v===true||v===false||(v!==null&&typeof v==='object'&&!Array.isArray(v)&&safeSchema(v,depth+1,budget));
 if(schema.properties!==undefined){const p=schema.properties;if(p===null||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length>64)return false;for(const v of Object.values(p))if(!sub(v))return false;}
 for(const k of['items','additionalProperties'])if(schema[k]!==undefined&&!(Array.isArray(schema[k])?schema[k].every(sub):sub(schema[k])))return false;
 if(schema.prefixItems!==undefined&&!(Array.isArray(schema.prefixItems)&&schema.prefixItems.length<=16&&schema.prefixItems.every(sub)))return false;
 for(const k of['oneOf','anyOf','allOf'])if(schema[k]!==undefined&&!(Array.isArray(schema[k])&&schema[k].length>=1&&schema[k].length<=16&&schema[k].every(sub)))return false;
 if(schema.not!==undefined&&!sub(schema.not))return false;
 if(schema.pattern!==undefined&&!safePattern(schema.pattern))return false;
 if(schema.uniqueItems!==undefined){if(typeof schema.uniqueItems!=='boolean')return false;if(schema.uniqueItems===true&&!(Number.isInteger(schema.maxItems)&&schema.maxItems>=0&&schema.maxItems<=256))return false;}
 if(schema.required!==undefined&&!(Array.isArray(schema.required)&&schema.required.every(t=>typeof t==='string'&&t.length<=256)))return false;
 if(schema.type!==undefined&&!(typeof schema.type==='string'||(Array.isArray(schema.type)&&schema.type.every(t=>typeof t==='string'))))return false;
 if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||schema.enum.length>256))return false;
 for(const k of['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','minItems','maxItems','minProperties','maxProperties'])if(schema[k]!==undefined&&(typeof schema[k]!=='number'||!Number.isFinite(schema[k])))return false;
 for(const k of['deprecated','readOnly','writeOnly'])if(schema[k]!==undefined&&typeof schema[k]!=='boolean')return false;
 for(const k of['description','title','$comment'])if(schema[k]!==undefined&&typeof schema[k]!=='string')return false;
 if(schema.const!==undefined&&JSON.stringify(schema.const).length>8192)return false;if(schema.default!==undefined&&JSON.stringify(schema.default).length>8192)return false;if(schema.examples!==undefined&&JSON.stringify(schema.examples).length>8192)return false;
 return true;}
