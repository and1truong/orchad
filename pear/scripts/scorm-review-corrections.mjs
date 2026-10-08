// Exact reviewed successors of published engine sources; unknown bytes remain
// subject to the installer's original version/source locks. Keep MIT headers.
import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const pins = {
  "17b3f713e5ddf6caf3206c77d2ea19e17fef5d4610b2d61d267f523012064871": "03213a703fe000cdf1ed1bb531f4f67dca0b68fb6f5d57f587ebd2c8ac2c1be3",
  "f35f205f11e2102a9db770794233b5e7981698edc6bd887d4ce5576b9350bf14": "fae6c4ca9514341b623479f41154175df0e27d68c4384cdda363916f7daef61f",
  "3fec364f6ea8cf9d4e5fbb226ced0646219fd456e5ae9f1bb1df0a739d826745": "0fcfd491141495491caeb8dcc334d68a1dd407fb0c6f15c0747438a7902c1fa9",
  "e34cb1536920b0597008b53dc97f13abddc71bb07911a0cd4daa55f127c551be": "92c02b812c6e7e3e8a0cd161d23e1aeb3319f4c124523e6df6d7ccff65e73d82",
  "9e73552ee1a4f79998eb4817b62f3c72a8a920b2b1b9434f7bc2e96867d23dd0": "220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32"
};
const corrections = [
  [
    "      if (this.context.isInitialized()) {\n        this.context.throwSCORMError(CMIElement, scorm2004_errors.READ_ONLY_ELEMENT, CMIElement);\n        return null;\n      }\n      return new CMICommentsObject(true);",
    "      if (this.context.isInitialized()) {\n        const knownLeaf = /^cmi\\.comments_from_lms\\.\\d+\\.(?:comment|location|timestamp)(?![\\s\\S])/.test(CMIElement);\n        this.context.throwSCORMError(CMIElement, knownLeaf ? scorm2004_errors.READ_ONLY_ELEMENT : scorm2004_errors.UNDEFINED_DATA_MODEL, CMIElement);\n        return null;\n      }\n      return new CMICommentsObject(true);"
  ],
  [
    "        for (const [collection, length] of collections.toReversed()) collection.childArray.length = length;",
    "        for (let i = collections.length - 1; i >= 0; i--) {\n          const [collection, length] = collections[i];\n          collection.childArray.length = length;\n        }"
  ]
];
function replace(source, pairs) {
  for (const [before, after] of pairs) if (source.includes(before)) {
    if (source.split(before).length !== 2) throw Error('SCORM review correction no longer matches');
    source = source.replace(before, () => after);
  }
  return source;
}
const navigationOriginal = "0fcfd491141495491caeb8dcc334d68a1dd407fb0c6f15c0747438a7902c1fa9";
const navigationPatched = "a8d9018516119e5180c5cccd9931bb8b56335f3c282c0367cfe116e73d420007";
const navigationUpdates = [
  [
    "    const adlNavRequestRegex = \"^adl\\\\.nav\\\\.request_valid\\\\.(choice|jump)\\\\.{target=([a-zA-Z0-9-_]+)}$\";",
    "    const adlNavRequestRegex = \"^adl\\\\.nav\\\\.request_valid\\\\.(choice|jump)\\\\.\\\\{target=([^{}]+)\\\\}(?![\\\\s\\\\S])\";"
  ],
  [
    "    if (CMIElement === \"cmi.completion_status\") {\n      return this._cmiHandler.evaluateCompletionStatus();",
    "    if (/^adl\\.nav\\.request_valid\\.(?:choice|jump)(?:\\.|$)/.test(CMIElement)) {\n      this.throwSCORMError(CMIElement, scorm2004_errors.GENERAL_GET_FAILURE);\n      return global_constants.SCORM_FALSE;\n    }\n    if (CMIElement === \"cmi.completion_status\") {\n      return this._cmiHandler.evaluateCompletionStatus();"
  ],
  [
    "  lmsSetValue(CMIElement, value) {\n    const oldValue = this._peekCMIValue(CMIElement);",
    "  lmsSetValue(CMIElement, value) {\n    if (/^adl\\.nav\\.request_valid\\.(?:choice|jump)(?:\\.|$)/.test(CMIElement)) {\n      this.throwSCORMError(CMIElement, scorm2004_errors.READ_ONLY_ELEMENT);\n      return global_constants.SCORM_FALSE;\n    }\n    const oldValue = this._peekCMIValue(CMIElement);"
  ],
  [
    "    if (stringMatches(CMIElement, adlNavRequestRegex)) {\n      const matches = CMIElement.match(adlNavRequestRegex);",
    "    if (stringMatches(CMIElement, adlNavRequestRegex)) {\n      this.lastErrorCode = \"0\";\n      const matches = CMIElement.match(adlNavRequestRegex);"
  ],
  [
    "  NAVEvent: \"^(_?(start|resumeAll|previous|continue|exit|exitAll|abandon|abandonAll|suspendAll|retry|retryAll)|_none_|(\\\\{target=(?<choice_target>\\\\S{0,}[a-zA-Z0-9-_]+)})?choice|(\\\\{target=(?<jump_target>\\\\S{0,}[a-zA-Z0-9-_]+)})?jump)$\",",
    "  NAVEvent: \"^(_?(start|resumeAll|previous|continue|exit|exitAll|abandon|abandonAll|suspendAll|retry|retryAll)|_none_|(\\\\{target=(?<choice_target>[^{}]+)\\\\})?choice|(\\\\{target=(?<jump_target>[^{}]+)\\\\})?jump)(?![\\\\s\\\\S])\","
  ],
  [
    "  NAVTarget: \"^{target=\\\\S{0,}[a-zA-Z0-9-_]+}$\",",
    "  NAVTarget: \"^\\\\{target=[^{}]+\\\\}(?![\\\\s\\\\S])\","
  ]
];
const realOriginal = "a8d9018516119e5180c5cccd9931bb8b56335f3c282c0367cfe116e73d420007";
const realPatched = "2872964c5545baf04c2de580be6ece0dafafe76c83d04efedc7b5d5cec7720df";
const realUpdates = [
  [
    "  CMIDecimal: \"^-?([0-9]{1,10})(\\\\.[0-9]{1,18})?$\",",
    "  CMIDecimal: \"^-?([0-9]+)(\\\\.[0-9]{1,18})?$\","
  ],
  [
    "    const matches = value.match(formatRegex);",
    "    // Pear: real precision does not limit integral digits; refuse non-finite engine arithmetic.\n    if (regexPattern === scorm2004_regex.CMIDecimal && (value.length > 4096 || !Number.isFinite(Number(value)))) throw new errorClass(CMIElement, errorCode);\n    const matches = value.match(formatRegex);"
  ],
  [
    "  audio_range: \"0#999.9999999\",",
    "  audio_range: \"0#*\","
  ],
  [
    "  speed_range: \"0#999.9999999\",",
    "  speed_range: \"0#*\","
  ]
];
const derivedOriginal = "2872964c5545baf04c2de580be6ece0dafafe76c83d04efedc7b5d5cec7720df";
const derivedPatched = "dbc20732465b9b4ffce672ac11a5d5dee48384d4f0beabf562c00215cf051281";
const derivedUpdates = [
  [
    "    if (CMIElement === \"adl.nav.request\") {\n      this.throwSCORMError(\n        CMIElement,\n        scorm2004_errors.WRITE_ONLY_ELEMENT,",
    "    // Pear: successful early-return model handlers reset previous errors too.\n    this.lastErrorCode = \"0\";\n    if (CMIElement === \"adl.nav.request\") {\n      this.throwSCORMError(\n        CMIElement,\n        scorm2004_errors.WRITE_ONLY_ELEMENT,"
  ],
  [
    "    if (stringMatches(CMIElement, adlNavRequestRegex)) {\n      this.lastErrorCode = \"0\";\n      const matches = CMIElement.match(adlNavRequestRegex);",
    "    if (stringMatches(CMIElement, adlNavRequestRegex)) {\n      const matches = CMIElement.match(adlNavRequestRegex);"
  ]
];
const languageOriginal = "dbc20732465b9b4ffce672ac11a5d5dee48384d4f0beabf562c00215cf051281";
const languagePatched = "1755d776fb21a84a37918169e77ffe6b7c64b6b0f82052d78d08dc018fb566a1";
const languageUpdates = [
  [
    "  CMILang: \"^([a-zA-Z]{1,8}|i|x)(-[a-zA-Z0-9-]{2,8})?$|^$\",",
    "  CMILang: \"^(?=[\\\\s\\\\S]{0,250}(?![\\\\s\\\\S]))(?:[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*)?(?![\\\\s\\\\S])\","
  ],
  [
    "    if (check2004ValidFormat(this._cmi_element + \".language\", language, scorm2004_regex.CMILang)) {",
    "    if (check2004ValidFormat(this._cmi_element + \".language\", language, scorm2004_regex.CMILang, true)) {"
  ]
];
export function reviewedSCORMSource(source) {
  const expected = pins[hash(source)];
  if (expected) {
    source = replace(source, corrections);
    if (hash(source) !== expected) throw Error('SCORM reviewed checksum mismatch');
  }
  if (hash(source) === navigationOriginal) {
    source = replace(source, navigationUpdates);
    if (hash(source) !== navigationPatched) throw Error('SCORM navigation checksum mismatch');
  }
  if (hash(source) === realOriginal) {
    source = replace(source, realUpdates);
    if (hash(source) !== realPatched) throw Error('SCORM real checksum mismatch');
  }
  if (hash(source) === derivedOriginal) {
    source = replace(source, derivedUpdates);
    if (hash(source) !== derivedPatched) throw Error('SCORM derived-read checksum mismatch');
  }
  if (hash(source) === languageOriginal) {
    source = replace(source, languageUpdates);
    if (hash(source) !== languagePatched) throw Error('SCORM preference-language checksum mismatch');
  }
  return source;
}
export function unreviewedSCORMSource(source) {
  if (hash(source) === languagePatched) {
    source = replace(source, languageUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== languageOriginal) throw Error('SCORM preference-language reverse checksum mismatch');
  }
  if (hash(source) === derivedPatched) {
    source = replace(source, derivedUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== derivedOriginal) throw Error('SCORM derived-read reverse checksum mismatch');
  }
  if (hash(source) === realPatched) {
    source = replace(source, realUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== realOriginal) throw Error('SCORM real reverse checksum mismatch');
  }
  if (hash(source) === navigationPatched) {
    source = replace(source, navigationUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== navigationOriginal) throw Error('SCORM navigation reverse checksum mismatch');
  }
  const original = Object.keys(pins).find(key => pins[key] === hash(source)); if (!original) return source;
  const output = replace(source, corrections.toReversed().map(([before, after]) => [after, before]));
  if (hash(output) !== original) throw Error('SCORM review reverse checksum mismatch');
  return output;
}
