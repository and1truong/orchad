import {multiFileManifest} from './scorm-package-fixture.ts';
import type {SCORM2004Edition} from '../src/shared/scorm2004-runtime.ts';
export function sequencingManifest(edition: SCORM2004Edition = '2004-4') {
  const objective = `<s:objectives><s:primaryObjective objectiveID="primary" satisfiedByMeasure="true"><s:minNormalizedMeasure>0.8</s:minNormalizedMeasure><s:mapInfo targetObjectiveID="shared-mastery" writeSatisfiedStatus="true" writeNormalizedMeasure="true"/></s:primaryObjective></s:objectives>`;
  const gate = `<s:objectives><s:objective objectiveID="required-intro"><s:mapInfo targetObjectiveID="shared-mastery" readSatisfiedStatus="true" readNormalizedMeasure="true"/></s:objective></s:objectives><s:sequencingRules><s:preConditionRule><s:ruleConditions conditionCombination="any"><s:ruleCondition condition="objectiveStatusKnown" referencedObjective="required-intro" operator="not"/><s:ruleCondition condition="satisfied" referencedObjective="required-intro" operator="not"/></s:ruleConditions><s:ruleAction action="disabled"/></s:preConditionRule></s:sequencingRules>`;
  const rollup = `<s:rollupRules><s:rollupRule childActivitySet="all"><s:rollupConditions><s:rollupCondition condition="completed"/></s:rollupConditions><s:rollupAction action="completed"/></s:rollupRule><s:rollupRule childActivitySet="all"><s:rollupConditions><s:rollupCondition condition="satisfied"/></s:rollupConditions><s:rollupAction action="satisfied"/></s:rollupRule></s:rollupRules>`;
  return multiFileManifest(edition).replace('<p:manifest ', '<p:manifest xmlns:a="http://www.adlnet.org/xsd/adlseq_v1p3" xmlns:s="http://www.imsglobal.org/xsd/imsss" ').replace('<p:organization identifier="org">', '<p:organization identifier="org" a:objectivesGlobalToSystem="false">').replace('<p:title>Original multi &amp; file package</p:title>', '<p:title>Original multi &amp; file package</p:title><s:sequencing><s:controlMode flow="true" choice="true" forwardOnly="true"/>' + rollup + '</s:sequencing>').replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><s:sequencing>' + objective + '</s:sequencing>').replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><s:sequencing>' + gate + '</s:sequencing>');
}
import {zip} from './scorm-fixture.ts';
export function sequencingPackage(edition: SCORM2004Edition, manifest = sequencingManifest(edition), unicode = false, interactionRecords = false) {
  const html = (title: string) => '<!doctype html><html><body><h1>' + title + '</h1><p id="entry"></p><p id="result"></p><button id="save">Save sequencing progress</button><button id="fail">Fail sequencing attempt</button><button id="continue">Continue sequencing SCO</button><button id="end">End sequencing session</button><script src="../assets/player.js"></script></body></html>';
  const sharedScript = manifest.includes('<runtime:data>') ? `
    const sharedStatus=document.createElement('p');document.body.append(sharedStatus);
    const sharedValue=api.GetValue('adl.data.0.store');sharedStatus.textContent='Shared notes: '+(api.GetLastError()==='0'?sharedValue:'unreadable');
    const remember=()=>{if(location.pathname.endsWith('intro.html'))api.SetValue('adl.data.0.store','authored-shared-notes');};
    for(const id of ['save','continue','end'])document.getElementById(id).addEventListener('click',remember,true);
  ` : '';
  const unicodeScript = unicode ? `
    const status=document.createElement('p');document.body.append(status);status.textContent='Unicode suspend characters: '+Array.from(api.GetValue('cmi.suspend_data')).length;
    const localized=document.createElement('p');document.body.append(localized);localized.textContent='Localized comment characters: '+Array.from(api.GetValue('cmi.comments_from_learner.0.comment').replace(/^\\{lang=[^}]+\\}/,'')).length;
    const rememberLocalized=()=>{const value='{lang=vi-VN-x-demo}'+'🙂'.repeat(3997)+'e\\u0301\\n';let accepted=api.SetValue('cmi.comments_from_learner.0.comment',value)==='true';accepted=api.SetValue('cmi.interactions.0.id','urn:pear:localized')==='true' && accepted;accepted=api.SetValue('cmi.interactions.0.type','long-fill-in')==='true' && accepted;accepted=api.SetValue('cmi.interactions.0.learner_response',value)==='true' && accepted;localized.textContent='Localized writes: '+(accepted?'accepted':'failed');};
    for(const id of ['save','continue','end'])document.getElementById(id).addEventListener('click',rememberLocalized,true);
    const rememberUnicode=()=>{const value='🙂'.repeat(${edition === '2004-2' ? 4000 : 64000});const rejected=api.SetValue('cmi.suspend_data',value+'x')==='false';status.textContent='Unicode SetValue: '+(rejected && api.SetValue('cmi.suspend_data',value)==='true'?'accepted':'failed');};
    for(const id of ['save','continue','end'])document.getElementById(id).addEventListener('click',rememberUnicode,true);
  ` : '';
  const interactionScript = interactionRecords ? `
    const records=document.createElement('p');document.body.append(records);records.textContent='Performance records: '+(api.GetValue('cmi.interactions.1.learner_response').split('[,]').filter(Boolean).length)+'; correct sets: '+api.GetValue('cmi.interactions.0.correct_responses._count');
    const rememberRecords=()=>{api.SetValue('cmi.interactions.0.id','urn:pear:choice');api.SetValue('cmi.interactions.0.type','choice');api.SetValue('cmi.interactions.0.learner_response','');if(api.GetValue('cmi.interactions.0.correct_responses._count')==='0')api.SetValue('cmi.interactions.0.correct_responses.0.pattern','');api.SetValue('cmi.interactions.1.id','urn:pear:performance');api.SetValue('cmi.interactions.1.type','performance');const value=Array.from({length:250},(_,i)=>('step-'+i+'-').padEnd(250,'a')+'[.]'+'🙂'.repeat(250)).join('[,]');records.textContent='Performance SetValue: '+api.SetValue('cmi.interactions.1.learner_response',value);};
    for(const id of ['save','continue','end'])document.getElementById(id).addEventListener('click',rememberRecords,true);
  ` : '';
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(manifest), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from(html('Original sequencing introduction')), method: 8},
    {name: 'lessons/practice.html', data: Buffer.from(html('Original sequencing practice')), method: 8},
    {name: 'assets/player.js', data: Buffer.from(`const api=parent.API_1484_11;api.Initialize('');
      document.getElementById('entry').textContent='Sequencing entry: '+api.GetValue('cmi.entry')+'; bookmark: '+api.GetValue('cmi.location');
      const update=()=>{api.SetValue('cmi.location','sequencing-page');api.SetValue('cmi.exit','suspend');api.SetValue('cmi.session_time','PT20S');};
      document.getElementById('save').onclick=()=>{update();api.SetValue('cmi.progress_measure','0.2');api.SetValue('cmi.completion_status','incomplete');document.getElementById('result').textContent='Sequencing Commit: '+api.Commit('');};
      const finish=(nav)=>{update();api.SetValue('cmi.progress_measure',location.pathname.endsWith('intro.html')?'0.5':'1');api.SetValue('cmi.completion_status','completed');api.SetValue('cmi.success_status','passed');api.SetValue('cmi.score.scaled','0.9');api.SetValue('adl.nav.request',nav);document.getElementById('result').textContent='Sequencing Terminate: '+api.Terminate('');};
      document.getElementById('fail').onclick=()=>{update();api.SetValue('cmi.exit','normal');api.SetValue('cmi.completion_status','completed');api.SetValue('cmi.success_status','failed');api.SetValue('cmi.score.scaled','0.4');api.SetValue('adl.nav.request','exit');document.getElementById('result').textContent='Failed attempt Terminate: '+api.Terminate('');};
      document.getElementById('continue').onclick=()=>finish('continue');document.getElementById('end').onclick=()=>finish('exitAll');` + sharedScript + unicodeScript + interactionScript), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body{color:#123}'), method: 8},
  ]);
}

export function collectionManifest(edition: SCORM2004Edition = '2004-4') {
  const definitions: string[] = [];
  const xml = sequencingManifest(edition).replace(/<s:sequencing>([\s\S]*?)<\/s:sequencing>/g, (_, body) => {
    const id = 'shared-' + definitions.length; definitions.push(`<s:sequencing ID="${id}">${body}</s:sequencing>`);
    return `<s:sequencing IDRef="${id}"/>`;
  });
  return xml.replace('</p:manifest>', `<s:sequencingCollection>${definitions.join('')}</s:sequencingCollection></p:manifest>`);
}

export function retryManifest(edition: SCORM2004Edition = '2004-4', action: 'retry' | 'retryAll' = 'retry') {
  const rule = `<s:sequencingRules><s:postConditionRule><s:ruleConditions><s:ruleCondition condition="satisfied" operator="not"/></s:ruleConditions><s:ruleAction action="${action}"/></s:postConditionRule></s:sequencingRules>`;
  return sequencingManifest(edition).replace('<s:objectives><s:primaryObjective', rule + '<s:limitConditions attemptLimit="3"/><s:objectives><s:primaryObjective');
}

export function weightedManifest() {
  return sequencingManifest().replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:completionThreshold completedByMeasure="true" minProgressMeasure="0.5" progressWeight="0.75"/>').replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><runtime:completionThreshold completedByMeasure="true" minProgressMeasure="0.5" progressWeight="0.25"/>');
}

export function adlManifest(edition: SCORM2004Edition = '2004-4') {
  return sequencingManifest(edition).replace('<p:manifest ', '<p:manifest xmlns:n="http://www.adlnet.org/xsd/adlnav_v1p3" ')
    .replace('</s:sequencing>', '<a:constrainedChoiceConsiderations constrainChoice="false" preventActivation="false"/></s:sequencing>')
    .replace('</s:sequencingRules></s:sequencing>', '</s:sequencingRules><a:rollupConsiderations requiredForCompleted="ifAttempted" requiredForSatisfied="ifNotSkipped" measureSatisfactionIfActive="false"/></s:sequencing>')
    .replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><n:presentation><n:navigationInterface><n:hideLMSUI>continue</n:hideLMSUI><n:hideLMSUI>exit</n:hideLMSUI></n:navigationInterface></n:presentation>');
}

export function calendarManifest(edition: SCORM2004Edition = '2004-4', begin = '2000-01-01T00:00:00Z', end = '2099-01-01T00:00:00Z') {
  return sequencingManifest(edition).replace('<s:controlMode flow="true" choice="true" forwardOnly="true"/>', `<s:controlMode flow="true" choice="true" forwardOnly="true"/><s:limitConditions beginTimeLimit="${begin}" endTimeLimit="${end}"/>`);
}

export function sharedDataManifest() {
  return sequencingManifest().replace('a:objectivesGlobalToSystem="false"', 'a:objectivesGlobalToSystem="false" runtime:sharedDataGlobalToSystem="false"')
    .replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><runtime:data><runtime:map targetID="urn:pear:shared-notes" readSharedData="false" writeSharedData="true"/><runtime:map targetID="urn:pear:private-writer" readSharedData="false" writeSharedData="true"/></runtime:data>')
    .replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><runtime:data><runtime:map targetID="urn:pear:shared-notes"/></runtime:data>');
}

export function systemSharedDataManifest() {return sharedDataManifest().replace('runtime:sharedDataGlobalToSystem="false"', '');}

export function selectionManifest(edition: SCORM2004Edition = '2004-4', selectionTiming = 'once', randomizationTiming = 'once', selectCount = 1, reorderChildren = true) {
  return sequencingManifest(edition).replace(/(<s:controlMode[^>]*\/>)/, '$1' + `<s:randomizationControls selectionTiming="${selectionTiming}" randomizationTiming="${randomizationTiming}" selectCount="${selectCount}" reorderChildren="${reorderChildren}"/>`).replace(/(<p:title>Practice<\/p:title>)<s:sequencing>.*?<\/s:sequencing>/, '$1');
}
