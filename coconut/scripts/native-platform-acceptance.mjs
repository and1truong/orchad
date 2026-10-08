// Drives actual Tauri/WebView and MCP lanes; never substitutes a browser/mock.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const bin=process.argv[2];
if(!bin)throw Error('Explicit native binary required');
console.log(JSON.stringify({platform:process.platform,node:process.version,image:process.env.ImageOS,imageVersion:process.env.ImageVersion}));
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','1420'],{cwd:root,stdio:'inherit'});
let viteExit=null;vite.on('exit',code=>viteExit=code);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const run=(script,env={})=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['scripts/'+script,bin],{cwd:root,env:{...process.env,...env},stdio:'inherit'});
 child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(Error(script+' failed: '+(signal??code))));
});
try{
 const deadline=Date.now()+30000;
 for(;;){
  if(viteExit!==null)throw Error('Native UI server exited: '+viteExit);
  if(await fetch('http://127.0.0.1:1420/').then(r=>r.ok,()=>false))break;
  if(Date.now()>deadline)throw Error('Native UI server unavailable');
  await sleep(250);
 }
 await run('native-acceptance.mjs');
 await run('native-pear-acceptance.mjs');
 for(const edition of ['1.2','2004-2','2004-3','2004-4'])await run('native-scorm-acceptance.mjs',{PEAR_NATIVE_SCORM_EDITION:edition});
 console.log('[native-platform] actual runtime, Pear and all four SCORM profiles passed');
}finally{
 vite.kill('SIGTERM');
 if(viteExit===null)await new Promise(resolve=>{const timeout=setTimeout(()=>{vite.kill('SIGKILL');resolve();},5000);vite.once('exit',()=>{clearTimeout(timeout);resolve();});});
}
