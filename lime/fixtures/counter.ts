import {
  CallSchema,
  canonical,
  failure,
  success,
  type Call,
  type Target,
} from "../src/shared/contract.js";
import type { PageAdapter } from "../src/host/policy.js";
// TEST DOUBLE ONLY. In-memory transactions are not production server authorization.
export class CounterFixture implements PageAdapter {
  value = 0;
  revision = 0;
  calls = 0;
  closed = false;
  target: Target = {
    targetId: "fixture-target",
    pageInstanceId: "fixture-page-0",
    origin: "http://127.0.0.1:4313",
    appId: "demo-counter",
    documentId: "demo-document",
    title: "Counter test double",
  };
  records = new Map<string, { semantic: string; result: unknown }>();
  async current() {
    if (this.closed) throw failure("TARGET_CLOSED", "Tab closed");
    return { ...this.target };
  }
  async describe() {
    return {
      protocolVersion: "0.1",
      appId: "demo-counter",
      tools: [
        {
          name: "demo_increment",
          description: "Increment the counter (test double)",
          inputSchema: {
            type: "object",
            properties: { amount: { type: "integer" } },
            required: ["amount"],
            additionalProperties: false,
          },
          effect: "write",
        },
        {
          name: "demo_read",
          description: "Read counter",
          inputSchema: { type: "object", additionalProperties: false },
          effect: "read",
        },
      ],
    };
  }
  async getContext() {
    return {
      appId: "demo-counter",
      documentId: this.target.documentId,
      revision: this.revision,
      selectionIds: [],
      summary: "Counter value " + this.value,
    };
  }
  async invoke(raw: Call) {
    this.calls++;
    const c = CallSchema.parse(raw);
    if (c.toolName === "demo_read")
      return success(
        { value: this.value, revision: this.revision },
        this.revision,
      );
    if (c.toolName !== "demo_increment")
      return failure("UNSUPPORTED", "Unknown tool");
    if (c.documentId !== this.target.documentId)
      return failure("NOT_FOUND", "Document missing");
    const amount = c.arguments.amount;
    if (
      !Number.isInteger(amount) ||
      Object.keys(c.arguments).length !== 1 ||
      c.expectedRevision === null ||
      !c.idempotencyKey
    )
      return failure("INVALID_ARGUMENT", "Invalid increment");
    const semantic = canonical({
      documentId: c.documentId,
      toolName: c.toolName,
      arguments: c.arguments,
      expectedRevision: c.expectedRevision,
    });
    const prior = this.records.get(c.idempotencyKey);
    if (prior)
      return prior.semantic === semantic
        ? prior.result
        : failure("IDEMPOTENCY_CONFLICT", "Key conflict");
    if (c.expectedRevision !== this.revision)
      return failure("STALE_CONTEXT", "Revision changed");
    this.value += amount as number;
    this.revision++;
    const result = success(
      { value: this.value, revision: this.revision },
      this.revision,
    );
    this.records.set(c.idempotencyKey, { semantic, result });
    return result;
  }
  navigate() {
    this.target = { ...this.target, pageInstanceId: crypto.randomUUID() };
  }
}
