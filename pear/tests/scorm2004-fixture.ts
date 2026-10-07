import {zip} from './scorm-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import type {SCORM2004Edition} from '../src/shared/scorm2004-runtime.ts';
export function scorm2004Package(edition: SCORM2004Edition) {
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(singleSCOManifest(edition)), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from('<!doctype html><html><body><h1>Original 2004 SCO</h1><p id="entry"></p><p id="isolation"></p><p id="result"></p><button id="save">Save 2004 progress</button><button id="finish">Terminate 2004 SCO</button><script src="../assets/player.js"></script></body></html>'), method: 8},
    {name: 'assets/player.js', data: Buffer.from(`const api=parent.API_1484_11; api.Initialize('');
      document.getElementById('entry').textContent='2004 entry: '+api.GetValue('cmi.entry')+'; bookmark: '+api.GetValue('cmi.location')+'; total: '+api.GetValue('cmi.total_time');
      let isolated=false;try{parent.parent.document.cookie}catch{isolated=true}
      document.getElementById('isolation').textContent=isolated&&!parent.API&&!parent.agentBridgeV1&&!window.__TAURI_INTERNALS__?'2004 API and Pear isolation verified':'Isolation failed';
      const update=()=>{api.SetValue('cmi.location','original-2004-page');api.SetValue('cmi.suspend_data','original-2004-resume');api.SetValue('cmi.exit','suspend');api.SetValue('cmi.score.scaled','0.9');api.SetValue('cmi.success_status','passed');api.SetValue('cmi.session_time','PT20S');};
      document.getElementById('save').onclick=()=>{update();api.SetValue('cmi.completion_status','incomplete');document.getElementById('result').textContent='2004 Commit: '+api.Commit('');};
      document.getElementById('finish').onclick=()=>{update();api.SetValue('cmi.completion_status','completed');document.getElementById('result').textContent='2004 Terminate: '+api.Terminate('');};`), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body{color:#123}'), method: 8},
  ]);
}
