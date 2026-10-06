import { createProvider, } from "@earendil-works/pi-ai";
import { errorAssistantStream, streamMangoCompletion, } from "@orchard/agent-client";
import { transcriptToWire, turnUsage } from "./transcript.js";
/**
 * pi-ai Provider over the shared Mango transport. Credentials are never part
 * of provider state: Models resolves `options.apiKey` from the (in-memory)
 * credential store per request and hands it here; this stream reads only that.
 * The gateway is the only place provider credentials/quota live — Pi never
 * calls an upstream model API directly.
 */
export function createMangoProvider(opts) {
    const makeModel = (id) => ({
        id,
        name: id,
        api: "openai-completions",
        provider: "mango",
        baseUrl: opts.getGatewayBaseUrl(),
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
        contextWindow: 0,
        maxTokens: 0,
    });
    const modelIds = () => typeof opts.modelIds === "function" ? opts.modelIds() : opts.modelIds;
    const models = modelIds().map(makeModel);
    const streamSimple = (model, context, options) => {
        const token = options?.apiKey;
        if (typeof token !== "string" || !token)
            return errorAssistantStream(model.id, "error", "[AUTHENTICATION] Mango gateway token is not configured");
        const { messages } = transcriptToWire(context.messages);
        const usage = turnUsage(messages);
        const maxSteps = opts.maxSteps ?? 8;
        const maxCalls = opts.maxToolCalls ?? 16;
        if (usage.steps >= maxSteps)
            return errorAssistantStream(model.id, "error", `[STEP_LIMIT] Run exceeded ${maxSteps} steps`);
        if (usage.toolCalls >= maxCalls)
            return errorAssistantStream(model.id, "error", `[TOOL_LIMIT] Run exceeded ${maxCalls} tool calls`);
        let marker;
        const stream = streamMangoCompletion({
            fetcher: opts.fetcher,
            gatewayBaseUrl: opts.getGatewayBaseUrl(),
            gatewayToken: token,
            model: model.id,
            messages,
            tools: [...opts.tools()],
            signal: options?.signal,
            priorCallIds: priorCallIds(messages),
            maxCalls: Math.max(0, maxCalls - usage.toolCalls),
            onError: (e) => {
                marker = { code: e.code, message: e.message };
            },
        });
        // Persist the Orchard error code on the terminal message so the runner's
        // status layer can tell STATE_INVALID/AUTHENTICATION from TRANSPORT after
        // reopen without re-parsing prose.
        const origResult = stream.result.bind(stream);
        stream.result = async () => {
            const m = await origResult();
            if (marker &&
                m.errorMessage &&
                !m.errorMessage.startsWith(`[${marker.code}]`))
                return {
                    ...m,
                    errorMessage: `[${marker.code}] ${marker.message}`,
                };
            return m;
        };
        return stream;
    };
    return createProvider({
        id: "mango",
        name: "Mango Gateway",
        auth: {
            apiKey: {
                name: "Mango gateway token",
                // The runner supplies the token through Models' credential store as a
                // memory-only {type:'api_key', key}; ambient sources resolve nothing.
                resolve: async ({ credential }) => credential?.type === "api_key" && credential.key
                    ? { auth: { apiKey: credential.key } }
                    : undefined,
            },
        },
        models,
        fetchModels: async () => modelIds().map(makeModel),
        api: { stream: streamSimple, streamSimple },
    });
}
function priorCallIds(messages) {
    const ids = new Set();
    for (const m of messages)
        for (const c of m.tool_calls ?? [])
            ids.add(c.id);
    return ids;
}
