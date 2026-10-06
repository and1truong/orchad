#!/usr/bin/env node
// Validates the Pear P0 contract freeze against @orchard/bridge-contract:
//   - bridge/tool-catalog.json: bounded dialect, descriptor shape, caps
//   - fixtures/describe.json: tools deep-equal the catalog (no drift)
//   - bridge/policy-map.json: one entry per tool, consistent effect/enums
//   - fixtures/getContext.json + fixtures/invoke/*.json: contract envelopes
//
// Requires `npm ci && npm run build` in ../../packages/bridge-contract first.
// Usage: node scripts/validate-catalog.mjs   (from pear/)

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  Bounds,
  Codes,
  hostSafeSchema,
  validateArgs,
} from "../../packages/bridge-contract/dist/index.js";

const pear = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(pear, p), "utf8"));

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`FAIL ${msg}`);
};
const check = (cond, msg) => {
  if (!cond) fail(msg);
};

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EFFECTS = new Set(["read", "write", "destructive"]);
const CODE_SET = new Set(Codes);

// --- tool-catalog.json -----------------------------------------------------
const catalog = read("bridge/tool-catalog.json");
check(Array.isArray(catalog), "tool-catalog.json must be an array");
check(
  catalog.length <= Bounds.tools,
  `catalog has ${catalog.length} tools > cap ${Bounds.tools}`,
);
const byName = new Map();
for (const t of catalog) {
  check(
    t && typeof t === "object" && NAME_RE.test(t.name ?? ""),
    `tool descriptor has invalid name: ${JSON.stringify(t?.name)}`,
  );
  check(!byName.has(t.name), `duplicate tool name ${t.name}`);
  byName.set(t.name, t);
  check(
    EFFECTS.has(t.effect),
    `${t.name}: effect must be read|write|destructive`,
  );
  check(
    typeof t.description === "string" &&
      t.description.length > 0 &&
      t.description.length <= Bounds.description,
    `${t.name}: description missing or over ${Bounds.description} chars`,
  );
  check(
    t.inputSchema && t.inputSchema.type === "object",
    `${t.name}: inputSchema must be an object schema`,
  );
  check(
    hostSafeSchema(t.inputSchema),
    `${t.name}: inputSchema outside bounded host dialect`,
  );
}

// --- fixtures/describe.json -------------------------------------------------
const describeDoc = read("fixtures/describe.json");
check(
  describeDoc.protocolVersion === "0.1",
  "describe.protocolVersion must be '0.1'",
);
check(describeDoc.appId === "pear", "describe.appId must be 'pear'");
check(
  JSON.stringify(describeDoc.tools) === JSON.stringify(catalog),
  "describe.tools drifted from bridge/tool-catalog.json — regenerate fixtures/describe.json",
);

// --- fixtures/getContext.json -----------------------------------------------
const ctx = read("fixtures/getContext.json");
check(ctx.appId === "pear", "getContext.appId must be 'pear'");
check(
  typeof ctx.documentId === "string" && ctx.documentId.length > 0,
  "getContext.documentId must be a nonempty string",
);
check(
  /^[a-z]+:[a-zA-Z0-9_-]+$/.test(ctx.documentId),
  `getContext.documentId must use kind:id aggregate form (ADR 0001), got ${ctx.documentId}`,
);
check(
  Number.isInteger(ctx.revision) && ctx.revision >= 0,
  "getContext.revision must be a nonnegative integer",
);
check(
  Array.isArray(ctx.selectionIds) &&
    ctx.selectionIds.length <= Bounds.selectionIds,
  "getContext.selectionIds must be an array within cap",
);
check(
  typeof ctx.summary === "string" && ctx.summary.length <= Bounds.summary,
  "getContext.summary must be a string within cap",
);
check(
  ctx.sessionEpoch === undefined ||
    (typeof ctx.sessionEpoch === "string" &&
      ctx.sessionEpoch.length <= Bounds.sessionEpoch),
  "getContext.sessionEpoch must be a short opaque string when present",
);

// --- bridge/policy-map.json --------------------------------------------------
const policy = read("bridge/policy-map.json").tools;
const PHASES = new Set(["p1", "p2", "p3", "p4"]);
const ROLES = new Set([
  "learner",
  "manager",
  "content_admin",
  "assessor",
  "admin",
]);
const CONSENTS = new Set([
  "catalog",
  "lesson_content",
  "personal",
  "report",
  "admin_surface",
]);
const APPROVALS = new Set(["none", "required", "required_confirm"]);
const EGRESS = new Set(["metadata", "per_item_license", "personal", "scoped"]);
for (const [name, entry] of Object.entries(policy)) {
  check(byName.has(name), `policy-map references unknown tool ${name}`);
  const tool = byName.get(name);
  if (!tool) continue;
  check(
    entry.effect === tool.effect,
    `${name}: policy effect ${entry.effect} != catalog effect ${tool.effect}`,
  );
  check(PHASES.has(entry.phase), `${name}: bad phase ${entry.phase}`);
  check(
    Array.isArray(entry.roles) &&
      entry.roles.length > 0 &&
      entry.roles.every((r) => ROLES.has(r)),
    `${name}: roles must be nonempty subset of role matrix`,
  );
  check(CONSENTS.has(entry.consent), `${name}: bad consent ${entry.consent}`);
  check(
    APPROVALS.has(entry.approval),
    `${name}: bad approval ${entry.approval}`,
  );
  check(EGRESS.has(entry.egress), `${name}: bad egress ${entry.egress}`);
  if (tool.effect === "read") {
    check(
      entry.approval === "none",
      `${name}: reads must not require approval (consent-gated only)`,
    );
  } else {
    check(
      entry.approval === "required" || entry.approval === "required_confirm",
      `${name}: writes must require approval`,
    );
  }
}
for (const name of byName.keys()) {
  check(policy[name], `policy-map missing entry for catalog tool ${name}`);
}

// --- fixtures/invoke/*.json ---------------------------------------------------
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
for (const file of readdirSync(join(pear, "fixtures/invoke")).sort()) {
  if (!file.endsWith(".json")) continue;
  const fx = read(join("fixtures/invoke", file));
  const tag = `fixtures/invoke/${file}`;
  check(typeof fx.name === "string", `${tag}: missing name`);
  const req = fx.request;
  const res = fx.result;
  check(isObject(req), `${tag}: request must be an object`);
  check(isObject(res), `${tag}: result must be an object`);
  if (!isObject(req) || !isObject(res)) continue;

  check(
    typeof req.requestId === "string" &&
      req.requestId.length > 0 &&
      req.requestId.length <= Bounds.id,
    `${tag}: bad requestId`,
  );
  check(
    typeof req.documentId === "string" &&
      /^[a-z]+:[a-zA-Z0-9_-]+$/.test(req.documentId),
    `${tag}: documentId must use kind:id aggregate form`,
  );
  const tool = byName.get(req.toolName);
  check(tool, `${tag}: unknown toolName ${req.toolName}`);
  if (!tool) continue;

  if (tool.effect === "read") {
    check(
      req.expectedRevision === null && req.idempotencyKey === null,
      `${tag}: read ${tool.name} must carry null expectedRevision/idempotencyKey`,
    );
  } else {
    check(
      Number.isInteger(req.expectedRevision) && req.expectedRevision >= 0,
      `${tag}: write ${tool.name} needs nonnegative expectedRevision`,
    );
    check(
      typeof req.idempotencyKey === "string" &&
        req.idempotencyKey.length > 0 &&
        req.idempotencyKey.length <= Bounds.id,
      `${tag}: write ${tool.name} needs nonempty idempotencyKey`,
    );
  }
  check(
    validateArgs(tool.inputSchema, req.arguments),
    `${tag}: arguments fail ${tool.name} inputSchema`,
  );

  check(typeof res.ok === "boolean", `${tag}: result.ok must be boolean`);
  check(
    res.revision === null ||
      (Number.isInteger(res.revision) && res.revision >= 0),
    `${tag}: result.revision must be integer or null`,
  );
  if (res.ok) {
    check(res.error === null, `${tag}: ok result must carry error null`);
  } else {
    check(isObject(res.error), `${tag}: failed result needs error object`);
    if (isObject(res.error)) {
      check(
        CODE_SET.has(res.error.code),
        `${tag}: error.code ${res.error.code} not in contract enum`,
      );
      check(
        typeof res.error.message === "string" &&
          res.error.message.length <= Bounds.errorMessage,
        `${tag}: error.message invalid`,
      );
      check(
        typeof res.error.retryable === "boolean",
        `${tag}: error.retryable must be boolean`,
      );
    }
    check(res.data === null, `${tag}: failed result should carry data null`);
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log(
  `OK: ${catalog.length} tools, ${Object.keys(policy).length} policy entries, ` +
    `${readdirSync(join(pear, "fixtures/invoke")).filter((f) => f.endsWith(".json")).length} invoke fixtures validated`,
);
