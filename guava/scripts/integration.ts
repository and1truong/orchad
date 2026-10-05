import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import assert from "node:assert/strict";
import type { Result, TargetDescriptor } from "../src/shared/contract.ts";
for (const kind of ["BROWSER", "DESKTOP"]) {
  const url = process.env[`ORCHARD_${kind}_MCP_URL`],
    token = process.env[`ORCHARD_${kind}_MCP_TOKEN`];
  if (!url || !token) {
    console.log(
      `${kind}: NOT RUN — configure loopback MCP URL and paired token; external artifact absent`,
    );
    continue;
  }
  const endpoint = new URL(url);
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname),
    "Integration requires loopback host",
  );
  assert.equal(endpoint.pathname, "/mcp");
  assert.equal(endpoint.search, "", "Token must not be in URL");
  const client = new Client({ name: "guava-integration", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: "Bearer " + token } },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      "host_call_tool",
      "host_get_context",
      "host_list_targets",
      "host_list_tools",
    ]);
    const invoke = async (name: string, args: any): Promise<Result> => {
      const r = await client.callTool({ name, arguments: args });
      const envelope = (r.structuredContent ??
        JSON.parse(
          (r.content as any[]).find((c) => c.type === "text")!.text,
        )) as unknown as Result;
      assert.equal(envelope.ok, !r.isError);
      assert.ok(
        "revision" in envelope && "data" in envelope && "error" in envelope,
      );
      return envelope;
    };
    const list = await invoke("host_list_targets", {});
    assert.equal(list.ok, true);
    const target = (list.data.targets as TargetDescriptor[]).find(
      (t) =>
        t.appId === "orchard-guava" &&
        t.documentId ===
          (process.env.ORCHARD_DOCUMENT_ID ?? "rca-consumer-lag"),
    );
    assert.ok(
      target,
      "Authorize an authenticated Guava target in the external host first",
    );
    const binding = {
      targetId: target.targetId,
      pageInstanceId: target.pageInstanceId,
    };
    const ctx = await invoke("host_get_context", binding);
    assert.equal(ctx.ok, true);
    const desc = await invoke("host_list_tools", binding);
    assert.equal(desc.ok, true);
    assert.equal(desc.data.protocolVersion, "0.1");
    assert.ok(
      desc.data.tools.some((t: any) => t.name === "canvas_apply_patch"),
    );
    const graph = await invoke("host_call_tool", {
      ...binding,
      call: {
        requestId: crypto.randomUUID(),
        documentId: target.documentId,
        toolName: "canvas_get_graph",
        arguments: { nodeLimit: 10, edgeLimit: 20 },
        expectedRevision: null,
        idempotencyKey: null,
      },
    });
    assert.equal(graph.ok, true);
    console.log(
      `${kind}: PASS live discovery, context, tool catalog and bounded graph read`,
    );
    if (process.env.ORCHARD_RUN_WRITES === "true") {
      const nonce = crypto.randomUUID();
      const call = {
        requestId: nonce,
        documentId: target.documentId,
        toolName: "canvas_apply_patch",
        arguments: {
          operations: [
            {
              op: "add_node",
              node: {
                id: "integration-" + nonce,
                type: "hypothesis",
                label: "External host integration probe",
                body: "Synthetic integration hypothesis, not fact",
                position: { x: 600, y: 600 },
                evidenceIds: [],
              },
            },
          ],
        },
        expectedRevision: graph.revision,
        idempotencyKey: nonce,
      };
      console.log(
        `${kind}: approve the exact pending batch in the trusted host UI`,
      );
      const written = await invoke("host_call_tool", { ...binding, call });
      assert.equal(written.ok, true);
      const replay = await invoke("host_call_tool", {
        ...binding,
        call: { ...call, requestId: crypto.randomUUID() },
      });
      assert.deepEqual(replay, written);
      const stale = await invoke("host_call_tool", {
        ...binding,
        call: {
          ...call,
          requestId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
        },
      });
      assert.equal(stale.error?.code, "STALE_CONTEXT");
      console.log(
        `${kind}: PASS live write/replay/stale; host approvals were manual`,
      );
    } else
      console.log(
        `${kind}: write scenarios NOT RUN — set ORCHARD_RUN_WRITES=true and use host approval UI`,
      );
  } catch (e) {
    console.error(`${kind}: FAILED — ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
