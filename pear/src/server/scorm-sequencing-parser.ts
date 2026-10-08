import type {Element} from '@xmldom/xmldom';
import type {SCORMStandard} from '../shared/scorm-engine.ts';
import {reject} from './errors.ts';
import {durationKeys, durationSeconds} from '../shared/scorm-duration.ts';
const SN = 'http://www.imsglobal.org/xsd/imsss';
const ADL = 'http://www.adlnet.org/xsd/adlseq_v1p3';
const NAV = 'http://www.adlnet.org/xsd/adlnav_v1p3';
const fail = (): never => reject('INVALID_ARGUMENT', 'Unsupported or malformed SCORM sequencing definition');
function children(el: Element) {const out: Element[] = []; for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element); return out;}
function attrs(el: Element, names: string[]) {
  for (let i = 0; i < el.attributes.length; i++) {const a = el.attributes.item(i)!; if (a.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue; if (a.namespaceURI || !names.includes(a.name)) fail();}
}
function bool(el: Element, name: string) {const v = el.getAttribute(name); if (v === null) return undefined; if (!['true', 'false', '1', '0'].includes(v)) fail(); return v === 'true' || v === '1';}
function number(el: Element, name: string, min: number, max: number) {const v = el.getAttribute(name); if (v === null) return undefined; if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) || Number(v) < min || Number(v) > max) fail(); return Number(v);}
// Delivery windows require an explicit timezone so every host enforces the
// same instant. Validate Gregorian dates before Date can normalize them.
function calendarLimit(el: Element, name: string) {
  const value = el.getAttribute(name); if (value === null) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) fail();
  const [year, month, day, hour, minute, second] = m!.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!year || month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 24 || minute > 59 || second > 59 || hour === 24 && (minute || second || Number(m![7] ?? 0))) fail();
  const zoneHours = Number(m![10] ?? 0), zoneMinutes = Number(m![11] ?? 0);
  if (zoneHours > 14 || zoneMinutes > 59 || zoneHours === 14 && zoneMinutes) fail();
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, Number((m![7] ?? '').padEnd(3, '0')));
  const offset = (zoneHours * 60 + zoneMinutes) * (m![9] === '-' ? -1 : 1);
  date.setTime(date.getTime() - offset * 60000);
  return date.toISOString();
}
function flags(el: Element, names: string[]) {attrs(el, names); return Object.fromEntries(names.filter(n => el.hasAttribute(n)).map(n => [n, bool(el, n)]));}

export function parsePresentation(item: Element, edition: SCORMStandard): string[] | undefined {
  const nodes = children(item).filter(n => n.namespaceURI === NAV && n.localName === 'presentation');
  if (!nodes.length) return undefined; if (nodes.length !== 1 || edition === '1.2') fail();
  attrs(nodes[0], []); const interfaces = children(nodes[0]);
  if (interfaces.length > 1 || interfaces.some(n => n.namespaceURI !== NAV || n.localName !== 'navigationInterface')) fail();
  if (!interfaces.length) return [];
  attrs(interfaces[0], []); const tokens = children(interfaces[0]); if (tokens.length > 64) fail();
  const allowed = ['continue', 'previous', 'exit', 'abandon', ...(edition === '2004-2' ? [] : ['exitAll', 'abandonAll', 'suspendAll'])];
  return [...new Set(tokens.map(n => {
    if (n.namespaceURI !== NAV || n.localName !== 'hideLMSUI' || children(n).length) fail(); attrs(n, []);
    const value = n.textContent?.trim() ?? ''; if (!allowed.includes(value)) fail(); return value;
  }))];
}

export function parseSharedData(item: Element, edition: SCORMStandard) {
  const cp = 'http://www.adlnet.org/xsd/adlcp_v1p3';
  const nodes = children(item).filter(n => n.namespaceURI === cp && n.localName === 'data');
  if (!nodes.length) return undefined; if (nodes.length !== 1 || edition !== '2004-4') fail();
  attrs(nodes[0], []); const maps = children(nodes[0]), ids = new Set<string>();
  if (!maps.length || maps.length > 64) fail();
  return maps.map(n => {
    if (n.namespaceURI !== cp || n.localName !== 'map' || children(n).length) fail(); attrs(n, ['targetID', 'readSharedData', 'writeSharedData']);
    const targetID = n.getAttribute('targetID');
    if (!targetID || targetID.length > 4000 || /\s|[\u0000-\u001f\u007f]/.test(targetID) || ids.has(targetID)) fail(); ids.add(targetID!);
    return {targetID: targetID!, readSharedData: bool(n, 'readSharedData') ?? true, writeSharedData: bool(n, 'writeSharedData') ?? false};
  });
}

function adlObjectives(el: Element, edition: SCORMStandard) {
  if (edition !== '2004-4') fail(); attrs(el, []); const list = children(el), ids = new Set<string>();
  if (!list.length || list.length > 1024) fail();
  return list.map(n => {
    if (n.namespaceURI !== ADL || n.localName !== 'objective') fail(); attrs(n, ['objectiveID']);
    const id = n.getAttribute('objectiveID'); if (!id || !id.trim() || id.length > 4000 || ids.has(id)) fail(); ids.add(id!);
    const mappings = children(n), targets = new Set<string>(); if (!mappings.length || mappings.length > 1024) fail();
    return {id, maps: mappings.map(m => {
      if (m.namespaceURI !== ADL || m.localName !== 'mapInfo' || children(m).length) fail();
      const read = ['readRawScore', 'readMinScore', 'readMaxScore', 'readCompletionStatus', 'readProgressMeasure'];
      const write = ['writeRawScore', 'writeMinScore', 'writeMaxScore', 'writeCompletionStatus', 'writeProgressMeasure'];
      attrs(m, ['targetObjectiveID', ...read, ...write]); const target = m.getAttribute('targetObjectiveID');
      if (!target || !target.trim() || target.length > 4000 || targets.has(target)) fail(); targets.add(target!);
      return {targetObjectiveID: target, ...Object.fromEntries(read.map(k => [k, bool(m, k) ?? true])), ...Object.fromEntries(write.map(k => [k, bool(m, k) ?? false]))};
    })};
  });
}
const conditions = ['satisfied', 'objectiveStatusKnown', 'objectiveMeasureKnown', 'objectiveMeasureGreaterThan', 'objectiveMeasureLessThan', 'completed', 'activityProgressKnown', 'attempted', 'attemptLimitExceeded', 'always'];
const preActions = ['skip', 'disabled', 'hiddenFromChoice', 'stopForwardTraversal'];
function rule(el: Element, kind: string) {
  attrs(el, []); const nodes = children(el), cs = nodes.find(n => n.localName === 'ruleConditions'), action = nodes.find(n => n.localName === 'ruleAction');
  if (nodes.length !== 2 || !cs || !action || nodes.some(n => n.namespaceURI !== SN)) fail();
  attrs(cs!, ['conditionCombination']); attrs(action!, ['action']);
  const combination = cs!.getAttribute('conditionCombination') ?? 'all', value = action!.getAttribute('action');
  const actions = kind === 'preConditionRule' ? preActions : kind === 'exitConditionRule' ? ['exit'] : ['exitParent', 'exitAll', 'continue', 'previous', 'retry', 'retryAll'];
  if (!['all', 'any'].includes(combination) || !actions.includes(value ?? '')) fail();
  const list = children(cs!); if (!list.length || list.length > 64) fail();
  return {action: value, conditionCombination: combination, conditions: list.map(n => {
    if (n.namespaceURI !== SN || n.localName !== 'ruleCondition' || children(n).length) fail();
    attrs(n, ['condition', 'operator', 'referencedObjective', 'measureThreshold']);
    const condition = n.getAttribute('condition'), operator = n.getAttribute('operator'), objective = n.getAttribute('referencedObjective'), threshold = number(n, 'measureThreshold', -1, 1);
    if (!conditions.includes(condition ?? '') || operator && !['noOp', 'not'].includes(operator) || objective && objective.length > 4000) fail();
    return {condition, ...(operator === 'not' ? {operator} : {}), ...(objective ? {referencedObjective: objective} : {}), ...(threshold !== undefined ? {parameters: {threshold}} : {})};
  })};
}
function objective(el: Element, edition: SCORMStandard) {
  attrs(el, ['objectiveID', 'satisfiedByMeasure']);
  const id = el.getAttribute('objectiveID') ?? ''; if (!id || id.length > 4000) fail();
  const out: Record<string, any> = {objectiveID: id, satisfiedByMeasure: bool(el, 'satisfiedByMeasure') ?? false, mapInfo: []};
  for (const n of children(el)) {
    if (n.namespaceURI !== SN) fail();
    if (n.localName === 'minNormalizedMeasure') {
      if (out.minNormalizedMeasure !== undefined || children(n).length) fail(); attrs(n, []);
      const value = n.textContent?.trim() ?? ''; if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || Number(value) < -1 || Number(value) > 1) fail(); out.minNormalizedMeasure = Number(value);
    } else if (n.localName === 'mapInfo') {
      // Fourth-edition score/completion/progress maps belong to adlseq:mapInfo,
      // not imsss:mapInfo. Keep the IMS namespace vocabulary schema-accurate.
      const names = ['readSatisfiedStatus', 'readNormalizedMeasure', 'writeSatisfiedStatus', 'writeNormalizedMeasure'];
      attrs(n, ['targetObjectiveID', ...names]); if (children(n).length) fail();
      const target = n.getAttribute('targetObjectiveID'); if (!target || target.length > 4000 || out.mapInfo.some((m: any) => m.targetObjectiveID === target)) fail();
      out.mapInfo.push({targetObjectiveID: target, ...Object.fromEntries(names.filter(k => n.hasAttribute(k)).map(k => [k, bool(n, k)]))});
    } else fail();
  }
  return out;
}
function rollup(el: Element) {
  attrs(el, ['rollupObjectiveSatisfied', 'rollupProgressCompletion', 'objectiveMeasureWeight']);
  const controls = {...Object.fromEntries(['rollupObjectiveSatisfied', 'rollupProgressCompletion'].filter(k => el.hasAttribute(k)).map(k => [k, bool(el, k)])), ...(el.hasAttribute('objectiveMeasureWeight') ? {objectiveMeasureWeight: number(el, 'objectiveMeasureWeight', 0, 1)} : {})};
  const rules = children(el).map(r => {
    if (r.namespaceURI !== SN || r.localName !== 'rollupRule') fail(); attrs(r, ['childActivitySet', 'minimumCount', 'minimumPercent']);
    const consideration = r.getAttribute('childActivitySet') ?? 'all', minimumCount = number(r, 'minimumCount', 0, 10000), minimumPercent = number(r, 'minimumPercent', 0, 1);
    if (!['all', 'any', 'none', 'atLeastCount', 'atLeastPercent'].includes(consideration) || minimumCount !== undefined && !Number.isInteger(minimumCount)) fail();
    const ns = children(r), cs = ns.find(n => n.localName === 'rollupConditions'), act = ns.find(n => n.localName === 'rollupAction');
    if (ns.length !== 2 || !cs || !act || ns.some(n => n.namespaceURI !== SN)) fail(); attrs(cs!, ['conditionCombination']); attrs(act!, ['action']);
    const combination = cs!.getAttribute('conditionCombination') ?? 'all', action = act!.getAttribute('action');
    if (!['all', 'any'].includes(combination) || !['satisfied', 'notSatisfied', 'completed', 'incomplete'].includes(action ?? '')) fail();
    const list = children(cs!); if (!list.length || list.length > 64) fail();
    return {consideration, minimumCount, minimumPercent, action, conditionCombination: combination, conditions: list.map(n => {
      if (n.namespaceURI !== SN || n.localName !== 'rollupCondition' || children(n).length) fail(); attrs(n, ['condition', 'operator']);
      const condition = n.getAttribute('condition'), operator = n.getAttribute('operator') ?? 'noOp';
      if (!['satisfied', 'objectiveStatusKnown', 'objectiveMeasureKnown', 'completed', 'progressKnown', 'attempted', 'attemptLimitExceeded', 'notAttempted', 'always'].includes(condition ?? '') || !['noOp', 'not'].includes(operator)) fail(); return {condition, operator};
    })};
  });
  return {controls, rules};
}
/** Translate only explicitly supported definitions. Unknown semantics fail before launch. */
export function parseSequencing(parent: Element, edition: SCORMStandard, collections: ReadonlyMap<string, Element> = new Map()): Record<string, any> | undefined {
  const nodes = children(parent).filter(n => n.namespaceURI === SN && n.localName === 'sequencing');
  if (!nodes.length) return undefined; if (nodes.length !== 1 || edition === '1.2') fail();
  const el = nodes[0]; attrs(el, ['IDRef']);
  const reference = el.getAttribute('IDRef');
  const referenced = reference === null ? undefined : collections.get(reference);
  if (reference !== null && !referenced) fail();
  // IMS SS XML Binding 3.2: replace an entire top-level XML group, not
  // individual settings. Compiling before translation also avoids the engine's
  // collection helper merging controls that the inline group must reset.
  const inline = children(el), keys = new Set(inline.map(n => `${n.namespaceURI}:${n.localName}`));
  const merged = [...(referenced ? children(referenced).filter(n => !keys.has(`${n.namespaceURI}:${n.localName}`)) : []), ...inline];
  return sequencingDefinition(merged, edition);
}

/** Collections are manifest-local, non-chainable and validated even if unused. */
export function parseSequencingCollections(manifest: Element, edition: SCORMStandard) {
  const nodes = children(manifest).filter(n => n.namespaceURI === SN && n.localName === 'sequencingCollection');
  const result = new Map<string, Element>();
  if (!nodes.length) return result;
  if (nodes.length !== 1 || edition === '1.2') fail();
  attrs(nodes[0], []); const definitions = children(nodes[0]);
  if (!definitions.length || definitions.length > 1024) fail();
  // xs:ID is an XML 1.0 NCName. Keep Unicode identifiers intact.
  const start = 'A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
  const ncName = new RegExp(`^[${start}][${start}0-9.\\-\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`, 'u');
  for (const definition of definitions) {
    if (definition.namespaceURI !== SN || definition.localName !== 'sequencing') fail();
    attrs(definition, ['ID']); const id = definition.getAttribute('ID');
    if (!id || id.length > 4000 || !ncName.test(id) || result.has(id)) fail();
    sequencingDefinition(children(definition), edition, false); result.set(id!, definition);
  }
  return result;
}

function sequencingDefinition(nodes: Element[], edition: SCORMStandard, resolveObjectives = true) {
  const out: Record<string, any> = {}, seen = new Set<string>();
  let extensions: ReturnType<typeof adlObjectives> | undefined;
  for (const n of nodes) {
    const key = `${n.namespaceURI}:${n.localName}`;
    if (![SN, ADL].includes(n.namespaceURI ?? '') || seen.has(key)) fail(); seen.add(key);
    if (n.namespaceURI === ADL) {
      if (n.localName === 'objectives') {extensions = adlObjectives(n, edition); continue;}
      if (children(n).length) fail();
      if (n.localName === 'constrainedChoiceConsiderations') out.sequencingControls = {...out.sequencingControls, constrainChoice: false, preventActivation: false, ...flags(n, ['constrainChoice', 'preventActivation'])};
      else if (n.localName === 'rollupConsiderations') {
        const names = ['requiredForSatisfied', 'requiredForNotSatisfied', 'requiredForCompleted', 'requiredForIncomplete']; attrs(n, [...names, 'measureSatisfactionIfActive']);
        out.rollupConsiderations = {measureSatisfactionIfActive: bool(n, 'measureSatisfactionIfActive') ?? true};
        for (const name of names) {const value = n.getAttribute(name) ?? 'always'; if (!['always', 'ifAttempted', 'ifNotSkipped', 'ifNotSuspended'].includes(value)) fail(); out.rollupConsiderations[name] = value;}
      } else fail();
      continue;
    }
    switch (n.localName) {
      case 'controlMode': out.sequencingControls = {...out.sequencingControls, choice: true, choiceExit: true, flow: false, forwardOnly: false, useCurrentAttemptObjectiveInfo: true, useCurrentAttemptProgressInfo: true, ...flags(n, ['choice', 'choiceExit', 'flow', 'forwardOnly', 'useCurrentAttemptObjectiveInfo', 'useCurrentAttemptProgressInfo'])}; break;
      case 'deliveryControls': out.deliveryControls = flags(n, ['tracked', 'completionSetByContent', 'objectiveSetByContent']); break;
      case 'randomizationControls': {
        attrs(n, ['randomizationTiming', 'selectCount', 'reorderChildren', 'selectionTiming']);
        const selectionTiming = n.getAttribute('selectionTiming') ?? 'never', randomizationTiming = n.getAttribute('randomizationTiming') ?? 'never';
        if (![selectionTiming, randomizationTiming].every(v => ['never', 'once', 'onEachNewAttempt'].includes(v))) fail();
        if (n.hasAttribute('selectCount') && !/^[+-]?\d+$/.test(n.getAttribute('selectCount')!)) fail();
        const selectCount = number(n, 'selectCount', 0, 2048); if (selectCount !== undefined && !Number.isInteger(selectCount)) fail();
        out.sequencingControls = {...out.sequencingControls, selectionTiming, randomizationTiming, selectCount: selectCount ?? null, randomizeChildren: bool(n, 'reorderChildren') ?? false};
        break;
      }
      case 'limitConditions': {
        attrs(n, ['attemptLimit', 'beginTimeLimit', 'endTimeLimit', ...durationKeys]); const limit = number(n, 'attemptLimit', 0, 10000); if (limit !== undefined) {if (!Number.isInteger(limit)) fail(); out.attemptLimit = limit;}
        for (const key of durationKeys) if (n.hasAttribute(key)) {try {out[key] = 'PT' + durationSeconds(n.getAttribute(key)!) + 'S';} catch {fail();}}
        const begin = calendarLimit(n, 'beginTimeLimit'), end = calendarLimit(n, 'endTimeLimit');
        if (begin !== undefined) out.beginTimeLimit = begin; if (end !== undefined) out.endTimeLimit = end;
        if (begin !== undefined && end !== undefined && Date.parse(begin) > Date.parse(end)) fail();
        break;
      }
      case 'sequencingRules': {
        attrs(n, []); out.sequencingRules = {};
        for (const r of children(n)) {if (r.namespaceURI !== SN || !['preConditionRule', 'exitConditionRule', 'postConditionRule'].includes(r.localName!)) fail(); (out.sequencingRules[r.localName + 's'] ??= []).push(rule(r, r.localName!));} break;
      }
      case 'objectives': {
        attrs(n, []); const ids = new Set<string>(); out.objectives = [];
        for (const o of children(n)) {
          if (o.namespaceURI !== SN || !['primaryObjective', 'objective'].includes(o.localName!)) fail(); const item = objective(o, edition);
          if (ids.has(item.objectiveID)) fail(); ids.add(item.objectiveID);
          if (o.localName === 'primaryObjective') {if (out.primaryObjective) fail(); out.primaryObjective = item;} else out.objectives.push(item);
        } break;
      }
      case 'rollupRules': {const r = rollup(n); out.rollupRules = {rules: r.rules}; out.sequencingControls = {...out.sequencingControls, ...r.controls}; break;}
      default: fail();
    }
    if (!['sequencingRules', 'objectives', 'rollupRules'].includes(n.localName!) && children(n).length) fail();
  }
  for (const extension of resolveObjectives ? extensions ?? [] : []) {
    const objective = [...(out.objectives ?? []), ...(out.primaryObjective ? [out.primaryObjective] : [])].find(o => o.objectiveID === extension.id);
    if (!objective) fail();
    for (const map of extension.maps) {
      const existing = objective.mapInfo.find((m: any) => m.targetObjectiveID === map.targetObjectiveID);
      if (existing) Object.assign(existing, map); else objective.mapInfo.push(map);
    }
  }
  return out;
}
