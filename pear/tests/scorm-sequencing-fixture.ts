import {multiFileManifest} from './scorm-package-fixture.ts';
import type {SCORM2004Edition} from '../src/shared/scorm2004-runtime.ts';
export function sequencingManifest(edition: SCORM2004Edition = '2004-4') {
  const objective = `<s:objectives><s:primaryObjective objectiveID="primary" satisfiedByMeasure="true"><s:minNormalizedMeasure>0.8</s:minNormalizedMeasure><s:mapInfo targetObjectiveID="shared-mastery" writeSatisfiedStatus="true" writeNormalizedMeasure="true"/></s:primaryObjective></s:objectives>`;
  const gate = `<s:objectives><s:objective objectiveID="required-intro"><s:mapInfo targetObjectiveID="shared-mastery" readSatisfiedStatus="true" readNormalizedMeasure="true"/></s:objective></s:objectives><s:sequencingRules><s:preConditionRule><s:ruleConditions conditionCombination="any"><s:ruleCondition condition="objectiveStatusKnown" referencedObjective="required-intro" operator="not"/><s:ruleCondition condition="satisfied" referencedObjective="required-intro" operator="not"/></s:ruleConditions><s:ruleAction action="disabled"/></s:preConditionRule></s:sequencingRules>`;
  const rollup = `<s:rollupRules><s:rollupRule childActivitySet="all"><s:rollupConditions><s:rollupCondition condition="completed"/></s:rollupConditions><s:rollupAction action="completed"/></s:rollupRule><s:rollupRule childActivitySet="all"><s:rollupConditions><s:rollupCondition condition="satisfied"/></s:rollupConditions><s:rollupAction action="satisfied"/></s:rollupRule></s:rollupRules>`;
  return multiFileManifest(edition).replace('<p:manifest ', '<p:manifest xmlns:a="http://www.adlnet.org/xsd/adlseq_v1p3" xmlns:s="http://www.imsglobal.org/xsd/imsss" ').replace('<p:organization identifier="org">', '<p:organization identifier="org" a:objectivesGlobalToSystem="false">').replace('<p:title>Original multi &amp; file package</p:title>', '<p:title>Original multi &amp; file package</p:title><s:sequencing><s:controlMode flow="true" choice="true" forwardOnly="true"/>' + rollup + '</s:sequencing>').replace('<p:title>Introduction</p:title>', '<p:title>Introduction</p:title><s:sequencing>' + objective + '</s:sequencing>').replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><s:sequencing>' + gate + '</s:sequencing>');
}
import {zip} from './scorm-fixture.ts';
export function sequencingPackage(edition: SCORM2004Edition, manifest = sequencingManifest(edition)) {
  const html = (title: string) => '<!doctype html><html><body><h1>' + title + '</h1><p id="entry"></p><p id="result"></p><button id="save">Save sequencing progress</button><button id="continue">Continue sequencing SCO</button><button id="end">End sequencing session</button><script src="../assets/player.js"></script></body></html>';
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(manifest), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from(html('Original sequencing introduction')), method: 8},
    {name: 'lessons/practice.html', data: Buffer.from(html('Original sequencing practice')), method: 8},
    {name: 'assets/player.js', data: Buffer.from(`const api=parent.API_1484_11;api.Initialize('');
      document.getElementById('entry').textContent='Sequencing entry: '+api.GetValue('cmi.entry')+'; bookmark: '+api.GetValue('cmi.location');
      const update=()=>{api.SetValue('cmi.location','sequencing-page');api.SetValue('cmi.exit','suspend');api.SetValue('cmi.session_time','PT20S');};
      document.getElementById('save').onclick=()=>{update();api.SetValue('cmi.completion_status','incomplete');document.getElementById('result').textContent='Sequencing Commit: '+api.Commit('');};
      const finish=(nav)=>{update();api.SetValue('cmi.completion_status','completed');api.SetValue('cmi.success_status','passed');api.SetValue('cmi.score.scaled','0.9');api.SetValue('adl.nav.request',nav);document.getElementById('result').textContent='Sequencing Terminate: '+api.Terminate('');};
      document.getElementById('continue').onclick=()=>finish('continue');document.getElementById('end').onclick=()=>finish('exitAll');`), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body{color:#123}'), method: 8},
  ]);
}
