import { defineDoc } from "@earendil-works/pi-durable";
/** Current journal/meta schema. Bumped on any incompatible store layout change. */
export const SCHEMA_VERSION = 1;
/** Exact upstream artifact versions this store layout was verified against. */
export const RUNTIME_VERSION = "pi-durable@1.0.4 pi-ai@1.0.4 chord@1.0.4";
/** Per-conversation operation journal: one durable record per host invocation. */
export const OpsDoc = defineDoc({
    kind: "orchard.ops",
    version: SCHEMA_VERSION,
    scope: "conversation",
    history: "latest",
    fork: "current",
    initial: () => ({ ops: {} }),
});
/** Store identity/version: written on first open, verified on every reopen. */
export const MetaDoc = defineDoc({
    kind: "orchard.meta",
    version: SCHEMA_VERSION,
    scope: "session",
    initial: () => ({
        schemaVersion: SCHEMA_VERSION,
        runtime: RUNTIME_VERSION,
        createdAt: Date.now(),
        node: typeof process !== "undefined" ? process.version : "unknown",
    }),
});
