// Canonical Agent App Bridge 0.1 scenario runner. Each host drives its real
// Policy + fixture through packages/bridge-contract/scenario/bridge-scenario.json with this driver
// contract:
//
//   host = {
//     target,                            // pinned TargetDescriptor
//     listTargets() -> Result,
//     getContext(target) -> Result,
//     listTools(target) -> Result,
//     call(call, { approve, signal }) -> Result,  // full Call envelope; the
//                                              // driver resolves any approval
//     dispatched() -> number,            // fixture invoke count
//     revision() -> number,              // latest known fixture revision
//     readsConsented: boolean            // whether this host auto-runs reads
//   }
//
// checkExpect supports: ok, code (string|string[]), data (subset),
// hasTargetId, documentId, integerRevision, protocolVersion, tool, effect,
// revisionBumped, noDispatch. A step carries optional flags: approve=false
// (driver denies the pending approval) and abort=true (driver passes an
// already-aborted signal).

const subset = (expect, actual) =>
  typeof actual === "object" &&
  actual !== null &&
  Object.entries(expect).every(([k, v]) => actual[k] === v);

export function checkStep(step, host, before, result) {
  const e = step.expect ?? {};
  const problems = [];
  const fail = (m) => problems.push(m);
  if (e.ok !== undefined && result.ok !== e.ok)
    fail(`ok=${result.ok}, want ${e.ok}`);
  if (e.code !== undefined) {
    const codes = Array.isArray(e.code) ? e.code : [e.code];
    if (!codes.includes(result.error?.code))
      fail(`code=${result.error?.code ?? result.error}, want one of ${codes}`);
  }
  if (e.data !== undefined && !subset(e.data, result.data ?? {}))
    fail(`data ${JSON.stringify(result.data)} misses ${JSON.stringify(e.data)}`);
  if (e.hasTargetId !== undefined) {
    const ids = (result.data?.targets ?? []).map((t) => t.targetId);
    if (!ids.includes(e.hasTargetId))
      fail(`targets ${JSON.stringify(ids)} missing ${e.hasTargetId}`);
  }
  if (e.documentId !== undefined && result.data?.documentId !== e.documentId)
    fail(`documentId=${result.data?.documentId}, want ${e.documentId}`);
  if (e.integerRevision && !Number.isInteger(result.data?.revision))
    fail(`revision=${result.data?.revision}, want integer`);
  if (e.protocolVersion !== undefined)
    if (result.data?.protocolVersion !== e.protocolVersion)
      fail(`protocolVersion=${result.data?.protocolVersion}`);
  if (e.tool !== undefined) {
    const tool = (result.data?.tools ?? []).find((t) => t.name === e.tool);
    if (!tool) fail(`catalog missing ${e.tool}`);
    else if (e.effect !== undefined && tool.effect !== e.effect)
      fail(`${e.tool} effect=${tool.effect}, want ${e.effect}`);
  }
  if (e.revisionBumped && !(host.revision() > before.revision))
    fail(`revision ${before.revision} -> ${host.revision()}, want bump`);
  if (e.noDispatch && host.dispatched() !== before.dispatched)
    fail(`dispatched ${before.dispatched} -> ${host.dispatched()}, want none`);
  return problems;
}

export async function runScenario(scenario, host, onStep = () => {}) {
  const failures = [];
  for (const step of scenario.steps) {
    if (step.ifReadsConsented && !host.readsConsented) {
      onStep(step.name, "skip", "host requires approval for reads");
      continue;
    }
    const before = { revision: host.revision(), dispatched: host.dispatched() };
    let result;
    try {
      if (step.op === "listTargets") result = await host.listTargets();
      else if (step.op === "getContext") result = await host.getContext(host.target);
      else if (step.op === "listTools") result = await host.listTools(host.target);
      else if (step.op === "call") {
        const call = {
          requestId: crypto.randomUUID(),
          documentId: step.call.documentId ?? host.target.documentId,
          toolName: step.call.toolName,
          arguments: step.call.arguments,
          expectedRevision: step.call.expectedRevision,
          idempotencyKey: step.call.idempotencyKey,
        };
        const controller = new AbortController();
        if (step.abort) controller.abort();
        result = await host.call(call, {
          approve: step.approve !== false,
          signal: controller.signal,
        });
      } else throw new Error(`unknown op ${step.op}`);
    } catch (err) {
      failures.push({ name: step.name, problems: [String(err)] });
      onStep(step.name, "fail", String(err));
      continue;
    }
    const problems = checkStep(step, host, before, result ?? {});
    if (problems.length) failures.push({ name: step.name, problems });
    onStep(step.name, problems.length ? "fail" : "pass", problems.join("; "));
  }
  return failures;
}
