// @orchard/bridge-contract — the single implementation of the Agent App
// Bridge 0.1 contract helpers. Every POC imports these; per-repo extensions
// live beside this file, not inside it. Bounds here mirror the "Giới hạn
// envelope" section of the root `contract` document — keep them in sync.

// No JSON-Schema compile step anywhere below: validation is interpreted so it
// runs under MV3 CSP (no eval/new Function) and every host — lime, coconut,
// the portable agent-client and the mango gateway — applies byte-identical
// semantics from this one implementation.

// Envelope bounds shared by every host and app (contract §9). The identity
// ceilings apply to requestId, idempotencyKey, toolCallId, sessionId,
// targetId, pageInstanceId, appId, documentId and sessionEpoch.
export const Bounds = {
  /** requestId, idempotencyKey, toolCallId, sessionId, targetId, pageInstanceId */
  id: 128,
  /** appId, documentId, sessionEpoch */
  appId: 128,
  documentId: 128,
  sessionEpoch: 128,
  /** tool name (also matches /^[A-Za-z0-9_-]{1,64}$/) */
  toolName: 64,
  description: 4096,
  summary: 8192,
  errorMessage: 8192,
  title: 1024,
  /** max entries of a context selectionIds array */
  selectionIds: 256,
  /** serialized Call/Result/message envelope cap (64 KiB) */
  message: 65536,
  /** tools per catalog */
  tools: 64,
  /** live MCP sessions per host: reject new ones (fail-closed, no eviction) */
  sessions: 64,
  /** guidance defaults: page dispatch timeout and human approval TTL */
  dispatchTimeoutMs: 10_000,
  approvalTtlMs: 60_000,
} as const;

export const Codes = [
  "INVALID_ARGUMENT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "STALE_CONTEXT",
  "IDEMPOTENCY_CONFLICT",
  "APPROVAL_DENIED",
  "CANCELLED",
  "TIMEOUT",
  "TARGET_CLOSED",
  "UNSUPPORTED",
  "INTERNAL",
] as const;
export type Code = (typeof Codes)[number];

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export type Result = {
  ok: boolean;
  revision: number | null;
  data: Json;
  error: { code: Code; message: string; retryable: boolean } | null;
};

export type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  effect: "read" | "write" | "destructive";
  outputSchema?: Record<string, unknown>;
};

export type Context = {
  appId: string;
  documentId: string;
  revision: number;
  selectionIds: string[];
  summary: string;
  sessionEpoch?: string | null;
};

export type Description = {
  protocolVersion: "0.1";
  appId: string;
  tools: Tool[];
};

export type Call = {
  requestId: string;
  documentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  expectedRevision: number;
  idempotencyKey: string;
};

export type Target = {
  targetId: string;
  title: string;
};

export type Binding = { targetId: string; pageInstanceId: string };

// Deterministic JSON serialization: object keys sorted, no whitespace. Used
// for approval arg-pinning and target-binding equality across hosts.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

// `success` takes the payload first: the arg order (data, revision) is part of
// the shared signature — the previous per-repo (revision, data) ordering was
// an interop footgun when porting code between POCs.
export const success = (
  data: unknown,
  revision: number | null = null,
): Result => ({
  ok: true,
  revision,
  data: data as Json,
  error: null,
});

// `failure` mirrors the Result shape; `revision` stays last and optional since
// failures typically carry none. Messages are clamped to the error bound so a
// large upstream message cannot produce a Result that exceeds it.
export const failure = (
  code: Code,
  message: string,
  retryable = false,
  revision: number | null = null,
): Result => ({
  ok: false,
  revision,
  data: null,
  error: { code, message: message.slice(0, 8000), retryable },
});

// Byte cap check for a serialized envelope (contract message cap).
export function withinMessageCap(value: unknown): boolean {
  const encoded = JSON.stringify(value);
  return (
    encoded !== undefined &&
    new TextEncoder().encode(encoded).length <= Bounds.message
  );
}

// Bounded page-declared schema dialect. Combinators are allowed with a
// fan-out cap; '$id', '$schema', '$ref'/'$defs' and 'format' stay excluded
// (process-wide $id registration, unsupported drafts, divergent annotation
// semantics), as do patternProperties/propertyNames/dependentSchemas/
// contains/if-then-else and unevaluated* to keep the dialect a small closed
// set.
export const SAFE_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "prefixItems",
  "enum",
  "const",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "description",
  "title",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$comment",
  "pattern",
  "uniqueItems",
  "oneOf",
  "anyOf",
  "allOf",
  "not",
]);

// ---------------------------------------------------------------------------
// `pattern` executes inside the trusted host on every argument check. The JS
// RegExp engine backtracks exponentially on ambiguous shapes — ^(a|aa)+$ or
// (a+)+ on a long non-matching string wedges the event loop where no
// AbortSignal can reach. The dialect therefore ships its own matcher: a
// Thompson-NFA simulation whose cost is bounded by program x input steps
// (plus a hard step budget), so ANYTHING safePattern accepts runs in bounded
// linear time — the gate does not need to guess which shapes backtrack.
// safePattern stays fail closed: whatever this engine cannot parse or bound
// is refused, and the `pattern` keyword is never silently skipped.
//
// Supported subset: literals, the usual escapes (\d\w\s and negations, \b\B,
// \n\r\t\f\v\0, \xHH, \uHHHH, \u{...}, escaped metachars and identity escapes),
// character classes with ranges and negation, '.', '^', '$', groups
// (capturing and (?:...)), alternation, and greedy/lazy quantifiers
// (* + ? {n} {n,} {n,m}). Refused: lookarounds, named groups, backreferences,
// \k \p \P \c escapes, \B inside classes, and repeat bounds above 255.
// ---------------------------------------------------------------------------

type CharRanges = [number, number][];
type Re =
  | { k: "cls"; ranges: CharRanges; negate: boolean }
  | { k: "cat"; xs: Re[] }
  | { k: "alt"; xs: Re[] }
  | { k: "rep"; x: Re; min: number; max: number | null }
  | { k: "as"; t: "bos" | "eos" | "wb" | "nwb" };

const DIGITS: CharRanges = [[48, 57]];
const WORD_CHARS: CharRanges = [
  [48, 57],
  [65, 90],
  [95, 95],
  [97, 122],
];
const SPACES: CharRanges = [
  [9, 13],
  [32, 32],
  [160, 160],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
  [0xfeff, 0xfeff],
];
// JS `.` without the s flag: every code point except line terminators.
const NON_LINE: CharRanges = [
  [10, 10],
  [13, 13],
  [0x2028, 0x2029],
];

const MAX_PATTERN_LENGTH = 256;
const MAX_PROGRAM = 4096;
const MAX_REPEAT = 255;
const MATCH_BUDGET = 4_000_000;

function complement(ranges: CharRanges): CharRanges {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: CharRanges = [];
  let next = 0;
  for (const [lo, hi] of sorted) {
    if (lo > next) out.push([next, lo - 1]);
    next = Math.max(next, hi + 1);
  }
  if (next <= 0x10ffff) out.push([next, 0x10ffff]);
  return out;
}

class PatternError extends Error {}

function parsePattern(src: string): Re {
  let i = 0;
  const n = src.length;
  let depth = 0;
  const bad = (m: string): never => {
    throw new PatternError(m);
  };
  const ch = (): number => {
    const c = src.codePointAt(i)!;
    i += c > 0xffff ? 2 : 1;
    return c;
  };
  const hex = (len: number): number => {
    if (i + len > n || !/^[0-9A-Fa-f]+$/.test(src.slice(i, i + len)))
      bad("bad hex escape");
    const v = parseInt(src.slice(i, i + len), 16);
    i += len;
    return v;
  };
  // One escape after '\': always returns range-atom form; assertions appear
  // only outside classes.
  const escape = (inClass: boolean): { ranges: CharRanges; single: number | null } | { as: "wb" | "nwb" } => {
    i++;
    if (i >= n) bad("trailing backslash");
    const c = src[i++];
    switch (c) {
      case "d": return { ranges: DIGITS, single: null };
      case "w": return { ranges: WORD_CHARS, single: null };
      case "s": return { ranges: SPACES, single: null };
      case "D": return { ranges: complement(DIGITS), single: null };
      case "W": return { ranges: complement(WORD_CHARS), single: null };
      case "S": return { ranges: complement(SPACES), single: null };
      case "n": return { ranges: [[10, 10]], single: 10 };
      case "r": return { ranges: [[13, 13]], single: 13 };
      case "t": return { ranges: [[9, 9]], single: 9 };
      case "f": return { ranges: [[12, 12]], single: 12 };
      case "v": return { ranges: [[11, 11]], single: 11 };
      case "0": return { ranges: [[0, 0]], single: 0 };
      case "b": return inClass ? { ranges: [[8, 8]], single: 8 } : { as: "wb" };
      case "B": if (!inClass) return { as: "nwb" }; return { ranges: [[66, 66]], single: 66 };
      case "x": return ((v) => ({ ranges: [[v, v]], single: v }))(hex(2));
      case "u": {
        if (src[i] === "{") {
          i++;
          const end = src.indexOf("}", i);
          if (end < 0 || !/^[0-9A-Fa-f]+$/.test(src.slice(i, end)))
            bad("bad unicode escape");
          const v = parseInt(src.slice(i, end), 16);
          if (v > 0x10ffff) bad("escape out of range");
          i = end + 1;
          return { ranges: [[v, v]], single: v };
        }
        return ((v) => ({ ranges: [[v, v]], single: v }))(hex(4));
      }
      default:
        if (/[1-9kKpPcC]/.test(c)) bad("unsupported escape");
        return { ranges: [[c.codePointAt(0)!, c.codePointAt(0)!]], single: c.codePointAt(0)! };
    }
  };
  const classAtom = (): { ranges: CharRanges; single: number | null } => {
    if (src[i] === "\\") return escape(true) as { ranges: CharRanges; single: number | null };
    const c = ch();
    return { ranges: [[c, c]], single: c };
  };
  const parseClass = (): Re => {
    i++; // '['
    let negate = false;
    if (src[i] === "^") {
      negate = true;
      i++;
    }
    let ranges: CharRanges = [];
    // A ']' closes the class immediately — '[]' is an empty class (JS parity).
    while (true) {
      if (i >= n) bad("unterminated class");
      if (src[i] === "]") {
        i++;
        break;
      }
      const a = classAtom();
      if (src[i] === "-" && src[i + 1] !== "]" && i + 1 < n) {
        i++;
        const b = classAtom();
        if (a.single == null || b.single == null || b.single < a.single)
          bad("bad class range");
        ranges.push([a.single as number, b.single as number]);
      } else ranges = ranges.concat(a.ranges);
    }
    return { k: "cls", ranges, negate };
  };
  const atom = (): Re => {
    const c = src[i];
    if (c === "(") {
      i++;
      if (src[i] === "?") {
        // Only (?:...) is in the dialect: lookarounds, named groups and flag
        // groups are refused rather than approximated.
        if (src[i + 1] !== ":") bad("unsupported group");
        i += 2;
      }
      depth++;
      const x = alt();
      if (src[i] !== ")") bad("unbalanced group");
      i++;
      depth--;
      return x;
    }
    if (c === "[") return parseClass();
    if (c === ".") {
      i++;
      return { k: "cls", ranges: NON_LINE, negate: true };
    }
    if (c === "^") {
      i++;
      return { k: "as", t: "bos" };
    }
    if (c === "$") {
      i++;
      return { k: "as", t: "eos" };
    }
    if (c === "\\") {
      const e = escape(false);
      if ("as" in e) return { k: "as", t: e.as };
      return { k: "cls", ranges: e.ranges, negate: false };
    }
    if ("*+?|)".includes(c)) bad("quantifier or metachar with no atom");
    const cp = ch();
    return { k: "cls", ranges: [[cp, cp]], negate: false };
  };
  const quantifier = (): { min: number; max: number | null } => {
    const c = src[i];
    let q: { min: number; max: number | null } | null = null;
    if (c === "*") q = { min: 0, max: null };
    else if (c === "+") q = { min: 1, max: null };
    else if (c === "?") q = { min: 0, max: 1 };
    else if (c === "{") {
      const m = /^\{(\d{1,3})(?:,(\d{0,3}))?\}/.exec(src.slice(i));
      if (m) {
        const min = parseInt(m[1], 10);
        const max = m[2] === undefined ? min : m[2] === "" ? null : parseInt(m[2], 10);
        if (min > MAX_REPEAT || (max !== null && (max > MAX_REPEAT || max < min)))
          bad("repeat out of bounds");
        q = { min, max };
        i += m[0].length;
      }
      // A '{' that is not a valid quantifier stays a literal char (Annex-B
      // JS semantics), so nothing is consumed here.
    }
    if (!q) return { min: 1, max: 1 };
    if (c !== "{") i++;
    if (src[i] === "?") i++; // lazy marker: same language, ignored
    return q;
  };
  const seq = (): Re => {
    const xs: Re[] = [];
    while (i < n && src[i] !== "|" && (depth === 0 || src[i] !== ")")) {
      const a = atom();
      const q = quantifier();
      xs.push(q.min === 1 && q.max === 1 ? a : { k: "rep", x: a, min: q.min, max: q.max });
    }
    return xs.length === 1 ? xs[0] : { k: "cat", xs };
  };
  const alt = (): Re => {
    const xs = [seq()];
    while (src[i] === "|") {
      i++;
      xs.push(seq());
    }
    return xs.length === 1 ? xs[0] : { k: "alt", xs };
  };
  const top = alt();
  if (i !== n) bad("trailing metachars");
  return top;
}

type Inst =
  | { op: "char"; ranges: CharRanges; negate: boolean }
  | { op: "split"; a: number; b: number }
  | { op: "jmp"; to: number }
  | { op: "assert"; t: "bos" | "eos" | "wb" | "nwb" }
  | { op: "match" };

type Patch = { at: number; field: "a" | "b" | "to" };

function compileRe(x: Re, prog: Inst[]): { start: number; outs: Patch[] } {
  if (prog.length > MAX_PROGRAM) throw new PatternError("program too large");
  switch (x.k) {
    case "cls":
      prog.push({ op: "char", ranges: x.ranges, negate: x.negate });
      return { start: prog.length - 1, outs: [] };
    case "as":
      prog.push({ op: "assert", t: x.t });
      return { start: prog.length - 1, outs: [] };
    case "cat": {
      let start = -1;
      for (const c of x.xs) {
        const f = compileRe(c, prog);
        if (start < 0) start = f.start;
        for (const o of f.outs) setPatch(prog, o, prog.length);
      }
      if (start < 0) start = prog.length;
      return { start, outs: [] };
    }
    case "alt": {
      const splits: number[] = [];
      const outs: Patch[] = [];
      let start = -1;
      for (let j = 0; j < x.xs.length; j++) {
        if (j < x.xs.length - 1) {
          splits.push(prog.length);
          prog.push({ op: "split", a: 0, b: 0 });
          if (j > 0) (prog[splits[j - 1]] as { b: number }).b = prog.length - 1;
        } else if (j > 0) (prog[splits[j - 1]] as { b: number }).b = prog.length;
        const f = compileRe(x.xs[j], prog);
        if (start < 0) start = f.start;
        if (j < x.xs.length - 1) {
          (prog[splits[j]] as { a: number }).a = f.start;
          outs.push(...f.outs, { at: prog.length, field: "to" });
          prog.push({ op: "jmp", to: 0 });
        } else outs.push(...f.outs);
      }
      return { start, outs };
    }
    case "rep": {
      // Fragment-internal exits always patch to the end of that fragment
      // (prog.length right after it compiles); only this rep's own dangling
      // exits — the split.b of its star/optional copies — are propagated.
      let start = -1;
      const outs: Patch[] = [];
      const child = (): number => {
        const f = compileRe(x.x, prog);
        if (start < 0) start = f.start;
        for (const o of f.outs) setPatch(prog, o, prog.length);
        return f.start;
      };
      for (let k = 0; k < x.min; k++) child();
      if (x.max === null) {
        const s = prog.length;
        prog.push({ op: "split", a: 0, b: 0 });
        if (start < 0) start = s;
        (prog[s] as { a: number }).a = child();
        outs.push({ at: s, field: "b" });
        prog.push({ op: "jmp", to: s });
      } else {
        for (let k = x.min; k < x.max; k++) {
          const s = prog.length;
          prog.push({ op: "split", a: 0, b: 0 });
          const f = compileRe(x.x, prog);
          if (start < 0) start = s;
          (prog[s] as { a: number }).a = f.start;
          for (const o of f.outs) setPatch(prog, o, prog.length);
          outs.push({ at: s, field: "b" });
        }
      }
      if (start < 0) start = prog.length;
      return { start, outs };
    }
  }
}

function setPatch(prog: Inst[], o: Patch, to: number): void {
  (prog[o.at] as unknown as Record<string, number>)[o.field] = to;
}

function compilePattern(src: string): Inst[] {
  const prog: Inst[] = [];
  const f = compileRe(parsePattern(src), prog);
  for (const o of f.outs) setPatch(prog, o, prog.length);
  prog.push({ op: "match" });
  return prog;
}

function nfaMatch(prog: Inst[], input: string): boolean {
  const s = Array.from(input);
  const n = s.length;
  const word = s.map(
    (c) =>
      c === "_" ||
      (c >= "0" && c <= "9") ||
      (c >= "a" && c <= "z") ||
      (c >= "A" && c <= "Z"),
  );
  const assertOk = (t: string, pos: number): boolean =>
    t === "bos"
      ? pos === 0
      : t === "eos"
        ? pos === n
        : t === "wb"
          ? word[pos - 1] !== word[pos]
          : word[pos - 1] === word[pos];
  let budget = MATCH_BUDGET;
  const closure = (set: Set<number>, pc: number, pos: number): boolean => {
    // Dedup every visited pc, not just emitted threads: nested stars like
    // (a*)* would otherwise ping-pong through split/jmp forever.
    const seen = new Set<number>();
    const stack = [pc];
    while (stack.length) {
      if (--budget < 0) return false;
      const p = stack.pop()!;
      if (seen.has(p)) continue;
      seen.add(p);
      const ins = prog[p];
      if (ins.op === "jmp") stack.push(ins.to);
      else if (ins.op === "split") stack.push(ins.a, ins.b);
      else if (ins.op === "assert") {
        if (assertOk(ins.t, pos)) stack.push(p + 1);
      } else set.add(p);
    }
    return true;
  };
  const hit = (ins: { ranges: CharRanges; negate: boolean }, c: number): boolean => {
    let m = false;
    for (const [lo, hi] of ins.ranges)
      if (c >= lo && c <= hi) {
        m = true;
        break;
      }
    return ins.negate ? !m : m;
  };
  let cur = new Set<number>();
  // Unanchored search semantics (JSON Schema `pattern` is a search, not a
  // full match): the start thread may begin at every position. Threads merge
  // by pc, so dedup keeps this linear instead of exponential.
  for (let pos = 0; pos <= n; pos++) {
    if (!closure(cur, 0, pos)) return false;
    for (const pc of cur) if (prog[pc].op === "match") return true;
    if (pos === n) break;
    const c = s[pos].codePointAt(0)!;
    const nxt = new Set<number>();
    for (const pc of cur) {
      const ins = prog[pc];
      if (ins.op === "char" && hit(ins, c) && !closure(nxt, pc + 1, pos + 1))
        return false;
    }
    cur = nxt;
    if (--budget < 0) return false;
  }
  return false;
}

// Compile + run a dialect pattern against a string value. Unparseable or
// over-budget patterns fail closed rather than falling back to RegExp.
export function matchPattern(pattern: unknown, value: unknown): boolean {
  if (typeof pattern !== "string" || typeof value !== "string") return false;
  try {
    return nfaMatch(compilePattern(pattern), value);
  } catch {
    return false;
  }
}

export function safePattern(p: unknown): boolean {
  if (typeof p !== "string" || !p.length || p.length > MAX_PATTERN_LENGTH)
    return false;
  try {
    compilePattern(p);
    return true;
  } catch {
    return false;
  }
}

// Page-declared schemas are untrusted input, but they are compiled and
// executed inside the trusted host before approval. The dialect is the
// bounded subset below: combinators with a fan-out cap, uniqueItems only on
// small arrays, patterns under the bounded regex policy, value-type checks on
// every keyword, plus global subschema-count, depth and byte caps, so a
// hostile schema fails closed instead of wedging or crashing the process.
export function hostSafeSchema(
  schema: unknown,
  depth = 0,
  budget?: { count: number },
): boolean {
  if (depth === 0) budget = { count: 0 };
  if (++budget!.count > 128) return false;
  if (schema === true || schema === false) return true;
  if (schema === null || typeof schema !== "object" || Array.isArray(schema))
    return false;
  if (depth === 0 && JSON.stringify(schema).length > 8192) return false;
  if (depth > 6) return false;
  const s = schema as Record<string, unknown>;
  for (const k of Object.keys(s)) if (!SAFE_SCHEMA_KEYS.has(k)) return false;
  const sub = (v: unknown): boolean =>
    v === true ||
    v === false ||
    (v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      hostSafeSchema(v, depth + 1, budget));
  if (s.properties !== undefined) {
    const p = s.properties;
    if (
      p === null ||
      typeof p !== "object" ||
      Array.isArray(p) ||
      Object.keys(p).length > 64
    )
      return false;
    for (const v of Object.values(p)) if (!sub(v)) return false;
  }
  for (const k of ["items", "additionalProperties"] as const)
    if (
      s[k] !== undefined &&
      !(Array.isArray(s[k]) ? (s[k] as unknown[]).every(sub) : sub(s[k]))
    )
      return false;
  if (
    s.prefixItems !== undefined &&
    !(
      Array.isArray(s.prefixItems) &&
      s.prefixItems.length <= 16 &&
      s.prefixItems.every(sub)
    )
  )
    return false;
  for (const k of ["oneOf", "anyOf", "allOf"] as const)
    if (
      s[k] !== undefined &&
      !(
        Array.isArray(s[k]) &&
        s[k].length >= 1 &&
        s[k].length <= 16 &&
        (s[k] as unknown[]).every(sub)
      )
    )
      return false;
  if (s.not !== undefined && !sub(s.not)) return false;
  if (s.pattern !== undefined && !safePattern(s.pattern)) return false;
  if (s.uniqueItems !== undefined) {
    if (typeof s.uniqueItems !== "boolean") return false;
    // uniqueItems is O(n^2) pairwise at validation time; only permit it on
    // arrays already bounded by a small maxItems.
    if (
      s.uniqueItems === true &&
      !(
        Number.isInteger(s.maxItems) &&
        (s.maxItems as number) >= 0 &&
        (s.maxItems as number) <= 256
      )
    )
      return false;
  }
  if (
    s.required !== undefined &&
    !(
      Array.isArray(s.required) &&
      s.required.every(
        (t: unknown) => typeof t === "string" && t.length <= 256,
      )
    )
  )
    return false;
  if (
    s.type !== undefined &&
    !(
      typeof s.type === "string" ||
      (Array.isArray(s.type) &&
        s.type.every((t: unknown) => typeof t === "string"))
    )
  )
    return false;
  if (
    s.enum !== undefined &&
    (!Array.isArray(s.enum) || s.enum.length > 256)
  )
    return false;
  for (const k of [
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minProperties",
    "maxProperties",
  ] as const)
    if (
      s[k] !== undefined &&
      (typeof s[k] !== "number" || !Number.isFinite(s[k]))
    )
      return false;
  for (const k of ["deprecated", "readOnly", "writeOnly"] as const)
    if (s[k] !== undefined && typeof s[k] !== "boolean") return false;
  for (const k of ["description", "title", "$comment"] as const)
    if (s[k] !== undefined && typeof s[k] !== "string") return false;
  for (const k of ["const", "default", "examples"] as const)
    if (s[k] !== undefined && JSON.stringify(s[k]).length > 8192) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The single argument validator for the bounded dialect. Interpreted, so it
// runs under MV3 CSP, and — critically for interop — it is the ONLY argument
// validator: lime, coconut, the portable agent-client and the mango gateway
// all call this, so a descriptor that passes hostSafeSchema validates
// identically on every host. Draft semantics are pinned here rather than
// delegated to whatever default a per-host library picked (the Ajv draft-07
// drift on prefixItems, for example):
//
// - `type`, `enum`, `const`, `required`, `min/maxProperties`, numeric bounds
//   and `multipleOf`, `min/maxLength`, `pattern`, `min/maxItems`,
//   `uniqueItems`, `properties`/`additionalProperties`, and the combinators
//   `oneOf`/`anyOf`/`allOf`/`not` follow plain JSON Schema meaning.
// - `prefixItems` (and an `items` array, the draft-07 spelling of a tuple)
//   validates positionally. Elements beyond the tuple validate against
//   `items` when it is a schema/boolean and are REJECTED when `items` is
//   absent — the dialect stays closed instead of silently widening.
// - String length counts Unicode code points, matching the contract's
//   Unicode-char caps.
// ---------------------------------------------------------------------------

const sameJson = (a: unknown, b: unknown): boolean =>
  canonical(a) === canonical(b);

function typeMatches(t: string, v: unknown): boolean {
  switch (t) {
    case "null": return v === null;
    case "boolean": return typeof v === "boolean";
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "integer": return Number.isInteger(v);
    case "string": return typeof v === "string";
    case "array": return Array.isArray(v);
    case "object":
      return typeof v === "object" && v !== null && !Array.isArray(v);
    default: return false;
  }
}

export function matchSchema(s: unknown, v: unknown): boolean {
  if (s === true) return true;
  if (s === false) return false;
  const o = s as Record<string, unknown>;
  if (o.const !== undefined && !sameJson(o.const, v)) return false;
  if (Array.isArray(o.enum) && !o.enum.some((e) => sameJson(e, v)))
    return false;
  if (o.type !== undefined) {
    const types = Array.isArray(o.type) ? o.type : [o.type];
    if (
      !types.some(
        (t) => typeof t === "string" && typeMatches(t as string, v),
      )
    )
      return false;
  }
  if (typeof v === "number") {
    if (o.minimum !== undefined && v < (o.minimum as number)) return false;
    if (o.maximum !== undefined && v > (o.maximum as number)) return false;
    if (o.exclusiveMinimum !== undefined && v <= (o.exclusiveMinimum as number))
      return false;
    if (o.exclusiveMaximum !== undefined && v >= (o.exclusiveMaximum as number))
      return false;
    if (o.multipleOf !== undefined) {
      const q = v / (o.multipleOf as number);
      if (Math.abs(q - Math.round(q)) > 1e-9 * Math.max(1, Math.abs(q)))
        return false;
    }
  }
  if (typeof v === "string") {
    const len = Array.from(v).length;
    if (o.minLength !== undefined && len < (o.minLength as number))
      return false;
    if (o.maxLength !== undefined && len > (o.maxLength as number))
      return false;
    if (o.pattern !== undefined && !matchPattern(o.pattern, v)) return false;
  }
  if (Array.isArray(v)) {
    if (o.minItems !== undefined && v.length < (o.minItems as number))
      return false;
    if (o.maxItems !== undefined && v.length > (o.maxItems as number))
      return false;
    if (o.uniqueItems === true) {
      for (let a = 0; a < v.length; a++)
        for (let b = a + 1; b < v.length; b++)
          if (sameJson(v[a], v[b])) return false;
    }
    const prefix = Array.isArray(o.prefixItems)
      ? (o.prefixItems as unknown[])
      : Array.isArray(o.items)
        ? (o.items as unknown[])
        : null;
    if (prefix) {
      for (let i = 0; i < prefix.length && i < v.length; i++)
        if (!matchSchema(prefix[i], v[i])) return false;
      if (v.length > prefix.length) {
        // Tuple extras: `items` schema validates them; no `items` closes the
        // tuple, so extra elements fail rather than slipping through.
        if (o.items === undefined || Array.isArray(o.items)) return false;
        if (o.items === false) return false;
        if (o.items !== true)
          for (let i = prefix.length; i < v.length; i++)
            if (!matchSchema(o.items, v[i])) return false;
      }
    } else if (
      o.items !== undefined &&
      o.items !== true &&
      !Array.isArray(o.items)
    ) {
      if (o.items === false) return v.length === 0;
      for (const e of v) if (!matchSchema(o.items, e)) return false;
    }
  }
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (o.minProperties !== undefined && keys.length < (o.minProperties as number))
      return false;
    if (o.maxProperties !== undefined && keys.length > (o.maxProperties as number))
      return false;
    if (Array.isArray(o.required))
      for (const r of o.required as unknown[])
        if (!Object.prototype.hasOwnProperty.call(obj, r as string))
          return false;
    const declared =
      o.properties !== null && typeof o.properties === "object"
        ? (o.properties as Record<string, unknown>)
        : {};
    for (const [k, sub] of Object.entries(declared))
      if (k in obj && !matchSchema(sub, obj[k])) return false;
    for (const k of keys) {
      if (k in declared) continue;
      if (o.additionalProperties === false) return false;
      if (
        o.additionalProperties !== undefined &&
        o.additionalProperties !== true &&
        !matchSchema(o.additionalProperties, obj[k])
      )
        return false;
    }
  }
  if (Array.isArray(o.oneOf)) {
    let n = 0;
    for (const sub of o.oneOf) if (matchSchema(sub, v)) n++;
    if (n !== 1) return false;
  }
  if (Array.isArray(o.anyOf) && !o.anyOf.some((sub) => matchSchema(sub, v)))
    return false;
  if (Array.isArray(o.allOf) && !o.allOf.every((sub) => matchSchema(sub, v)))
    return false;
  if (o.not !== undefined && matchSchema(o.not, v)) return false;
  return true;
}

// Validates args against a schema already inside the bounded dialect (the
// hostSafeSchema gate is re-checked here so direct callers stay fail closed).
// For schemas the caller already trusts — e.g. the gateway's own published
// api.schema.json envelopes, which legitimately exceed dialect caps — call
// matchSchema directly instead: it applies the same keyword semantics
// without re-running the untrusted-input gate.
export function validateArgs(schema: unknown, args: unknown): boolean {
  if (!hostSafeSchema(schema)) return false;
  try {
    return matchSchema(schema, args);
  } catch {
    return false;
  }
}

export function validateArguments(
  tool: { inputSchema: Record<string, unknown> },
  args: unknown,
): boolean {
  return validateArgs(tool.inputSchema, args);
}
