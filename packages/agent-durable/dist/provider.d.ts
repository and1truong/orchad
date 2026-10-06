import { type Provider } from "@earendil-works/pi-ai";
import { type ToolDescriptor } from "@orchard/agent-client";
export type MangoProviderOptions = {
    /** Live base URL thunk: reconfigure never rebuilds the provider. */
    getGatewayBaseUrl: () => string;
    fetcher?: typeof fetch;
    /**
     * Model ids the runner may select. A thunk is resolved on every Models
     * refresh, so a gateway reconfigure can publish the new model id without
     * rebuilding the provider.
     */
    modelIds: readonly string[] | (() => readonly string[]);
    /**
     * Current host tool descriptors (name/description/inputSchema/effect) at
     * request time. The runner republishes this on every host rebind; the
     * declarations reach the gateway with real effects so the strict batch
     * gate validates the same schema the host executes.
     */
    tools: () => readonly ToolDescriptor[];
    /** Per-turn budgets, evaluated against committed transcript state. */
    maxSteps?: number;
    maxToolCalls?: number;
};
/**
 * pi-ai Provider over the shared Mango transport. Credentials are never part
 * of provider state: Models resolves `options.apiKey` from the (in-memory)
 * credential store per request and hands it here; this stream reads only that.
 * The gateway is the only place provider credentials/quota live — Pi never
 * calls an upstream model API directly.
 */
export declare function createMangoProvider(opts: MangoProviderOptions): Provider;
