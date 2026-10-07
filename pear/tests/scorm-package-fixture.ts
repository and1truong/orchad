import {zip} from './scorm-fixture.ts';
import type {SCORMStandard} from '../src/shared/scorm-engine.ts';
export function multiFileManifest(standard: SCORMStandard = '1.2') {
  const ns = standard === '1.2' ? 'http://www.imsproject.org/xsd/imscp_rootv1p1p2' : 'http://www.imsglobal.org/xsd/imscp_v1p1';
  const cp = standard === '1.2' ? 'http://www.adlnet.org/xsd/adlcp_rootv1p2' : 'http://www.adlnet.org/xsd/adlcp_v1p3';
  const edition = {'1.2': '1.2', '2004-2': '2004 2nd Edition', '2004-3': '2004 3rd Edition', '2004-4': '2004 4th Edition'}[standard];
  return `<?xml version="1.0" encoding="UTF-8"?><p:manifest identifier="original-multi" xmlns:p="${ns}" xmlns:runtime="${cp}">
    <p:metadata><p:schema>ADL SCORM</p:schema><p:schemaversion>${edition}</p:schemaversion></p:metadata>
    <p:organizations default="org"><p:organization identifier="org"><p:title>Original multi &amp; file package</p:title>
      <p:item identifier="intro" identifierref="sco1"><p:title>Introduction</p:title></p:item>
      <p:item identifier="practice" identifierref="sco2" parameters="?mode=practice"><p:title>Practice</p:title></p:item>
    </p:organization></p:organizations>
    <p:resources><p:resource identifier="sco1" type="webcontent" runtime:${standard === '1.2' ? 'scormtype' : 'scormType'}="sco" xml:base="lessons/" href="intro.html"><p:file href="intro.html"/><p:dependency identifierref="shared"/></p:resource>
      <p:resource identifier="sco2" type="webcontent" runtime:${standard === '1.2' ? 'scormtype' : 'scormType'}="sco" href="lessons/practice.html"><p:file href="lessons/practice.html"/></p:resource>
      <p:resource identifier="shared" type="webcontent" runtime:${standard === '1.2' ? 'scormtype' : 'scormType'}="asset"><p:file href="assets/player.js"/><p:file href="assets/style.css"/></p:resource>
    </p:resources></p:manifest>`;
}
export function multiFilePackage(standard: SCORMStandard = '1.2', xml = multiFileManifest(standard)) {
  return zip([
    {name: 'imsmanifest.xml', data: Buffer.from(xml), method: 8},
    {name: 'lessons/intro.html', data: Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="../assets/style.css"></head><body><h1>Introduction</h1><script src="../assets/player.js"></script></body></html>'), method: 8},
    {name: 'lessons/practice.html', data: Buffer.from('<!doctype html><html><body><h1>Practice</h1><script src="../assets/player.js"></script></body></html>'), method: 8},
    {name: 'assets/player.js', data: Buffer.from('const api=parent.API; api.LMSInitialize("");'), method: 8},
    {name: 'assets/style.css', data: Buffer.from('body { color: #123; }'), method: 8},
  ]);
}
