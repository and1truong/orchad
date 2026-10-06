import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { makeApp, login, ORIGIN } from "./helpers.ts";
import { forceStaleStep, scenarios } from "../src/harness/fake-mango.ts";

// Host-side replay of the harness: fake Mango proposes calls, the host
// approves/denies, approved calls go to /api/invoke with the same envelope
// discipline lime applies (reads null revision+key, writes both).
async function runScenario(
  app: Awaited<ReturnType<typeof makeApp>>["app"],
  scenarioId: string,
  decisions: ("approved" | "denied")[],
) {
  const jar = await login(app, "learner1", "learner-dev");
  const revisions = new Map<string, number>();
  let lastEnrollmentId = "";
  const out: { decision: string; code: string | null; ok: boolean }[] = [];
  const sc = scenarios.find((s) => s.id === scenarioId)!;
  for (let i = 0; i < sc.steps.length; i++) {
    const step = sc.steps[i];
    const documentId = step.documentId
      .replace("{self}", "learner1")
      .replace("{lastEnrollmentId}", lastEnrollmentId);
    if (decisions[i] === "denied") {
      out.push({ decision: "denied", code: "APPROVAL_DENIED", ok: false });
      continue;
    }
    const expected = revisions.get(documentId) ?? 0;
    const res = await app.inject({
      method: "POST",
      url: "/api/invoke",
      headers: {
        origin: ORIGIN,
        cookie: jar.cookies,
        "x-csrf-token": jar.csrf,
        "content-type": "application/json",
      },
      payload: {
        requestId: randomUUID(),
        documentId,
        toolName: step.toolName,
        arguments: JSON.parse(
          JSON.stringify(step.arguments).replaceAll(
            "{lastEnrollmentId}",
            lastEnrollmentId,
          ),
        ),
        expectedRevision: step.write
          ? forceStaleStep(scenarioId, i)
            ? expected - 1
            : expected
          : null,
        idempotencyKey: step.write ? randomUUID() : null,
      },
    });
    const body = res.json();
    if (body.revision != null) revisions.set(documentId, body.revision);
    if (body.ok && step.toolName === "learning_enroll")
      lastEnrollmentId = body.data.enrollmentId;
    out.push({
      decision: "approved",
      code: body.ok ? null : body.error.code,
      ok: body.ok,
    });
  }
  return out;
}

test("host flow: search → approve enroll → read my learning", async () => {
  const { app } = await makeApp();
  const out = await runScenario(app, "search-enroll", [
    "approved",
    "approved",
    "approved",
  ]);
  assert.equal(out[0].ok, true);
  assert.equal(out[1].ok, true);
  assert.equal(out[2].ok, true);
});

test("host flow: deny mid-scenario skips the call entirely", async () => {
  const { app } = await makeApp();
  const out = await runScenario(app, "search-enroll", [
    "approved",
    "denied",
    "approved",
  ]);
  assert.equal(out[1].code, "APPROVAL_DENIED");
  assert.equal(out[1].ok, false);
  // Denied call never reached the app: workspace revision only bumped by reads? no —
  // reads don't bump; only the (denied) write would have. My-learning read still works.
  assert.equal(out[2].ok, true);
});

test("quiz boundary: agent cannot complete prerequisites, start_attempt FORBIDDEN", async () => {
  const { app } = await makeApp();
  const out = await runScenario(app, "quiz-blocked", [
    "approved",
    "approved",
    "approved",
  ]);
  assert.equal(out[0].ok, true); // enroll ok
  assert.equal(out[1].code, "FORBIDDEN"); // prerequisites unmet
  assert.equal(out[2].ok, true); // progress read ok
});

test("RBAC deny: learner proposing admin tools gets FORBIDDEN on both", async () => {
  const { app } = await makeApp();
  const out = await runScenario(app, "rbac-deny", ["approved", "approved"]);
  assert.equal(out[0].code, "FORBIDDEN");
  assert.equal(out[1].code, "FORBIDDEN");
});

test("stale retry: forced-stale write → STALE_CONTEXT then success", async () => {
  const { app } = await makeApp();
  const out = await runScenario(app, "stale-retry", [
    "approved",
    "approved",
    "approved",
  ]);
  assert.equal(out[0].ok, true);
  assert.equal(out[1].code, "STALE_CONTEXT");
  assert.equal(out[2].ok, true);
});
