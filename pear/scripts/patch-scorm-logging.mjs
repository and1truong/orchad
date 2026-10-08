// Checksum-locked adaptation of the pinned MIT engine: direct-log removal and
// selection/duration/Unicode corrections documented in ADR-092/094/095/096/097. Preserve copyright/license.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root = new URL('../node_modules/scorm-again/', import.meta.url), metadata = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (metadata.version !== '3.4.5') throw Error('Review the SCORM integration adaptation before changing engine version');
const path = new URL('dist/esm/scorm2004.js', root), source = readFileSync(path, 'utf8'), digest = value => createHash('sha256').update(value).digest('hex');
const original = '93e463ed4ba87bd59a2fe228c94c879faf4aa7469a687166ffab8fac4a4d1f69', loggingOnly = '6a8cc4f52e6c2acbe79e5403d2f0a21602ffcb9fe54ab07e202ca2f223369936', selection = '206daee49525dbf352bf9d6920f6d1ccc03ad9e8834db57a8d7d5ee2efb93cc0', limits = 'de7a085e997136ad200f52a2221c2fec17e457c0d6a869735f613219b2dae10e', patched = '8c6468541bf6f07353307758f5a828e7e9e04da0619c859500c9b108015db5da';

const localized = '445f18f920d5424b335c666594e532fb9a3238b84cc76f522d5185e41aabbd08';
const localizedUpdates = [
  [
    "  CMILangString250: \"^({lang=([a-zA-Z]{1,8}|i|x)(-[a-zA-Z0-9-]{2,8})?})?((?!{.*$).{0,250}$)?$\",",
    "  CMILangString250: \"^((?=\\\\{lang=[^}]{1,250}\\\\})(\\\\{lang=([a-zA-Z]{1,8})((?:-[a-zA-Z0-9]{1,8})*)\\\\}))?(?!\\\\{lang=)(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){0,250}(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILangString: \"^({lang=([a-zA-Z]{1,8}|i|x)(-[a-zA-Z0-9-]{2,8})?})?((?!{.*$).*$)?$\",",
    "  CMILangString: \"^((?=\\\\{lang=[^}]{1,250}\\\\})(\\\\{lang=([a-zA-Z]{1,8})((?:-[a-zA-Z0-9]{1,8})*)\\\\}))?(?!\\\\{lang=)(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF])*(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILangString250cr: \"^(({lang=([a-zA-Z]{1,8}|i|x)?(-[a-zA-Z0-9-]{2,8})?})?(.{0,250})?)?$\",",
    "  CMILangString250cr: \"^((?=\\\\{lang=[^}]{1,250}\\\\})(\\\\{lang=([a-zA-Z]{1,8})((?:-[a-zA-Z0-9]{1,8})*)\\\\}))?(?!\\\\{lang=)(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){0,250}(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILangString4000: \"^({lang=([a-zA-Z]{1,8}|i|x)(-[a-zA-Z0-9-]{2,8})?})?((?!{.*$).{0,4000}$)?$\",",
    "  CMILangString4000: \"^((?=\\\\{lang=[^}]{1,250}\\\\})(\\\\{lang=([a-zA-Z]{1,8})((?:-[a-zA-Z0-9]{1,8})*)\\\\}))?(?!\\\\{lang=)(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){0,4000}(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILangcr: \"^(({lang=([a-zA-Z]{1,8}|i|x)?(-[a-zA-Z0-9-]{2,8})?}))(.*?)$\",",
    "  CMILangcr: \"^((?=\\\\{lang=[^}]{1,250}\\\\})(\\\\{lang=([a-zA-Z]{1,8})((?:-[a-zA-Z0-9]{1,8})*)\\\\}))((?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF])*)(?![\\\\s\\\\S])\","
  ]
];

const collections = '0294d815f75b820fdb34e8dde0a84297e49f42bba45a10f826ff298423f92d6d';
const collectionUpdates = [
  [
    "  CMIString250: \"^[\\\\u0000-\\\\uFFFF]{0,250}$\",",
    "  CMIString250: \"^(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){0,250}(?![\\\\s\\\\S])\","
  ],
  [
    "  CMIString1000: \"^[\\\\u0000-\\\\uFFFF]{0,1000}$\",",
    "  CMIString1000: \"^(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){0,1000}(?![\\\\s\\\\S])\","
  ],
  [
    "  CMIString4000: \"^[\\\\u0000-\\\\uFFFF]{0,4000}$\",",
    "  CMIString4000: \"^(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){0,4000}(?![\\\\s\\\\S])\","
  ],
  [
    "  CMIString64000: \"^[\\\\u0000-\\\\uFFFF]{0,64000}$\",",
    "  CMIString64000: \"^(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){0,64000}(?![\\\\s\\\\S])\","
  ],
  [
    "const PERFORMANCE_CHARACTERSTRING = \"(?![\\\\s\\\\S]*(?:\\\\[,\\\\]|\\\\[\\\\.\\\\]|\\\\[:\\\\]))[\\\\s\\\\S]{1,250}\";",
    "const PERFORMANCE_CHARACTERSTRING = \"(?![\\\\s\\\\S]*(?:\\\\[,\\\\]|\\\\[\\\\.\\\\]|\\\\[:\\\\]))(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF]){1,250}\";"
  ],
  [
    "    } else {\n      let nodes = [];\n      const response_type = LearnerResponses[this.type];",
    "    } else {\n      // Pear: zero records is a valid learner collection, after ID/type dependencies.\n      if (learner_response === \"\" && [\"choice\", \"matching\", \"sequencing\", \"performance\"].includes(this.type)) {\n        this._learner_response = \"\";\n        return;\n      }\n      let nodes = [];\n      const response_type = LearnerResponses[this.type];"
  ],
  [
    "    if (this._interactionType === \"fill-in\" && pattern === \"\") {",
    "    if ([\"fill-in\", \"choice\"].includes(this._interactionType) && pattern === \"\") {"
  ],
  [
    "      if (Object.prototype.hasOwnProperty.call(json, key) && json[key]) {",
    "      // Pear: a stored empty correct-response pattern is a record, not absent data.\n      if (Object.prototype.hasOwnProperty.call(json, key) && (json[key] || json[key] === \"\" && /^cmi\\.interactions\\.\\d+\\.correct_responses\\.\\d+\\.pattern$/.test((CMIElement ? CMIElement + \".\" : \"\") + key))) {"
  ]
];

const responsesPrevious = "8080f3641f2d758d3589ef6c7796a8703c4aae99d14a7069546070e7e2f942ad", responses = "5312ce9cf54a83580a5e839c03cf6338a3b1d30d18fb0ab81f955b2ec603cb6b";
const responseUpdates = [
  [
    "  CMIFeedback: \"^.*$\",",
    "  CMIFeedback: \"^(?:[\\\\u0000-\\\\uD7FF\\\\uE000-\\\\uFFFF]|[\\\\uD800-\\\\uDBFF][\\\\uDC00-\\\\uDFFF])*(?![\\\\s\\\\S])\","
  ],
  [
    "const RESPONSE_PREFIX_RE = /^\\{(?:lang|case_matters|order_matters)=[^}]+\\}/;\nfunction stripResponsePrefixes(node) {\n  let result = node;\n  while (RESPONSE_PREFIX_RE.test(result)) {\n    result = result.replace(RESPONSE_PREFIX_RE, \"\");\n  }\n  return result;\n}\n",
    "// Pear: interaction-wide boolean properties precede localized text/records.\n// Language remains on each localized string so its grammar and SPM are checked.\nfunction stripResponsePrefixes(node, type) {\n  const allowed = type === \"fill-in\" ? [\"case_matters\", \"order_matters\"] : type === \"long-fill-in\" ? [\"case_matters\"] : type === \"performance\" ? [\"order_matters\"] : [];\n  const seen = new Set();\n  let result = node, match;\n  while ((match = /^\\{(case_matters|order_matters)=([^}]*)\\}/.exec(result)) && allowed.includes(match[1])) {\n    if (seen.has(match[1]) || ![\"true\", \"false\"].includes(match[2])) {\n      throw new Scorm2004ValidationError(\"cmi.interactions.n.correct_responses.n.pattern\", scorm2004_errors.TYPE_MISMATCH);\n    }\n    seen.add(match[1]); result = result.slice(match[0].length);\n  }\n  return result;\n}\n"
  ],
  [
    "function validatePattern(type, pattern, responseDef) {\n  if (pattern.trim() !== pattern) {",
    "function validatePattern(type, pattern, responseDef) {\n  const textual = [\"fill-in\", \"long-fill-in\", \"performance\", \"other\"].includes(type);\n  pattern = stripResponsePrefixes(pattern, type);\n  if (!textual && pattern.trim() !== pattern) {"
  ],
  [
    "    if (raw.trim() !== raw) {",
    "    if (!textual && raw.trim() !== raw) {"
  ],
  [
    "  if (!responseDef.delimiter && pattern.includes(\",\")) {",
    "  if (!textual && !responseDef.delimiter && pattern.includes(\",\")) {"
  ],
  [
    "        const record = stripResponsePrefixes(node);",
    "        const record = node;"
  ],
  [
    "  checkValidResponseType(CMIElement, response_type, value, interaction_type) {\n    let nodes = [];",
    "  checkValidResponseType(CMIElement, response_type, value, interaction_type) {\n    // Pear: reuse the typed setter validator for textual patterns, including prefixes.\n    if ([\"fill-in\", \"long-fill-in\", \"performance\", \"other\"].includes(interaction_type)) {\n      try { validatePattern(interaction_type, String(value), response_type); }\n      catch (error) { this.context.throwSCORMError(CMIElement, error.errorCode || scorm2004_errors.TYPE_MISMATCH, CMIElement); }\n      return;\n    }\n    let nodes = [];"
  ],
  [
    "  if (type !== \"numeric\" && (responseDef.unique || responseDef.duplicate === false)) {",
    "  if (responseDef.unique) {"
  ]
];

const responseDelimiterUpdates = [
  [
    "  const rawNodes = responseDef.delimiter ? splitDelimited(pattern, responseDef.delimiter) : [pattern];",
    "  const rawNodes = responseDef.delimiter ? textual ? pattern.split(responseDef.delimiter) : splitDelimited(pattern, responseDef.delimiter) : [pattern];"
  ],
  [
    "  const nodes = responseDef.delimiter ? splitDelimited(pattern, responseDef.delimiter) : [pattern];",
    "  const nodes = responseDef.delimiter ? textual ? pattern.split(responseDef.delimiter) : splitDelimited(pattern, responseDef.delimiter) : [pattern];"
  ]
];

if (![original, loggingOnly, selection, limits, patched, localized, collections, responsesPrevious, responses].includes(digest(source))) throw Error('Unexpected pinned SCORM source; refusing an unreviewed patch');
let output = source;
if (digest(source) === original) for (const statement of ['console.debug(`Activity delivered: ${activity.id} - ${activity.title}`);', 'console.debug("Sequencing state restored successfully");', 'console.error(`Failed to restore sequencing state: ${error}`);']) {
  if (output.split(statement).length !== 2) throw Error('SCORM direct-log patch no longer matches');
  output = output.replace(statement, '/* Pear: omit direct upstream sequencing logs. */');
}
const replaceOnce = (before, after) => {if (output.split(before).length !== 2) throw Error('SCORM selection correction no longer matches'); output = output.replace(before, after);};
if (![selection, limits, patched, localized, collections, responsesPrevious, responses].includes(digest(source))) {
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
}
if (![limits, patched, localized, collections, responsesPrevious, responses].includes(digest(source))) {
replaceOnce("return this._attemptAbsoluteDurationLimit || \"PT0H0M0S\";", "return this._attemptAbsoluteDuration;");
replaceOnce("this._attemptAbsoluteDurationLimit = duration;", "this._attemptAbsoluteDuration = duration;");
replaceOnce("return this._activityAbsoluteDurationLimit || \"PT0H0M0S\";", "return this._activityAbsoluteDuration;");
replaceOnce("this._activityAbsoluteDurationLimit = duration;", "this._activityAbsoluteDuration = duration;");
replaceOnce("  checkLimitConditions(activity) {\n    if (activity.isSuspended)", "  checkLimitConditions(activity) {\n    if (activity._pearDurationLimitCheck) return activity._pearDurationLimitCheck(activity);\n    if (activity.isSuspended)");
replaceOnce("  checkLimitConditions(activity) {\n    let result = true;", "  checkLimitConditions(activity) {\n    if (activity._pearDurationLimitCheck) return !activity._pearDurationLimitCheck(activity);\n    let result = true;");
}
if (![patched, localized, collections, responsesPrevious, responses].includes(digest(source))) replaceOnce("    const formatRegex = new RegExp(regexPattern);", "    // Pear: plain characterstring limits count Unicode scalar values, not UTF-16 units.\n    const scalarString = regexPattern.startsWith(\"^[\\\\u0000-\\\\uFFFF]\") || regexPattern.startsWith(\"^[\\\\s\\\\S]{0,\");\n    const formatRegex = new RegExp(scalarString ? regexPattern.replace(\"[\\\\u0000-\\\\uFFFF]\", \"[\\\\s\\\\S]\") : regexPattern, scalarString ? \"u\" : \"\");");
if (![patched, localized, collections, responsesPrevious, responses].includes(digest(output))) throw Error('SCORM adapted source checksum mismatch');
if (![localized, collections, responsesPrevious, responses].includes(digest(output))) for (const [before, after] of localizedUpdates) replaceOnce(before, after);
if (![localized, collections, responsesPrevious, responses].includes(digest(output))) throw Error('SCORM localized-string checksum mismatch');
if (![collections, responsesPrevious, responses].includes(digest(output))) for (const [before, after] of collectionUpdates) replaceOnce(before, after);
if (![collections, responsesPrevious, responses].includes(digest(output))) throw Error('SCORM interaction-collection checksum mismatch');
if (![responsesPrevious, responses].includes(digest(output))) for (const [before, after] of responseUpdates) replaceOnce(before, after);
if (![responsesPrevious, responses].includes(digest(output))) throw Error('SCORM textual-response base checksum mismatch');
if (digest(output) !== responses) for (const [before, after] of responseDelimiterUpdates) replaceOnce(before, after);
if (digest(output) !== responses) throw Error('SCORM textual-response checksum mismatch');
writeFileSync(path, output);

const path12 = new URL('dist/esm/scorm12.js', root), source12 = readFileSync(path12, 'utf8');
const original12 = '52ffa12e5167e3a37b2f64eefa61cd599ea90c30cf4d164b667baddf83d497a6', patched12 = '2f8591ab1f08bd696ff11dc72b1e92c197d12512978ef870a39507ed9567e366';
if (![original12, patched12].includes(digest(source12))) throw Error('Unexpected pinned SCORM 1.2 source');
if (digest(source12) !== patched12) {
  const before = "    const formatRegex = new RegExp(regexPattern);", after = "    // Pear: plain characterstring limits count Unicode scalar values, not UTF-16 units.\n    const scalarString = regexPattern.startsWith(\"^[\\\\u0000-\\\\uFFFF]\") || regexPattern.startsWith(\"^[\\\\s\\\\S]{0,\");\n    const formatRegex = new RegExp(scalarString ? regexPattern.replace(\"[\\\\u0000-\\\\uFFFF]\", \"[\\\\s\\\\S]\") : regexPattern, scalarString ? \"u\" : \"\");";
  if (source12.split(before).length !== 2) throw Error('SCORM 1.2 Unicode patch no longer matches');
  const output12 = source12.replace(before, after);
  if (digest(output12) !== patched12) throw Error('SCORM 1.2 Unicode checksum mismatch');
  writeFileSync(path12, output12);
}
