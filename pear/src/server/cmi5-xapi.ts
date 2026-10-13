import {cmi5Invalid,cmi5IRI} from './cmi5-package.ts';

export function xapiObject(v:any,keys:string[],required:string[]=[]) {
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(v,k)))cmi5Invalid('unsupported or missing JSON property');
}
export function xapiLanguage(v:unknown) {
  if(typeof v!=='string'||!v||v.length>128)return false;
  // Intl covers ordinary BCP 47; private-use and grandfathered tags are also
  // valid language map keys even when the runtime has no canonical locale.
  if(/^x(?:-[a-z0-9]{1,8})+$/i.test(v)||['en-gb-oed','i-ami','i-bnn','i-default','i-enochian','i-hak','i-klingon','i-lux','i-mingo','i-navajo','i-pwn','i-tao','i-tay','i-tsu','sgn-be-fr','sgn-be-nl','sgn-ch-de','art-lojban','cel-gaulish','no-bok','no-nyn','zh-guoyu','zh-hakka','zh-min','zh-min-nan','zh-xiang'].includes(v.toLowerCase()))return true;
  try{new Intl.Locale(v);return true;}catch{return false;}
}
export function xapiLanguageMap(v:any) {
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>32||Object.entries(v).some(([k,text])=>!xapiLanguage(k)||typeof text!=='string'||text.length>4096)||new Set(Object.keys(v).map(k=>k.toLowerCase())).size!==Object.keys(v).length)cmi5Invalid('bounded BCP 47 language map required');
}
export function xapiExtensions(v:any) {
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!cmi5IRI(k)))cmi5Invalid('IRI extension map required');
}
export function xapiActivity(v:any) {
  xapiObject(v,['id','objectType','definition'],['id']);if(!cmi5IRI(v.id)||v.objectType!==undefined&&v.objectType!=='Activity')cmi5Invalid('Activity object required');
  if(v.definition===undefined)return;
  const d=v.definition;xapiObject(d,['name','description','type','moreInfo','interactionType','correctResponsesPattern','choices','scale','source','target','steps','extensions']);
  for(const key of ['name','description'])if(d[key]!==undefined)xapiLanguageMap(d[key]);
  if(d.type!==undefined&&!cmi5IRI(d.type)||d.moreInfo!==undefined&&(typeof d.moreInfo!=='string'||!/^https?:\/\//i.test(d.moreInfo)||!cmi5IRI(d.moreInfo)))cmi5Invalid('Activity type IRI or moreInfo URL invalid');
  if(d.extensions!==undefined)xapiExtensions(d.extensions);
  if(d.interactionType!==undefined&&!['true-false','choice','fill-in','long-fill-in','matching','performance','sequencing','likert','numeric','other'].includes(d.interactionType))cmi5Invalid('interaction type invalid');
  if(d.correctResponsesPattern!==undefined&&(!d.interactionType||!Array.isArray(d.correctResponsesPattern)||d.correctResponsesPattern.length>128||d.correctResponsesPattern.some((s:any)=>typeof s!=='string'||s.length>4096)))cmi5Invalid('bounded interaction response patterns required');
  const allowed:Record<string,string[]>={choices:['choice','sequencing'],scale:['likert'],source:['matching'],target:['matching'],steps:['performance']};
  for(const [key,types] of Object.entries(allowed))if(d[key]!==undefined) {
    if(!types.includes(d.interactionType)||!Array.isArray(d[key])||d[key].length>128)cmi5Invalid('interaction components do not match type');
    const ids=new Set();for(const component of d[key]){xapiObject(component,['id','description'],['id']);if(typeof component.id!=='string'||!component.id||component.id.length>256||ids.has(component.id))cmi5Invalid('unique bounded interaction component ID required');ids.add(component.id);if(component.description!==undefined)xapiLanguageMap(component.description);}
  }
}
// xAPI document/query timestamps may carry an offset. cmi5 statements retain
// their separate mandatory UTC/source-time/lifecycle validation.
export function xapiQueryTime(v:unknown):string|undefined {
  if(v===undefined)return undefined;
  if(typeof v!=='string'||v.length>40)cmi5Invalid('valid xAPI query timestamp required');
  const match=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  if(!match||!Number.isFinite(Date.parse(v)))cmi5Invalid('valid xAPI query timestamp required');
  const local=new Date(match[1]+'Z');if(local.toISOString().slice(0,19)!==match[1])cmi5Invalid('invalid calendar date');
  if(match[3]!=='Z'&&(Number(match[3]!.slice(1,3))>23||Number(match[3]!.slice(4))>59))cmi5Invalid('invalid UTC offset');
  return new Date(v).toISOString();
}
export function statementFormat(value:any,format:string,language?:string):any {
  const copy=structuredClone(value);
  const ranges=(language??'').slice(0,4096).split(',').slice(0,32).map((part,index)=>{const [tag,...params]=part.trim().split(';');const weight=params.find(p=>p.trim().startsWith('q='))?.trim().slice(2),q=weight===undefined?1:Number(weight);return {tag:tag!.toLowerCase(),q:Number.isFinite(q)&&q>=0&&q<=1?q:0,index};}).filter(r=>r.q>0).sort((a,b)=>b.q-a.q||a.index-b.index);
  function map(v:any) {
    const keys=Object.keys(v);if(!keys.length)return v;
    for(const range of ranges){let tag=range.tag;while(tag){const key=keys.find(k=>tag==='*'||k.toLowerCase()===tag||k.toLowerCase().startsWith(tag+'-'));if(key)return {[key]:v[key]};tag=tag.includes('-')?tag.slice(0,tag.lastIndexOf('-')):'';}}
    const key=keys[0]!;return {[key]:v[key]};
  }
  function walk(v:any) {
    if(!v||typeof v!=='object')return;
    if(v.objectType==='Activity'||v.id&&v.definition){if(format==='ids')delete v.definition;else if(format==='canonical'&&v.definition){for(const key of ['name','description'])if(v.definition[key])v.definition[key]=map(v.definition[key]);for(const key of ['choices','scale','source','target','steps'])for(const c of v.definition[key]??[])if(c.description)c.description=map(c.description);}}
    if(format==='ids'&&(v.objectType==='Agent'||v.account||v.mbox||v.mbox_sha1sum||v.openid)){delete v.name;}
    for(const [key,child] of Object.entries(v)){if(key==='extensions')continue;if(key==='verb'&&child&&typeof child==='object'){if(format==='ids')delete (child as any).display;else if(format==='canonical'&&(child as any).display)(child as any).display=map((child as any).display);}else if(Array.isArray(child))child.forEach(walk);else walk(child);}
  }
  if(format!=='exact')walk(copy);return copy;
}
