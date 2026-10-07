// Pear plain-text WebVTT profile, based on W3C CRD 2026-05-20 section 4.
export function parseCaptions(input:string){
 const text=input.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
 if(!text.startsWith("WEBVTT\n\n")||text.length>65536||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
  throw new Error("Use the Pear plain-text WebVTT profile");
 const blocks=text.slice(8).trimEnd().split(/\n{2,}/);
 const ids=new Set<string>();let previous=-1;
 const timestamp=(value:string)=>{
  const m=/^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
  if(!m)throw new Error("Invalid caption timestamp");
  const ms=Number(m[1]??0)*3600000+Number(m[2])*60000+Number(m[3])*1000+Number(m[4]);
  if(!Number.isSafeInteger(ms)||ms>86400000)throw new Error("Caption timestamp exceeds 24 hours");return ms;
 };
 const cues=blocks.map(block=>{
  const lines=block.split("\n");let id="";
  if(!lines[0]!.includes("-->")){id=lines.shift()!;if(!id.trim()||id.includes("-->")||ids.has(id))throw new Error("Invalid or duplicate caption identifier");ids.add(id);}
  const timing=/^(\S+)[ \t]+-->[ \t]+(\S+)$/.exec(lines.shift()??"");
  if(!timing)throw new Error("Caption cue settings/STYLE/REGION are outside this profile");
  const start=timestamp(timing[1]!),end=timestamp(timing[2]!);
  const payload=lines.join("\n");
  if(start<previous||end<=start||!payload.trim()||payload.length>1000||/[<&]/.test(payload)||payload.includes("-->"))
   throw new Error("Use ordered nonempty plain-text caption cues");
  previous=start;return {id,start,end,text:payload};
 });
 if(!cues.length||cues.length>200)throw new Error("Use 1 to 200 caption cues");
 return cues;
}
