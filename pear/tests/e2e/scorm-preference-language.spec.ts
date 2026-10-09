import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../../src/server/app.ts';
import {scormLearningFixture} from '../scorm-learning-fixture.ts';
import {interopPackage} from '../scorm-interop-fixture.ts';

for (const edition of ['2004-2', '2004-3', '2004-4'] as const) test(edition + ': built preference language survive lost ACK and close/resume', async ({page}) => {
  const capacity = 'x' + '-abcdefgh'.repeat(27) + '-abcde';
  const script = `{const api=parent.API_1484_11,key='cmi.learner_preference.language',capacity=${JSON.stringify(capacity)},get=()=>api.GetValue(key),set=v=>api.SetValue(key,v),error=()=>api.GetLastError();
    const reservedCountries=${JSON.stringify(JSON.parse(readFileSync(new URL('../../scripts/scorm-language-registry.json',import.meta.url),'utf8')).userAssignedCountries)};
    const assignedCountries=["AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW", "AN", "BU", "CS", "DD", "FX", "NT", "SU", "TP", "YD", "YU", "ZR"],unassignedCountries=["AA", "AB", "AC", "AH", "AJ", "AK", "AP", "AV", "AY", "BC", "BK", "BP", "BX", "CB", "CE", "CJ", "CP", "CQ", "CT", "DA", "DB", "DC", "DF", "DG", "DH", "DI", "DL", "DN", "DP", "DQ", "DR", "DS", "DT", "DU", "DV", "DW", "DX", "DY", "EA", "EB", "ED", "EF", "EI", "EJ", "EK", "EL", "EM", "EN", "EO", "EP", "EQ", "EU", "EV", "EW", "EX", "EY", "EZ", "FA", "FB", "FC", "FD", "FE", "FF", "FG", "FH", "FL", "FN", "FP", "FQ", "FS", "FT", "FU", "FV", "FW", "FY", "FZ", "GC", "GJ", "GK", "GO", "GV", "GX", "GZ", "HA", "HB", "HC", "HD", "HE", "HF", "HG", "HH", "HI", "HJ", "HL", "HO", "HP", "HQ", "HS", "HV", "HW", "HX", "HY", "HZ", "IA", "IB", "IC", "IF", "IG", "IH", "II", "IJ", "IK", "IP", "IU", "IV", "IW", "IX", "IY", "IZ", "JA", "JB", "JC", "JD", "JF", "JG", "JH", "JI", "JJ", "JK", "JL", "JN", "JQ", "JR", "JS", "JT", "JU", "JV", "JW", "JX", "JY", "JZ", "KA", "KB", "KC", "KD", "KF", "KJ", "KK", "KL", "KO", "KQ", "KS", "KT", "KU", "KV", "KX", "LD", "LE", "LF", "LG", "LH", "LJ", "LL", "LM", "LN", "LO", "LP", "LQ", "LW", "LX", "LZ", "MB", "MI", "MJ", "NB", "ND", "NH", "NJ", "NK", "NM", "NN", "NQ", "NS", "NV", "NW", "NX", "NY", "OA", "OB", "OC", "OD", "OE", "OF", "OG", "OH", "OI", "OJ", "OK", "OL", "ON", "OO", "OP", "OQ", "OR", "OS", "OT", "OU", "OV", "OW", "OX", "OY", "OZ", "PB", "PC", "PD", "PI", "PJ", "PO", "PP", "PQ", "PU", "PV", "PX", "PZ", "QB", "QC", "QD", "QE", "QF", "QG", "QH", "QI", "QJ", "QK", "QL", "QM", "QN", "QO", "QP", "QQ", "QR", "QS", "QT", "QU", "QV", "QW", "QX", "QY", "QZ", "RA", "RB", "RC", "RD", "RF", "RG", "RH", "RI", "RJ", "RK", "RL", "RM", "RN", "RP", "RQ", "RR", "RT", "RV", "RX", "RY", "RZ", "SF", "SP", "SQ", "SW", "TA", "TB", "TE", "TI", "TQ", "TS", "TU", "TX", "TY", "UB", "UC", "UD", "UE", "UF", "UH", "UI", "UJ", "UK", "UL", "UN", "UO", "UP", "UQ", "UR", "UT", "UU", "UV", "UW", "UX", "VB", "VD", "VF", "VH", "VJ", "VK", "VL", "VM", "VO", "VP", "VQ", "VR", "VS", "VT", "VV", "VW", "VX", "VY", "VZ", "WA", "WB", "WC", "WD", "WE", "WG", "WH", "WI", "WJ", "WK", "WL", "WM", "WN", "WO", "WP", "WQ", "WR", "WT", "WU", "WV", "WW", "WX", "WY", "WZ", "XA", "XB", "XC", "XD", "XE", "XF", "XG", "XH", "XI", "XJ", "XK", "XL", "XM", "XN", "XO", "XP", "XQ", "XR", "XS", "XT", "XU", "XV", "XW", "XX", "XY", "XZ", "YA", "YB", "YC", "YF", "YG", "YH", "YI", "YJ", "YK", "YL", "YM", "YN", "YO", "YP", "YQ", "YR", "YS", "YV", "YW", "YX", "YY", "YZ", "ZB", "ZC", "ZD", "ZE", "ZF", "ZG", "ZH", "ZI", "ZJ", "ZK", "ZL", "ZN", "ZO", "ZP", "ZQ", "ZS", "ZT", "ZU", "ZV", "ZX", "ZY", "ZZ"];
    for(const value of [...assignedCountries.map(code=>'FRE-'+code.toLowerCase()+'-demo'),'en-US-ZZ','x-ZZ','i-klingon-ZZ','SCC-us','vi-VN-x-demo','en-Latn-US','i-klingon','I-MINGO-x-demo','i-lux','eng','fre','fra','qaa','qtz','mol','scc','scr','jaw','VI-vn-X-DEMO',capacity]){
      if(set(value)!=='true'||get()!==value||error()!=='0')throw Error('valid language '+value);
    }
    for(const bad of [...unassignedCountries.map(code=>'en-'+code),...reservedCountries.map(code=>'en-'+code),'i-madeup','I-UNKNOWN','i-klignon','i','a','A','abcd','abcdefgh','abcd-US','zz','ZZ','zz-US','zzz','ZZZ-a','en--US','en-','1en-US','en-abcdefghi','en_US',capacity+'a']){
      if(set(bad)!=='false'||error()!=='406'||get()!==capacity||error()!=='0')throw Error('malformed language '+bad);
    }
    if(set('')!=='true'||get()!==''||error()!=='0'||set(capacity)!=='true')throw Error('clear language');
    if(api.SetValue('cmi.objectives.0.id','urn:pear:language-objective')!=='true'||api.SetValue('cmi.interactions.0.id','urn:pear:language-interaction')!=='true'||api.SetValue('cmi.interactions.0.type','fill-in')!=='true')throw Error('language dependencies');
    const localizedFields=['cmi.comments_from_learner.0.comment','cmi.objectives.0.description','cmi.interactions.0.description','cmi.interactions.0.learner_response','cmi.interactions.0.correct_responses.0.pattern'];
    if(api.GetValue('cmi.entry')==='resume')for(const field of localizedFields)if(api.GetValue(field)!=='{lang=I-MINGO}Original historical IANA text')throw Error('IANA resume '+field);
    for(const field of localizedFields){
      const good='{lang=scc}Original historical text';for(const code of assignedCountries){const value='{lang=qaa-'+code+'}Original country text';if(api.SetValue(field,value)!=='true'||api.GetValue(field)!==value)throw Error('localized country '+field);}if(api.SetValue(field,good)!=='true'||api.GetValue(field)!==good)throw Error('localized language '+field);
      for(const primary of [...unassignedCountries.map(code=>'fre-'+code.toLowerCase()+'-demo'),...reservedCountries.map(code=>'fre-'+code.toLowerCase()+'-demo'),'i-madeup','I-UNKNOWN','i-klignon','i','zz','zzz','a','abcdefgh'])if(api.SetValue(field,'{lang='+primary+'}Rejected text')!=='false'||api.GetLastError()!=='406'||api.GetValue(field)!==good)throw Error('localized registry '+field);
    }
    for(const field of localizedFields)if(api.SetValue(field,'{lang=I-MINGO}Original historical IANA text')!=='true')throw Error('registered IANA '+field);
    const countryKey='cmi.comments_from_learner.1.comment',countryValue='{lang=FRE-su}Original historical country text';
    if(api.GetValue('cmi.entry')==='resume'&&api.GetValue(countryKey)!==countryValue)throw Error('country resume');
    if(api.SetValue(countryKey,countryValue)!=='true')throw Error('historical country write');
    document.getElementById('entry').textContent='Preference language preserved';}`;
  const f = await scormLearningFixture(undefined, interopPackage(edition, 'pipwerks', script)); f.enroll();
  const origin = 'http://127.0.0.1:4696', {app, scormContentApp: content} = await createApp({db: f.db, origin, developmentAuth: true, staticRoot: resolve('dist'), scormContent: {origin: 'http://localhost:4697', runtimeBundle: readFileSync('dist/scorm/runtime.js')}});
  try {
    await content!.listen({port: 4697, host: '127.0.0.1'}); await app.listen({port: 4696, host: '127.0.0.1'});
    await page.goto(origin); await page.getByLabel('Account', {exact: true}).fill('learner-a'); await page.getByLabel('Password', {exact: true}).fill('learner-a-dev'); await page.getByRole('button', {name: 'Sign in', exact: true}).click();
    await page.getByRole('button', {name: 'My learning', exact: true}).click();
    await page.locator('.learning-row').filter({has: page.getByRole('heading', {name: 'Original SCORM course', exact: true})}).getByRole('button', {name: 'Continue learning', exact: true}).click();
    const player = page.getByLabel('Enrolled SCORM player', {exact: true}), outer = page.frameLocator('iframe[title="Isolated SCORM engine player"]'), sco = outer.frameLocator('iframe[title="SCORM SCO"]');
    await player.getByLabel('I consent to SCORM progress tracking for this enrollment.', {exact: true}).check(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Preference language preserved', {exact: true})).toBeVisible();
    // pipwerks commits its initial incomplete status before this explicit save.
    await expect(player.getByRole('status')).toContainText('saved by the server');
    const initialRevision = Number(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision);
    const initialReceipts = Number(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n);
    let dropped = false, original = '';
    await page.route('**/launch/*/checkpoint', async route => {
      const payload = route.request().postData()!;
      if (!dropped) {original = payload; dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); await route.abort();}
      else {expect(payload).toBe(original); await route.continue();}
    });
    await sco.getByRole('button', {name: 'Store licensed progress', exact: true}).click(); await expect(outer.getByRole('status')).toContainText('has not been acknowledged');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    await player.getByRole('button', {name: 'Retry engine checkpoint', exact: true}).click(); await expect(player.getByRole('status')).toContainText('saved by the server');
    expect(f.db.prepare('SELECT revision FROM scorm_sco_attempts').get()!.revision).toBe(initialRevision + 1);
    expect(f.db.prepare('SELECT count(*) n FROM scorm_engine_checkpoints').get()!.n).toBe(initialReceipts + 1); await page.unroute('**/launch/*/checkpoint');
    const stored = JSON.parse(f.db.prepare('SELECT runtime_state FROM scorm_sco_attempts').get()!.runtime_state as string);
    expect(stored.comments_from_learner['1'].comment).toBe('{lang=FRE-su}Original historical country text');
    expect(stored.learner_preference.language).toBe(capacity); for(const value of [stored.comments_from_learner['0'].comment,stored.objectives['0'].description,stored.interactions['0'].description,stored.interactions['0'].learner_response,stored.interactions['0'].correct_responses['0'].pattern])expect(value).toBe('{lang=I-MINGO}Original historical IANA text'); expect(stored.completion_status).toBe('incomplete');
    await player.getByRole('button', {name: 'Close SCO and choose another', exact: true}).click(); await player.getByRole('button', {name: /Introduction/}).click();
    await expect(sco.getByText('Preference language preserved', {exact: true})).toBeVisible();
    expect(f.db.prepare('SELECT count(*) n FROM scorm_completion_proofs').get()!.n).toBe(0);
  } finally {await page.close(); content!.server.closeAllConnections(); app.server.closeAllConnections(); await app.close(); f.db.close();}
});
