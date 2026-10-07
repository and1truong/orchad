
export type InlineText={kind:"text";text:string}|{kind:"strong"|"em"|"underline";children:InlineText[]};
export type PromptBlock={kind:"paragraph";lines:InlineText[][]}|{kind:"ordered"|"unordered";items:InlineText[][]};
// Original bounded markup: **bold**, *italic*, __underline__, "- " and "1. ".
// Raw HTML, URLs and attributes are always literal text, never parsed as nodes.
export function questionInline(text:string,depth=0,budget={nodes:0}):InlineText[]{
 if(depth>=4||budget.nodes>=128)return [{kind:"text",text}];
 const out:InlineText[]=[];let cursor=0;
 const markers:[string,"strong"|"em"|"underline"|"both"][]=[["***","both"],["**","strong"],["__","underline"],["*","em"]];
 while(cursor<text.length){
  if(budget.nodes>=128){out.push({kind:"text",text:text.slice(cursor)});break;}
  let begin=text.length,token:"strong"|"em"|"underline"|"both"="em",marker="";
  for(const [candidate,kind] of markers){const at=text.indexOf(candidate,cursor);if(at>=0&&at<begin){begin=at;marker=candidate;token=kind;}}
  if(!marker){out.push({kind:"text",text:text.slice(cursor)});budget.nodes++;break;}
  const end=text.indexOf(marker,begin+marker.length);
  if(end<0){out.push({kind:"text",text:text.slice(cursor)});budget.nodes++;break;}
  if(begin>cursor){out.push({kind:"text",text:text.slice(cursor,begin)});budget.nodes++;}
  budget.nodes++;out.push(token==="both"?{kind:"strong",children:[{kind:"em",children:questionInline(text.slice(begin+marker.length,end),depth+2,budget)}]}:{kind:token,children:questionInline(text.slice(begin+marker.length,end),depth+1,budget)});cursor=end+marker.length;
 }
 return out;
}
export function questionBlocks(prompt:string):PromptBlock[]{
 const lines=prompt.split("\n");if(lines.length>32)return [{kind:"paragraph",lines:[[ {kind:"text",text:prompt} ]]}];
 const blocks:PromptBlock[]=[],budget={nodes:0};let boundary=false;
 for(const line of lines){
  if(!line.trim()){boundary=true;continue;}
  const ordered=/^\d{1,2}\. /.test(line),unordered=line.startsWith("- "),kind=ordered?"ordered":unordered?"unordered":"paragraph";
  const content=questionInline(kind==="paragraph"?line:line.replace(ordered?/^\d{1,2}\. /:/^- /,""),0,budget),previous=boundary?undefined:blocks.at(-1);boundary=false;
  if(kind==="paragraph"){if(previous?.kind==="paragraph")previous.lines.push(content);else blocks.push({kind,lines:[content]});}
  else if(previous&&(previous.kind==="ordered"||previous.kind==="unordered")&&previous.kind===kind)previous.items.push(content);else blocks.push({kind,items:[content]});
 }
 return blocks;
}
