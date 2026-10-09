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
const model12Original = "220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32";
const model12Patched = "3c6715ad2bdd07c445af58d24509ded9a8388345ccc1931b5c467ccb9c8f9cec";
const model12Updates = [
  [
    "  /**\n   * Gets the appropriate error code for undefined data model elements.\n   * Both SCORM 2004 and SCORM 1.2 use UNDEFINED_DATA_MODEL (401): an\n   * unrecognized element is \"Not implemented\", not a general exception. SCORM\n   * 1.2 previously returned GENERAL (101) here, which is non-conformant \u2014 the\n   * ADL 1.2 CTS and the SCORM 1.2 RTE spec expect 401 for an unknown element.\n   */\n  getUndefinedDataModelErrorCode() {\n    return getErrorCode(this.context.errorCodes, \"UNDEFINED_DATA_MODEL\");\n  }\n",
    "  /** Invalid names inside CMI use 201; unsupported outside models use 401. */\n  getUndefinedDataModelErrorCode(CMIElement) {\n    return getErrorCode(this.context.errorCodes, CMIElement === \"cmi\" || CMIElement.startsWith(\"cmi.\") ? \"ARGUMENT_ERROR\" : \"UNDEFINED_DATA_MODEL\");\n  }\n"
  ],
  [
    "    const invalidErrorCode = this.getUndefinedDataModelErrorCode();\n    const collections = [];",
    "    const invalidErrorCode = this.getUndefinedDataModelErrorCode(CMIElement);\n    const collections = [];"
  ],
  [
    "    const invalidErrorCode = this.getUndefinedDataModelErrorCode();\n    for (let idx",
    "    const invalidErrorCode = this.getUndefinedDataModelErrorCode(CMIElement);\n    for (let idx"
  ]
];
const time12Original = "3c6715ad2bdd07c445af58d24509ded9a8388345ccc1931b5c467ccb9c8f9cec";
const time12Patched = "eb75395928406b5a4722d344fd52ef3614e83797c736fb5d79d00f50d47cb642";
const time12Updates = [
  [
    "  CMITimespan: \"^([0-9]+):([0-9]{2}):([0-9]{2})(\\\\.\\\\d{1,2})?$\",",
    "  CMITimespan: \"^([0-9]{2,4}):([0-9]{2}):([0-9]{2})(\\\\.\\\\d{1,2})?$\","
  ]
];
const time2004Original = "1755d776fb21a84a37918169e77ffe6b7c64b6b0f82052d78d08dc018fb566a1";
const time2004Patched = "86189a9e5d9990b064f114ec7a8eecfea9ef05731ac87405e9e280b1e2a7cae1";
const time2004Updates = [
  [
    "  CMITimespan: \"^P(?:([.,\\\\d]+)Y)?(?:([.,\\\\d]+)M)?(?:([.,\\\\d]+)W)?(?:([.,\\\\d]+)D)?(?:T?(?:([.,\\\\d]+)H)?(?:([.,\\\\d]+)M)?(?:(\\\\d+(?:\\\\.\\\\d{1,2})?)S)?)?$\",",
    "  CMITimespan: \"^P(?=\\\\d|T\\\\d)(?!.*W)(?!.*T$)(?:(\\\\d+)Y)?(?:(\\\\d+)M)?(?:(\\\\d+)W)?(?:(\\\\d+)D)?(?:T(?:(\\\\d+)H)?(?:(\\\\d+)M)?(?:(\\\\d+(?:\\\\.\\\\d{1,2})?)S)?)?$\","
  ]
];
const urnOriginal = "86189a9e5d9990b064f114ec7a8eecfea9ef05731ac87405e9e280b1e2a7cae1";
const urnPatched = "2d934ecb704315c2b24f6ecc782624d3ba266feec5f870f542f37bc504eb8601";
const urnUpdates = [
  [
    "  CMIShortIdentifier: \"^(?=[\\\\s\\\\S]{1,250}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\",",
    "  CMIShortIdentifier: \"^(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,250}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILongIdentifier: \"^(?=[\\\\s\\\\S]{1,4000}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\",",
    "  CMILongIdentifier: \"^(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,4000}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ]
];
const schemeOriginal = "2d934ecb704315c2b24f6ecc782624d3ba266feec5f870f542f37bc504eb8601";
const schemePatched = "83c7f6ec22e62557ab0642af4ac3b3b5ab9d3d134074a53763d1eb918a6183cd";
const schemeUpdates = [
  [
    "  CMIShortIdentifier: \"^(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,250}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\",",
    "  CMIShortIdentifier: \"^(?:(?=[A-Za-z][A-Za-z0-9+.-]*:)|(?=[^:/?#]*(?:[/?#]|$)))(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,250}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILongIdentifier: \"^(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,4000}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\",",
    "  CMILongIdentifier: \"^(?:(?=[A-Za-z][A-Za-z0-9+.-]*:)|(?=[^:/?#]*(?:[/?#]|$)))(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,4000}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ]
];
const fragmentOriginal = "83c7f6ec22e62557ab0642af4ac3b3b5ab9d3d134074a53763d1eb918a6183cd";
const fragmentPatched = "87e419e81c4f875d0388b8f5c4cad3036302bd2dc6b11acdec1d2f389783613f";
const fragmentUpdates = [
  [
    "  CMIShortIdentifier: \"^(?:(?=[A-Za-z][A-Za-z0-9+.-]*:)|(?=[^:/?#]*(?:[/?#]|$)))(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,250}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\",",
    "  CMIShortIdentifier: \"^(?![^#]*#[\\\\s\\\\S]*#)(?:(?=[A-Za-z][A-Za-z0-9+.-]*:)|(?=[^:/?#]*(?:[/?#]|$)))(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,250}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ],
  [
    "  CMILongIdentifier: \"^(?:(?=[A-Za-z][A-Za-z0-9+.-]*:)|(?=[^:/?#]*(?:[/?#]|$)))(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,4000}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\",",
    "  CMILongIdentifier: \"^(?![^#]*#[\\\\s\\\\S]*#)(?:(?=[A-Za-z][A-Za-z0-9+.-]*:)|(?=[^:/?#]*(?:[/?#]|$)))(?:(?![uU][rR][nN]:)|(?=[uU][rR][nN]:(?![uU][rR][nN]:)[A-Za-z0-9][A-Za-z0-9-]{0,31}:(?:[A-Za-z0-9()+,\\\\-.:=@;$_!*'/?#]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])))(?=[\\\\s\\\\S]{1,4000}(?![\\\\s\\\\S]))(?:[A-Za-z0-9\\\\-._~:/?#@!$&'()*+,;=]|%[0-9A-Fa-f]{2})+(?![\\\\s\\\\S])\","
  ]
];
const resultOriginal = "87e419e81c4f875d0388b8f5c4cad3036302bd2dc6b11acdec1d2f389783613f";
const resultPatched = "d28dc6ff0d7f4f2637302a285c600a686078fb64e80518ce541404449c017430";
const resultUpdates = [
  [
    "  CMIResult: \"^(correct|incorrect|unanticipated|neutral|-?([0-9]{1,4})(\\\\.[0-9]{1,18})?)$\",",
    "  CMIResult: \"^(correct|incorrect|unanticipated|neutral|-?([0-9]+)(\\\\.[0-9]{1,18})?)(?![\\\\s\\\\S])\","
  ],
  [
    "    if (regexPattern === scorm2004_regex.CMIDecimal && (value.length > 4096 || !Number.isFinite(Number(value)))) throw new errorClass(CMIElement, errorCode);",
    "    if ((regexPattern === scorm2004_regex.CMIDecimal || regexPattern === scorm2004_regex.CMIResult && !Number.isNaN(Number(value))) && (value.length > 4096 || !Number.isFinite(Number(value)))) throw new errorClass(CMIElement, errorCode);"
  ],
  [
    "  set result(result) {\n    if (check2004ValidFormat",
    "  set result(result) {\n    if (this.initialized && this._id === \"\") {\n      throw new Scorm2004ValidationError(this._cmi_element + \".result\", scorm2004_errors.DEPENDENCY_NOT_ESTABLISHED);\n    }\n    if (check2004ValidFormat"
  ]
];
const responseNumericOriginal = "d28dc6ff0d7f4f2637302a285c600a686078fb64e80518ce541404449c017430";
const responseNumericPatched = "16ea129cb6cbf6e50774afe6c852afd3dfb861e52220286d368bbec535ac9d14";
const responseNumericUpdates = [
  [
    "      const response_type = LearnerResponses[this.type];",
    "      const response_type = LearnerResponses[this.type];\n      if (this.type === \"numeric\") check2004ValidFormat(this._cmi_element + \".learner_response\", learner_response, scorm2004_regex.CMIDecimal);"
  ],
  [
    "  const nodes = splitDelimited(pattern, responseDef.delimiter);\n  // Pear: bare commas",
    "  if (type === \"numeric\" && !pattern.includes(\"[:]\")) throw new Scorm2004ValidationError(\"cmi.interactions.n.correct_responses.n.pattern\", scorm2004_errors.TYPE_MISMATCH);\n  const nodes = splitDelimited(pattern, responseDef.delimiter);\n  // Pear: bare commas"
  ],
  [
    "  const checkSingle = (value) => {\n    if (!fmt1.test(value)) {",
    "  const checkSingle = (value) => {\n    if (type === \"numeric\") check2004ValidFormat(\"cmi.interactions.n.correct_responses.n.pattern\", value, scorm2004_regex.CMIDecimal);\n    if (!fmt1.test(value)) {"
  ],
  [
    "        if (fmt2 && part2 !== void 0 && !fmt2.test(part2)) {",
    "        if (part2?.includes(\"[:]\")) for (const endpoint of splitDelimited(part2, \"[:]\")) check2004ValidFormat(\"cmi.interactions.n.correct_responses.n.pattern\", endpoint, scorm2004_regex.CMIDecimal, true);\n        if (fmt2 && part2 !== void 0 && !fmt2.test(part2)) {"
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
  if (hash(source) === model12Original) {
    source = replace(source, model12Updates);
    if (hash(source) !== model12Patched) throw Error('SCORM 1.2 model-error checksum mismatch');
  }
  if (hash(source) === time12Original) {
    source = replace(source, time12Updates);
    if (hash(source) !== time12Patched) throw Error('SCORM timeinterval checksum mismatch');
  }
  if (hash(source) === time2004Original) {
    source = replace(source, time2004Updates);
    if (hash(source) !== time2004Patched) throw Error('SCORM timeinterval checksum mismatch');
  }
  if (hash(source) === urnOriginal) {
    source = replace(source, urnUpdates);
    if (hash(source) !== urnPatched) throw Error('SCORM URN checksum mismatch');
  }
  if (hash(source) === schemeOriginal) {
    source = replace(source, schemeUpdates);
    if (hash(source) !== schemePatched) throw Error('SCORM URI scheme checksum mismatch');
  }
  if (hash(source) === fragmentOriginal) {
    source = replace(source, fragmentUpdates);
    if (hash(source) !== fragmentPatched) throw Error('SCORM URI fragment checksum mismatch');
  }
  if (hash(source) === resultOriginal) {
    source = replace(source, resultUpdates);
    if (hash(source) !== resultPatched) throw Error('SCORM result binding checksum mismatch');
  }
  if (hash(source) === responseNumericOriginal) {
    source = replace(source, responseNumericUpdates);
    if (hash(source) !== responseNumericPatched) throw Error("SCORM numeric response checksum mismatch");
  }
  return source;
}
export function unreviewedSCORMSource(source) {
  if (hash(source) === responseNumericPatched) {
    source = replace(source, responseNumericUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== responseNumericOriginal) throw Error("SCORM numeric response reverse checksum mismatch");
  }
  if (hash(source) === resultPatched) {
    source = replace(source, resultUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== resultOriginal) throw Error('SCORM result binding reverse checksum mismatch');
  }
  if (hash(source) === fragmentPatched) {
    source = replace(source, fragmentUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== fragmentOriginal) throw Error('SCORM URI fragment reverse checksum mismatch');
  }
  if (hash(source) === schemePatched) {
    source = replace(source, schemeUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== schemeOriginal) throw Error('SCORM URI scheme reverse checksum mismatch');
  }
  if (hash(source) === urnPatched) {
    source = replace(source, urnUpdates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== urnOriginal) throw Error('SCORM URN reverse checksum mismatch');
  }
  if (hash(source) === time2004Patched) {
    source = replace(source, time2004Updates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== time2004Original) throw Error('SCORM timeinterval reverse checksum mismatch');
  }
  if (hash(source) === time12Patched) {
    source = replace(source, time12Updates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== time12Original) throw Error('SCORM timeinterval reverse checksum mismatch');
  }
  if (hash(source) === model12Patched) {
    source = replace(source, model12Updates.toReversed().map(([before, after]) => [after, before]));
    if (hash(source) !== model12Original) throw Error('SCORM 1.2 model-error reverse checksum mismatch');
  }
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
