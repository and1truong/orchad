import Scorm2004API, * as engines from 'scorm-again/scorm2004';
import type {SCORMStandard} from './scorm-engine.ts';
// ponytail: retain isolated 2nd-edition RFC2396 policy; full legacy matrix remains OPEN.
// The checksum-locked installer exports isolated contemporary/legacy bindings.
const legacy = (engines as unknown as {Scorm2004LegacyAPI: typeof Scorm2004API}).Scorm2004LegacyAPI;
export function scorm2004Engine(edition: SCORMStandard) {return edition === '2004-2' ? legacy : Scorm2004API;}
