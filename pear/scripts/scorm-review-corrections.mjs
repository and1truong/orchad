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
export function reviewedSCORMSource(source) {
  const expected = pins[hash(source)]; if (!expected) return source;
  const output = replace(source, corrections);
  if (hash(output) !== expected) throw Error('SCORM reviewed checksum mismatch');
  return output;
}
export function unreviewedSCORMSource(source) {
  const original = Object.keys(pins).find(key => pins[key] === hash(source)); if (!original) return source;
  const output = replace(source, corrections.toReversed().map(([before, after]) => [after, before]));
  if (hash(output) !== original) throw Error('SCORM review reverse checksum mismatch');
  return output;
}
