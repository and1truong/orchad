import type {Session} from "./api.ts";
import {humanError,diagnosticText} from "./diagnostics.ts";
export async function downloadOriginalPDF(path:string,name:string,session:Session,current:()=>void){
 current();const response=await fetch(path,{credentials:"same-origin",headers:{"x-pear-epoch":session.sessionEpoch}});current();
 if(!response.ok){const result=await response.json();throw Error(humanError(result.error?.code??response.status,result.error?.message??"Request failed"));}
 const blob=await response.blob();current();if(!response.headers.get("content-type")?.startsWith("application/pdf"))throw Error(diagnosticText("Request failed"));
 const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
