import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';

test('actual installation upgrades limits-v3 and pristine 1.2, is idempotent and rejects unexpected engine bytes/version',()=>{
  const root=mkdtempSync(join(tmpdir(),'pear-unicode-install-')),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const current2004=readFileSync(new URL('../node_modules/scorm-again/dist/esm/scorm2004.js',import.meta.url),'utf8'),current12=readFileSync(new URL('../node_modules/scorm-again/dist/esm/scorm12.js',import.meta.url),'utf8');
  const beginning='    // Pear: plain characterstring limits count Unicode scalar values, not UTF-16 units.',ending='scalarString ? "u" : "");';
  const previous=(s:string)=>{const start=s.indexOf(beginning),end=s.indexOf(ending,start)+ending.length;assert.ok(start>=0&&end>start);return s.slice(0,start)+'    const formatRegex = new RegExp(regexPattern);'+s.slice(end);};
  const old2004=previous(current2004),old12=previous(current12);assert.equal(hash(old2004),'de7a085e997136ad200f52a2221c2fec17e457c0d6a869735f613219b2dae10e');assert.equal(hash(old12),'52ffa12e5167e3a37b2f64eefa61cd599ea90c30cf4d164b667baddf83d497a6');
  const actualScript=readFileSync(new URL('../scripts/patch-scorm-logging.mjs',import.meta.url),'utf8'),pairs:[string,string][]=[];
  // Reconstruct pinned historical inputs, then prove their exact known hashes.
  // Execute only the trusted replacement declarations with a capture callback.
  runInNewContext(actualScript.slice(actualScript.indexOf('if (![selection, limits, patched]'),actualScript.indexOf('if (digest(output) !== patched)')), {source:'',digest:()=>'',selection:'selection',limits:'limits',patched:'patched',replaceOnce:(a:string,b:string)=>pairs.push([a,b])});
  assert.equal(pairs.length,11);
  let loggingOnly=current2004;
  for(const [before,after] of pairs.toReversed()){assert.equal(loggingOnly.split(after).length,2);loggingOnly=loggingOnly.replace(after,before);}
  assert.equal(hash(loggingOnly),'6a8cc4f52e6c2acbe79e5403d2f0a21602ffcb9fe54ab07e202ca2f223369936');
  let pristine=loggingOnly;
  for(const statement of ['console.debug(`Activity delivered: ${activity.id} - ${activity.title}`);','console.debug("Sequencing state restored successfully");','console.error(`Failed to restore sequencing state: ${error}`);']) pristine=pristine.replace('/* Pear: omit direct upstream sequencing logs. */',statement);
  assert.equal(hash(pristine),'93e463ed4ba87bd59a2fe228c94c879faf4aa7469a687166ffab8fac4a4d1f69');
  let selected=loggingOnly;for(const [before,after] of pairs.slice(0,4))selected=selected.replace(before,after);
  assert.equal(hash(selected),'206daee49525dbf352bf9d6920f6d1ccc03ad9e8834db57a8d7d5ee2efb93cc0');
  try {
    const directory=join(root,'node_modules/scorm-again'),entries=join(directory,'dist/esm');mkdirSync(entries,{recursive:true});mkdirSync(join(root,'scripts'));
    const script=join(root,'scripts/patch-scorm-logging.mjs');writeFileSync(script,readFileSync(new URL('../scripts/patch-scorm-logging.mjs',import.meta.url)));const metadata=join(directory,'package.json');writeFileSync(metadata,JSON.stringify({version:'3.4.5'}));
    for(const input of [pristine,loggingOnly,selected,old2004,current2004]){
      writeFileSync(join(entries,'scorm2004.js'),input);writeFileSync(join(entries,'scorm12.js'),old12);
      const result=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(entries,'scorm2004.js'),'utf8'),current2004);assert.equal(readFileSync(join(entries,'scorm12.js'),'utf8'),current12);
    }
    for(let n=0;n<2;n++){const result=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(entries,'scorm2004.js'),'utf8'),current2004);assert.equal(readFileSync(join(entries,'scorm12.js'),'utf8'),current12);}
    writeFileSync(join(entries,'scorm12.js'),current12+'\n// unexpected');assert.notEqual(spawnSync(process.execPath,[script]).status,0);
    writeFileSync(join(entries,'scorm12.js'),current12);writeFileSync(metadata,JSON.stringify({version:'3.4.6'}));assert.notEqual(spawnSync(process.execPath,[script]).status,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
