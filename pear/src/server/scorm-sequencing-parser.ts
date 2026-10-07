import type {Element} from '@xmldom/xmldom';
import type {SCORMStandard} from '../shared/scorm-engine.ts';
import {reject} from './errors.ts';
const SN = 'http://www.imsglobal.org/xsd/imsss';
const fail = (): never => reject('INVALID_ARGUMENT', 'Unsupported or malformed SCORM sequencing definition');
function children(el: Element) {const out: Element[] = []; for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element); return out;}
function attrs(el: Element, names: string[]) {
  for (let i = 0; i < el.attributes.length; i++) {const a = el.attributes.item(i)!; if (a.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue; if (a.namespaceURI || !names.includes(a.name)) fail();}
}
function bool(el: Element, name: string) {const v = el.getAttribute(name); if (v === null) return undefined; if (!['true', 'false', '1', '0'].includes(v)) fail(); return v === 'true' || v === '1';}
function number(el: Element, name: string, min: number, max: number) {const v = el.getAttribute(name); if (v === null) return undefined; if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) || Number(v) < min || Number(v) > max) fail(); return Number(v);}
function flags(el: Element, names: string[]) {attrs(el, names); return Object.fromEntries(names.filter(n => el.hasAttribute(n)).map(n => [n, bool(el, n)]));}
const conditions = ['satisfied', 'objectiveStatusKnown', 'objectiveMeasureKnown', 'objectiveMeasureGreaterThan', 'objectiveMeasureLessThan', 'completed', 'activityProgressKnown', 'attempted', 'attemptLimitExceeded', 'always'];
const preActions = ['skip', 'disabled', 'hiddenFromChoice', 'stopForwardTraversal'];
function rule(el: Element, kind: string) {
  attrs(el, []); const nodes = children(el), cs = nodes.find(n => n.localName === 'ruleConditions'), action = nodes.find(n => n.localName === 'ruleAction');
  if (nodes.length !== 2 || !cs || !action || nodes.some(n => n.namespaceURI !== SN)) fail();
  attrs(cs!, ['conditionCombination']); attrs(action!, ['action']);
  const combination = cs!.getAttribute('conditionCombination') ?? 'all', value = action!.getAttribute('action');
  const actions = kind === 'preConditionRule' ? preActions : kind === 'exitConditionRule' ? ['exit'] : ['exitParent', 'exitAll', 'continue', 'previous'];
  // retry/retryAll require additional conformance coverage before accepting manifests.
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
      const base = ['readSatisfiedStatus', 'readNormalizedMeasure', 'writeSatisfiedStatus', 'writeNormalizedMeasure'];
      const fourth = ['readCompletionStatus', 'writeCompletionStatus', 'readProgressMeasure', 'writeProgressMeasure'];
      const names = edition === '2004-4' ? [...base, ...fourth] : base;
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
    sequencingDefinition(children(definition), edition); result.set(id!, definition);
  }
  return result;
}

function sequencingDefinition(nodes: Element[], edition: SCORMStandard) {
  const out: Record<string, any> = {}, seen = new Set<string>();
  for (const n of nodes) {
    if (n.namespaceURI !== SN || seen.has(n.localName!)) fail(); seen.add(n.localName!);
    switch (n.localName) {
      case 'controlMode': out.sequencingControls = {...out.sequencingControls, choice: true, choiceExit: true, flow: false, forwardOnly: false, useCurrentAttemptObjectiveInfo: true, useCurrentAttemptProgressInfo: true, ...flags(n, ['choice', 'choiceExit', 'flow', 'forwardOnly', 'useCurrentAttemptObjectiveInfo', 'useCurrentAttemptProgressInfo'])}; break;
      case 'constrainedChoiceConsiderations': out.sequencingControls = {...out.sequencingControls, ...flags(n, ['constrainChoice', 'preventActivation'])}; break;
      case 'deliveryControls': out.deliveryControls = flags(n, ['tracked', 'completionSetByContent', 'objectiveSetByContent']); break;
      case 'limitConditions': {
        attrs(n, ['attemptLimit']); const limit = number(n, 'attemptLimit', 1, 10000); if (limit !== undefined) {if (!Number.isInteger(limit)) fail(); out.attemptLimit = limit;} break;
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
  return out;
}
