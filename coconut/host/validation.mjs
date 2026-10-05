import {z} from 'zod';
// Single implementation of the bounded schema dialect and the envelope
// bounds lives in @orchard/bridge-contract; this file only keeps the
// Result-payload shape checks that are coconut-side.
import {Bounds,Codes,safePattern,hostSafeSchema,withinMessageCap} from '@orchard/bridge-contract';
export {safePattern};
export const safeSchema=hostSafeSchema;
const codes=z.enum([...Codes]);
const result=z.object({ok:z.boolean(),revision:z.number().int().nonnegative().nullable(),data:z.unknown().nullable(),error:z.object({code:codes,message:z.string().max(Bounds.errorMessage),retryable:z.boolean()}).nullable()}).refine(x=>x.ok?x.error===null:x.error!==null);
const context=z.object({appId:z.string().max(Bounds.appId),documentId:z.string().max(Bounds.documentId),revision:z.number().int().nonnegative(),selectionIds:z.array(z.string().max(Bounds.id)).max(Bounds.selectionIds),summary:z.string().max(Bounds.summary),sessionEpoch:z.string().max(Bounds.sessionEpoch).nullable().optional()});
const describe=z.object({protocolVersion:z.literal('0.1'),appId:z.string().max(Bounds.appId),tools:z.array(z.object({name:z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),description:z.string().max(Bounds.description),inputSchema:z.union([z.object({type:z.literal('object').optional()}).passthrough(),z.boolean()]),effect:z.enum(['read','write','destructive']),outputSchema:z.union([z.record(z.unknown()),z.boolean()]).optional()})).max(Bounds.tools)});
export function validReply(value,op){if(!withinMessageCap(value)||!result.safeParse(value).success)return false;if(!value.ok)return true;return op==='describe'?describe.safeParse(value.data).success:op==='getContext'?context.safeParse(value.data).success:true;}
