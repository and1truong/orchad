# @orchard/agent-client 0.1.0

Portable trusted-host agent loop for Agent App Bridge 0.1. Bundle this ESM package in browser extensions or desktop shell frontends. Uses web-standard APIs and interpreted JSON Schema validation compatible with MV3 CSP. No Node, Chrome, Tauri or provider SDK APIs.

Import runAgentTurn and supply the exact shared-contract input. The callback executeTool(toolName, arguments, toolCallId) owns all authorization, approval, target binding and execution. tools are ToolDescriptor objects, not OpenAI provider schemas. The client handles mapping.

Save returned messages including assistant tool_calls and x_gateway_state unchanged. onEvent emits the contract's text_delta, tool_requested, tool_completed, error and exactly one completed event. Defaults: 8 steps, 16 tool calls. Calls execute sequentially after complete stream validation. Errors are reported through events/finishReason; invalid configuration can throw.

createMockAgentClient(fetcher) returns the same runAgentTurn interface with an injected transport for offline host development. Hosts can provide a scripted fetch response without copying the agent loop.

AbortSignal cancels streaming and waiting; an already dispatched host operation needs independent host cancellation and cannot be rolled back by this library. Never replay writes after transport failures. Tool failures become Page Bridge error envelopes. No automatic approval, retries, provider fallback or page credentials.

Build from mango with npm run build. Create local tarball with npm run pack:client. See mango/README.md and CONTRACT.md for installation, fixtures and limitations. Package not published.
