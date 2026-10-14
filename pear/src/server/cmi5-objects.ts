import {cmi5Invalid,cmi5IRI} from './cmi5-package.ts';
import {xapiObject,xapiActivity,xapiLanguageMap,xapiLanguage,xapiExtensions,xapiUUID,xapiQueryTime,xapiResult} from './cmi5-xapi.ts';

export function xapiAgent(v:any,group=true) {
  xapiObject(v,['objectType','name','account','mbox','mbox_sha1sum','openid',...(group?['member']:[])]);
  const type=v.objectType??'Agent';if(type!=='Agent'&&(!group||type!=='Group')||type==='Agent'&&v.member!==undefined)cmi5Invalid('Agent or Group required');
  if(v.name!==undefined&&(typeof v.name!=='string'||v.name.length>500))cmi5Invalid('bounded Agent/Group name required');
  const identifiers=['account','mbox','mbox_sha1sum','openid'].filter(key=>Object.hasOwn(v,key));if(identifiers.length>1||identifiers.length===0&&type!=='Group')cmi5Invalid('one Agent/identified Group identifier required');
  if(v.account!==undefined){xapiObject(v.account,['homePage','name'],['homePage','name']);if(!cmi5IRI(v.account.homePage)||typeof v.account.name!=='string'||!v.account.name||v.account.name.length>256)cmi5Invalid('account identifier invalid');}
  if(v.mbox!==undefined&&(!cmi5IRI(v.mbox)||!/^mailto:/i.test(v.mbox)||v.mbox.length<=7)||v.mbox_sha1sum!==undefined&&(typeof v.mbox_sha1sum!=='string'||!/^[a-f0-9]{40}$/i.test(v.mbox_sha1sum))||v.openid!==undefined&&!cmi5IRI(v.openid))cmi5Invalid('Agent inverse functional identifier invalid');
  if(v.member!==undefined){if(type!=='Group'||!Array.isArray(v.member)||!v.member.length&&!identifiers.length||v.member.length>20)cmi5Invalid('bounded Group members required');v.member.forEach((member:any)=>xapiAgent(member,false));}
  if(type==='Group'&&!identifiers.length&&v.member===undefined)cmi5Invalid('anonymous Group members required');
}
export function xapiStatementRef(v:any,scope:(id:string)=>void) {xapiObject(v,['objectType','id'],['objectType','id']);if(v.objectType!=='StatementRef'||typeof v.id!=='string'||!xapiUUID.test(v.id))cmi5Invalid('StatementRef UUID required');scope(v.id.toLowerCase());}
export function xapiContext(v:any,scope:(id:string)=>void) {
  xapiObject(v,['registration','contextActivities','extensions','language','revision','platform','instructor','team','statement']);
  if(v.registration!==undefined&&(typeof v.registration!=='string'||!xapiUUID.test(v.registration)))cmi5Invalid('context registration UUID required');
  if(v.language!==undefined&&!xapiLanguage(v.language))cmi5Invalid('BCP 47 context language required');
  for(const key of ['revision','platform'])if(v[key]!==undefined&&(typeof v[key]!=='string'||v[key].length>500))cmi5Invalid('bounded context metadata required');
  if(v.contextActivities!==undefined){xapiObject(v.contextActivities,['parent','grouping','category','other']);for(const values of Object.values(v.contextActivities) as any[]){if(!Array.isArray(values)||values.length>32)cmi5Invalid('bounded context activity lists required');values.forEach(xapiActivity);}}
  if(v.extensions!==undefined)xapiExtensions(v.extensions);if(v.instructor!==undefined)xapiAgent(v.instructor);if(v.team!==undefined){if(v.team?.objectType!=='Group')cmi5Invalid('context team must be a Group');xapiAgent(v.team);}if(v.statement!==undefined)xapiStatementRef(v.statement,scope);
}
export function xapiStatementObject(v:any,scope:(id:string)=>void,depth=0) {
  if(!v||typeof v!=='object'||Array.isArray(v))cmi5Invalid('statement object required');
  switch(v.objectType??'Activity') {
    case 'Activity':xapiActivity(v);return;
    case 'Agent':case 'Group':xapiAgent(v);return;
    case 'StatementRef':xapiStatementRef(v,scope);return;
    case 'SubStatement': {
      if(depth)cmi5Invalid('nested SubStatements are forbidden');xapiObject(v,['objectType','actor','verb','object','result','context','timestamp'],['objectType','actor','verb','object']);xapiAgent(v.actor);xapiObject(v.verb,['id','display'],['id']);if(!cmi5IRI(v.verb.id))cmi5Invalid('verb IRI required');if(v.verb.display!==undefined)xapiLanguageMap(v.verb.display);xapiStatementObject(v.object,scope,depth+1);
      if(v.verb.id==='http://adlnet.gov/expapi/verbs/voided')cmi5Invalid('SubStatements cannot void Statements');
      if(v.result!==undefined)xapiResult(v.result);if(v.context!==undefined){xapiContext(v.context,scope);if((v.context.revision!==undefined||v.context.platform!==undefined)&&(v.object.objectType??'Activity')!=='Activity')cmi5Invalid('revision/platform require an Activity object');}if(v.timestamp!==undefined)xapiQueryTime(v.timestamp);return;
    }
    default:cmi5Invalid('unsupported statement object type');
  }
}
