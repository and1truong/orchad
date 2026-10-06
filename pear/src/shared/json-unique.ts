// Bounded JSON parser preserving the duplicate-key rejection required by this profile.
export function parseUniqueJSON(input:string){
 if(Buffer.byteLength(input)>64*1024)throw Error("JSON exceeds 64 KiB");let i=0;
 const ws=()=>{while(i<input.length&&/[\t\n\r ]/.test(input[i]!))i++;};
 function string(){const start=i++;while(i<input.length){const ch=input[i++]!;if(ch==="\\"){i++;continue;}if(ch==='"')return JSON.parse(input.slice(start,i)) as string;}throw Error("Unterminated JSON string");}
 function value(depth:number):any{
  if(depth>16)throw Error("JSON depth exceeds 16");ws();const ch=input[i];
  if(ch==='"')return string();
  if(ch==="{"){
   i++;const entries:[string,any][]=[],keys=new Set<string>();ws();if(input[i]==="}"){i++;return {};}
   while(true){ws();if(input[i]!=='"')throw Error("Object key required");const key=string();if(keys.has(key))throw Error("Duplicate JSON key");keys.add(key);ws();if(input[i++]!==":")throw Error("Colon required");entries.push([key,value(depth+1)]);ws();const separator=input[i++];if(separator==="}")return Object.fromEntries(entries);if(separator!==",")throw Error("Invalid object delimiter");}
  }
  if(ch==="["){
   i++;const result:any[]=[];ws();if(input[i]==="]"){i++;return result;}
   while(true){result.push(value(depth+1));ws();const separator=input[i++];if(separator==="]")return result;if(separator!==",")throw Error("Invalid array delimiter");}
  }
  const token=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(input.slice(i));if(!token)throw Error("Invalid JSON value");i+=token[0].length;const result=JSON.parse(token[0]);if(typeof result==="number"&&!Number.isFinite(result))throw Error("Finite number required");return result;
 }
 const result=value(0);ws();if(i!==input.length)throw Error("Trailing JSON data");return result;
}
