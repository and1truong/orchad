import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {reviewedSCORMSource, unreviewedSCORMSource} from '../scripts/scorm-review-corrections.mjs';

test('actual installation upgrades limits-v3 and pristine 1.2, is idempotent and rejects unexpected engine bytes/version',()=>{
  const root=mkdtempSync(join(tmpdir(),'pear-unicode-install-')),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const corrected2004=readFileSync(new URL('../node_modules/scorm-again/dist/esm/scorm2004.js',import.meta.url),'utf8'),corrected12=readFileSync(new URL('../node_modules/scorm-again/dist/esm/scorm12.js',import.meta.url),'utf8');
  const current2004=unreviewedSCORMSource(corrected2004),current12=unreviewedSCORMSource(corrected12);
  const beginning='    // Pear: plain characterstring limits count Unicode scalar values, not UTF-16 units.',ending='scalarString ? "u" : "");';
  const previous=(s:string)=>{const start=s.indexOf(beginning),end=s.indexOf(ending,start)+ending.length;assert.ok(start>=0&&end>start);return s.slice(0,start)+'    const formatRegex = new RegExp(regexPattern);'+s.slice(end);};
  const installer=readFileSync(new URL('../scripts/patch-scorm-logging.mjs',import.meta.url),'utf8');
  const updates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const localizedUpdates = ')+'const localizedUpdates = '.length,installer.indexOf(';',installer.indexOf('const localizedUpdates = '))));
  assert.equal(updates.length,5);
  const responseUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const responseUpdates = ')+'const responseUpdates = '.length,installer.indexOf(';\n\nconst responseDelimiterUpdates',installer.indexOf('const responseUpdates = '))));
  const delimiterUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const responseDelimiterUpdates = ')+'const responseDelimiterUpdates = '.length,installer.indexOf(';\n\nconst separators',installer.indexOf('const responseDelimiterUpdates = '))));
  const separatorUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const separatorUpdates = ')+'const separatorUpdates = '.length,installer.indexOf(';\n\nconst identifiers',installer.indexOf('const separatorUpdates = '))));
  const identifierUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const identifierUpdates = ')+'const identifierUpdates = '.length,installer.indexOf(';\n\nconst timestamps',installer.indexOf('const identifierUpdates = '))));
  const timestampUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const timestampUpdates = ')+'const timestampUpdates = '.length,installer.indexOf(';\n\nconst initialized',installer.indexOf('const timestampUpdates = '))));
  const initializationUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const initializationUpdates = ')+'const initializationUpdates = '.length,installer.indexOf(';\n\nif',installer.indexOf('const initializationUpdates = '))));
  let timestamps2004=current2004;
  for(const [before,after] of initializationUpdates.toReversed()){assert.equal(timestamps2004.split(after).length,2);timestamps2004=timestamps2004.replace(after,()=>before);}
  assert.equal(hash(current2004),'17b3f713e5ddf6caf3206c77d2ea19e17fef5d4610b2d61d267f523012064871');
  let identifiers2004=timestamps2004;
  for(const [before,after] of timestampUpdates.toReversed()){assert.equal(identifiers2004.split(after).length,2);identifiers2004=identifiers2004.replace(after,()=>before);}
  assert.equal(hash(timestamps2004),'bc9b1872658bcc18d5bd9fcb20f035e2d0d9657f9ea174f847905256af141938');
  let separators2004=identifiers2004;
  for(const [before,after] of identifierUpdates.toReversed()){assert.equal(separators2004.split(after).length,2);separators2004=separators2004.replace(after,()=>before);}
  assert.equal(hash(separators2004),'92eae7d9b66fc91c85c68e3ad53b3a4b1f9011b89e69698f0619c3187c69ff8c');
  assert.equal(hash(identifiers2004),'8b30d65901cf1aee04991a23f8c55fc61050556e9d1bf448ea0da34a92fbaff9');
  let responses2004=separators2004;
  for(const [before,after] of separatorUpdates.toReversed()){assert.equal(responses2004.split(after).length,2);responses2004=responses2004.replace(after,()=>before);}
  assert.equal(hash(responses2004),'5312ce9cf54a83580a5e839c03cf6338a3b1d30d18fb0ab81f955b2ec603cb6b');
  let previousResponses2004=responses2004;
  for(const [before,after] of delimiterUpdates.toReversed()){assert.equal(previousResponses2004.split(after).length,2);previousResponses2004=previousResponses2004.replace(after,before);}
  assert.equal(hash(previousResponses2004),'8080f3641f2d758d3589ef6c7796a8703c4aae99d14a7069546070e7e2f942ad');
  let collections2004=previousResponses2004;
  for(const [before,after] of responseUpdates.toReversed()){assert.equal(collections2004.split(after).length,2);collections2004=collections2004.replace(after,before);}
  assert.equal(hash(collections2004),'0294d815f75b820fdb34e8dde0a84297e49f42bba45a10f826ff298423f92d6d');
  const collectionUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const collectionUpdates = ')+'const collectionUpdates = '.length,installer.indexOf(';\n\nconst responses',installer.indexOf('const collectionUpdates = '))));
  assert.equal(collectionUpdates.length,8);let localized2004=collections2004;
  for(const [before,after] of collectionUpdates.toReversed()){assert.equal(localized2004.split(after).length,2);localized2004=localized2004.replace(after,before);}
  assert.equal(hash(localized2004),'445f18f920d5424b335c666594e532fb9a3238b84cc76f522d5185e41aabbd08');let unicode2004=localized2004;
  for(const [before,after] of updates.toReversed()){assert.equal(unicode2004.split(after).length,2);unicode2004=unicode2004.replace(after,before);}
  assert.equal(hash(unicode2004),'8c6468541bf6f07353307758f5a828e7e9e04da0619c859500c9b108015db5da');
  const old2004=previous(unicode2004),old12=previous(current12);assert.equal(hash(old2004),'de7a085e997136ad200f52a2221c2fec17e457c0d6a869735f613219b2dae10e');assert.equal(hash(old12),'52ffa12e5167e3a37b2f64eefa61cd599ea90c30cf4d164b667baddf83d497a6');
  const actualScript=readFileSync(new URL('../scripts/patch-scorm-logging.mjs',import.meta.url),'utf8'),pairs:[string,string][]=[];
  // Reconstruct pinned historical inputs, then prove their exact known hashes.
  // Execute only the trusted replacement declarations with a capture callback.
  runInNewContext(actualScript.slice(actualScript.indexOf('if (![selection, limits, patched, localized, collections, responsesPrevious, responses, separators]'),actualScript.indexOf('if (![patched, localized, collections, responsesPrevious, responses, separators].includes(digest(output))) throw')), {source:'',digest:()=>'',selection:'selection',limits:'limits',patched:'patched',localized:'localized',collections:'collections',responsesPrevious:'responsesPrevious',responses:'responses',separators:'separators',replaceOnce:(a:string,b:string)=>pairs.push([a,b])});
  assert.equal(pairs.length,11);
  let loggingOnly=unicode2004;
  for(const [before,after] of pairs.toReversed()){assert.equal(loggingOnly.split(after).length,2);loggingOnly=loggingOnly.replace(after,before);}
  assert.equal(hash(loggingOnly),'6a8cc4f52e6c2acbe79e5403d2f0a21602ffcb9fe54ab07e202ca2f223369936');
  let pristine=loggingOnly;
  for(const statement of ['console.debug(`Activity delivered: ${activity.id} - ${activity.title}`);','console.debug("Sequencing state restored successfully");','console.error(`Failed to restore sequencing state: ${error}`);']) pristine=pristine.replace('/* Pear: omit direct upstream sequencing logs. */',statement);
  assert.equal(hash(pristine),'93e463ed4ba87bd59a2fe228c94c879faf4aa7469a687166ffab8fac4a4d1f69');
  let selected=loggingOnly;for(const [before,after] of pairs.slice(0,4))selected=selected.replace(before,after);
  assert.equal(hash(selected),'206daee49525dbf352bf9d6920f6d1ccc03ad9e8834db57a8d7d5ee2efb93cc0');
  try {
    const directory=join(root,'node_modules/scorm-again'),entries=join(directory,'dist/esm');mkdirSync(entries,{recursive:true});mkdirSync(join(root,'scripts'));
    const script=join(root,'scripts/patch-scorm-logging.mjs');writeFileSync(script,readFileSync(new URL('../scripts/patch-scorm-logging.mjs',import.meta.url)));const metadata=join(directory,'package.json');writeFileSync(metadata,JSON.stringify({version:'3.4.5'}));writeFileSync(join(root,'scripts/scorm-review-corrections.mjs'),readFileSync(new URL('../scripts/scorm-review-corrections.mjs',import.meta.url)));
    for(const input of [...new Set([pristine,loggingOnly,selected,old2004,unicode2004,localized2004,collections2004,previousResponses2004,responses2004,separators2004,identifiers2004,timestamps2004,current2004].flatMap(value=>[value,reviewedSCORMSource(value)]))]){
      writeFileSync(join(entries,'scorm2004.js'),input);writeFileSync(join(entries,'scorm12.js'),old12);
      const result=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(entries,'scorm2004.js'),'utf8'),corrected2004);assert.equal(readFileSync(join(entries,'scorm12.js'),'utf8'),corrected12);
    }
    for(let n=0;n<2;n++){const result=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(entries,'scorm2004.js'),'utf8'),corrected2004);assert.equal(readFileSync(join(entries,'scorm12.js'),'utf8'),corrected12);}
    writeFileSync(join(entries,'scorm12.js'),current12+'\n// unexpected');assert.notEqual(spawnSync(process.execPath,[script]).status,0);
    writeFileSync(join(entries,'scorm12.js'),current12);writeFileSync(join(entries,'scorm2004.js'),current2004+'\n// unexpected');assert.notEqual(spawnSync(process.execPath,[script]).status,0);
    writeFileSync(join(entries,'scorm2004.js'),current2004);writeFileSync(metadata,JSON.stringify({version:'3.4.6'}));assert.notEqual(spawnSync(process.execPath,[script]).status,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
