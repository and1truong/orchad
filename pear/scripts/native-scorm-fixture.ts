// Isolated CI fixture. Not imported or mounted by any product entry point.
import {mkdtempSync, rmSync, readFileSync, writeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import Fastify from 'fastify';
import {createApp} from '../src/server/app.ts';
import {scormLearningFixture} from '../tests/scorm-learning-fixture.ts';
import {interopPackage} from '../tests/scorm-interop-fixture.ts';
import {singleSCOManifest} from '../tests/scorm-player-fixture.ts';
import {sequencingResponsePatterns} from '../tests/scorm-sequencing-response-vectors.ts';
import {collectionManifest, xmlCollectionIdsManifest, xmlTokenManifest, xmlTimeManifest, xmlSharedTargetManifest} from '../tests/scorm-sequencing-fixture.ts';
import {absentCollectionPaths} from '../tests/scorm-collection-read-vectors.ts';
import {interactionCollectionScript} from '../tests/scorm-interaction-collection-vectors.ts';
import {learnerCommentScript,learnerCommentVerifyScript} from '../tests/scorm-learner-comment-spm-vectors.ts';
import {scorm2004CheckpointLimit} from '../src/shared/scorm2004-runtime.ts';
const edition = process.env.PEAR_NATIVE_SCORM_EDITION ?? '2004-4';
const commentSPM = process.env.PEAR_NATIVE_SCORM_COMMENT_SPM === '1';
const collectionSPM = process.env.PEAR_NATIVE_SCORM_COLLECTION_SPM === '1' || commentSPM;
if (collectionSPM && edition === '1.2') throw Error('2004 collection profile only');
if (!['1.2', '2004-2', '2004-3', '2004-4'].includes(edition)) throw Error('Unsupported native SCORM edition');
const nonce = process.env.PEAR_NATIVE_NONCE;
if (!nonce || !/^[-a-zA-Z0-9]{20,64}$/.test(nonce)) throw Error('Explicit native fixture nonce required');
const dir = mkdtempSync(join(tmpdir(), 'pear-native-scorm-')), prefix = '/native-scorm/' + nonce, origin = 'http://127.0.0.1:4310';
let action = 'start', droppedACK = false, exactRetry = false, droppedPayload = '', droppedReceipt = '', droppedCount = 0, droppedRevision = 0, largestCheckpointBytes = 0, largestCheckpointLimit = 0, responseBindingCheckpoints = 0, responseWriteCheckpoints = 0, largestInteractionJournal = 0; const probes: any[] = [], calls: string[] = [], navigationAttempts: string[] = [], pearCanaryCalls: string[] = [], navigationViolations: string[] = [], driverErrors: string[] = [], contentRequests: {kind: string; status: number}[] = [];
const script = `
(async()=>{
  const evidence={pearCookieDenied:false,pearStorageDenied:false,pearBridgeDenied:false,pearNativeDenied:false,noOwnBridge:!window.agentBridgeV1&&!parent.agentBridgeV1,nativeDenied:false,externalFetchDenied:false,userAgent:navigator.userAgent,entry:get('${edition === '1.2' ? 'cmi.core.entry' : 'cmi.entry'}'),bookmark:get('${edition === '1.2' ? 'cmi.core.lesson_location' : 'cmi.location'}')};
  if('${edition}'!=='1.2'&&!${collectionSPM}){
    if('${edition}'==='2004-4'){
      const api=parent.API_1484_11,id='urn:pear:native-shared-target',store='native-shared-target-notes';
      const resumed=evidence.entry!=='resume'||api.GetValue('adl.data.0.store')===store&&api.GetLastError()==='0';
      if(api.SetValue('adl.data.0.store',store)!=='true')throw Error('Native shared target write refused');
      if(api.SetValue('adl.data.0.id','forged')!=='false')throw Error('Native shared target ID mutation admitted');const idCode=api.GetLastError();
      evidence.sharedTargetID={resumed,idCode,id:api.GetValue('adl.data.0.id'),preserved:api.GetValue('adl.data.0.store')===store&&api.GetLastError()==='0'};
    }
    const api=parent.API_1484_11;if(api.SetValue('cmi.interactions.0.id','urn:pear:native-read-errors')!=='true')throw Error('Native interaction ID refused');
    evidence.collectionReadErrors=${JSON.stringify(absentCollectionPaths)}.map(path=>{if(api.GetValue(path)!=='')throw Error('Absent collection value');return {path,code:api.GetLastError()};});
    evidence.interactionReadErrors=['type','timestamp','weighting','result','latency'].map(field=>{
      if(api.GetValue('cmi.interactions.2.'+field)!=='')throw Error('Absent interaction value');const absentCode=api.GetLastError();
      if(api.GetValue('cmi.interactions.0.'+field)!=='')throw Error('Unset interaction value');return {field,absentCode,unsetCode:api.GetLastError()};
    });
    const decimals={'cmi.score.min':'0.'+'1'.repeat(4094),'cmi.learner_preference.audio_level':'0.'+'0'.repeat(19)+'1','cmi.score.max':'0.5'+'0'.repeat(40)};
    const decimalResumed=evidence.entry!=='resume'||Object.entries(decimals).every(([key,value])=>api.GetValue(key)===value&&api.GetLastError()==='0');
    for(const [key,value] of Object.entries(decimals))if(api.SetValue(key,value)!=='true')throw Error('Native long decimal refused');
    const decimalCodes=[['cmi.score.min','0.'+'1'.repeat(4095)],['cmi.score.max',decimals['cmi.score.max']+'\\n'],['cmi.score.scaled','1.'+'0'.repeat(40)+'1'],['cmi.learner_preference.audio_level','-0.'+'0'.repeat(330)+'1']].map(([key,value])=>{if(api.SetValue(key,value)!=='false')throw Error('Native invalid decimal admitted');return api.GetLastError();});
    evidence.decimalCapacity={resumed:decimalResumed,preserved:Object.entries(decimals).every(([key,value])=>api.GetValue(key)===value&&api.GetLastError()==='0'),codes:decimalCodes};
    const patterns=${JSON.stringify(sequencingResponsePatterns)},base='cmi.interactions.1';
    if(evidence.entry!=='resume'){if(api.SetValue(base+'.id','urn:pear:native-ordered')!=='true'||api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native ordered dependency');for(const [n,p] of patterns.entries())for(let write=0;write<(n===0?5000:1);write++)if(api.SetValue(base+'.correct_responses.'+n+'.pattern',p)!=='true')throw Error('Native ordered pattern');}
    const languageValues={'cmi.learner_preference.language':'qtz','cmi.interactions.1.description':'{lang=scc}Native historical language'};
    const languageResumed=evidence.entry!=='resume'||Object.entries(languageValues).every(([key,value])=>api.GetValue(key)===value&&api.GetLastError()==='0');
    for(const [key,value] of Object.entries(languageValues))if(api.SetValue(key,value)!=='true')throw Error('Native registered language refused');
    const languageCodes=Object.keys(languageValues).flatMap(key=>['zz','zzz','ZZ-us','a','abcdefgh'].map(primary=>{const value=key==='cmi.learner_preference.language'?primary:'{lang='+primary+'}Rejected text';if(api.SetValue(key,value)!=='false')throw Error('Native unknown ISO language admitted');return api.GetLastError();}));
    evidence.languageRegistry={resumed:languageResumed,preserved:Object.entries(languageValues).every(([key,value])=>api.GetValue(key)===value&&api.GetLastError()==='0'),codes:languageCodes};
    const ianaKey='cmi.interactions.0.description',ianaValue='{lang=I-MINGO}Native historical IANA text';
    const ianaResumed=evidence.entry!=='resume'||api.GetValue(ianaKey)===ianaValue&&api.GetLastError()==='0';
    if(api.SetValue(ianaKey,ianaValue)!=='true')throw Error('Native registered IANA language refused');
    const ianaCodes=['i-madeup','i-klignon','I-UNKNOWN','i'].map(tag=>{if(api.SetValue(ianaKey,'{lang='+tag+'}Rejected text')!=='false')throw Error('Native unknown IANA language admitted');return api.GetLastError();});
    evidence.ianaLanguage={resumed:ianaResumed,preserved:api.GetValue(ianaKey)===ianaValue&&api.GetLastError()==='0',codes:ianaCodes};
    if(api.SetValue(ianaKey,'{lang=en-US}Native country control')!=='true'||api.GetValue(ianaKey)!=='{lang=en-US}Native country control'||api.SetValue(ianaKey,ianaValue)!=='true')throw Error('Native country control refused');
    const countryCodes=${JSON.stringify(JSON.parse(readFileSync(new URL('./scorm-language-registry.json',import.meta.url),'utf8')).userAssignedCountries)}.map(code=>{if(api.SetValue(ianaKey,'{lang=fre-'+code.toLowerCase()+'-demo}Rejected text')!=='false')throw Error('Native reserved country admitted');return api.GetLastError();});
    evidence.reservedCountry={resumed:ianaResumed,preserved:api.GetValue(ianaKey)===ianaValue&&api.GetLastError()==='0',codes:countryCodes};
    const assignedCountries=${JSON.stringify((()=>{const r=JSON.parse(readFileSync(new URL('./scorm-language-registry.json',import.meta.url),'utf8'));return [...r.countryAlpha2,...r.historicalCountryAlpha2];})())};
    for(const code of assignedCountries){const value='{lang=FRE-'+code.toLowerCase()+'}Native historical country';if(api.SetValue(ianaKey,value)!=='true'||api.GetValue(ianaKey)!==value)throw Error('Native ISO country refused');}
    if(api.SetValue(ianaKey,ianaValue)!=='true')throw Error('Native country control restoration refused');
    const unassignedCodes=['en-OO','FRE-ab','qaa-CJ-demo','SCC-oh'].map(tag=>{if(api.SetValue(ianaKey,'{lang='+tag+'}Rejected text')!=='false')throw Error('Native unassigned ISO country admitted');return api.GetLastError();});
    evidence.countryRegistry={resumed:ianaResumed,accepted:assignedCountries.length,preserved:api.GetValue(ianaKey)===ianaValue&&api.GetLastError()==='0',codes:unassignedCodes};
    const registeredSubcodes=${JSON.stringify(JSON.parse(readFileSync(new URL('./scorm-language-registry.json',import.meta.url),'utf8')).ianaSubcodes)};
    for(const code of registeredSubcodes){const value='{lang=FRE-'+code.toUpperCase()+'}Native registered subcode';if(api.SetValue(ianaKey,value)!=='true'||api.GetValue(ianaKey)!==value)throw Error('Native registered subcode refused');}
    if(api.SetValue(ianaKey,ianaValue)!=='true')throw Error('Native subcode control restoration refused');
    const unregisteredCodes=['en-abc','FRE-abcd','qaa-foobar','SCC-abcdefgh','en-madeup','en-999','en-klingon','en-Qaby'].map(tag=>{if(api.SetValue(ianaKey,'{lang='+tag+'}Rejected text')!=='false')throw Error('Native unregistered subcode admitted');return api.GetLastError();});
    evidence.ianaSubcodes={resumed:ianaResumed,accepted:registeredSubcodes.length,preserved:api.GetValue(ianaKey)===ianaValue&&api.GetLastError()==='0',codes:unregisteredCodes};
    for(const tag of ['en-001','en-US-11','x-11','i-klingon-a1']){const value='{lang='+tag+'}Native country syntax control';if(api.SetValue(ianaKey,value)!=='true'||api.GetValue(ianaKey)!==value)throw Error('Native country syntax control refused');}
    if(api.SetValue(ianaKey,ianaValue)!=='true')throw Error('Native country syntax restoration refused');
    const alphabet='abcdefghijklmnopqrstuvwxyz0123456789',digitCountries=[...alphabet].flatMap(a=>[...alphabet].map(b=>a+b)).filter(code=>/[0-9]/.test(code));
    const digitCountryCodes=digitCountries.map(code=>{if(api.SetValue(ianaKey,'{lang=FRE-'+code.toUpperCase()+'-demo}Rejected text')!=='false')throw Error('Native mixed/digit country admitted');return api.GetLastError();});
    evidence.countryCharacters={resumed:ianaResumed,preserved:api.GetValue(ianaKey)===ianaValue&&api.GetLastError()==='0',codes:digitCountryCodes};
    const singletonCodes=[...'abcdefghijklmnopqrstuvwxyz'].map(char=>{const value='{lang=FRE-'+char.toUpperCase()+'-demo}Native singleton text',expected='${edition}'==='2004-2'?'false':'true';if(api.SetValue(ianaKey,value)!==expected)throw Error('Native singleton edition binding');const code=api.GetLastError();if(api.GetValue(ianaKey)!==(expected==='false'?ianaValue:value))throw Error('Native singleton state lost');return code;});
    if(api.SetValue(ianaKey,ianaValue)!=='true')throw Error('Native singleton restoration refused');
    evidence.singletonLanguage={resumed:ianaResumed,preserved:api.GetValue(ianaKey)===ianaValue&&api.GetLastError()==='0',codes:singletonCodes};
    const result='0.5' +'0'.repeat(40),resultKey=base+'.result';
    const resultResumed=evidence.entry!=='resume'||api.GetValue(resultKey)===result&&api.GetLastError()==='0';
    if(api.SetValue(resultKey,result)!=='true')throw Error('Native long interaction result refused');
    const resultCodes=[result+'\\n','0.'+'1'.repeat(4095),'9'.repeat(309),'Correct'].map(value=>{if(api.SetValue(resultKey,value)!=='false')throw Error('Native invalid result admitted');return api.GetLastError();});
    evidence.resultDecimal={resumed:resultResumed,preserved:api.GetValue(resultKey)===result&&api.GetLastError()==='0',codes:resultCodes};
    const uriIDs='${edition}'==='2004-2'?['custom://registry:alpha@name:part/a','custom:opaque?part']:['http://[2001:DB8::1]:999999/answer?x=1#part','custom://[v1.future:host]/answer'];
    const uriResumed=evidence.entry!=='resume'||uriIDs.every((id,n)=>api.GetValue(base+'.objectives.'+n+'.id')===id&&api.GetLastError()==='0');
    for(const [n,id] of uriIDs.entries())if(api.SetValue(base+'.objectives.'+n+'.id',id)!=='true')throw Error('Native URI authority rejected');
    const uriCodes=('${edition}'==='2004-2'?['custom://host[part]/','custom://host/part[one]','custom://host/?q=[part]','custom:','custom:#fragment']:['http://[::1]tail/','http://host:abc/','http://host/path[part]']).map(id=>{if(api.SetValue(base+'.objectives.2.id',id)!=='false')throw Error('Native invalid URI authority admitted');return api.GetLastError();});
    evidence.uriAuthority={resumed:uriResumed,preserved:uriIDs.every((id,n)=>api.GetValue(base+'.objectives.'+n+'.id')===id&&api.GetLastError()==='0'),codes:uriCodes,count:api.GetValue(base+'.objectives._count')};
    if(evidence.entry!=='resume'){for(let n=0;n<5000;n++)if(api.SetValue(base+'.learner_response','first-response')!=='true')throw Error('Native response history');for(let n=0;n<5000;n++)if(api.SetValue(base+'.type',n%2?'choice':'sequencing')!=='true')throw Error('Native type history');if(api.SetValue(base+'.type','numeric')!=='true'||api.Commit('')!=='true')throw Error('Native compact type history');evidence.typeHistory={writes:5000,preserved:api.GetValue(base+'.learner_response')==='first-response'&&api.GetLastError()==='0'};evidence.responseHistory={writes:10000,preserved:api.GetValue(base+'.learner_response')==='first-response'&&api.GetLastError()==='0'&&api.GetValue(base+'.correct_responses.0.pattern')===patterns[0]&&api.GetLastError()==='0'};evidence.responseWriteCheckpoint={committed:true,preserved:api.GetValue(base+'.learner_response')==='first-response'&&api.GetLastError()==='0'};if(api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native original type recovery');}else evidence.responseWriteCheckpoint={resumed:api.GetValue(base+'.learner_response')==='first-response'&&api.GetLastError()==='0'};
    const codes=[[1,patterns[0]],[patterns.length,patterns[0]],[patterns.length,'']].map(([n,p])=>{if(api.SetValue(base+'.correct_responses.'+n+'.pattern',p)!=='false')throw Error('Native duplicate admitted');return api.GetLastError();});
    const preserved=patterns.every((p,n)=>api.GetValue(base+'.correct_responses.'+n+'.pattern')===p&&api.GetLastError()==='0');
    evidence.sequencingResponses={count:api.GetValue(base+'.correct_responses._count'),codes,preserved};
    if(api.SetValue(base+'.correct_responses.0.pattern','uncommitted[,]pattern')!=='true')throw Error('Native unsaved response');
    for(let i=0;i<4097;i++)if(api.SetValue(base+'.type','sequencing')!=='true'||api.SetValue(base+'.correct_responses.0.pattern','uncommitted[,]pattern')!=='true')throw Error('Native noncompactable journal setup');
    const typeAccepted=api.SetValue(base+'.type','numeric')==='true'&&api.GetLastError()==='0';
    if(api.Commit('')!=='false')throw Error('Native unreloadable checkpoint queued');const commitCode=api.GetLastError();
    if(api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native checkpoint recovery');
    if(api.SetValue(base+'.correct_responses.0.pattern',patterns[0])!=='true')throw Error('Native original response recovery');
    evidence.reloadableCheckpoint={typeAccepted,commitCode,preserved:patterns.every((p,n)=>api.GetValue(base+'.correct_responses.'+n+'.pattern')===p&&api.GetLastError()==='0')};
    if(evidence.entry==='resume'){if(api.SetValue(base+'.type','numeric')!=='true'||api.Commit('')!=='true')throw Error('Native accepted response type change');evidence.responseBindingCheckpoint={committed:true,preserved:patterns.every((p,n)=>api.GetValue(base+'.correct_responses.'+n+'.pattern')===p&&api.GetLastError()==='0')};if(api.SetValue(base+'.type','sequencing')!=='true')throw Error('Native binding recovery');}
    const comment='🙂'.repeat(4000);if(evidence.entry!=='resume')for(let n=0;n<35;n++)if(api.SetValue('cmi.comments_from_learner.'+n+'.comment',comment)!=='true')throw Error('Native large comment');
    evidence.checkpointCapacity={count:api.GetValue('cmi.comments_from_learner._count'),preserved:Array.from({length:35},(_,n)=>api.GetValue('cmi.comments_from_learner.'+n+'.comment')===comment&&api.GetLastError()==='0').every(Boolean)};
  }
  if(${collectionSPM}){const api=parent.API_1484_11;if(evidence.entry!=='resume'){${interactionCollectionScript}}let preserved=api.GetValue('cmi.interactions._count')==='250'&&api.GetValue('cmi.objectives._count')==='100';for(let i=0;i<250;i++){const base='cmi.interactions.'+i;preserved=preserved&&api.GetValue(base+'.type')==='choice'&&api.GetValue(base+'.learner_response')==='{lang=en}Original collection response'&&api.GetValue(base+'.objectives._count')==='10'&&api.GetValue(base+'.correct_responses._count')==='10';for(let j=0;j<10;j++)preserved=preserved&&api.GetValue(base+'.objectives.'+j+'.id')==='urn:pear:collection-objective:'+i+':'+j&&api.GetValue(base+'.correct_responses.'+j+'.pattern')==='urn:pear:collection-choice:'+j;}for(let i=0;i<100;i++)preserved=preserved&&api.GetValue('cmi.objectives.'+i+'.score.raw')==='50';if(!preserved)throw Error('Native mandatory collection lost');evidence.collectionSPM={interactions:250,objectives:100,nestedObjectives:2500,patterns:2500,preserved};}
  if(${commentSPM}){const api=parent.API_1484_11;if(evidence.entry!=='resume'){${learnerCommentScript}}${learnerCommentVerifyScript}evidence.learnerCommentSPM={comments:250,charactersPerComment:4000,preserved:true};}
  const top=parent.parent;
  for(const [key,read] of Object.entries({pearCookieDenied:()=>top.document.cookie,pearStorageDenied:()=>top.localStorage.length,pearBridgeDenied:()=>top.agentBridgeV1,pearNativeDenied:()=>top.__TAURI_INTERNALS__}))try{read();}catch{evidence[key]=true;}
  const native=window.__TAURI_INTERNALS__||parent.__TAURI_INTERNALS__;
  evidence.nativeSurface={invoke:typeof native?.invoke,ipc:typeof native?.ipc,postMessage:typeof native?.postMessage,messageChannel:typeof window.ipc?.postMessage,pattern:native?.__TAURI_PATTERN__?.pattern??null,pending:false};
  if(!native)evidence.nativeDenied=true;
  else await Promise.race([Promise.resolve().then(()=>native.invoke('host_request',{request:{action:'heartbeat'}})).catch(()=>{evidence.nativeDenied=true;}),new Promise(resolve=>setTimeout(()=>{evidence.nativeSurface.pending=true;resolve();},5000))]);
  try{await fetch('http://127.0.0.1:4316/external-fetch');}catch{evidence.externalFetchDenied=true;}
  const sink='http://127.0.0.1:4316',violations=[];
  document.addEventListener('securitypolicyviolation',event=>violations.push(event.effectiveDirective));
  for(const [key,run] of Object.entries({xhr:()=>{const request=new XMLHttpRequest();request.open('GET',sink+'/xhr');request.send();},websocket:()=>new WebSocket('ws://127.0.0.1:4316/websocket'),beacon:()=>navigator.sendBeacon(sink+'/beacon','synthetic')}))try{run();}catch{}
  for(const [tag,path] of [['img','image'],['iframe','frame']]){const element=document.createElement(tag);element.src=sink+'/'+path;document.body.append(element);}
  const media=document.createElement('audio'),source=document.createElement('source');source.src=sink+'/media.mp3';source.type='audio/mpeg';media.preload='auto';media.append(source);document.body.append(media);media.load();
  evidence.mediaPlayback=false;evidence.mediaError=null;
  const playback=media.play().then(()=>{evidence.mediaPlayback=true;},error=>{evidence.mediaError=error.name;});
  await Promise.race([playback,new Promise(resolve=>setTimeout(resolve,300))]);
  const style=document.createElement('style');style.textContent='body{background-image:url('+sink+'/css)}';document.head.append(style);
  const form=document.createElement('form');form.action=sink+'/form';form.method='POST';document.body.append(form);evidence.formAttempted=true;try{form.submit();}catch{}
  evidence.popupDenied=window.open(sink+'/popup')===null;
  try{await navigator.serviceWorker.register('native-worker.js');evidence.serviceWorkerDenied=false;}catch{evidence.serviceWorkerDenied=true;}
  try{const worker=new Worker(sink+'/worker');worker.terminate();}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
  // Sandbox disallows forms before CSP dispatch, so form-action need not emit an event.
  evidence.egressDirectives=['connect-src','img-src','media-src','frame-src','worker-src'].every(directive=>violations.includes(directive));
  evidence.egressViolations=[...new Set(violations)];
  evidence.redirectDenied=(await fetch('${prefix}/redirect')).status===403;
  document.getElementById('save').onclick();
  await fetch('${prefix}/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)});
  let finished=false,navigated=false;
  const timer=setInterval(async()=>{const command=await(await fetch('${prefix}/command')).json();if(command.action==='finish'&&!finished){finished=true;document.getElementById('finish').onclick();}if(command.action==='navigate'&&finished&&!navigated){navigated=true;clearInterval(timer);
    await fetch('${prefix}/navigation-attempt',{method:'POST'});
    // The SCO can read this same-origin nonce; it is not an authority boundary.
    const injected=parent.document.createElement('script');injected.nonce=parent.document.querySelector('script[nonce]').nonce;
    injected.textContent='location.href='+JSON.stringify('${origin}${prefix}/pear-canary');parent.document.body.append(injected);
  }},200);
})();`;
const standard = edition as '1.2' | '2004-2' | '2004-3' | '2004-4';
// Exercise XML boolean/integer/token/time lexical bindings in the actual native journey.
const manifest = standard === '1.2' ? singleSCOManifest(standard) : xmlTimeManifest(xmlTokenManifest(singleSCOManifest(standard)
  .replace('<p:manifest ', '<p:manifest xmlns:s="http://www.imsglobal.org/xsd/imsss" xmlns:a="http://www.adlnet.org/xsd/adlseq_v1p3" ')
  .replace('identifier="intro"', 'identifier="intro" isvisible=" &#x9;1&#xA; "')
  .replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><s:sequencing><s:deliveryControls tracked=" &#xD;true&#xA; "/><s:limitConditions attemptLimit=" &#x9;+0003&#xA; " beginTimeLimit="2000-01-01T00:00:00Z" endTimeLimit="2099-01-01T00:00:00Z" attemptAbsoluteDurationLimit="PT3600S" attemptExperiencedDurationLimit="PT3600S" activityAbsoluteDurationLimit="PT3600S" activityExperiencedDurationLimit="PT3600S"/><s:randomizationControls selectionTiming="never" randomizationTiming="never"/><s:sequencingRules><s:preConditionRule><s:ruleConditions conditionCombination="all"><s:ruleCondition condition="always" operator="not"/></s:ruleConditions><s:ruleAction action="disabled"/></s:preConditionRule></s:sequencingRules><a:rollupConsiderations requiredForSatisfied="always" requiredForNotSatisfied="always" requiredForCompleted="always" requiredForIncomplete="always"/></s:sequencing>')));
const collections = standard === '1.2' ? manifest : xmlCollectionIdsManifest(collectionManifest(standard, manifest));
const nativeManifest = collectionSPM ? singleSCOManifest(standard) : standard === '2004-4' ? xmlSharedTargetManifest(collections.replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:data><runtime:map targetID="urn:pear:native-shared-target" readSharedData="true" writeSharedData="true"/></runtime:data>')) : collections;
const f = await scormLearningFixture(join(dir, 'pear.sqlite'), interopPackage(standard, 'pipwerks', script, nativeManifest)), binding = f.enroll();
const {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4315', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
// Synthetic diagnostics record route classes/status, never launch capabilities.
content!.addHook('onResponse', async (req, reply) => {
  const kind = req.url.startsWith('/launch/') ? req.url.endsWith('/checkpoint') ? 'checkpoint' : req.url.includes('/files/') ? 'resource' : 'launch' : req.url === '/runtime.js' ? 'runtime' : req.url.startsWith(prefix) ? req.url.endsWith('/probe') ? 'probe' : 'fixture-command' : 'other';
  contentRequests.push({kind, status: reply.statusCode});
});
// Lose one successful response after the real player transaction has committed.
content!.addHook('onSend', async (req, reply, payload) => {
  if (!req.url.endsWith('/checkpoint') || reply.statusCode !== 200) return payload;
  const serialized = JSON.stringify(req.body);largestCheckpointBytes=Math.max(largestCheckpointBytes,Buffer.byteLength(serialized));
  largestCheckpointLimit=Math.max(largestCheckpointLimit,scorm2004CheckpointLimit((req.body as any)?.state));
  if(Object.keys(JSON.parse(String(payload)).responseBindings??{}).length)responseBindingCheckpoints++;
  if(Array.isArray((req.body as any)?.interactionWrites)&&(req.body as any).interactionWrites.length){responseWriteCheckpoints++;largestInteractionJournal=Math.max(largestInteractionJournal,(req.body as any).interactionWrites.length);}
  const count = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
  const revision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
  // Lose the large collection ACK, never the wrapper's initial small checkpoint.
  if (collectionSPM && Object.keys((req.body as any)?.state?.interactions ?? {}).length !== 250) return payload;
  if (!droppedACK) {
    droppedACK = true; droppedPayload = serialized; droppedReceipt = String(payload); droppedCount = count; droppedRevision = revision;
    reply.code(503); return JSON.stringify({error: 'Synthetic lost acknowledgement after commit'});
  }
  if (serialized === droppedPayload) exactRetry = String(payload) === droppedReceipt && count === droppedCount && revision === droppedRevision;
  return payload;
});
const sink = Fastify({logger: false}); sink.addHook('onRequest', async req => {calls.push(req.url);}); sink.all('/*', async () => 'Synthetic native isolation sink');
content!.get(prefix + '/redirect', async (_req, reply) => reply.redirect(origin + prefix + '/pear-canary'));
content!.post(prefix + '/navigation-attempt', async () => {navigationAttempts.push('player-script-pear'); return {ok: true};});
app.get(prefix + '/pear-canary', async () => {pearCanaryCalls.push('pear-canary'); return 'Synthetic Pear navigation sink';});
app.post(prefix + '/navigation-violation', async req => {if ((req.body as any)?.directive === 'frame-src') navigationViolations.push('frame-src'); return {ok: true};});
content!.get(prefix + '/command', async () => ({action}));
content!.post(prefix + '/probe', async req => {probes.push(req.body); return {ok: true};});
app.get(prefix + '/bootstrap/:user', async (req, reply) => {
  const user = (req.params as any).user; if (!['learner-a', 'learner-b'].includes(user)) return reply.code(404).send();
  const login = await app.inject({method: 'POST', url: '/api/login', headers: {host: '127.0.0.1:4310', origin}, payload: {username: user, password: user + '-dev'}});
  if (login.statusCode !== 200) throw Error('Synthetic native login failed');
  return reply.header('Set-Cookie', login.headers['set-cookie']!).redirect(user === 'learner-a' ? prefix + '/view' : '/');
});
app.get(prefix + '/view', async (_req, reply) => reply.type('text/html').send(readFileSync('dist/index.html', 'utf8').replace('</head>', '<script defer src="' + prefix + '/driver.js"></script></head>')));
app.get(prefix + '/driver.js', async (_req, reply) => reply.type('text/javascript').send(`
document.addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective==='frame-src')void fetch('${prefix}/navigation-violation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({directive:event.effectiveDirective})});});
(async()=>{const wait=async(fn)=>{const until=Date.now()+60000;for(;;){const result=fn();if(result)return result;if(Date.now()>until)throw Error('Native driver timeout');await new Promise(r=>setTimeout(r,100));}};
const button=label=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label&&!b.disabled);
try{await wait(()=>button('Sign out'));(await wait(()=>button('My learning'))).click();(await wait(()=>button('Continue learning'))).click();
const panel=await wait(()=>document.querySelector('[aria-label="Enrolled SCORM player"]'));
const consent=Array.from(panel.querySelectorAll('input')).find(i=>i.type==='checkbox'&&i.parentElement.textContent.includes('I consent to SCORM progress tracking'));consent.click();
const intro=()=>Array.from(panel.querySelectorAll('button')).find(b=>b.textContent.includes('Introduction')&&!b.disabled);(await wait(intro)).click();
let resumed=false,retried=false;setInterval(async()=>{const state=await(await fetch('${prefix}/command')).json();if(state.action==='retry'&&!retried){retried=true;(await wait(()=>button('Retry engine checkpoint'))).click();}if(state.action==='resume'&&!resumed){resumed=true;(await wait(()=>button('Close SCO and choose another'))).click();(await wait(intro)).click();}},200);
}catch(error){await fetch('${prefix}/driver-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:error.name,message:error.message})});}})();`));
// Counts/booleans only: never expose CMI values or capabilities in native diagnostics.
function collectionStored() {
  const row = f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts ORDER BY rowid DESC LIMIT 1').get() as any;
  const receipt = f.db.prepare('SELECT result FROM scorm_engine_checkpoints ORDER BY rowid DESC LIMIT 1').get() as any;
  const state = row ? JSON.parse(row.runtime_state) : {}, bindings = receipt ? JSON.parse(receipt.result).responseBindings ?? {} : {};
  const interactions = Object.values(state.interactions ?? {}) as any[], objectives = Object.values(state.objectives ?? {}) as any[];
  const origins = Object.keys(bindings).length;
  const comments = Object.values(state.comments_from_learner ?? {}) as any[];
  return {interactions: interactions.length, objectives: objectives.length, origins, preserved: interactions.length === 250 && objectives.length === 100 && origins === 250 && interactions.every((value, i) => value.type === 'choice' && value.learner_response === '{lang=en}Original collection response' && bindings['cmi.interactions.' + i + '.learner_response'] === 'fill-in' && Object.keys(value.objectives ?? {}).length === 10 && Object.keys(value.correct_responses ?? {}).length === 10) && objectives.every(value => value.score?.raw === '50'), ...(commentSPM ? {comments:{count:comments.length,preserved:comments.length===250&&comments.every((value,i)=>value.comment==='🙂'.repeat(4000)&&value.location==='page'+i&&value.timestamp==='2020-02-29T12:00:00.00Z')}} : {})};
}
app.get(prefix + '/state', async () => ({sharedTargetStored: standard !== '2004-4' || f.db.prepare('SELECT store FROM scorm_system_data WHERE target_id=?').get('urn:pear:native-shared-target')?.store === 'native-shared-target-notes', edition, collectionSPM, commentSPM, collectionStored: collectionSPM ? collectionStored() : null, action, droppedACK, exactRetry, largestCheckpointBytes, largestCheckpointLimit, responseBindingCheckpoints, responseWriteCheckpoints, largestInteractionJournal, binding, contentRequests, probes, calls, navigationAttempts, pearCanaryCalls, navigationViolations, driverErrors, checkpoints: (f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get() as any).n, proofs: (f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get() as any).n, certificates: (f.db.prepare('SELECT count(*) n FROM certificates').get() as any).n}));
app.post(prefix + '/command', async (req, reply) => {const next = (req.body as any)?.action; if (!['retry', 'resume', 'finish', 'navigate'].includes(next)) return reply.code(400).send(); action = next; return {ok: true};});
app.get(prefix + '/command', async () => ({action}));
app.post(prefix + '/driver-error', async req => {driverErrors.push(String((req.body as any)?.message).slice(0, 200)); return {ok: true};});
await sink.listen({host: '127.0.0.1', port: 4316}); await content!.listen({host: '127.0.0.1', port: 4315}); await app.listen({host: '127.0.0.1', port: 4310});
console.log('PEAR_NATIVE_FIXTURE_READY');
let closing = false;
async function close() {
  if (closing) return; closing = true;
  // Flush phase evidence before a synchronous close/cleanup can block or exit.
  const started = performance.now(), phase = (name: string, databaseCloseMs?: number) => writeSync(1, 'PEAR_NATIVE_FIXTURE_CLOSE:' + name + ' elapsedMs=' + (performance.now() - started).toFixed(3) + (databaseCloseMs === undefined ? '' : ' databaseCloseMs=' + databaseCloseMs.toFixed(3)) + '\n');
  phase('received');
  sink.server.closeAllConnections(); content!.server.closeAllConnections(); app.server.closeAllConnections();
  phase('connections-closed');
  await sink.close(); phase('sink-closed');
  await app.close(); phase('app-closed');
  const databaseCloseStarted = performance.now(); f.db.close(); const databaseCloseMs = performance.now() - databaseCloseStarted;
  phase('database-closed', databaseCloseMs); rmSync(dir, {recursive: true, force: true}); phase('cleanup-complete'); process.exit(0);
}
process.on('SIGTERM', () => void close()); process.on('SIGINT', () => void close());

// Node IPC gives Windows the same graceful fixture cleanup as Unix signals.
process.on("message", message => {if ((message as any)?.kind === "close") void close();});
