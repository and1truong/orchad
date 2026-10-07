// Checksum-locked adaptation of the pinned MIT engine: direct-log removal and
// selection corrections documented in ADR-092. Preserve copyright/license.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root = new URL('../node_modules/scorm-again/', import.meta.url), metadata = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (metadata.version !== '3.4.5') throw Error('Review the SCORM integration adaptation before changing engine version');
const path = new URL('dist/esm/scorm2004.js', root), source = readFileSync(path, 'utf8'), digest = value => createHash('sha256').update(value).digest('hex');
const original = '93e463ed4ba87bd59a2fe228c94c879faf4aa7469a687166ffab8fac4a4d1f69', loggingOnly = '6a8cc4f52e6c2acbe79e5403d2f0a21602ffcb9fe54ab07e202ca2f223369936', patched = '206daee49525dbf352bf9d6920f6d1ccc03ad9e8834db57a8d7d5ee2efb93cc0';
if (digest(source) === patched) process.exit(0);
if (![original, loggingOnly].includes(digest(source))) throw Error('Unexpected pinned SCORM source; refusing an unreviewed patch');
let output = source;
if (digest(source) === original) for (const statement of ['console.debug(`Activity delivered: ${activity.id} - ${activity.title}`);', 'console.debug("Sequencing state restored successfully");', 'console.error(`Failed to restore sequencing state: ${error}`);']) {
  if (output.split(statement).length !== 2) throw Error('SCORM direct-log patch no longer matches');
  output = output.replace(statement, '/* Pear: omit direct upstream sequencing logs. */');
}
const replaceOnce = (before, after) => {if (output.split(before).length !== 2) throw Error('SCORM selection correction no longer matches'); output = output.replace(before, after);};
replaceOnce('if (selectCount === null || selectCount > 0) {', 'if (selectCount === null || selectCount >= 0) {');
replaceOnce(`    const children = [...activity.children];
    if (controls.selectionTiming === SelectionTiming.NEVER) {`, `    const children = [...activity.children];
    // Pear selection-v2: start each new selection from the complete original pool.
    // Called onEachNewAttempt only when the host engine starts a fresh attempt.
    if (controls.selectionTiming === SelectionTiming.ON_EACH_NEW_ATTEMPT) {
      for (const child of children) {
        child.isAvailable = true;
        child.isHiddenFromChoice = false;
      }
    }
    if (controls.selectionTiming === SelectionTiming.NEVER) {`);
replaceOnce(`  ensureSelectionAndRandomization(activity) {
    if (activity.getAvailableChildren() === activity.children && (SelectionRandomization.isSelectionNeeded(activity) || SelectionRandomization.isRandomizationNeeded(activity))) {
      SelectionRandomization.applySelectionAndRandomization(activity, activity.isNewAttempt);
    }
  }`, `  ensureSelectionAndRandomization(activity) {
    const controls = activity.sequencingControls;
    const newAttempt = !activity.isActive && !activity.isSuspended && (controls.selectionTiming === "onEachNewAttempt" || controls.randomizationTiming === "onEachNewAttempt");
    if (newAttempt && activity._pearSelectionPreparedForAttempt === activity.attemptCount + 1) return;
    if (newAttempt || activity.getAvailableChildren() === activity.children && (SelectionRandomization.isSelectionNeeded(activity) || SelectionRandomization.isRandomizationNeeded(activity))) {
      SelectionRandomization.applySelectionAndRandomization(activity, activity.isNewAttempt || newAttempt);
      if (newAttempt) activity._pearSelectionPreparedForAttempt = activity.attemptCount + 1;
    }
  }`);
replaceOnce(`  static applySelectionAndRandomization(activity, isNewAttempt = false) {
    const controls = activity.sequencingControls;`, `  static applySelectionAndRandomization(activity, isNewAttempt = false) {
    // Pear selection-v2: traversal already prepared this exact parent attempt.
    if (isNewAttempt && activity._pearSelectionPreparedForAttempt === activity.attemptCount) {
      delete activity._pearSelectionPreparedForAttempt;
      activity.setProcessedChildren(activity.children.filter((child) => child.isAvailable));
      return activity.getAvailableChildren();
    }
    const controls = activity.sequencingControls;`);
if (digest(output) !== patched) throw Error('SCORM adapted source checksum mismatch');
writeFileSync(path, output);
