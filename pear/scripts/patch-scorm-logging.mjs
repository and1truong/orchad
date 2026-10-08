// Checksum-locked adaptation of the pinned MIT engine: direct-log removal and
// selection/duration/Unicode corrections documented in ADR-092/094/095/096/097. Preserve copyright/license.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root = new URL('../node_modules/scorm-again/', import.meta.url), metadata = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (metadata.version !== '3.4.5') throw Error('Review the SCORM integration adaptation before changing engine version');
const path = new URL('dist/esm/scorm2004.js', root), digest = value => createHash('sha256').update(value).digest('hex');
let source = readFileSync(path, 'utf8');
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

const separators = "92eae7d9b66fc91c85c68e3ad53b3a4b1f9011b89e69698f0619c3187c69ff8c";
const separatorUpdates = [
  [
    "function stripBrackets(delim) {\n  return delim.replace(/[[\\]]/g, \"\");\n}\nfunction escapeRegex(s) {\n  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, \"\\\\$&\");\n}\nfunction splitDelimited(value, bracketed) {\n  if (!bracketed) {\n    return [value];\n  }\n  if (value.includes(bracketed)) {\n    return value.split(bracketed);\n  }\n  const bare = stripBrackets(bracketed);\n  if (!bare) {\n    return [value];\n  }\n  const splitRe = new RegExp(`(?<!\\\\\\\\)${escapeRegex(bare)}`, \"g\");\n  const unescapeRe = new RegExp(`\\\\\\\\${escapeRegex(bare)}`, \"g\");\n  return value.split(splitRe).map((part) => part.replace(unescapeRe, bare));\n}\nfunction splitFirstDelimited(value, bracketed) {\n  if (!bracketed) {\n    return [value];\n  }\n  if (value.includes(bracketed)) {\n    const idx = value.indexOf(bracketed);\n    return [value.slice(0, idx), value.slice(idx + bracketed.length)];\n  }\n  const bare = stripBrackets(bracketed);\n  if (!bare) {\n    return [value];\n  }\n  const splitRe = new RegExp(`(?<!\\\\\\\\)${escapeRegex(bare)}`);\n  const unescapeRe = new RegExp(`\\\\\\\\${escapeRegex(bare)}`, \"g\");\n  const parts = value.split(splitRe);\n  const first = (parts[0] ?? \"\").replace(unescapeRe, bare);\n  if (parts.length === 1) {\n    return [first];\n  }\n  return [first, parts.slice(1).join(bare).replace(unescapeRe, bare)];\n}\n",
    "// Pear: reserved separators require their brackets; bare punctuation is data.\nfunction splitDelimited(value, bracketed) {\n  return bracketed ? value.split(bracketed) : [value];\n}\nfunction splitFirstDelimited(value, bracketed) {\n  const index = bracketed ? value.indexOf(bracketed) : -1;\n  return index < 0 ? [value] : [value.slice(0, index), value.slice(index + bracketed.length)];\n}\n"
  ],
  [
    "  const rawNodes = responseDef.delimiter ? textual ? pattern.split(responseDef.delimiter) : splitDelimited(pattern, responseDef.delimiter) : [pattern];",
    "  const rawNodes = splitDelimited(pattern, responseDef.delimiter);"
  ],
  [
    "  const nodes = responseDef.delimiter ? textual ? pattern.split(responseDef.delimiter) : splitDelimited(pattern, responseDef.delimiter) : [pattern];",
    "  const nodes = splitDelimited(pattern, responseDef.delimiter);"
  ]
];

const identifiers = '8b30d65901cf1aee04991a23f8c55fc61050556e9d1bf448ea0da34a92fbaff9';
const identifierUpdates = [
  [
    "  CMIShortIdentifier: \"^(?=.*\\\\w)[\\\\w\\\\-\\\\(\\\\)\\\\+\\\\.\\\\:\\\\=\\\\@\\\\;\\\\$\\\\_\\\\!\\\\*\\\\'\\\\%\\\\/\\\\#]{1,250}$\",",
    "  CMIShortIdentifier: \"^(?=[\\\\s\\\\S]{1,250}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILongIdentifier: \"^(?:(?!urn:)\\\\S{1,4000}|urn:[A-Za-z0-9-]{1,31}:\\\\S{1,4000}|.{1,4000})$\",",
    "  CMILongIdentifier: \"^(?=[\\\\s\\\\S]{1,4000}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ],
  [
    "  if (!textual && !responseDef.delimiter && pattern.includes(\",\")) {\n    throw new Scorm2004ValidationError(\n      \"cmi.interactions.n.correct_responses.n.pattern\",\n      scorm2004_errors.TYPE_MISMATCH\n    );\n  }\n",
    "  // Pear: bare commas are URI data; each response type validates its own grammar.\n"
  ],
  [
    "        if (this._interactionType === \"matching\" && /\\\\[.,]/.test(pattern)) ; else {\n          validatePattern(this._interactionType, pattern, responseDef);\n        }",
    "        validatePattern(this._interactionType, pattern, responseDef);"
  ]
];

const timestamps = 'bc9b1872658bcc18d5bd9fcb20f035e2d0d9657f9ea174f847905256af141938';
const timestampUpdates = [
  [
    "  CMITime: \"^(19[7-9][0-9]|[2-9][0-9]{3})((-(0[1-9]|1[0-2]))((-(0[1-9]|[1-2][0-9]|3[0-1]))(T([0-1][0-9]|2[0-3])((:[0-5][0-9])((:[0-5][0-9])((\\\\.[0-9]{1,6})((Z|([+|-]([0-1][0-9]|2[0-3])))(:[0-5][0-9])?)?)?)?)?)?)?)?$\",",
    "  CMITime: \"^(?:19[7-9][0-9]|20(?:[0-2][0-9]|3[0-8]))(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12][0-9]|3[01])(?:T(?:[01][0-9]|2[0-3])(?::[0-5][0-9](?::[0-5][0-9](?:\\\\.[0-9]{1,2}(?:(?:Z|[+-](?:[01][0-9]|2[0-3])(?::[0-5][0-9])?))?)?)?)?)?)?)?(?![\\\\s\\\\S])\","
  ],
  [
    "function check2004ValidFormat(CMIElement, value, regexPattern, allowEmptyString) {\n  return checkValidFormat(\n    CMIElement,\n    value,\n    regexPattern,\n    scorm2004_errors.TYPE_MISMATCH,\n    Scorm2004ValidationError,\n    allowEmptyString\n  );\n}\n",
    "function check2004ValidFormat(CMIElement, value, regexPattern, allowEmptyString) {\n  const valid = checkValidFormat(\n    CMIElement,\n    value,\n    regexPattern,\n    scorm2004_errors.TYPE_MISMATCH,\n    Scorm2004ValidationError,\n    allowEmptyString\n  );\n  // Pear: lexical day bounds must also respect the Gregorian month/year.\n  if (regexPattern === scorm2004_regex.CMITime && value.length >= 10) {\n    const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10));\n    if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) {\n      throw new Scorm2004ValidationError(CMIElement, scorm2004_errors.TYPE_MISMATCH);\n    }\n  }\n  return valid;\n}\n"
  ]
];

const initialized = '17b3f713e5ddf6caf3206c77d2ea19e17fef5d4610b2d61d267f523012064871';
const initializationUpdates = [
  [
    "    this.childArray = [];\n  }\n  /**\n   * Called when the API has been reset",
    "    this.childArray = [];\n  }\n  initialize() {\n    super.initialize();\n    for (const child of this.childArray) child.initialize();\n  }\n  /**\n   * Called when the API has been reset"
  ],
  [
    "    } else if (stringMatches(CMIElement, \"cmi\\\\.comments_from_lms\\\\.\\\\d+\")) {\n      return new CMICommentsObject(true);",
    "    } else if (stringMatches(CMIElement, \"cmi\\\\.comments_from_lms\\\\.\\\\d+\")) {\n      // Pear: reject content-owned LMS records before appending to the collection.\n      if (this.context.isInitialized()) {\n        this.context.throwSCORMError(CMIElement, scorm2004_errors.READ_ONLY_ELEMENT, CMIElement);\n        return null;\n      }\n      return new CMICommentsObject(true);"
  ]
];

const atomic = 'f35f205f11e2102a9db770794233b5e7981698edc6bd887d4ce5576b9350bf14';
const atomicityUpdates = [
  [
    "    let foundFirstIndex = false;\n    const invalidErrorMessage = `The data model element passed to ${methodName} (${CMIElement}) is not a valid SCORM data model element.`;\n    const invalidErrorCode = this.getUndefinedDataModelErrorCode();\n    for (let idx = 0; idx < structure.length; idx++) {",
    "    let foundFirstIndex = false;\n    const invalidErrorMessage = `The data model element passed to ${methodName} (${CMIElement}) is not a valid SCORM data model element.`;\n    const invalidErrorCode = this.getUndefinedDataModelErrorCode();\n    const collections = [];\n    try {\n    for (let idx = 0; idx < structure.length; idx++) {"
  ],
  [
    "        const traverseResult = this.traverseToNextLevel(",
    "        const collection = refObject[attribute];\n        if (scorm2004 && collection instanceof CMIArray) collections.push([collection, collection.childArray.length]);\n        const traverseResult = this.traverseToNextLevel("
  ],
  [
    "    if (returnValue === global_constants.SCORM_FALSE) {\n      this.context.apiLog(",
    "    } finally {\n      // Pear: failed writes must not leave appended collection records behind.\n      if (returnValue !== global_constants.SCORM_TRUE) {\n        for (const [collection, length] of collections.toReversed()) collection.childArray.length = length;\n      }\n    }\n    if (returnValue === global_constants.SCORM_FALSE) {\n      this.context.apiLog("
  ]
];

const indexed = '3fec364f6ea8cf9d4e5fbb226ced0646219fd456e5ae9f1bb1df0a739d826745';
const indexUpdates = [
  [
    "    const index = parseInt(structure[idx + 1] || \"0\", 10);",
    "    const setIndexToken = structure[idx + 1] ?? \"\";\n    const index = /^[0-9]+(?![\\s\\S])/.test(setIndexToken) ? Number(setIndexToken) : NaN;"
  ],
  [
    "    const index = parseInt(structure[idx + 1] || \"\", 10);",
    "    const getIndexToken = structure[idx + 1] ?? \"\";\n    const index = /^[0-9]+(?![\\s\\S])/.test(getIndexToken) ? Number(getIndexToken) : NaN;"
  ]
];

if (digest(source) === indexed) for (const [before, after] of indexUpdates.toReversed()) {
  if (source.split(after).length !== 2) throw Error('SCORM packed-index reverse patch no longer matches');
  source = source.replace(after, () => before);
}

if (digest(source) === atomic) for (const [before, after] of atomicityUpdates.toReversed()) {
  if (source.split(after).length !== 2) throw Error('SCORM collection atomicity reverse patch no longer matches');
  source = source.replace(after, () => before);
}

if (digest(source) === initialized) for (const [before, after] of initializationUpdates.toReversed()) {
  if (source.split(after).length !== 2) throw Error('SCORM initialization reverse patch no longer matches');
  source = source.replace(after, () => before);
}

if (digest(source) === timestamps) for (const [before, after] of timestampUpdates.toReversed()) {
  if (source.split(after).length !== 2) throw Error('SCORM timestamp reverse patch no longer matches');
  source = source.replace(after, () => before);
}

// The exact known v9 output reverses to the known v8 input before upgrades.
// Never undo or accept an unknown source, even if replacement text matches.
if (digest(source) === identifiers) for (const [before, after] of identifierUpdates.toReversed()) {
  if (source.split(after).length !== 2) throw Error('SCORM identifier reverse patch no longer matches');
  source = source.replace(after, () => before);
}
if (![original, loggingOnly, selection, limits, patched, localized, collections, responsesPrevious, responses, separators].includes(digest(source))) throw Error('Unexpected pinned SCORM source; refusing an unreviewed patch');
let output = source;
if (digest(source) === original) for (const statement of ['console.debug(`Activity delivered: ${activity.id} - ${activity.title}`);', 'console.debug("Sequencing state restored successfully");', 'console.error(`Failed to restore sequencing state: ${error}`);']) {
  if (output.split(statement).length !== 2) throw Error('SCORM direct-log patch no longer matches');
  output = output.replace(statement, '/* Pear: omit direct upstream sequencing logs. */');
}
const replaceOnce = (before, after) => {if (output.split(before).length !== 2) throw Error('SCORM selection correction no longer matches'); output = output.replace(before, () => after);};
if (![selection, limits, patched, localized, collections, responsesPrevious, responses, separators].includes(digest(source))) {
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
if (![limits, patched, localized, collections, responsesPrevious, responses, separators].includes(digest(source))) {
replaceOnce("return this._attemptAbsoluteDurationLimit || \"PT0H0M0S\";", "return this._attemptAbsoluteDuration;");
replaceOnce("this._attemptAbsoluteDurationLimit = duration;", "this._attemptAbsoluteDuration = duration;");
replaceOnce("return this._activityAbsoluteDurationLimit || \"PT0H0M0S\";", "return this._activityAbsoluteDuration;");
replaceOnce("this._activityAbsoluteDurationLimit = duration;", "this._activityAbsoluteDuration = duration;");
replaceOnce("  checkLimitConditions(activity) {\n    if (activity.isSuspended)", "  checkLimitConditions(activity) {\n    if (activity._pearDurationLimitCheck) return activity._pearDurationLimitCheck(activity);\n    if (activity.isSuspended)");
replaceOnce("  checkLimitConditions(activity) {\n    let result = true;", "  checkLimitConditions(activity) {\n    if (activity._pearDurationLimitCheck) return !activity._pearDurationLimitCheck(activity);\n    let result = true;");
}
if (![patched, localized, collections, responsesPrevious, responses, separators].includes(digest(source))) replaceOnce("    const formatRegex = new RegExp(regexPattern);", "    // Pear: plain characterstring limits count Unicode scalar values, not UTF-16 units.\n    const scalarString = regexPattern.startsWith(\"^[\\\\u0000-\\\\uFFFF]\") || regexPattern.startsWith(\"^[\\\\s\\\\S]{0,\");\n    const formatRegex = new RegExp(scalarString ? regexPattern.replace(\"[\\\\u0000-\\\\uFFFF]\", \"[\\\\s\\\\S]\") : regexPattern, scalarString ? \"u\" : \"\");");
if (![patched, localized, collections, responsesPrevious, responses, separators].includes(digest(output))) throw Error('SCORM adapted source checksum mismatch');
if (![localized, collections, responsesPrevious, responses, separators].includes(digest(output))) for (const [before, after] of localizedUpdates) replaceOnce(before, after);
if (![localized, collections, responsesPrevious, responses, separators].includes(digest(output))) throw Error('SCORM localized-string checksum mismatch');
if (![collections, responsesPrevious, responses, separators].includes(digest(output))) for (const [before, after] of collectionUpdates) replaceOnce(before, after);
if (![collections, responsesPrevious, responses, separators].includes(digest(output))) throw Error('SCORM interaction-collection checksum mismatch');
if (![responsesPrevious, responses, separators].includes(digest(output))) for (const [before, after] of responseUpdates) replaceOnce(before, after);
if (![responsesPrevious, responses, separators].includes(digest(output))) throw Error('SCORM textual-response base checksum mismatch');
if (![responses, separators].includes(digest(output))) for (const [before, after] of responseDelimiterUpdates) replaceOnce(before, after);
if (![responses, separators].includes(digest(output))) throw Error('SCORM textual-response checksum mismatch');
if (digest(output) !== separators) for (const [before, after] of separatorUpdates) replaceOnce(before, after);
if (digest(output) !== separators) throw Error('SCORM reserved-separator checksum mismatch');
for (const [before, after] of identifierUpdates) replaceOnce(before, after);
if (digest(output) !== identifiers) throw Error('SCORM URI identifier checksum mismatch');
for (const [before, after] of timestampUpdates) replaceOnce(before, after);
if (digest(output) !== timestamps) throw Error('SCORM timestamp checksum mismatch');
for (const [before, after] of initializationUpdates) replaceOnce(before, after);
if (digest(output) !== initialized) throw Error('SCORM initialization checksum mismatch');
for (const [before, after] of atomicityUpdates) replaceOnce(before, after);
if (digest(output) !== atomic) throw Error('SCORM collection atomicity checksum mismatch');
for (const [before, after] of indexUpdates) replaceOnce(before, after);
if (digest(output) !== indexed) throw Error('SCORM packed-index checksum mismatch');
writeFileSync(path, output);

const path12 = new URL('dist/esm/scorm12.js', root);
let source12 = readFileSync(path12, 'utf8');
const score12 = '9e73552ee1a4f79998eb4817b62f3c72a8a920b2b1b9434f7bc2e96867d23dd0';
const score12Updates = [
  [
    "    this._max = params.max || params.max === \"\" ? params.max : \"100\";",
    "    // Pear: fresh 1.2 scores remain blank until explicitly set.\n    this._max = params.max ?? \"\";"
  ],
  [
    "   * SCORE-01: Resets _raw and _min to empty strings to match subclass behavior.\n   * _max is NOT reset here as it has a non-trivial default (\"100\") that is\n   * handled by the constructor or reinitialization logic.\n   */\n  reset() {\n    this._initialized = false;\n    this._raw = \"\";\n    this._min = \"\";\n  }",
    "   * Pear: reset every score component to its blank initial value.\n   */\n  reset() {\n    this._initialized = false;\n    this._raw = \"\";\n    this._min = \"\";\n    this._max = \"\";\n  }"
  ]
];

if (digest(source12) === score12) for (const [before, after] of score12Updates.toReversed()) {
  if (source12.split(after).length !== 2) throw Error('SCORM 1.2 score reverse patch no longer matches');
  source12 = source12.replace(after, () => before);
}
const atomic12 = 'e34cb1536920b0597008b53dc97f13abddc71bb07911a0cd4daa55f127c551be';
const atomicity12Updates = [
  [
    "    let foundFirstIndex = false;\n    const invalidErrorMessage = `The data model element passed to ${methodName} (${CMIElement}) is not a valid SCORM data model element.`;\n    const invalidErrorCode = this.getUndefinedDataModelErrorCode();\n    for (let idx = 0; idx < structure.length; idx++) {",
    "    let foundFirstIndex = false;\n    const invalidErrorMessage = `The data model element passed to ${methodName} (${CMIElement}) is not a valid SCORM data model element.`;\n    const invalidErrorCode = this.getUndefinedDataModelErrorCode();\n    const collections = [];\n    try {\n    for (let idx = 0; idx < structure.length; idx++) {"
  ],
  [
    "        const traverseResult = this.traverseToNextLevel(",
    "        const collection = refObject[attribute];\n        if (collection instanceof CMIArray) collections.push([collection, collection.childArray.length]);\n        const traverseResult = this.traverseToNextLevel("
  ],
  [
    "    if (returnValue === global_constants.SCORM_FALSE) {\n      this.context.apiLog(",
    "    } finally {\n      // Pear: failed writes must not leave appended collection records behind.\n      if (returnValue !== global_constants.SCORM_TRUE) {\n        for (const [collection, length] of collections.toReversed()) collection.childArray.length = length;\n      }\n    }\n    if (returnValue === global_constants.SCORM_FALSE) {\n      this.context.apiLog("
  ]
];

if (digest(source12) === atomic12) for (const [before, after] of atomicity12Updates.toReversed()) {
  if (source12.split(after).length !== 2) throw Error('SCORM 1.2 atomicity reverse patch no longer matches');
  source12 = source12.replace(after, () => before);
}
const indexed12 = '4d205a6b1c73d9af2b1f09b4f9a12b713cea07468b50bc3947f3c86370ce3e99';
if (digest(source12) === indexed12) for (const [before, after] of indexUpdates.toReversed()) {
  if (source12.split(after).length !== 2) throw Error('SCORM 1.2 packed-index reverse patch no longer matches');
  source12 = source12.replace(after, () => before);
}
const original12 = '52ffa12e5167e3a37b2f64eefa61cd599ea90c30cf4d164b667baddf83d497a6', patched12 = '2f8591ab1f08bd696ff11dc72b1e92c197d12512978ef870a39507ed9567e366';
if (![original12, patched12].includes(digest(source12))) throw Error('Unexpected pinned SCORM 1.2 source');
if (digest(source12) !== patched12) {
  const before = "    const formatRegex = new RegExp(regexPattern);", after = "    // Pear: plain characterstring limits count Unicode scalar values, not UTF-16 units.\n    const scalarString = regexPattern.startsWith(\"^[\\\\u0000-\\\\uFFFF]\") || regexPattern.startsWith(\"^[\\\\s\\\\S]{0,\");\n    const formatRegex = new RegExp(scalarString ? regexPattern.replace(\"[\\\\u0000-\\\\uFFFF]\", \"[\\\\s\\\\S]\") : regexPattern, scalarString ? \"u\" : \"\");";
  if (source12.split(before).length !== 2) throw Error('SCORM 1.2 Unicode patch no longer matches');
  const output12 = source12.replace(before, after);
  if (digest(output12) !== patched12) throw Error('SCORM 1.2 Unicode checksum mismatch');
  writeFileSync(path12, output12);
}

let output12 = digest(source12) === patched12 ? source12 : readFileSync(path12, 'utf8');
for (const [before, after] of indexUpdates) {
  if (output12.split(before).length !== 2) throw Error('SCORM 1.2 packed-index correction no longer matches');
  output12 = output12.replace(before, () => after);
}
if (digest(output12) !== indexed12) throw Error('SCORM 1.2 packed-index checksum mismatch');
for (const [before, after] of atomicity12Updates) {
  if (output12.split(before).length !== 2) throw Error('SCORM 1.2 atomicity correction no longer matches');
  output12 = output12.replace(before, () => after);
}
if (digest(output12) !== atomic12) throw Error('SCORM 1.2 atomicity checksum mismatch');
for (const [before, after] of score12Updates) {
  if (output12.split(before).length !== 2) throw Error('SCORM 1.2 score-default correction no longer matches');
  output12 = output12.replace(before, () => after);
}
if (digest(output12) !== score12) throw Error('SCORM 1.2 score-default checksum mismatch');
writeFileSync(path12, output12);
