import {zip} from './scorm-fixture.ts';
import type {SCORMStandard} from '../src/shared/scorm-engine.ts';
import {multiFileManifest} from './scorm-package-fixture.ts';
export function singleSCOManifest(standard: SCORMStandard = '1.2') {
  return multiFileManifest(standard).replace(/<p:item identifier="practice"[\s\S]*?<\/p:item>/, '').replace(/<p:resource identifier="sco2"[\s\S]*?<\/p:resource>/, '');
}
export function singleSCOPackage(xml = singleSCOManifest()) {
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(xml), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="../assets/style.css"></head><body><h1>Original engine SCO</h1><p id="entry"></p><p id="resume"></p><p id="isolation"></p><p id="result"></p><button id="save">Save engine progress</button><button id="finish">Finish engine SCO</button><script src="../assets/player.js"></script></body></html>'), method: 8},
    {name: 'assets/player.js', data: Buffer.from(`const api=parent.API;
      api.LMSInitialize("");
      document.getElementById("entry").textContent="Engine entry: "+api.LMSGetValue("cmi.core.entry");
      document.getElementById("resume").textContent="Engine resume: "+api.LMSGetValue("cmi.core.lesson_location")+"; "+api.LMSGetValue("cmi.suspend_data")+"; total: "+api.LMSGetValue("cmi.core.total_time");
      let isolated=false;try{parent.parent.document.cookie}catch{isolated=true}
      document.getElementById("isolation").textContent=isolated&&!window.agentBridgeV1&&!parent.agentBridgeV1&&!window.__TAURI_INTERNALS__?"Pear cookies and bridge are isolated":"Isolation failed";
      document.getElementById("save").onclick=()=>{
        api.LMSSetValue("cmi.core.lesson_location","page-2");api.LMSSetValue("cmi.suspend_data","original-engine-resume");
        api.LMSSetValue("cmi.core.lesson_status","incomplete");api.LMSSetValue("cmi.core.exit","suspend");api.LMSSetValue("cmi.core.score.raw","85");api.LMSSetValue("cmi.core.session_time","00:01:00");
        api.LMSSetValue("cmi.interactions.0.id","original-q1");api.LMSSetValue("cmi.interactions.0.type","choice");api.LMSSetValue("cmi.interactions.0.student_response","a");api.LMSSetValue("cmi.interactions.0.result","correct");
        document.getElementById("result").textContent="Commit accepted: "+api.LMSCommit("");
      };
      document.getElementById("finish").onclick=()=>{document.getElementById("result").textContent="Finish accepted: "+api.LMSFinish("")};`), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body{color:rgb(17,34,51)}'), method: 8},
  ]);
}

export function multiSCOPlayerPackage(hidden = false) {
  let xml = multiFileManifest().replace('<p:title>Practice</p:title>', '<p:title>Practice</p:title><runtime:prerequisites type="aicc_script">intro</runtime:prerequisites>');
  if (hidden) xml = xml.replace('identifier="intro"', 'identifier="intro" isvisible="false"').replace('identifier="practice"', 'identifier="practice" isvisible="0"');
  const html = (title: string) => '<!doctype html><html><body><h1>' + title + '</h1><p id="entry"></p><p id="result"></p><button id="save">Save SCO progress</button><button id="finish">Finish SCO</button><script src="../assets/player.js"></script></body></html>';
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(xml), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from(html('Original introduction SCO')), method: 8},
    {name: 'lessons/practice.html', data: Buffer.from(html('Original practice SCO')), method: 8},
    {name: 'assets/player.js', data: Buffer.from(`const api=parent.API; api.LMSInitialize("");
      document.getElementById("entry").textContent="SCO entry: "+api.LMSGetValue("cmi.core.entry")+"; bookmark: "+api.LMSGetValue("cmi.core.lesson_location");
      const update=()=>{api.LMSSetValue("cmi.core.lesson_location",location.pathname.endsWith("intro.html")?"intro-page":"practice-page");api.LMSSetValue("cmi.core.exit","suspend");api.LMSSetValue("cmi.core.score.raw","90");api.LMSSetValue("cmi.core.score.min","0");api.LMSSetValue("cmi.core.score.max","100");api.LMSSetValue("cmi.core.session_time","00:00:20");};
      document.getElementById("save").onclick=()=>{update();api.LMSSetValue("cmi.core.lesson_status","incomplete");document.getElementById("result").textContent="Commit: "+api.LMSCommit("");};
      document.getElementById("finish").onclick=()=>{update();api.LMSSetValue("cmi.core.lesson_status","passed");document.getElementById("result").textContent="Finish: "+api.LMSFinish("");};`), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body{color:#123}'), method: 8},
  ]);
}
