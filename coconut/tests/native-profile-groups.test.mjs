// Orchestration only. This does not substitute for actual WebView acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('native groups cover every original profile, default to all and stop on failure', () => {
  const dir=mkdtempSync(join(tmpdir(),'coconut-native-groups-'));
  try {
    mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'node_modules/vite/bin'),{recursive:true});
    writeFileSync(join(dir,'scripts/native-platform-acceptance.mjs'),readFileSync(new URL('../scripts/native-platform-acceptance.mjs',import.meta.url)));
    writeFileSync(join(dir,'node_modules/vite/bin/vite.js'),"require('node:http').createServer((q,r)=>r.end('fixture')).listen(1420,'127.0.0.1');");
    for(const script of ['native-acceptance.mjs','native-pear-acceptance.mjs','native-scorm-acceptance.mjs'])writeFileSync(join(dir,'scripts',script),
      "import {appendFileSync} from 'node:fs';appendFileSync(process.env.NATIVE_GROUP_RECORD,JSON.stringify({script:"+JSON.stringify(script)+",edition:process.env.PEAR_NATIVE_SCORM_EDITION??null,collection:process.env.PEAR_NATIVE_SCORM_COLLECTION_SPM==='1',comments:process.env.PEAR_NATIVE_SCORM_COMMENT_SPM==='1'})+'\\n');if(process.env.NATIVE_GROUP_FAIL==="+JSON.stringify(script)+")process.exit(7);");
    const record=join(dir,'record');
    const run=(group,fail)=>{
      writeFileSync(record,'');const env={...process.env,NATIVE_GROUP_RECORD:record,NATIVE_GROUP_FAIL:fail??''};
      delete env.PEAR_NATIVE_SCORM_EDITION;delete env.PEAR_NATIVE_SCORM_COLLECTION_SPM;delete env.PEAR_NATIVE_SCORM_COMMENT_SPM;
      const result=spawnSync(process.execPath,['scripts/native-platform-acceptance.mjs','explicit-test-binary',...(group===undefined?[]:[group])],{cwd:dir,env,encoding:'utf8',timeout:15000});
      assert.ifError(result.error);return {...result,rows:readFileSync(record,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)};
    };
    const baseline=[{script:'native-acceptance.mjs',edition:null,collection:false,comments:false},{script:'native-pear-acceptance.mjs',edition:null,collection:false,comments:false},...['1.2','2004-2','2004-3','2004-4'].map(edition=>({script:'native-scorm-acceptance.mjs',edition,collection:false,comments:false}))];
    const collections=[...['2004-2','2004-3','2004-4'].map(edition=>({script:'native-scorm-acceptance.mjs',edition,collection:true,comments:false})),...['2004-2','2004-3','2004-4'].map(edition=>({script:'native-scorm-acceptance.mjs',edition,collection:false,comments:true}))];
    for(const [group,expected] of [['baseline',baseline],['collections',collections],['all',[...baseline,...collections]],[undefined,[...baseline,...collections]]]){
      const result=run(group);assert.equal(result.status,0,result.stderr);assert.deepEqual(result.rows,expected);
    }
    const failed=run('baseline','native-pear-acceptance.mjs');assert.equal(failed.status,1);assert.deepEqual(failed.rows,baseline.slice(0,2));assert.match(failed.stderr,/failed: 7/);
    const invalid=run('unknown');assert.equal(invalid.status,1);assert.deepEqual(invalid.rows,[]);assert.match(invalid.stderr,/Unknown native profile group/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
