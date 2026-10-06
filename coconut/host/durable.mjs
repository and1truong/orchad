// Durable agent runner for the coconut sidecar: one Harness over SQLite in
// this process, so a host-window close or sidecar respawn never loses a run.
// Trusted ops arrive as {action:'durable_*'} stdin frames; status pushes go
// back out as {kind:'durable-status'} for the native sidebar. External MCP
// clients see none of this.
import {openRunner} from '@orchard/agent-durable';
import {sidebar,fail} from './policy.mjs';

const noop = () => {};
const sig = () => new AbortController().signal;

export class Durable {
  constructor(policy, opts = {}) {
    this.policy = policy;
    this.opts = opts;
    this.runnerP = null;
    this.unwatch = noop;
    this.epochs = new Map();
    this.push = opts.push ?? noop;
  }

  runner() {
    return (this.runnerP ??= openRunner({
      storagePath: this.opts.storagePath,
      maxSteps: this.opts.maxSteps,
      maxToolCalls: this.opts.maxToolCalls,
    }).then(async (r) => {
      await r.configure(this.opts.gateway);
      this.unwatch = r.watch((s) => this.push(s));
      return r;
    }));
  }

  /** Rebind every policy-bound target. Called on 'binding' frames and lazily
   *  before every durable op; when nothing is reachable the run stays parked. */
  async bind() {
    const r = await this.runner();
    const bindings = [];
    for (const t of this.policy.targets.values()) {
      const ctx = await this.policy.execute(
        sidebar,
        'host_get_context',
        { targetId: t.targetId, pageInstanceId: t.pageInstanceId },
        sig(),
      );
      if (!ctx.ok) continue;
      const tools = await this.policy.execute(
        sidebar,
        'host_list_tools',
        { targetId: t.targetId, pageInstanceId: t.pageInstanceId },
        sig(),
      );
      if (!tools.ok || !Array.isArray(tools.data?.tools)) continue;
      const epoch = ctx.data?.sessionEpoch ?? null;
      this.epochs.set(t.targetId, epoch);
      bindings.push({
        targetId: t.targetId,
        revision: () => (ctx.data?.revision ?? null),
        tools: tools.data.tools,
        idempotentTools: this.opts.idempotentTools,
        // Re-entry re-proves consent: target still bound, context reachable,
        // session epoch unchanged since this binding.
        revalidate: async (envelope) => {
          const live = this.policy.targets.get(envelope.targetId);
          if (!live) throw new Error('host unbound');
          const now = await this.policy.execute(
            sidebar,
            'host_get_context',
            { targetId: envelope.targetId, pageInstanceId: live.pageInstanceId },
            sig(),
          );
          if (!now.ok) throw new Error('host context unreachable');
          if ((now.data?.sessionEpoch ?? null) !== epoch)
            throw new Error('session epoch changed — consent expired');
        },
      });
    }
    if (bindings.length === 0) return;
    const policy = this.policy;
    await r.bind(bindings, async (envelope, _attempt, ctx) => {
      const live = policy.targets.get(envelope.targetId);
      if (!live)
        return fail('TARGET_CLOSED', 'Host target is not bound', true);
      return policy.execute(
        sidebar,
        'host_call_tool',
        {
          targetId: envelope.targetId,
          pageInstanceId: live.pageInstanceId,
          call: {
            requestId: envelope.requestId,
            documentId: live.documentId,
            toolName: envelope.toolName,
            arguments: envelope.arguments,
            expectedRevision: envelope.expectedRevision,
            idempotencyKey: envelope.idempotencyKey,
          },
        },
        ctx?.abortSignal ?? sig(),
      );
    });
    this.push(await r.status());
  }

  async unbind() {
    const r = await this.runner().catch(() => null);
    r?.unbind();
  }

  async handle(m) {
    await this.bind();
    const r = await this.runner();
    switch (m.action) {
      case 'durable_submit':
        if (typeof m.prompt !== 'string' || !m.prompt) throw Error('prompt required');
        return r.submit({ prompt: m.prompt, requestId: m.requestId });
      case 'durable_status': return r.status();
      case 'durable_resume': return r.resume();
      case 'durable_cancel': return r.cancel();
      case 'durable_transcript': return r.transcript();
      case 'durable_reconcile': return r.reconcile();
      case 'durable_resolve': {
        if (typeof m.callId !== 'string' || !m.verdict) throw Error('callId + verdict required');
        await r.resolveOp(
          m.callId,
          m.verdict.status === 'reconciled'
            ? { status: 'reconciled', result: m.verdict.result }
            : { status: 'failed', error: m.verdict.error ?? 'rejected' },
        );
        return r.status();
      }
      default: throw Error('Unknown durable action');
    }
  }

  async close() {
    this.unwatch();
    await this.runnerP?.then((r) => r.close()).catch(() => {});
  }
}
