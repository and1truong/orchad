import Scorm2004API from 'scorm-again/scorm2004';
import {scormCharacters} from './scorm-characterstring.ts';
import type {ResponseBindings} from './scorm-response-bindings.ts';

export type InteractionWrite = [string,string];
export const interactionWriteLimit = 4096;
export const interactionWritePath = /^cmi\.interactions\.(0|[1-9]\d{0,2})\.(id|type|learner_response|correct_responses\.(0|[1-9]\d{0,2})\.pattern)(?![\s\S])/;
export const interactionResponsePath = /^cmi\.interactions\.\d+\.(learner_response|correct_responses\.\d+\.pattern)(?![\s\S])/;
export const canonicalInteractionPath = (key:string)=>key.replace(/\.\d+(?=\.|$)/g,n=>'.'+Number(n.slice(1)));
export const interactionTypePath = (key:string)=>key.split('.').slice(0,3).join('.')+'.type';

/** Replay the actual ordered typed writes; an asserted origin type is never sufficient. */
export function replayInteractionWrites(runtime:Scorm2004API,input:unknown,incoming:Record<string,string>):ResponseBindings{
  if(!Array.isArray(input)||input.length>interactionWriteLimit)throw Error('Invalid interaction write journal');
  const origins:ResponseBindings=Object.create(null),touched=new Set<string>();
  for(const entry of input){
    if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||typeof entry[1]!=='string'||!interactionWritePath.test(entry[0])||scormCharacters(entry[1])>36*4000+35*3)throw Error('Invalid interaction write');
    const [key,value]=entry;
    if(runtime.SetValue(key,value)!=='true')throw Error('Rejected interaction write');
    if(interactionResponsePath.test(key))origins[key]=runtime.GetValue(interactionTypePath(key));
    touched.add(key);
  }
  const state=runtime.renderCMIToJSONObject().cmi as Record<string,any>;
  for(const key of touched){const value=key.split('.').slice(1).reduce<any>((v,k)=>v?.[k],state);if(incoming[key]!==value)throw Error('Interaction journal does not match snapshot');}
  return origins;
}
