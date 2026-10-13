import {randomUUID} from 'node:crypto';
import {DOMParser, type Element} from '@xmldom/xmldom';
import {packageLimits, packageURI, readSCORMPackage} from './scorm-package-reader.ts';
import {reject} from './errors.ts';

export const cmi5Namespace = 'https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd';
export const cmi5Moves = ['NotApplicable', 'Passed', 'Completed', 'CompletedAndPassed', 'CompletedOrPassed'] as const;
export type CMI5Move = typeof cmi5Moves[number];
export interface CMI5Node {id: string; activityId: string; title: string; names: Record<string,string>; descriptions: Record<string,string>; auIds: string[]}
export interface CMI5AU extends CMI5Node {href: string; remote?: boolean; moveOn: CMI5Move; launchMethod: 'AnyWindow' | 'OwnWindow'; masteryScore?: number; launchParameters?: string; entitlementKey?: string; activityType?: string}
export interface CMI5Manifest {profile: 'pear-cmi5-quartz-local/1' | 'pear-cmi5-quartz/2'; sourceFormat?: 'zip' | 'xml'; course: CMI5Node; blocks: CMI5Node[]; aus: CMI5AU[]}
export function cmi5Invalid(message: string): never {return reject('INVALID_ARGUMENT', 'Invalid cmi5 profile: ' + message);}
export function cmi5IRI(v: unknown): v is string {return typeof v === 'string' && v.length <= 2048 && /^[a-z][a-z0-9+.-]*:[^\s<>"{}|\\^`]+$/i.test(v) && !/[\u0000-\u001f\u007f]/.test(v);}
const children = (el: Element) => Array.from(el.childNodes).filter(n => n.nodeType === 1) as Element[];
function one(el: Element, name: string, optional = false) {
  const found = children(el).filter(n => n.localName === name && n.namespaceURI === cmi5Namespace);
  if (found.length !== (optional && !found.length ? 0 : 1)) cmi5Invalid('exactly one ' + name + ' required');
  return found[0];
}
function shape(el: Element, allowed: string[], attrs: string[] = [], repeated: string[] = [], unordered = false) {
  if (el.namespaceURI !== cmi5Namespace) cmi5Invalid('unsupported XML namespace');
  for (const attr of Array.from(el.attributes)) if ((!attr.namespaceURI || attr.namespaceURI === cmi5Namespace) && !attrs.includes(attr.name)) cmi5Invalid('unsupported XML attribute');
  let previous = -1; const seen = new Set<string>();
  let extension = false;
  for (const n of children(el)) {
    if (n.namespaceURI && n.namespaceURI !== cmi5Namespace) {extension = true;continue;}
    const name = n.localName!, index = allowed.indexOf(name);
    // AUs and blocks share the same repeated choice position in the XSD.
    const rank = name === 'block' && allowed.includes('au') ? allowed.indexOf('au') : index;
    if (extension || n.namespaceURI !== cmi5Namespace || index < 0 || !unordered && rank < previous || seen.has(name) && !repeated.includes(name)) cmi5Invalid('unsupported, duplicate or misplaced XML element');
    previous = rank; seen.add(name);
  }
  for (const n of Array.from(el.childNodes)) if ((n.nodeType === 3 || n.nodeType === 4) && n.nodeValue?.trim()) cmi5Invalid('unexpected XML text');
}
function text(el: Element | undefined, max = 4096) {
  if (!el || children(el).length || (el.textContent?.length ?? 0) > max) cmi5Invalid('bounded plain XML text required');
  return (el.textContent ?? '').trim();
}
function languageMap(el: Element) {
  shape(el, ['langstring'], [], ['langstring']);
  const result: Record<string,string> = Object.create(null);
  for (const n of children(el).filter(n => n.namespaceURI === cmi5Namespace)) {
    const lang = n.getAttribute('lang');
    if (!lang || !/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i.test(lang) || Object.hasOwn(result, lang.toLowerCase()) || Array.from(n.attributes).some(a => a.name !== 'lang' && (!a.namespaceURI || a.namespaceURI === cmi5Namespace))) cmi5Invalid('unique language tags required');
    result[lang.toLowerCase()] = text(n);
  }
  if (!Object.keys(result).length || Object.keys(result).length > 16) cmi5Invalid('1–16 localized strings required');
  return result;
}
export function cmi5RemoteURL(href: string) {
  if (href.length > 4096 || /[\s\\\u0000-\u001f\u007f]/.test(href)) cmi5Invalid('invalid remote AU URL');
  let url: URL;try {url = new URL(href);}catch {cmi5Invalid('absolute remote AU URL required');}
  if (url!.username || url!.password || url!.protocol !== 'https:' && !(url!.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url!.hostname))) cmi5Invalid('HTTPS or loopback HTTP AU without userinfo required');
  if (['endpoint','fetch','actor','registration','activityId'].some(k => url!.searchParams.has(k))) cmi5Invalid('reserved AU launch query name');
  return url!.href;
}
export async function inspectCMI5Package(bytes: Buffer, format: 'zip' | 'xml' = 'zip') {
  if (!bytes.length || bytes.length > (format === 'xml' ? packageLimits.manifest : packageLimits.archive)) cmi5Invalid('package format quota exceeded');
  const files = format === 'xml' ? new Map([['cmi5.xml',bytes]]) : await readSCORMPackage(bytes), raw = files.get('cmi5.xml');
  if (!raw || raw.length > packageLimits.manifest) cmi5Invalid('root cmi5.xml required within quota');
  let xml: string;
  try {xml = new TextDecoder('utf-8', {fatal: true}).decode(raw);} catch {cmi5Invalid('UTF-8 XML required');}
  if (/<!DOCTYPE|<!ENTITY/i.test(xml!) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml!)) cmi5Invalid('DTD/entities/control characters forbidden');
  let root: Element;
  try {root = new DOMParser({onError: () => {throw Error('Malformed XML');}}).parseFromString(xml!, 'application/xml').documentElement!;} catch {cmi5Invalid('malformed XML');}
  if (root!.localName !== 'courseStructure') cmi5Invalid('courseStructure required');
  const ids = new Set<string>(), objectiveIds = new Set<string>(), refs: string[] = [], aus: CMI5AU[] = [], blocks: CMI5Node[] = [];
  let count = 0;
  const stack = [{el: root!, depth: 0}];
  while (stack.length) {const {el,depth} = stack.pop()!; if (++count > 16000 || depth > 32) cmi5Invalid('XML node/depth quota'); for (const n of children(el)) stack.push({el:n,depth:depth+1});}
  function id(el: Element) {const value = el.getAttribute('id'); if (!cmi5IRI(value) || ids.has(value)) cmi5Invalid('unique absolute publisher IRI required'); ids.add(value); return value;}
  function node(el: Element): CMI5Node {
    const names = languageMap(one(el,'title')!), descriptions = languageMap(one(el,'description')!);
    const title = Object.values(names)[0]!.trim(); if (!title || title.length > 500) cmi5Invalid('bounded title required');
    return {id:id(el), activityId:'urn:uuid:' + randomUUID(), title, names, descriptions, auIds:[]};
  }
  function objectives(el: Element | undefined, references: boolean) {
    if (!el) return; shape(el,['objective'],[],['objective']); if (!children(el).length) cmi5Invalid('empty objectives');
    for (const n of children(el).filter(n => n.namespaceURI === cmi5Namespace)) {
      shape(n,references ? [] : ['title','description'],[references ? 'idref' : 'id'],[],!references);
      if (references) {const v = n.getAttribute('idref'); if (!cmi5IRI(v)) cmi5Invalid('objective IRI reference required'); refs.push(v);}
      else {const v = id(n); objectiveIds.add(v); languageMap(one(n,'title')!); languageMap(one(n,'description')!);}
    }
  }
  shape(root!,['course','objectives','au','block'],[],['au','block']);
  const courseEl = one(root!,'course')!; shape(courseEl,['title','description'],['id']); const course = node(courseEl);
  objectives(one(root!,'objectives',true),false);
  function visit(el: Element): string[] {
    if (el.localName === 'block') {
      shape(el,['title','description','objectives','au','block'],['id'],['au','block']);
      const block = node(el); objectives(one(el,'objectives',true),true); blocks.push(block);
      block.auIds = children(el).filter(n => n.namespaceURI === cmi5Namespace && ['au','block'].includes(n.localName!)).flatMap(visit);
      if (!block.auIds.length) cmi5Invalid('block requires an AU'); return block.auIds;
    }
    shape(el,['title','description','objectives','url','launchParameters','entitlementKey'],['id','moveOn','masteryScore','launchMethod','activityType']);
    const value = node(el); objectives(one(el,'objectives',true),true);
    const href = text(one(el,'url')).trim(), remote = /^[a-z][a-z0-9+.-]*:/i.test(href);
    let entry: string;
    if (remote) entry = cmi5RemoteURL(href);
    else {
      if (format === 'xml') cmi5Invalid('standalone XML requires fully qualified AU URLs');
      const resolved = packageURI('',href), launch = new URL('https://package.invalid/' + href);
      if (!files.has(resolved.path) || !/\.html?$/i.test(resolved.path) || ['endpoint','fetch','actor','registration','activityId'].some(k => launch.searchParams.has(k))) cmi5Invalid('local HTML AU required without reserved query names');
      entry = resolved.path.split('/').map(encodeURIComponent).join('/')+resolved.suffix;
    }
    const moveOn = el.getAttribute('moveOn') ?? 'NotApplicable', launchMethod = el.getAttribute('launchMethod') ?? 'AnyWindow', mastery = el.getAttribute('masteryScore'), activityType = el.getAttribute('activityType');
    if (!cmi5Moves.includes(moveOn as CMI5Move) || !['AnyWindow','OwnWindow'].includes(launchMethod)) cmi5Invalid('unsupported moveOn/launchMethod');
    if (mastery !== null && (!/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/.test(mastery))) cmi5Invalid('masteryScore must be 0–1 with four decimal places');
    if (activityType !== null && !cmi5IRI(activityType)) cmi5Invalid('activityType IRI required');
    const optional = (name: string) => {const n = one(el,name,true); return n ? text(n) : undefined;};
    aus.push({...value,href:entry,remote,moveOn:moveOn as CMI5Move,launchMethod:launchMethod as CMI5AU['launchMethod'],...(mastery !== null ? {masteryScore:Number(mastery)} : {}),...(activityType ? {activityType} : {}),launchParameters:optional('launchParameters'),entitlementKey:optional('entitlementKey')});
    return [value.id];
  }
  course.auIds = children(root!).filter(n => n.namespaceURI === cmi5Namespace && ['au','block'].includes(n.localName!)).flatMap(visit);
  if (!aus.length || aus.length > 2048 || refs.some(v => !objectiveIds.has(v))) cmi5Invalid('1–2048 AUs and resolved objectives required');
  const manifest: CMI5Manifest = {profile:format === 'xml' || aus.some(a => a.remote) ? 'pear-cmi5-quartz/2' : 'pear-cmi5-quartz-local/1',sourceFormat:format,course,blocks,aus};
  return {files,manifest};
}
