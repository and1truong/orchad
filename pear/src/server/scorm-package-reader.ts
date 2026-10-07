import {createHash} from 'node:crypto';
import yauzl from 'yauzl';
import {DOMParser, type Element} from '@xmldom/xmldom';
import type {SCORMActivity, SCORMManifest, SCORMResource, SCORMStandard} from '../shared/scorm-engine.ts';
import {crc32} from './scorm-archive.ts';
import {parseSequencing, parseSequencingCollections} from './scorm-sequencing-parser.ts';
import {reject} from './errors.ts';

export const packageLimits = {archive: 32 * 1024 * 1024, expanded: 64 * 1024 * 1024, file: 16 * 1024 * 1024, files: 2048, manifest: 1024 * 1024};
const decoder = new TextDecoder('utf-8', {fatal: true});
function invalid(message: string): never {return reject('INVALID_ARGUMENT', 'Invalid SCORM package: ' + message);}
export function packagePath(value: string) {
  if (!value || value.length > 512 || value.normalize('NFC') !== value || /[\\\u0000-\u001f\u007f?#:]/.test(value) || value.startsWith('/') || value.split('/').some(x => !x || x === '.' || x === '..')) invalid('unsafe or ambiguous resource path');
  return value;
}

export async function readSCORMPackage(bytes: Buffer) {
  if (!bytes.length || bytes.length > packageLimits.archive) invalid('archive quota exceeded');
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.fromBuffer(bytes, {lazyEntries: true, strictFileNames: true, validateEntrySizes: true}, (error, file) => error || !file ? reject(error ?? Error('ZIP unavailable')) : resolve(file)));
  if (zip.entryCount > packageLimits.files) {zip.close(); invalid('file-count quota exceeded');}
  return new Promise<Map<string, Buffer>>((resolve, rejectPromise) => {
    const files = new Map<string, Buffer>(), paths = new Set<string>();
    let expanded = 0, finished = false;
    const fail = (error: unknown) => {if (finished) return; finished = true; zip.close(); rejectPromise(error);};
    zip.on('error', fail);
    zip.on('end', () => {if (!finished) {finished = true; resolve(files);}});
    zip.on('entry', (entry: yauzl.Entry) => {
      try {
        const directory = entry.fileName.endsWith('/'), path = packagePath(directory ? entry.fileName.slice(0, -1) : entry.fileName);
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (paths.has(path) || (mode !== 0 && mode !== 0x8000 && mode !== 0x4000) || (entry.generalPurposeBitFlag & 1)) invalid('duplicate, encrypted or special entry');
        paths.add(path);
        if (directory) {if (entry.uncompressedSize !== 0) invalid('directory contains data'); zip.readEntry(); return;}
        if (mode === 0x4000 || ![0, 8].includes(entry.compressionMethod) || entry.uncompressedSize > packageLimits.file || expanded + entry.uncompressedSize > packageLimits.expanded || !Number.isSafeInteger(entry.uncompressedSize)) invalid('resource quota or compression unsupported');
        expanded += entry.uncompressedSize;
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {fail(error ?? Error('ZIP stream unavailable')); return;}
          const chunks: Buffer[] = []; let size = 0;
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > entry.uncompressedSize || size > packageLimits.file) {stream.destroy(); fail(Error('SCORM expanded resource quota exceeded')); return;}
            chunks.push(chunk);
          });
          stream.on('end', () => {
            if (finished) return;
            const data = Buffer.concat(chunks);
            if (size !== entry.uncompressedSize || crc32(data) !== entry.crc32) {fail(Error('SCORM resource length/CRC mismatch')); return;}
            files.set(path, data); zip.readEntry();
          });
        });
      } catch (e) {fail(e);}
    });
    zip.readEntry();
  });
}

const XML = 'http://www.w3.org/XML/1998/namespace';
const CP12 = 'http://www.adlnet.org/xsd/adlcp_rootv1p2', CP2004 = 'http://www.adlnet.org/xsd/adlcp_v1p3';
const IMS12 = 'http://www.imsproject.org/xsd/imscp_rootv1p1p2', IMS2004 = 'http://www.imsglobal.org/xsd/imscp_v1p1';
function elements(parent: Element, name?: string, namespace?: string | null) {
  const result: Element[] = [];
  for (let n = parent.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) {
    const el = n as Element;
    if ((!name || el.localName === name) && (namespace === undefined || el.namespaceURI === namespace)) result.push(el);
  }
  return result;
}
function one(parent: Element, name: string, ns: string) {
  const found = elements(parent, name, ns);
  if (found.length !== 1) invalid('exactly one ' + name + ' required');
  return found[0]!;
}
function label(parent: Element, ns: string) {const value = one(parent, 'title', ns).textContent?.trim() ?? ''; if (!value || value.length > 500) invalid('bounded title required'); return value;}

/** Resolve local manifest URIs while refusing root escape, scheme and encoded traversal. */
export function packageURI(base: string, relative: string, allowRoot = false) {
  if (!relative || /[\\\u0000-\u001f]/.test(relative) || /^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.startsWith('/')) invalid('remote or absolute launch URI unsupported');
  const directory = base.endsWith('/') ? base : base.slice(0, base.lastIndexOf('/') + 1);
  const pathAndSuffix = relative.match(/^([^?#]*)([?#].*)?$/)!;
  const parts = directory.split('/').filter(Boolean);
  for (const raw of pathAndSuffix[1]!.split('/')) {
    let part: string;
    try {part = decodeURIComponent(raw);} catch {invalid('invalid resource URI encoding');}
    if (/[\\/\u0000-\u001f]/.test(part!)) invalid('encoded resource separator');
    if (!part || part === '.') continue;
    if (part === '..') {if (!parts.length) invalid('resource URI escapes package'); parts.pop();}
    else parts.push(part);
  }
  const path = allowRoot && !parts.length ? '' : packagePath(parts.join('/'));
  return {path, suffix: pathAndSuffix[2] ?? ''};
}

export function inspectManifest(files: Map<string, Buffer>): SCORMManifest {
  const bytes = files.get('imsmanifest.xml');
  if (!bytes || bytes.length > packageLimits.manifest) invalid('root imsmanifest.xml required within quota');
  let xml: string;
  try {xml = decoder.decode(bytes);} catch {invalid('manifest must be UTF-8');}
  if (/<!DOCTYPE|<!ENTITY/i.test(xml!) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml!)) invalid('DTD/entities or control characters forbidden');
  let root: Element;
  try {root = new DOMParser({onError: () => {throw Error('Malformed manifest XML');}}).parseFromString(xml!, 'application/xml').documentElement!;} catch {invalid('malformed manifest XML');}
  const ns = root!.namespaceURI;
  if (root!.localName !== 'manifest' || ![IMS12, IMS2004].includes(ns!)) invalid('SCORM packaging namespace unsupported');
  let count = 0; const features = new Set<string>(), stack = [{node: root!, depth: 0}];
  while (stack.length) {
    const {node, depth} = stack.pop()!;
    if (++count > 12000 || depth > 32) invalid('manifest node/depth quota');
    if ([CP12, CP2004].includes(node.namespaceURI ?? '') && ['prerequisites', 'maxtimeallowed', 'timelimitaction', 'datafromlms', 'masteryscore', 'dataFromLMS', 'timeLimitAction', 'completionThreshold', 'data'].includes(node.localName ?? '')) {
      const parent = node.parentNode as Element;
      if (parent?.localName !== 'item' || parent.namespaceURI !== ns) invalid('misplaced runtime extension');
      features.add(node.localName!);
    }
    if (node.namespaceURI === 'http://www.imsglobal.org/xsd/imsss' && ['sequencing', 'sequencingCollection'].includes(node.localName!)) {
      const parent = node.parentNode as Element;
      if (node.localName === 'sequencing' && !(['item', 'organization'].includes(parent?.localName ?? '') && parent.namespaceURI === ns || parent?.localName === 'sequencingCollection' && parent.namespaceURI === node.namespaceURI)) invalid('misplaced sequencing definition');
      if (node.localName === 'sequencingCollection' && parent !== root!) invalid('misplaced sequencing collection');
      features.add(node.localName!);
    }
    if (node.namespaceURI === 'http://www.adlnet.org/xsd/adlseq_v1p3' || node.namespaceURI === 'http://www.adlnet.org/xsd/adlnav_v1p3') features.add('unsupportedNavigationExtension');
    for (const n of elements(node)) stack.push({node: n, depth: depth + 1});
  }
  const metadata = one(root!, 'metadata', ns!), schema = one(metadata, 'schema', ns!).textContent?.trim(), edition = one(metadata, 'schemaversion', ns!).textContent?.trim();
  if (schema !== 'ADL SCORM') invalid('SCORM schema marker required');
  const editions: Record<string, SCORMStandard> = {'1.2': '1.2', '2004 2nd Edition': '2004-2', '2004 3rd Edition': '2004-3', '2004 4th Edition': '2004-4'};
  const standard = editions[edition ?? ''];
  if (!standard || (standard === '1.2' ? ns !== IMS12 : ns !== IMS2004)) invalid('exact supported SCORM edition required');
  const collections = parseSequencingCollections(root!, standard);
  const cp = standard === '1.2' ? CP12 : CP2004;
  const ids = new Set<string>();
  const id = (el: Element) => {const value = el.getAttribute('identifier') ?? ''; if (!value || value.length > 256 || ids.has(value)) invalid('missing/duplicate/oversized identifier'); ids.add(value); return value;};
  const identifier = id(root!);
  const localBase = (el: Element, parent: string) => {const value = el.getAttributeNS(XML, 'base'); if (!value) return parent; const uri = packageURI(parent, value, true); if (uri.suffix) invalid('xml:base cannot contain query or fragment'); return uri.path + (uri.path && value.endsWith('/') ? '/' : '');};
  const rootBase = localBase(root!, '');
  const resourceRoot = one(root!, 'resources', ns!), resourcesBase = localBase(resourceRoot, rootBase), resources: SCORMResource[] = [];
  for (const el of elements(resourceRoot, 'resource', ns!)) {
    const rid = id(el), resourceBase = localBase(el, resourcesBase), type = el.getAttributeNS(cp, standard === '1.2' ? 'scormtype' : 'scormType');
    if (el.getAttribute('type') !== 'webcontent' || !['sco', 'asset'].includes(type ?? '')) invalid('SCORM webcontent SCO/asset required');
    const href = el.getAttribute('href'), entry = href ? packageURI(resourceBase, href) : null;
    if (type === 'sco' && !entry) invalid('SCO launch href required');
    const declared = elements(el, 'file', ns!).map(f => packageURI(localBase(f, resourceBase), f.getAttribute('href') ?? '').path);
    if (entry && !files.has(entry.path) || declared.some(path => !files.has(path))) invalid('referenced package resource missing');
    resources.push({id: rid, kind: type as 'sco' | 'asset', href: entry ? entry.path + entry.suffix : '', files: declared, dependencies: elements(el, 'dependency', ns!).map(d => d.getAttribute('identifierref') ?? '')});
  }
  const resourceIds = new Set(resources.map(r => r.id));
  if (!resources.some(r => r.kind === 'sco') || resources.some(r => r.dependencies.some(d => !resourceIds.has(d)))) invalid('SCO or resource dependency missing');
  const organizations = one(root!, 'organizations', ns!), orgs = elements(organizations, 'organization', ns!);
  const org = orgs.find(o => o.getAttribute('identifier') === organizations.getAttribute('default')) ?? (orgs.length === 1 ? orgs[0] : undefined);
  if (!org) invalid('default organization unavailable');
  const organizationId = id(org), title = label(org, ns!);
  const activity = (el: Element): SCORMActivity => {
    const visibility = el.getAttribute('isvisible');
    if (visibility !== null && !['true', 'false', '1', '0'].includes(visibility)) invalid('invalid activity visibility');
    const aid = id(el), resourceId = el.getAttribute('identifierref') || undefined, parameters = el.getAttribute('parameters') || undefined;
    if (resourceId && !resourceIds.has(resourceId)) invalid('activity references unknown resource');
    if (parameters && (parameters.length > 2048 || /[\u0000-\u001f]/.test(parameters))) invalid('activity parameters quota');
    const pre = elements(el, 'prerequisites', cp);
    if (pre.length > 1 || pre.some(p => p.getAttribute('type') && p.getAttribute('type') !== 'aicc_script')) invalid('unsupported prerequisite type');
    const prerequisites = pre[0]?.textContent?.trim();
    const extensions: Partial<SCORMActivity> = {};
    if (standard === '1.2') {
      for (const [tag, key] of [['datafromlms', 'launchData'], ['masteryscore', 'masteryScore'], ['maxtimeallowed', 'maxTimeAllowed'], ['timelimitaction', 'timeLimitAction']] as const) {
        const nodes = elements(el, tag, cp); if (nodes.length > 1) invalid('duplicate runtime extension');
        if (nodes.length) extensions[key] = tag === 'datafromlms' ? nodes[0].textContent ?? '' : nodes[0].textContent?.trim() ?? '';
      }
      if (extensions.launchData !== undefined && extensions.launchData.length > 4096 || extensions.masteryScore !== undefined && (!/^\d{1,3}(?:\.\d+)?$/.test(extensions.masteryScore) || Number(extensions.masteryScore) > 100) || extensions.maxTimeAllowed !== undefined && !/^\d{2,4}:[0-5]\d:[0-5]\d(?:\.\d{1,2})?$/.test(extensions.maxTimeAllowed) || extensions.timeLimitAction !== undefined && !['exit,message', 'exit,no message', 'continue,message', 'continue,no message'].includes(extensions.timeLimitAction)) invalid('invalid runtime launch data, mastery or time policy');
    }
    if (standard !== '1.2') {
      for (const [tag, key] of [['dataFromLMS', 'launchData'], ['timeLimitAction', 'timeLimitAction']] as const) {
        const nodes = elements(el, tag, cp); if (nodes.length > 1) invalid('duplicate runtime extension');
        if (nodes.length) extensions[key] = tag === 'dataFromLMS' ? nodes[0].textContent ?? '' : nodes[0].textContent?.trim() ?? '';
      }
      if (extensions.launchData !== undefined && extensions.launchData.length > 4000 || extensions.timeLimitAction !== undefined && !['exit,message', 'exit,no message', 'continue,message', 'continue,no message'].includes(extensions.timeLimitAction)) invalid('invalid SCORM 2004 launch data or time policy');
      const thresholds = elements(el, 'completionThreshold', cp); if (thresholds.length > 1) invalid('duplicate completion threshold');
      if (thresholds.length) {
        const n = thresholds[0], text = n.textContent?.trim() ?? '', attrs = Array.from({length: n.attributes.length}, (_, i) => n.attributes.item(i)!);
        const numeric = (value: string) => /^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)$/.test(value);
        if (attrs.length) {
          if (standard !== '2004-4' || text || attrs.some(a => a.namespaceURI || !['completedByMeasure', 'minProgressMeasure', 'progressWeight'].includes(a.name))) invalid('completion threshold attributes require 4th edition');
          const enabled = n.getAttribute('completedByMeasure') ?? 'false', minimum = n.getAttribute('minProgressMeasure') ?? '1', weight = n.getAttribute('progressWeight') ?? '1';
          if (!['true', 'false', '1', '0'].includes(enabled) || !numeric(minimum) || !numeric(weight)) invalid('invalid completion threshold attributes');
          if (['true', '1'].includes(enabled)) extensions.completionThreshold = minimum;
          extensions.completionMeasure = {completedByMeasure: ['true', '1'].includes(enabled), minProgressMeasure: Number(minimum), progressWeight: Number(weight)};
        } else if (text) {if (!numeric(text)) invalid('invalid completion threshold'); extensions.completionThreshold = text;}
      }
    }
    return {id: aid, title: label(el, ns!), ...(visibility !== null ? {isVisible: visibility !== 'false' && visibility !== '0'} : {}), ...(resourceId ? {resourceId} : {}), ...(parameters ? {parameters} : {}), ...(prerequisites ? {prerequisites} : {}), ...extensions, ...(standard !== '1.2' ? {sequencing: parseSequencing(el, standard, collections)} : {}), children: elements(el, 'item', ns!).map(activity)};
  };
  const activities = elements(org, 'item', ns!).map(activity);
  if (!activities.length) invalid('organization activity tree required');
  const qualifiedGlobal = org.getAttributeNS('http://www.adlnet.org/xsd/adlseq_v1p3', 'objectivesGlobalToSystem'), legacyGlobal = org.getAttribute('objectivesGlobalToSystem');
  if (qualifiedGlobal && legacyGlobal && qualifiedGlobal !== legacyGlobal) invalid('conflicting objective scope');
  const global = qualifiedGlobal || legacyGlobal || 'true';
  if (!['true', 'false', '1', '0'].includes(global)) invalid('invalid objective scope');
  // XML ID uniqueness spans the document, including unselected organizations.
  const documentIds = new Set([root!, ...Array.from(root!.getElementsByTagNameNS(ns!, '*'))].map(n => n.getAttribute('identifier')).filter(Boolean));
  if ([...collections.keys()].some(id => documentIds.has(id))) invalid('duplicate sequencing identifier');
  return {standard, identifier, title, organizationId, activities, resources, ...(standard !== '1.2' ? {sequencing: parseSequencing(org, standard, collections), objectivesGlobalToSystem: !['false', '0'].includes(global)} : {}), runtimeFeatures: [...features].sort()};
}

export async function inspectSCORMPackage(bytes: Buffer) {
  const files = await readSCORMPackage(bytes), manifest = inspectManifest(files);
  return {files, manifest, sha256: createHash('sha256').update(bytes).digest('hex'), expandedBytes: [...files.values()].reduce((n, b) => n + b.length, 0)};
}
