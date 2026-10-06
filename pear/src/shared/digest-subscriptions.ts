import {array,integer,enumeration,object,string,tool} from "./schema.ts";
import type {Tool} from "./model.ts";
import {calendarParts,calendarWallTime} from "./calendar.ts";
export type DigestPreferences={enabled:boolean;timeZone:string;hour:number;minute:number;weekdays:number[];minutes:number;dstChoice:"earlier"|"later";retentionDays:number};
export const defaultDigestPreferences:DigestPreferences={enabled:false,timeZone:"UTC",hour:9,minute:0,weekdays:[1,2,3,4,5],minutes:20,dstChoice:"earlier",retentionDays:7};
export const digestPreferencesSchema=object({enabled:{type:"boolean"},timeZone:string(100),hour:integer(23),minute:integer(59),weekdays:array(integer(7,1),7,1),minutes:integer(1440,1),dstChoice:enumeration("earlier","later"),retentionDays:integer(30,1)});
export const digestHumanTools:Tool[]=[
 tool("human_get_digest_preferences","read",{},"Read own current reviewed in-app digest settings."),
 tool("human_get_digest_notifications","read",{offset:integer(1000)},"Read own unexpired in-app digests; current audience is rechecked and unavailable rows withheld.",[]),
 tool("human_save_digest_preferences","write",{preferences:digestPreferencesSchema,confirmed:{type:"boolean",enum:[true]}},"Review and explicitly save own in-app schedule. No external delivery or official progress."),
 tool("human_read_digest_notification","write",{notificationId:string(64)},"Mark one own unexpired notification read; no learning acknowledgment."),
 tool("human_delete_digest_history","destructive",{confirmed:{type:"boolean",enum:[true]}},"Delete own retained in-app digest payloads; operational audit and original-key receipts remain.")
];
export function nextDigestRun(p:DigestPreferences,after:string){
 const ms=Date.parse(after);if(!Number.isFinite(ms)||new Set(p.weekdays).size!==p.weekdays.length)throw new RangeError("Invalid digest recurrence");
 const local=calendarParts(ms,p.timeZone),day=Date.UTC(local.year,local.month-1,local.day);
 for(let i=0;i<9;i++){const d=new Date(day+i*86400000),weekday=d.getUTCDay()||7;if(!p.weekdays.includes(weekday))continue;
 const utc=calendarWallTime({year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),hour:p.hour,minute:p.minute,second:0,millisecond:0},p.timeZone,p.dstChoice);
 if(Date.parse(utc)>ms)return utc;
 }throw new RangeError("Digest recurrence did not advance");
}
