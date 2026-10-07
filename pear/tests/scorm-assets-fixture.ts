import {multiFileManifest} from './scorm-package-fixture.ts';
import {zip} from './scorm-fixture.ts';
import type {SCORMStandard} from '../src/shared/scorm-engine.ts';
export function assetManifest(standard: SCORMStandard, onlyAssets = false) {
  let xml = multiFileManifest(standard).replace(/(runtime:scorm[Tt]ype=")sco(" xml:base)/, '$1asset$2');
  if (onlyAssets) xml = xml.replace(/(runtime:scorm[Tt]ype=")sco"/g, '$1asset"');
  if (standard !== '1.2') xml = xml.replace('<p:manifest ', '<p:manifest xmlns:s="http://www.imsglobal.org/xsd/imsss" ').replace('<p:title>Original multi &amp; file package</p:title>', '<p:title>Original multi &amp; file package</p:title><s:sequencing><s:controlMode flow="true"/><s:rollupRules><s:rollupRule childActivitySet="all"><s:rollupConditions><s:rollupCondition condition="completed"/></s:rollupConditions><s:rollupAction action="completed"/></s:rollupRule><s:rollupRule childActivitySet="all"><s:rollupConditions><s:rollupCondition condition="satisfied"/></s:rollupConditions><s:rollupAction action="satisfied"/></s:rollupRule></s:rollupRules></s:sequencing>');
  return xml;
}
export function assetPackage(standard: SCORMStandard, xml = assetManifest(standard)) {
  const script = standard === '1.2' ? `const a=parent.API; a.LMSInitialize(''); document.getElementById('finish').onclick=()=>{a.LMSSetValue('cmi.core.lesson_status','passed');a.LMSSetValue('cmi.core.score.raw','90');a.LMSSetValue('cmi.core.score.min','0');a.LMSSetValue('cmi.core.score.max','100');a.LMSSetValue('cmi.core.session_time','00:00:20');a.LMSFinish('');};` : `const a=parent.API_1484_11;a.Initialize('');document.getElementById('finish').onclick=()=>{a.SetValue('cmi.completion_status','completed');a.SetValue('cmi.success_status','passed');a.SetValue('cmi.score.scaled','0.9');a.SetValue('cmi.session_time','PT20S');a.SetValue('adl.nav.request','exitAll');a.Terminate('');};`;
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(xml), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="../assets/style.css"></head><body><h1>Original asset introduction</h1><p id="apis"></p><p id="control"></p><p id="advance"></p><script>const read=(key)=>{try{return typeof parent[key]}catch{return "undefined"}};document.getElementById("apis").textContent="Asset APIs: "+read("API")+" / "+read("API_1484_11");try{parent.document.getElementById("scorm-asset-continue").click();document.getElementById("control").textContent="Asset parent controls accessible"}catch{document.getElementById("control").textContent="Asset parent controls blocked"}fetch(location.pathname.split("/files/")[0]+"/advance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sequence:1,revision:0,navigation:"continue"})}).then(r=>{document.getElementById("advance").textContent=r.ok?"Asset self-advance accepted":"Asset self-advance blocked"}).catch(()=>{document.getElementById("advance").textContent="Asset self-advance blocked"});</script></body></html>'), method: 8},
    {name: 'lessons/practice.html', data: Buffer.from('<!doctype html><html><body><h1>Original communicating practice</h1><button id="finish">Finish communicating practice</button><script src="../assets/player.js"></script></body></html>'), method: 8},
    {name: 'assets/player.js', data: Buffer.from(script), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body{color:#123}'), method: 8},
  ]);
}
