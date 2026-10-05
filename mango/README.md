# Mango: Model Gateway + portable agent client

Agent App Bridge 0.1 inference service under the existing `and1truong/orchad` repository. The product name is Orchard; the remote repository spelling remains unchanged. This implementation owns only `mango/`.

Node 24+, TypeScript, Fastify, SQLite. Offline mock is the default. No Redis, queue, MCP endpoint, app credentials, page execution, consumer-chat integration or server agent loop.

## Run locally

From `mango/`:

1. `npm ci --ignore-scripts`
2. Copy `.env.example` to `.env`. Environment files are not automatically loaded by npm. Export variables yourself, or start with `node --env-file=.env --import tsx src/main.ts`.
3. Provision distinct development principals: `npm run token -- issue alice mock-scripted`, then `npm run token -- issue bob mock-scripted`. Each prints a new random bearer token once. Store it in trusted host memory. Provisioning persists only a SHA-256 hash, principal, policy and revocation flag.
4. `npm run dev`. Default loopback URL: http://127.0.0.1:4311. `GET /health` is unauthenticated. `/v1/models` and `/v1/chat/completions` require the issued bearer token.
5. Revoke through stdin: `npm run token -- revoke < token-file`. Run the token CLI against the same SQLITE_PATH as the service. `npm run token -- issue` refuses an existing principal; `npm run token -- update alice model-a,model-b` replaces only the model list (limits unchanged, no new token minted) and every existing token follows it. Do not put tokens in URLs, shell history or application page scripts. Seed/provisioning commands are explicit; no automatic shared demo token exists.

For a reproducible tool loop, export `MOCK_SCRIPT_FILE=fixtures/increment-script.json`. A host must provide `demo_increment` and execute it through the callback; the gateway only emits calls. This fixture is a labeled test double, not production approval or authorization code. Script selection uses the number of assistant turns in supplied history; no domain operation is built into the gateway.

`npm run check`, `npm test`, `npm run build`. Built service: `npm start`. Built token CLI: `node dist/src/token-cli.js issue alice mock-scripted`.

## Portable client

`packages/agent-client` exports `runAgentTurn`, shared types and `createMockAgentClient(fetcher)`. It uses web-standard fetch, streams and AbortSignal plus an interpreted JSON Schema validator. No Node, Chrome, Tauri, provider SDK, eval or generated Function dependency. MV3 CSP compatibility is exercised by a browser bundle in a VM with string code generation disabled.

Local installation: run `npm run pack:client`, then in Lime/Coconut run `npm install /absolute/path/to/mango/artifacts/orchard-agent-client-0.1.0.tgz`. Alternatively install the package directory with `npm install /absolute/path/to/mango/packages/agent-client` after building. No registry publication is performed. Browser consumers should bundle the ESM package using their normal frontend build.

Input is the contract object: gatewayBaseUrl, gatewayToken, model, messages, tools, executeTool, signal, maxSteps, maxToolCalls, onEvent. Default budgets are 8 turns and 16 calls. Output is messages and finishReason. Tool call IDs, assistant shape and opaque x_gateway_state are retained. Host callback supplies target binding, authorization, approval, revisions, idempotency and actual execution. The client has no authority to approve a write. All completed arguments are validated before any tools in a turn are dispatched; dispatch is sequential.

Transport/authentication errors are separate. Tool failures append an error result and allow the next inference turn. Truncated streams, malformed arguments, unsupported finish reasons and exceeded budgets stop without dispatching partial calls. Exactly one completed event is emitted; observer exceptions do not replay tools or interrupt cleanup.

AbortSignal stops inference and waiting on a host callback. The callback signature has no signal: hosts must also wire their run cancellation to their own execution/approval controller. Cancelling the client cannot undo a callback already dispatched; no retry or reconnect replay occurs. A cancelled history can contain an unfinished assistant tool batch and must not be reused as a completed conversation without host reconciliation.

## Providers and model registry

Provider adapters use documented REST APIs with streaming internally even for nonstreaming gateway requests: OpenAI Chat Completions, Anthropic Messages, Gemini GenerateContent. This avoids SDK-specific auto retries and automatic tool runners. Model IDs are administrator configuration, never a hardcoded latest model.

Default registry contains only `mock-scripted`. `fixtures/models.example.json` is a template containing clearly labeled placeholders, not verified live models. Copy it, replace upstreamModel IDs, configure server API credentials, then set MODELS_FILE. Remove providers you do not use. Startup rejects missing adapters and invalid capability declarations. Model listing exposes only the principal's allowlist and the configured capability matrix.

| Adapter | Text | Streaming | Function tools | Compatibility limits |
| --- | --- | --- | --- | --- |
| mock | yes | yes | yes | Offline scripted synthetic responses only |
| OpenAI | implemented | implemented | implemented | Chat Completions subset; text/function tools; no multimodal, built-ins, reasoning fields or arbitrary request options |
| Anthropic | implemented | implemented | implemented | Extended thinking not enabled; unexpected thinking or server-tool blocks rejected; tool-use IDs preserved |
| Gemini | implemented | implemented | implemented | GenerateContent v1beta; parametersJsonSchema; original signed public parts and function IDs replayed; exposed thought text rejected |

These are adapter implementation capabilities, not a claim that every provider/model combination supports them. Administrators must configure truthful model capabilities. Requested streaming/functions on a model marked unsupported fail explicitly. Upstream rejection is surfaced, never silently downgraded.

Gemini signatures are returned only inside authenticated-encrypted x_gateway_state, bound to principal/provider/model and the assistant message. State expires after 24 hours. No hidden reasoning is exposed. OpenAI and Anthropic thinking-disabled paths issue no continuation state. Unsupported reasoning/extended-thinking combinations must not be configured as compatible. Server keys are environment-only; user requests cannot select upstream URLs/headers. Future user-owned credentials require a separate authorized enrollment flow and are not implemented.

## API and security

See API.md and api.schema.json for the precise subset and extensions; SECURITY.md for deployment, authentication seams, limits and quota overshoot. CONTRACT.md is a verbatim copy of main's `contract`; CONTRACT-CHANGES.md records the checksum discrepancy with the prompt.

## Container

From `mango/`: `docker build -t orchard-mango .`. A nonroot Node 24 container uses /data/mango.sqlite. Mount a writable named volume, pass a stable 64-hex-character GATEWAY_STATE_KEY, an exact CORS_ORIGINS allowlist, and publish **only** `127.0.0.1:4311:4311` for local development. Example: `docker run --rm --name mango -p 127.0.0.1:4311:4311 -v mango-data:/data -e GATEWAY_STATE_KEY -e CORS_ORIGINS orchard-mango`. Export those environment variables first. Provision via `docker exec mango node dist/src/token-cli.js issue alice mock-scripted`. Set NODE_ENV=development explicitly only for local experiments; production requires the key and allowlist.

The Dockerfile is supplied; no Docker executable is available in the implementation environment, so image build/run was not tested. No cloud deployment or public endpoint was created.

## Live smoke tests

Paid calls are opt-in only. Configure the corresponding server API key and an exact OPENAI_SMOKE_MODEL, ANTHROPIC_SMOKE_MODEL or GEMINI_SMOKE_MODEL; set LIVE_SMOKE=true and run the live test file. Otherwise all three tests report skipped. Synthetic adapter tests are not evidence of live provider access, pricing, model capability or account authorization.

## Official API references checked

Checked on 2026-10-05: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [Anthropic tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [Gemini GenerateContent](https://ai.google.dev/api/generate-content), [Gemini thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures), [interpreted browser JSON Schema validator](https://github.com/cfworker/cfworker/tree/main/packages/json-schema). Runtime dependencies and development tools have exact versions and package-lock integrity hashes.
