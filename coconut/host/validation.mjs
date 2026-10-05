import {z} from 'zod';
const codes=z.enum(['INVALID_ARGUMENT','UNAUTHORIZED','FORBIDDEN','NOT_FOUND','STALE_CONTEXT','IDEMPOTENCY_CONFLICT','APPROVAL_DENIED','CANCELLED','TIMEOUT','TARGET_CLOSED','UNSUPPORTED','INTERNAL']);
const result=z.object({ok:z.boolean(),revision:z.number().int().nonnegative().nullable(),data:z.unknown().nullable(),error:z.object({code:codes,message:z.string().max(4096),retryable:z.boolean()}).nullable()}).refine(x=>x.ok?x.error===null:x.error!==null);
const context=z.object({appId:z.string().max(256),documentId:z.string().max(256),revision:z.number().int().nonnegative(),selectionIds:z.array(z.string().max(256)).max(256),summary:z.string().max(16000)});
const describe=z.object({protocolVersion:z.literal('0.1'),appId:z.string().max(256),tools:z.array(z.object({name:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),description:z.string().max(4096),inputSchema:z.object({type:z.literal('object')}).passthrough(),effect:z.enum(['read','write','destructive']),outputSchema:z.record(z.unknown()).optional()})).max(64)});
export function validReply(value,op){if(JSON.stringify(value).length>65536||!result.safeParse(value).success)return false;if(!value.ok)return true;return op==='describe'?describe.safeParse(value.data).success:op==='getContext'?context.safeParse(value.data).success:true;}
const SAFE_KEYS=new Set(['type','properties','required','additionalProperties','items','prefixItems','enum','const','minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','minItems','maxItems','uniqueItems','minProperties','maxProperties','description','title','default','examples','deprecated','readOnly','writeOnly','$comment','$id','$schema']);
// Page-declared schemas are untrusted input, but they are compiled and executed
// by Ajv in the trusted sidecar before approval. Only a keyword subset that
// cannot carry user regexes ($ref, pattern, format, combinators...) or explode
// at compile time is allowed, with depth and size caps, so a hostile schema
// fails closed instead of wedging or crashing the enforcement process.
export function safeSchema(schema,depth=0){if(schema===true||schema===false)return true;if(schema===null||typeof schema!=='object'||Array.isArray(schema))return false;if(depth===0&&JSON.stringify(schema).length>8192)return false;if(depth>6)return false;for(const k of Object.keys(schema))if(!SAFE_KEYS.has(k))return false;
 const sub=v=>v===true||v===false||(v!==null&&typeof v==='object'&&!Array.isArray(v)&&safeSchema(v,depth+1));
 if(schema.properties!==undefined){const p=schema.properties;if(p===null||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length>64)return false;for(const v of Object.values(p))if(!sub(v))return false;}
 for(const k of['items','additionalProperties'])if(schema[k]!==undefined&&!(Array.isArray(schema[k])?schema[k].every(sub):sub(schema[k])))return false;
 if(schema.prefixItems!==undefined&&!(Array.isArray(schema.prefixItems)&&schema.prefixItems.length<=16&&schema.prefixItems.every(sub)))return false;
 if(schema.required!==undefined&&!(Array.isArray(schema.required)&&schema.required.every(t=>typeof t==='string'&&t.length<=256)))return false;
 if(schema.type!==undefined&&!(typeof schema.type==='string'||(Array.isArray(schema.type)&&schema.type.every(t=>typeof t==='string'))))return false;
 if(schema.enum!==undefined&&(!Array.isArray(schema.enum)||schema.enum.length>256))return false;
 for(const k of['minimum','maximum','exclusiveMinimum','exclusiveMaximum','multipleOf','minLength','maxLength','minItems','maxItems','minProperties','maxProperties'])if(schema[k]!==undefined&&(typeof schema[k]!=='number'||!Number.isFinite(schema[k])))return false;
 for(const k of['uniqueItems','deprecated','readOnly','writeOnly'])if(schema[k]!==undefined&&typeof schema[k]!=='boolean')return false;
 for(const k of['description','title','$comment','$id','$schema'])if(schema[k]!==undefined&&typeof schema[k]!=='string')return false;
 if(schema.const!==undefined&&JSON.stringify(schema.const).length>8192)return false;if(schema.default!==undefined&&JSON.stringify(schema.default).length>8192)return false;if(schema.examples!==undefined&&JSON.stringify(schema.examples).length>8192)return false;
 return true;}
