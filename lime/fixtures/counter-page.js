// TEST DOUBLE ONLY: per-page memory, no authenticated backend or production authorization.
(() => {
  let value = 0,
    revision = 0;
  const records = new Map();
  const result = (ok, data, error = null) => ({
    ok,
    revision: ok ? revision : null,
    data,
    error,
  });
  const fail = (code, message) =>
    result(false, null, { code, message, retryable: false });
  const schema = {
    type: "object",
    properties: { amount: { type: "integer" } },
    required: ["amount"],
    additionalProperties: false,
  };
  window.agentBridgeV1 = {
    async describe() {
      return {
        protocolVersion: "0.1",
        appId: "demo-counter",
        tools: [
          {
            name: "demo_increment",
            description: "Increment fixture counter",
            inputSchema: schema,
            effect: "write",
          },
          {
            name: "demo_read",
            description: "Read fixture counter",
            inputSchema: { type: "object", additionalProperties: false },
            effect: "read",
          },
        ],
      };
    },
    async getContext() {
      return {
        appId: "demo-counter",
        documentId: "demo-document",
        revision,
        selectionIds: [],
        summary: "Counter value " + value,
      };
    },
    async invoke(c) {
      if (c.documentId !== "demo-document")
        return fail("NOT_FOUND", "Document missing");
      if (c.toolName === "demo_read") return result(true, { value, revision });
      if (c.toolName !== "demo_increment")
        return fail("UNSUPPORTED", "Unknown tool");
      if (
        !Number.isInteger(c.arguments?.amount) ||
        Object.keys(c.arguments).length !== 1 ||
        !Number.isInteger(c.expectedRevision) ||
        typeof c.idempotencyKey !== "string"
      )
        return fail("INVALID_ARGUMENT", "Invalid mutation");
      const semantic = JSON.stringify([
        c.documentId,
        c.toolName,
        c.arguments.amount,
        c.expectedRevision,
      ]);
      const prior = records.get(c.idempotencyKey);
      if (prior)
        return prior.semantic === semantic
          ? prior.result
          : fail("IDEMPOTENCY_CONFLICT", "Key reused");
      if (c.expectedRevision !== revision)
        return fail("STALE_CONTEXT", "Revision changed");
      value += c.arguments.amount;
      revision++;
      const r = result(true, { value, revision });
      records.set(c.idempotencyKey, { semantic, result: r });
      document.getElementById("value").textContent = value;
      document.getElementById("revision").textContent = "Revision " + revision;
      return r;
    },
  };
})();
