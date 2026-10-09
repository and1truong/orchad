import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {reviewedSCORMSource, unreviewedSCORMSource, uriAuthorityUpdates, decimalUpdates, resultDecimalUpdates, legacyAbsoluteUpdates, languageRegistryUpdates, ianaLanguageUpdates, reservedCountryUpdates, countryRegistryUpdates, subcodeRegistryUpdates} from '../scripts/scorm-review-corrections.mjs';

test('actual installation upgrades limits-v3 and pristine 1.2, is idempotent and rejects unexpected engine bytes/version',()=>{
  const root=mkdtempSync(join(tmpdir(),'pear-unicode-install-')),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const corrected2004=readFileSync(new URL('../node_modules/scorm-again/dist/esm/scorm2004.js',import.meta.url),'utf8'),corrected12=readFileSync(new URL('../node_modules/scorm-again/dist/esm/scorm12.js',import.meta.url),'utf8');
  const current2004=unreviewedSCORMSource(corrected2004),current12=unreviewedSCORMSource(corrected12);
  const reviewScript=readFileSync(new URL('../scripts/scorm-review-corrections.mjs',import.meta.url),'utf8');
  const navUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const navigationUpdates = ')+'const navigationUpdates = '.length,reviewScript.indexOf(';\nconst realOriginal',reviewScript.indexOf('const navigationUpdates = '))));
  const realUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const realUpdates = ')+'const realUpdates = '.length,reviewScript.indexOf(';\nconst derivedOriginal',reviewScript.indexOf('const realUpdates = '))));
  const derivedUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const derivedUpdates = ')+'const derivedUpdates = '.length,reviewScript.indexOf(';\nconst languageOriginal',reviewScript.indexOf('const derivedUpdates = '))));
  const languageUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const languageUpdates = ')+'const languageUpdates = '.length,reviewScript.indexOf(';\nconst model12Original',reviewScript.indexOf('const languageUpdates = '))));
  const urnUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const urnUpdates = ')+'const urnUpdates = '.length,reviewScript.indexOf(';\nconst schemeOriginal',reviewScript.indexOf('const urnUpdates = '))));
  const schemeUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const schemeUpdates = ')+'const schemeUpdates = '.length,reviewScript.indexOf(';\nconst fragmentOriginal',reviewScript.indexOf('const schemeUpdates = '))));
  const fragmentUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const fragmentUpdates = ')+'const fragmentUpdates = '.length,reviewScript.indexOf(';\nconst resultOriginal',reviewScript.indexOf('const fragmentUpdates = '))));
  const resultUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const resultUpdates = ')+'const resultUpdates = '.length,reviewScript.indexOf(';\nconst responseNumericOriginal',reviewScript.indexOf('const resultUpdates = '))));
  const responseNumericUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const responseNumericUpdates = ')+'const responseNumericUpdates = '.length,reviewScript.indexOf(';\nconst emptyLocationOriginal',reviewScript.indexOf('const responseNumericUpdates = '))));
  const emptyLocationUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const emptyLocationUpdates = ')+'const emptyLocationUpdates = '.length,reviewScript.indexOf(';\nconst choiceSetOriginal',reviewScript.indexOf('const emptyLocationUpdates = '))));
  const choiceSetUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const choiceSetUpdates = ')+'const choiceSetUpdates = '.length,reviewScript.indexOf(';\nconst commentPresenceOriginal',reviewScript.indexOf('const choiceSetUpdates = '))));
  const commentPresenceUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const commentPresenceUpdates = ')+'const commentPresenceUpdates = '.length,reviewScript.indexOf(';\nconst descriptionPresenceOriginal',reviewScript.indexOf('const commentPresenceUpdates = '))));
  const descriptionPresenceUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const descriptionPresenceUpdates = ')+'const descriptionPresenceUpdates = '.length,reviewScript.indexOf(';\nconst learnerResponsePresenceOriginal',reviewScript.indexOf('const descriptionPresenceUpdates = '))));
  const learnerResponsePresenceUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const learnerResponsePresenceUpdates = ')+'const learnerResponsePresenceUpdates = '.length,reviewScript.indexOf(';\nconst contentPresenceOriginal',reviewScript.indexOf('const learnerResponsePresenceUpdates = '))));
  const contentPresenceUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const contentPresenceUpdates = ')+'const contentPresenceUpdates = '.length,reviewScript.indexOf(';\nconst timeoutExitAllOriginal',reviewScript.indexOf('const contentPresenceUpdates = '))));
  const timeoutExitAllUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const timeoutExitAllUpdates = ')+'const timeoutExitAllUpdates = '.length,reviewScript.indexOf(';\nconst logoutExitAllOriginal',reviewScript.indexOf('const timeoutExitAllUpdates = '))));
  const logoutExitAllUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const logoutExitAllUpdates = ')+'const logoutExitAllUpdates = '.length,reviewScript.indexOf(';\nconst interactionIDOriginal',reviewScript.indexOf('const logoutExitAllUpdates = '))));
  const interactionIDUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const interactionIDUpdates = ')+'const interactionIDUpdates = '.length,reviewScript.indexOf(';\nconst urnNulOriginal',reviewScript.indexOf('const interactionIDUpdates = '))));
  const urnNulUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const urnNulUpdates = ')+'const urnNulUpdates = '.length,reviewScript.indexOf(';\nconst interactionReadOriginal',reviewScript.indexOf('const urnNulUpdates = '))));
  const interactionReadUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const interactionReadUpdates = ')+'const interactionReadUpdates = '.length,reviewScript.indexOf(';\nconst sequencingResponseOriginal',reviewScript.indexOf('const interactionReadUpdates = '))));
  const sequencingResponseUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const sequencingResponseUpdates = ')+'const sequencingResponseUpdates = '.length,reviewScript.indexOf(';\nconst responseBindingOriginal',reviewScript.indexOf('const sequencingResponseUpdates = '))));
  const responseBindingUpdates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const responseBindingUpdates = ')+'const responseBindingUpdates = '.length,reviewScript.indexOf(';\n// RFC3986',reviewScript.indexOf('const responseBindingUpdates = '))));
  let subcodeRegistryPredecessor=corrected2004;for(const [before,after] of subcodeRegistryUpdates.toReversed()){assert.equal(subcodeRegistryPredecessor.split(after).length,2);subcodeRegistryPredecessor=subcodeRegistryPredecessor.replace(after,()=>before);}
  assert.equal(hash(subcodeRegistryPredecessor),'aed6a0dda87c61dd3fbddc8e756ea4ee03f07d4895540f30fd6810b00c9fe84b');
  let countryRegistryPredecessor=subcodeRegistryPredecessor;for(const [before,after] of countryRegistryUpdates.toReversed()){assert.equal(countryRegistryPredecessor.split(after).length,2);countryRegistryPredecessor=countryRegistryPredecessor.replace(after,()=>before);}
  assert.equal(hash(countryRegistryPredecessor),'4ad1c795e60362bd73c3826f80a1a0ed2202185a5a98a4559328361dd6f4659b');
  let reservedCountryPredecessor=countryRegistryPredecessor;for(const [before,after] of reservedCountryUpdates.toReversed()){assert.equal(reservedCountryPredecessor.split(after).length,2);reservedCountryPredecessor=reservedCountryPredecessor.replace(after,()=>before);}
  assert.equal(hash(reservedCountryPredecessor),'62d0e92379a86ba6cad924e0cc40f28065970b0d0a6f373256ce8fb20333d151');
  let ianaPredecessor=reservedCountryPredecessor;for(const [before,after] of ianaLanguageUpdates.toReversed()){assert.equal(ianaPredecessor.split(after).length,2);ianaPredecessor=ianaPredecessor.replace(after,()=>before);}
  assert.equal(hash(ianaPredecessor),'a8a7d45aae0d80cd982ab7260c2279b304e5da5f364622a636f5f879e426c9a3');
  let languageRegistryPredecessor=ianaPredecessor;for(const [before,after] of languageRegistryUpdates.toReversed()){assert.equal(languageRegistryPredecessor.split(after).length,2);languageRegistryPredecessor=languageRegistryPredecessor.replace(after,()=>before);}
  assert.equal(hash(languageRegistryPredecessor),'8bd81c6515c2146928a9e3f665e7cf9544214ee2c8bf566da24bf19de4273a47');
  let legacyAbsolutePredecessor=languageRegistryPredecessor;for(const [before,after] of legacyAbsoluteUpdates.toReversed()){assert.equal(legacyAbsolutePredecessor.split(after).length,2);legacyAbsolutePredecessor=legacyAbsolutePredecessor.replace(after,()=>before);}
  assert.equal(hash(legacyAbsolutePredecessor),'0447a677c989ac331f2e883c3e450a04c9366dcf3b5e4b06c5cbb0d5fdb1a62b');
  let resultDecimalPredecessor=legacyAbsolutePredecessor;for(const [before,after] of resultDecimalUpdates.toReversed()){assert.equal(resultDecimalPredecessor.split(after).length,2);resultDecimalPredecessor=resultDecimalPredecessor.replace(after,()=>before);}
  assert.equal(hash(resultDecimalPredecessor),'6d9a5a3b33f911fcc447c8edf475022e22b07bb34166122e376d1b1ff32df086');
  let decimalPredecessor=resultDecimalPredecessor;for(const [before,after] of decimalUpdates.toReversed()){assert.equal(decimalPredecessor.split(after).length,2);decimalPredecessor=decimalPredecessor.replace(after,()=>before);}
  assert.equal(hash(decimalPredecessor),'9ba7375b3f88be0bf54cf02ed4220346f5fbee12de8fa23ac723ba6fe0d0d35c');
  let uriAuthorityPredecessor=decimalPredecessor;for(const [before,after] of uriAuthorityUpdates.toReversed()){assert.equal(uriAuthorityPredecessor.split(after).length,2);uriAuthorityPredecessor=uriAuthorityPredecessor.replace(after,()=>before);}
  assert.equal(hash(uriAuthorityPredecessor),'8bdddcc2d2b129e5541e9f18b46e50353cf72978d591ab9ca98d431876d46f10');
  let responseBindingPredecessor=uriAuthorityPredecessor;for(const [before,after] of responseBindingUpdates.toReversed()){assert.equal(responseBindingPredecessor.split(after).length,2);responseBindingPredecessor=responseBindingPredecessor.replace(after,()=>before);}
  assert.equal(hash(responseBindingPredecessor),'5153a70d4100dd05c905d4df8ad4f27dbab16292e4f27ef461096b77f022f276');
  let sequencingResponsePredecessor=responseBindingPredecessor;for(const [before,after] of sequencingResponseUpdates.toReversed()){assert.equal(sequencingResponsePredecessor.split(after).length,2);sequencingResponsePredecessor=sequencingResponsePredecessor.replace(after,()=>before);}
  assert.equal(hash(sequencingResponsePredecessor),'3d677e8ee9457aa0ca29a68ada989301493de6965c3cc2e51431b0198b2f10aa');
  let interactionReadPredecessor=sequencingResponsePredecessor;for(const [before,after] of interactionReadUpdates.toReversed()){assert.equal(interactionReadPredecessor.split(after).length,2);interactionReadPredecessor=interactionReadPredecessor.replace(after,()=>before);}
  assert.equal(hash(interactionReadPredecessor),'35b50ad4ce8742e927725802ccba2b9950532f637d3a0ea74daa886155ff0790');
  let urnNulPredecessor=interactionReadPredecessor;for(const [before,after] of urnNulUpdates.toReversed()){assert.equal(urnNulPredecessor.split(after).length,2);urnNulPredecessor=urnNulPredecessor.replace(after,()=>before);}
  assert.equal(hash(urnNulPredecessor),'ca2588b34c137ee832c2b58cadde4ad5c6260286c3fe5ce0e25470f55b40dc31');
  let interactionIDPredecessor=urnNulPredecessor;for(const [before,after] of interactionIDUpdates.toReversed()){assert.equal(interactionIDPredecessor.split(after).length,2);interactionIDPredecessor=interactionIDPredecessor.replace(after,()=>before);}
  assert.equal(hash(interactionIDPredecessor),'bc4d03187eb829e7b8a9a22e775b2cf2cfe14d7e0815ad24e518522c6500706a');
  let logoutExitAllPredecessor=interactionIDPredecessor;for(const [before,after] of logoutExitAllUpdates.toReversed()){assert.equal(logoutExitAllPredecessor.split(after).length,2);logoutExitAllPredecessor=logoutExitAllPredecessor.replace(after,()=>before);}
  assert.equal(hash(logoutExitAllPredecessor),'06459750c6d56c132306b08b89814db746915c44be835fab1e4d1ab29c8bf26f');
  let timeoutExitAllPredecessor=logoutExitAllPredecessor;for(const [before,after] of timeoutExitAllUpdates.toReversed()){assert.equal(timeoutExitAllPredecessor.split(after).length,2);timeoutExitAllPredecessor=timeoutExitAllPredecessor.replace(after,()=>before);}
  assert.equal(hash(timeoutExitAllPredecessor),'5020b23897cbf8bca9c4e6ae71633cc6df6389dd70d6f593318bd4ab19f2c6e7');
  let contentPresencePredecessor=timeoutExitAllPredecessor;for(const [before,after] of contentPresenceUpdates.toReversed()){assert.equal(contentPresencePredecessor.split(after).length,2);contentPresencePredecessor=contentPresencePredecessor.replace(after,()=>before);}
  assert.equal(hash(contentPresencePredecessor),'acc64c8c88268bbfaf8429cd0c4805ed2c0c4110888514e0dca8369b60480019');
  let learnerResponsePresencePredecessor=contentPresencePredecessor;for(const [before,after] of learnerResponsePresenceUpdates.toReversed()){assert.equal(learnerResponsePresencePredecessor.split(after).length,2);learnerResponsePresencePredecessor=learnerResponsePresencePredecessor.replace(after,()=>before);}
  assert.equal(hash(learnerResponsePresencePredecessor),'bb1e42b70479ed21a68fc99f5b25a6dc875975d4336b6db0be23115c3aedd8ba');
  let descriptionPresencePredecessor=learnerResponsePresencePredecessor;for(const [before,after] of descriptionPresenceUpdates.toReversed()){assert.equal(descriptionPresencePredecessor.split(after).length,2);descriptionPresencePredecessor=descriptionPresencePredecessor.replace(after,()=>before);}
  assert.equal(hash(descriptionPresencePredecessor),'d0b3b183192ac4a8a10efb9058435a1d5e1255065f1d11e776c8420fa2a60897');
  let commentPresencePredecessor=descriptionPresencePredecessor;for(const [before,after] of commentPresenceUpdates.toReversed()){assert.equal(commentPresencePredecessor.split(after).length,2);commentPresencePredecessor=commentPresencePredecessor.replace(after,()=>before);}
  assert.equal(hash(commentPresencePredecessor),'23fc451fff5e7e78919c772419866cb62f7c1174f470ff7940a61eebfc458158');
  let choiceSetPredecessor=commentPresencePredecessor;for(const [before,after] of choiceSetUpdates.toReversed()){assert.equal(choiceSetPredecessor.split(after).length,2);choiceSetPredecessor=choiceSetPredecessor.replace(after,()=>before);}
  assert.equal(hash(choiceSetPredecessor),'400811138e860165b56b9444bf5dbeeb65c5fc46c5cf37a88ac34ade7b2c4571');
  let emptyLocationPredecessor=choiceSetPredecessor;for(const [before,after] of emptyLocationUpdates.toReversed()){assert.equal(emptyLocationPredecessor.split(after).length,2);emptyLocationPredecessor=emptyLocationPredecessor.replace(after,()=>before);}
  assert.equal(hash(emptyLocationPredecessor),'16ea129cb6cbf6e50774afe6c852afd3dfb861e52220286d368bbec535ac9d14');
  let responseNumericPredecessor=emptyLocationPredecessor;for(const [before,after] of responseNumericUpdates.toReversed()){assert.equal(responseNumericPredecessor.split(after).length,2);responseNumericPredecessor=responseNumericPredecessor.replace(after,()=>before);}
  assert.equal(hash(responseNumericPredecessor),'d28dc6ff0d7f4f2637302a285c600a686078fb64e80518ce541404449c017430');
  let resultPredecessor=responseNumericPredecessor;for(const [before,after] of resultUpdates.toReversed()){assert.equal(resultPredecessor.split(after).length,2);resultPredecessor=resultPredecessor.replace(after,()=>before);}
  assert.equal(hash(resultPredecessor),'87e419e81c4f875d0388b8f5c4cad3036302bd2dc6b11acdec1d2f389783613f');
  let fragmentPredecessor=resultPredecessor;for(const [before,after] of fragmentUpdates.toReversed()){assert.equal(fragmentPredecessor.split(after).length,2);fragmentPredecessor=fragmentPredecessor.replace(after,()=>before);}
  assert.equal(hash(fragmentPredecessor),'83c7f6ec22e62557ab0642af4ac3b3b5ab9d3d134074a53763d1eb918a6183cd');
  let schemePredecessor=fragmentPredecessor;for(const [before,after] of schemeUpdates.toReversed()){assert.equal(schemePredecessor.split(after).length,2);schemePredecessor=schemePredecessor.replace(after,()=>before);}
  assert.equal(hash(schemePredecessor),'2d934ecb704315c2b24f6ecc782624d3ba266feec5f870f542f37bc504eb8601');
  let urnPredecessor=schemePredecessor;for(const [before,after] of urnUpdates.toReversed()){assert.equal(urnPredecessor.split(after).length,2);urnPredecessor=urnPredecessor.replace(after,()=>before);}
  assert.equal(hash(urnPredecessor),'86189a9e5d9990b064f114ec7a8eecfea9ef05731ac87405e9e280b1e2a7cae1');
  const time12Updates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const time12Updates = ')+'const time12Updates = '.length,reviewScript.indexOf(';\nconst time2004Original',reviewScript.indexOf('const time12Updates = '))));
  let time12Predecessor=corrected12;for(const [before,after] of time12Updates.toReversed()){assert.equal(time12Predecessor.split(after).length,2);time12Predecessor=time12Predecessor.replace(after,()=>before);}
  assert.equal(hash(time12Predecessor),'3c6715ad2bdd07c445af58d24509ded9a8388345ccc1931b5c467ccb9c8f9cec');
  const time2004Updates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const time2004Updates = ')+'const time2004Updates = '.length,reviewScript.indexOf(';\nconst urnOriginal',reviewScript.indexOf('const time2004Updates = '))));
  let time2004Predecessor=urnPredecessor;for(const [before,after] of time2004Updates.toReversed()){assert.equal(time2004Predecessor.split(after).length,2);time2004Predecessor=time2004Predecessor.replace(after,()=>before);}
  assert.equal(hash(time2004Predecessor),'1755d776fb21a84a37918169e77ffe6b7c64b6b0f82052d78d08dc018fb566a1');
  let languagePredecessor=time2004Predecessor;for(const [before,after] of languageUpdates.toReversed()){assert.equal(languagePredecessor.split(after).length,2);languagePredecessor=languagePredecessor.replace(after,()=>before);}
  assert.equal(hash(languagePredecessor),'dbc20732465b9b4ffce672ac11a5d5dee48384d4f0beabf562c00215cf051281');
  let derivedPredecessor=languagePredecessor;for(const [before,after] of derivedUpdates.toReversed()){assert.equal(derivedPredecessor.split(after).length,2);derivedPredecessor=derivedPredecessor.replace(after,()=>before);}
  assert.equal(hash(derivedPredecessor),'2872964c5545baf04c2de580be6ece0dafafe76c83d04efedc7b5d5cec7720df');
  let predecessorReviewed2004=derivedPredecessor;for(const [before,after] of realUpdates.toReversed()){assert.equal(predecessorReviewed2004.split(after).length,2);predecessorReviewed2004=predecessorReviewed2004.replace(after,()=>before);}
  assert.equal(hash(predecessorReviewed2004),'a8d9018516119e5180c5cccd9931bb8b56335f3c282c0367cfe116e73d420007');
  let previousReviewed2004=predecessorReviewed2004;for(const [before,after] of navUpdates.toReversed()){assert.equal(previousReviewed2004.split(after).length,2);previousReviewed2004=previousReviewed2004.replace(after,()=>before);}
  assert.equal(hash(previousReviewed2004),'0fcfd491141495491caeb8dcc334d68a1dd407fb0c6f15c0747438a7902c1fa9');
  const model12Updates: [string,string][]=JSON.parse(reviewScript.slice(reviewScript.indexOf('const model12Updates = ')+'const model12Updates = '.length,reviewScript.indexOf(';\nconst time12Original',reviewScript.indexOf('const model12Updates = '))));
  let model12Predecessor=time12Predecessor;for(const [before,after] of model12Updates.toReversed()){assert.equal(model12Predecessor.split(after).length,2);model12Predecessor=model12Predecessor.replace(after,()=>before);}
  assert.equal(hash(model12Predecessor),'220469e4b8764960e49fe797f899a00fcdbc10d341cf01e534241bf4b0947a32');
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
  const initializationUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const initializationUpdates = ')+'const initializationUpdates = '.length,installer.indexOf(';\n\nconst atomic',installer.indexOf('const initializationUpdates = '))));
  const atomicityUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const atomicityUpdates = ')+'const atomicityUpdates = '.length,installer.indexOf(';\n\nconst indexed',installer.indexOf('const atomicityUpdates = '))));
  const indexUpdates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const indexUpdates = ')+'const indexUpdates = '.length,installer.indexOf(';\n\nif',installer.indexOf('const indexUpdates = '))));
  const atomicity12Updates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const atomicity12Updates = ')+'const atomicity12Updates = '.length,installer.indexOf(';\n\nif',installer.indexOf('const atomicity12Updates = '))));
  const score12Updates: [string,string][]=JSON.parse(installer.slice(installer.indexOf('const score12Updates = ')+'const score12Updates = '.length,installer.indexOf(';\n\nif',installer.indexOf('const score12Updates = '))));
  let atomic12=current12;for(const [before,after] of score12Updates.toReversed()){assert.equal(atomic12.split(after).length,2);atomic12=atomic12.replace(after,()=>before);}
  assert.equal(hash(atomic12),'e34cb1536920b0597008b53dc97f13abddc71bb07911a0cd4daa55f127c551be');
  let indexed12=atomic12;for(const [before,after] of atomicity12Updates.toReversed()){assert.equal(indexed12.split(after).length,2);indexed12=indexed12.replace(after,()=>before);}
  assert.equal(hash(indexed12),'4d205a6b1c73d9af2b1f09b4f9a12b713cea07468b50bc3947f3c86370ce3e99');
  let atomic2004=current2004,unicode12=indexed12;
  for(const [before,after] of indexUpdates.toReversed()){assert.equal(atomic2004.split(after).length,2);atomic2004=atomic2004.replace(after,()=>before);assert.equal(unicode12.split(after).length,2);unicode12=unicode12.replace(after,()=>before);}
  assert.equal(hash(current2004),'3fec364f6ea8cf9d4e5fbb226ced0646219fd456e5ae9f1bb1df0a739d826745'); assert.equal(hash(current12),'9e73552ee1a4f79998eb4817b62f3c72a8a920b2b1b9434f7bc2e96867d23dd0');
  assert.equal(hash(unicode12),'2f8591ab1f08bd696ff11dc72b1e92c197d12512978ef870a39507ed9567e366');
  let initialized2004=atomic2004;
  for(const [before,after] of atomicityUpdates.toReversed()){assert.equal(initialized2004.split(after).length,2);initialized2004=initialized2004.replace(after,()=>before);}
  assert.equal(hash(atomic2004),'f35f205f11e2102a9db770794233b5e7981698edc6bd887d4ce5576b9350bf14');
  let timestamps2004=initialized2004;
  for(const [before,after] of initializationUpdates.toReversed()){assert.equal(timestamps2004.split(after).length,2);timestamps2004=timestamps2004.replace(after,()=>before);}
  assert.equal(hash(initialized2004),'17b3f713e5ddf6caf3206c77d2ea19e17fef5d4610b2d61d267f523012064871');
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
  const old2004=previous(unicode2004),old12=previous(unicode12);assert.equal(hash(old2004),'de7a085e997136ad200f52a2221c2fec17e457c0d6a869735f613219b2dae10e');assert.equal(hash(old12),'52ffa12e5167e3a37b2f64eefa61cd599ea90c30cf4d164b667baddf83d497a6');
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
    writeFileSync(join(root,'scripts/scorm-language-registry.json'),readFileSync(new URL('../scripts/scorm-language-registry.json',import.meta.url)));
    for(const input of [...new Set([subcodeRegistryPredecessor,countryRegistryPredecessor,reservedCountryPredecessor,ianaPredecessor,languageRegistryPredecessor,pristine,loggingOnly,selected,old2004,unicode2004,localized2004,collections2004,previousResponses2004,responses2004,separators2004,identifiers2004,timestamps2004,initialized2004,atomic2004,current2004,previousReviewed2004,predecessorReviewed2004,derivedPredecessor,languagePredecessor,time2004Predecessor,urnPredecessor,schemePredecessor,fragmentPredecessor,resultPredecessor,responseNumericPredecessor,emptyLocationPredecessor,choiceSetPredecessor,commentPresencePredecessor,descriptionPresencePredecessor,learnerResponsePresencePredecessor,contentPresencePredecessor,timeoutExitAllPredecessor,logoutExitAllPredecessor,interactionIDPredecessor,urnNulPredecessor,interactionReadPredecessor,sequencingResponsePredecessor,responseBindingPredecessor,decimalPredecessor,resultDecimalPredecessor,legacyAbsolutePredecessor].flatMap(value=>[value,reviewedSCORMSource(value)]))]){
      writeFileSync(join(entries,'scorm2004.js'),input);writeFileSync(join(entries,'scorm12.js'),old12);
      const result=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(entries,'scorm2004.js'),'utf8'),corrected2004);assert.equal(readFileSync(join(entries,'scorm12.js'),'utf8'),corrected12);
    }
    for(const input12 of [...new Set([old12,unicode12,indexed12,atomic12,current12,model12Predecessor,time12Predecessor].flatMap(value=>[value,reviewedSCORMSource(value)]))]) {writeFileSync(join(entries,'scorm12.js'),input12);const result=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(entries,'scorm12.js'),'utf8'),corrected12);}
    for(let n=0;n<2;n++){const result=spawnSync(process.execPath,[script],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(entries,'scorm2004.js'),'utf8'),corrected2004);assert.equal(readFileSync(join(entries,'scorm12.js'),'utf8'),corrected12);}
    for(const entry of ['scorm2004.js','scorm12.js']) {const syntax=spawnSync(process.execPath,['--check',join(entries,entry)],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr);}
    writeFileSync(join(entries,'scorm12.js'),current12+'\n// unexpected');assert.notEqual(spawnSync(process.execPath,[script]).status,0);
    writeFileSync(join(entries,'scorm12.js'),current12);writeFileSync(join(entries,'scorm2004.js'),current2004+'\n// unexpected');assert.notEqual(spawnSync(process.execPath,[script]).status,0);
    writeFileSync(join(entries,'scorm2004.js'),current2004);writeFileSync(metadata,JSON.stringify({version:'3.4.6'}));assert.notEqual(spawnSync(process.execPath,[script]).status,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
