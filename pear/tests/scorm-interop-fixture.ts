import {readFileSync} from 'node:fs';
import {zip} from './scorm-fixture.ts';
import {singleSCOManifest} from './scorm-player-fixture.ts';
import type {SCORMStandard} from '../src/shared/scorm-engine.ts';
export function interopPackage(standard: SCORMStandard, wrapper: 'pipwerks' | 'adl', extraScript = '', manifest = singleSCOManifest(standard)) {
  const source = wrapper === 'adl' ? Buffer.from(readFileSync(new URL('./fixtures/scorm/adl-2004-wrapper.base64', import.meta.url), 'utf8').trim(), 'base64') : readFileSync(new URL('./fixtures/scorm/pipwerks-wrapper.js', import.meta.url));
  const version = standard === '1.2' ? '1.2' : '2004';
  const driver = wrapper === 'pipwerks' ? `pipwerks.debug.isActive=false;const scorm=pipwerks.SCORM;scorm.version='${version}';const init=()=>scorm.init(),get=(k)=>scorm.get(k),set=(k,v)=>scorm.set(k,v),save=()=>scorm.save(),finish=()=>scorm.quit();` : `const init=()=>doInitialize(),get=(k)=>doGetValue(k),set=(k,v)=>doSetValue(k,v),save=()=>doCommit(),finish=()=>doTerminate();`;
  const bookmark = standard === '1.2' ? 'cmi.core.lesson_location' : 'cmi.location', status = standard === '1.2' ? 'cmi.core.lesson_status' : 'cmi.completion_status', exit = standard === '1.2' ? 'cmi.core.exit' : 'cmi.exit', entry = standard === '1.2' ? 'cmi.core.entry' : 'cmi.entry';
  const script = driver + `document.getElementById('result').textContent='Licensed wrapper Initialize: '+init();document.getElementById('entry').textContent='Licensed entry: '+get('${entry}')+'; bookmark: '+get('${bookmark}');
    document.getElementById('save').onclick=()=>{set('${bookmark}','licensed-page');set('cmi.suspend_data','licensed-state');set('${status}','incomplete');set('${exit}','suspend');document.getElementById('result').textContent='Licensed save: '+save();};
    document.getElementById('finish').onclick=()=>{set('${status}','${standard === '1.2' ? 'passed' : 'completed'}');${standard === '1.2' ? "set('cmi.core.score.raw','90');" : "set('cmi.success_status','passed');set('cmi.score.scaled','0.9');"}document.getElementById('result').textContent='Licensed finish: '+finish();};`;
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(manifest), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from('<!doctype html><html><body><h1>Licensed wrapper content</h1><p id="result"></p><p id="entry"></p><button id="save">Store licensed progress</button><button id="finish">Finish licensed content</button><script src="../assets/wrapper.js"></script><script src="../assets/player.js"></script></body></html>'), method: 8},
    {name: 'assets/wrapper.js', data: source, method: 8},
    {name: 'assets/player.js', data: Buffer.from(script + extraScript), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body{color:#123}'), method: 8},
  ]);
}
