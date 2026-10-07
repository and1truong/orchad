// Narrow, checksum-locked logging-only adaptation of the pinned MIT engine.
// Keep engine state/SCORM behavior and its copyright/license notice unchanged.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root = new URL('../node_modules/scorm-again/', import.meta.url), metadata = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (metadata.version !== '3.4.5') throw Error('Review the SCORM logging adaptation before changing engine version');
const path = new URL('dist/esm/scorm2004.js', root), source = readFileSync(path, 'utf8'), digest = value => createHash('sha256').update(value).digest('hex');
const original = '93e463ed4ba87bd59a2fe228c94c879faf4aa7469a687166ffab8fac4a4d1f69', patched = '6a8cc4f52e6c2acbe79e5403d2f0a21602ffcb9fe54ab07e202ca2f223369936';
if (digest(source) === patched) process.exit(0);
if (digest(source) !== original) throw Error('Unexpected pinned SCORM source; refusing an unreviewed patch');
let output = source;
for (const statement of ['console.debug(`Activity delivered: ${activity.id} - ${activity.title}`);', 'console.debug("Sequencing state restored successfully");', 'console.error(`Failed to restore sequencing state: ${error}`);']) {
  if (output.split(statement).length !== 2) throw Error('SCORM direct-log patch no longer matches');
  output = output.replace(statement, '/* Pear: omit direct upstream sequencing logs. */');
}
if (digest(output) !== patched) throw Error('SCORM adapted source checksum mismatch');
writeFileSync(path, output);
