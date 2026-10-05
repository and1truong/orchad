import Fastify, { LogController } from "fastify";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  validateRequest,
  validateHistory,
  validator as schemaValidator,
  callSchema,
  type ChatRequest,
  type Message,
  type ToolCall,
} from "../packages/agent-client/src/protocol.js";
import AjvModule from "ajv";
import { StateCodec } from "./state.js";
import type { Storage, Principal } from "./store.js";
import {
  UpstreamError,
  sleep,
  type ProviderAdapter,
  type ProviderRequest,
  type ModelConfig,
  type Usage,
} from "./providers/types.js";
const Ajv = AjvModule as unknown as typeof AjvModule.default;
const validator = new Ajv({
  strict: false,
  allErrors: true,
  validateFormats: false,
});
const checkCall = schemaValidator.compile(callSchema);
export type GatewayOptions = {
  store: Storage;
  models: ModelConfig[];
  adapters: ProviderAdapter[];
  stateKey?: Buffer;
  corsOrigins?: string[];
  timeoutMs?: number;
  retryBudget?: number;
  logger?: boolean;
  debugContent?: boolean;
  production?: boolean;
};
export function createGateway(o: GatewayOptions) {
  const models = new Map(o.models.map((m) => [m.id, m]));
  const providers = new Map(o.adapters.map((a) => [a.name, a]));
  if (models.size !== o.models.length || !models.size)
    throw new Error("Invalid model registry");
  for (const m of models.values())
    if (
      !providers.has(m.provider) ||
      !m.id ||
      !m.upstreamModel ||
      !Number.isInteger(m.maxOutputTokens) ||
      m.maxOutputTokens < 1 ||
      m.maxOutputTokens > 8192 ||
      !m.capabilities?.text ||
      typeof m.capabilities.streaming !== "boolean" ||
      typeof m.capabilities.functionTools !== "boolean" ||
      !Array.isArray(m.compatibility)
    )
      throw new Error("Invalid configured model capabilities");
  if (o.debugContent && o.production)
    throw new Error("Content debug forbidden in production");
  const state = new StateCodec(o.stateKey ?? randomBytes(32));
  const active = new Map<string, number>(),
    rates = new Map<string, { start: number; count: number }>(),
    controllers = new Set<AbortController>();
  const app = Fastify({
    logger: o.logger
      ? {
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            "body",
            "messages",
            "tools",
            "apiKey",
          ],
          serializers: {
            req: (r) => ({ method: r.method, url: r.url?.split("?")[0] }),
            err: () => ({
              type: "Error",
              message: "Request failed",
              stack: "",
            }),
          },
        }
      : false,
    bodyLimit: 512_000,
    requestTimeout: 35_000,
    logController: new LogController({ disableRequestLogging: true }),
    genReqId: () => randomUUID(),
  });
  if (o.debugContent)
    app.log.warn(
      "LOCAL DEBUG CONTENT ENABLED: prompts and tool outputs may contain sensitive data",
    );
  const failure = (reply: any, status: number, code: string, message: string) =>
    reply
      .code(status)
      .send({ error: { message, type: "gateway_error", code } });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    const origin = req.headers.origin;
    if (origin) {
      if (!(o.corsOrigins ?? []).includes(origin)) {
        failure(reply, 403, "CORS_DENIED", "Origin denied");
        return;
      }
      reply
        .header("access-control-allow-origin", origin)
        .header("vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      reply
        .header("access-control-allow-methods", "GET, POST, OPTIONS")
        .header("access-control-allow-headers", "Authorization, Content-Type");
      reply.code(204).send();
    }
  });
  app.setErrorHandler((error, req, reply) => {
    const err = error as { statusCode?: number };
    app.log.warn(
      { requestId: req.id, status: err.statusCode ?? 500 },
      "Request rejected",
    );
    failure(
      reply,
      err.statusCode ?? 500,
      err.statusCode === 400 ? "INVALID_REQUEST" : "INTERNAL",
      "Request failed",
    );
  });
  const auth = (req: any, reply: any): Principal | undefined => {
    const header = req.headers.authorization;
    const p =
      typeof header === "string" && header.startsWith("Bearer ")
        ? o.store.authenticate(header.slice(7))
        : undefined;
    if (!p) failure(reply, 401, "UNAUTHORIZED", "Bearer token required");
    return p;
  };
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/v1/models", async (req, reply) => {
    const p = auth(req, reply);
    if (!p) return;
    return {
      object: "list",
      data: o.models
        .filter((m) => p.models.includes(m.id))
        .map((m) => ({
          id: m.id,
          object: "model",
          created: 0,
          owned_by: m.provider,
          x_gateway_capabilities: {
            ...m.capabilities,
            max_completion_tokens: m.maxOutputTokens,
            compatibility: m.compatibility,
          },
        })),
    };
  });
  app.post("/v1/chat/completions", async (req, reply) => {
    const p = auth(req, reply);
    if (!p) return;
    const body = req.body as ChatRequest;
    if (!validateRequest(body))
      return failure(
        reply,
        400,
        "INVALID_REQUEST",
        "Unsupported or invalid request schema",
      );
    const model = models.get(body.model);
    if (!model || !p.models.includes(body.model))
      return failure(reply, 403, "MODEL_DENIED", "Model denied");
    if (
      (body.stream && !model.capabilities.streaming) ||
      (body.tools?.length && !model.capabilities.functionTools)
    )
      return failure(
        reply,
        400,
        "UNSUPPORTED",
        "Model feature not implemented",
      );
    const maxTokens =
      body.max_completion_tokens ?? Math.min(2048, model.maxOutputTokens);
    if (maxTokens > model.maxOutputTokens)
      return failure(
        reply,
        400,
        "OUTPUT_LIMIT",
        "Configured output limit exceeded",
      );
    const continuations = new Map<number, unknown>();
    try {
      validateHistory(body.messages);
      const names = new Set<string>();
      for (const t of body.tools ?? []) {
        if (names.has(t.function.name)) throw 0;
        names.add(t.function.name);
        validator.compile(t.function.parameters);
      }
      for (const [i, m] of body.messages.entries())
        if (m.x_gateway_state)
          continuations.set(
            i,
            state.open(m.x_gateway_state, p.id, model.provider, model.id, m),
          );
    } catch {
      return failure(
        reply,
        400,
        "INVALID_REQUEST",
        "Invalid history, schema or continuation state",
      );
    }
    const now = Date.now();
    if (rates.size > 10000)
      for (const [k, v] of rates) if (now - v.start >= 60000) rates.delete(k);
    let rate = rates.get(p.id);
    if (!rate || now - rate.start >= 60000) {
      rate = { start: now, count: 0 };
      rates.set(p.id, rate);
    }
    if (rate.count >= p.rpm)
      return failure(reply, 429, "RATE_LIMIT", "Request rate exceeded");
    rate.count++;
    if ((active.get(p.id) ?? 0) >= p.concurrency)
      return failure(reply, 429, "CONCURRENCY_LIMIT", "Concurrency exceeded");
    // UTF-8 bytes + per-message/tool framing are a conservative input token reservation.
    const inputReservation =
      Buffer.byteLength(
        JSON.stringify({
          messages: body.messages.map(({ x_gateway_state, ...m }) => m),
          tools: body.tools,
        }),
      ) +
      body.messages.length * 64 +
      (body.tools?.length ?? 0) * 128;
    const reservation = inputReservation + maxTokens;
    if (!o.store.reserve(req.id, p, reservation))
      return failure(reply, 429, "QUOTA_LIMIT", "Quota reservation denied");
    active.set(p.id, (active.get(p.id) ?? 0) + 1);
    const controller = new AbortController();
    controllers.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, o.timeoutMs ?? 30000);
    const disconnected = () => {
      if (!reply.raw.writableFinished) controller.abort();
    };
    reply.raw.on("close", disconnected);
    req.raw.on("aborted", disconnected);
    const request: ProviderRequest = {
      ...body,
      max_completion_tokens: maxTokens,
      upstreamModel: model.upstreamModel,
      continuations,
    };
    let usage: Usage = { input: null, output: null },
      status = "error",
      started = false,
      final = false,
      reason: string | undefined,
      outputBytes = 0,
      toolObserved = false;
    const message: Message = { role: "assistant", content: "" };
    const calls = new Map<number, ToolCall>();
    const id = `chatcmpl-${req.id}`,
      created = Math.floor(now / 1000);
    const chunk = (delta: any, finish_reason: string | null = null) => ({
      id,
      object: "chat.completion.chunk",
      created,
      model: model.id,
      choices: [{ index: 0, delta, finish_reason }],
    });
    const send = async (data: any) => {
      if (!started) {
        reply.hijack();
        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache",
          "x-request-id": req.id,
          ...(req.headers.origin
            ? {
                "access-control-allow-origin": req.headers.origin,
                vary: "Origin",
              }
            : {}),
        });
        started = true;
      }
      controller.signal.throwIfAborted();
      if (
        !reply.raw.write(
          `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`,
        )
      )
        await once(reply.raw, "drain", { signal: controller.signal });
    };
    try {
      if (o.debugContent)
        app.log.warn({ localContent: body.messages }, "Local debug content");
      let attempt = 0;
      while (true) {
        try {
          for await (const event of providers
            .get(model.provider)!
            .generate(request, controller.signal)) {
            controller.signal.throwIfAborted();
            if (final) throw new UpstreamError(502);
            if (event.type === "delta") {
              if (event.content) {
                outputBytes += Buffer.byteLength(event.content);
                message.content = (message.content ?? "") + event.content;
                if (message.content.length > 65536)
                  throw new UpstreamError(413);
              }
              for (const delta of event.tool_calls ?? []) {
                toolObserved = true;
                if (
                  body.tool_choice === "none" ||
                  !model.capabilities.functionTools ||
                  !Number.isInteger(delta.index) ||
                  delta.index < 0 ||
                  delta.index >= 16
                )
                  throw new UpstreamError(422);
                const c = calls.get(delta.index) ?? {
                  id: "",
                  type: "function",
                  function: { name: "", arguments: "" },
                };
                if (delta.id) {
                  if (c.id && c.id !== delta.id) throw new UpstreamError(502);
                  c.id = delta.id;
                }
                c.function.name += delta.function?.name ?? "";
                c.function.arguments += delta.function?.arguments ?? "";
                outputBytes += Buffer.byteLength(JSON.stringify(delta));
                calls.set(delta.index, c);
              }
              if (outputBytes > 262144) throw new UpstreamError(413);
              if (body.stream)
                await send(
                  chunk({
                    ...(event.content ? { content: event.content } : {}),
                    ...(event.tool_calls
                      ? { tool_calls: event.tool_calls }
                      : {}),
                  }),
                );
            } else {
              usage = event.usage;
              if (
                ![usage.input, usage.output].every(
                  (n) => n === null || (Number.isSafeInteger(n) && n >= 0),
                )
              )
                throw new UpstreamError(502);
              reason = event.finishReason;
              const ordered = [...calls.entries()].sort((a, b) => a[0] - b[0]);
              if (calls.size) {
                message.tool_calls = ordered.map(([, c]) => c);
                if (!message.content) message.content = null;
              }
              if (reason === "stop" || reason === "tool_calls") {
                if (
                  (reason === "tool_calls") !== Boolean(calls.size) ||
                  new Set(message.tool_calls?.map((c) => c.id)).size !==
                    (message.tool_calls?.length ?? 0)
                )
                  throw new UpstreamError(502);
                for (const [position, [i, c]] of ordered.entries()) {
                  if (
                    i !== position ||
                    !checkCall(c) ||
                    body.messages.some((m) =>
                      m.tool_calls?.some((old) => old.id === c.id),
                    )
                  )
                    throw new UpstreamError(502);
                  const tool = body.tools?.find(
                    (t) => t.function.name === c.function.name,
                  );
                  if (
                    !tool ||
                    !validator.compile(tool.function.parameters)(
                      JSON.parse(c.function.arguments),
                    )
                  )
                    throw new UpstreamError(422);
                }
              }
              if (event.continuation !== undefined)
                message.x_gateway_state = state.seal(
                  p.id,
                  model.provider,
                  model.id,
                  message,
                  event.continuation,
                );
              final = true;
              if (body.stream) {
                await send(
                  chunk(
                    {
                      ...(!outputBytes ? { role: "assistant" } : {}),
                      ...(message.x_gateway_state
                        ? { x_gateway_state: message.x_gateway_state }
                        : {}),
                    },
                    reason,
                  ),
                );
                await send({
                  ...chunk({}),
                  choices: [],
                  usage:
                    usage.input !== null && usage.output !== null
                      ? {
                          prompt_tokens: usage.input,
                          completion_tokens: usage.output,
                          total_tokens: usage.input + usage.output,
                        }
                      : null,
                });
              }
            }
          }
          if (!final) throw new UpstreamError(502);
          break;
        } catch (e) {
          if (
            e instanceof UpstreamError &&
            e.retryable &&
            !started &&
            !toolObserved &&
            outputBytes === 0 &&
            attempt < (o.retryBudget ?? 0) &&
            !controller.signal.aborted
          ) {
            await sleep(
              Math.min(1000, 100 * 2 ** attempt) +
                Math.floor(Math.random() * 100),
              controller.signal,
            );
            attempt++;
            continue;
          }
          throw e;
        }
      }
      status = "ok";
      if (body.stream) {
        await send("[DONE]");
        reply.raw.end();
      } else
        return {
          id,
          object: "chat.completion",
          created,
          model: model.id,
          choices: [{ index: 0, message, finish_reason: reason }],
          usage:
            usage.input !== null && usage.output !== null
              ? {
                  prompt_tokens: usage.input,
                  completion_tokens: usage.output,
                  total_tokens: usage.input + usage.output,
                }
              : null,
        };
    } catch (e) {
      status = timedOut
        ? "timeout"
        : controller.signal.aborted
          ? "cancelled"
          : "error";
      const code = timedOut
        ? "UPSTREAM_TIMEOUT"
        : controller.signal.aborted
          ? "CANCELLED"
          : "UPSTREAM_ERROR";
      if (started) {
        if (!reply.raw.destroyed) {
          reply.raw.write(
            `data: ${JSON.stringify({ error: { code, message: "Inference failed", type: "gateway_error" } })}\n\n`,
          );
          reply.raw.end();
        }
      } else
        return failure(
          reply,
          timedOut
            ? 504
            : controller.signal.aborted
              ? 499
              : e instanceof UpstreamError && e.status === 429
                ? 429
                : 502,
          code,
          "Inference failed",
        );
    } finally {
      clearTimeout(timer);
      req.raw.off("aborted", disconnected);
      reply.raw.off("close", disconnected);
      controller.abort();
      controllers.delete(controller);
      const n = (active.get(p.id) ?? 1) - 1;
      if (n) active.set(p.id, n);
      else active.delete(p.id);
      try {
        o.store.record({
          id: req.id,
          principal: p.id,
          provider: model.provider,
          model: model.id,
          status,
          latencyMs: Date.now() - now,
          usage,
          reserved: reservation,
        });
      } catch {
        // A ledger failure must not rewrite an already-computed response; the
        // orphaned reservation is charged conservatively at next startup.
        app.log.warn(
          { requestId: req.id, principal: p.id },
          "Ledger record failed",
        );
      }
      app.log.info(
        {
          requestId: req.id,
          principal: p.id,
          provider: model.provider,
          model: model.id,
          status,
          latencyMs: Date.now() - now,
        },
        "Inference finished",
      );
    }
  });
  app.addHook("preClose", async () => {
    for (const c of controllers) c.abort();
  });
  return app;
}
