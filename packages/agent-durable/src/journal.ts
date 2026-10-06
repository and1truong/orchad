import { defineDoc } from "@earendil-works/pi-durable";
import type { JsonObject } from "@earendil-works/pi-durable";
import type { JsonValue } from "@earendil-works/chord";

/** Current journal/meta schema. Bumped on any incompatible store layout change. */
export const SCHEMA_VERSION = 1;
/** Exact upstream artifact versions this store layout was verified against. */
export const RUNTIME_VERSION = "pi-durable@1.0.4 pi-ai@1.0.4 chord@1.0.4";

export type OpEnvelope = {
  targetId: string;
  /** Host-level invocation request id (stable across attempts: the op id). */
  requestId: string;
  toolName: string;
  arguments: JsonObject;
  /** Raw argument string as the model emitted it (digest bound by state). */
  argumentsRaw: string | null;
  expectedRevision: number | null;
  /** Minted once at intent checkpoint, reused verbatim on every re-dispatch. */
  idempotencyKey: string | null;
};

export type OpStatus =
  /** Intent committed but nothing left the process (host not bound). */
  | "parked"
  /** Commit before the host call: the envelope MAY have reached the host. */
  | "dispatched"
  | "completed"
  | "failed"
  | "interrupted"
  | "ambiguous"
  | "reconciled";

export type OpRecord = {
  /** Immutable operation id == request id on the host invocation envelope. */
  opId: string;
  /** Model tool-call id this op satisfies (journal key). */
  callId: string;
  taskId: string;
  envelope: OpEnvelope;
  /** "safe" ops may re-run execute() on recovery; "unsafe" never re-run. */
  replayClass: "safe" | "unsafe";
  status: OpStatus;
  /** Dispatch count: 0 = parked only, 1 = first send, >1 = at-least-once. */
  attempts: number;
  dispatchedAt: number;
  lastAttemptAt: number | null;
  /** Settled host Result (the verbatim JSON the model saw). */
  result: JsonObject | null;
  error: string | null;
};

export type OpsState = {
  [key: string]: JsonValue;
  ops: Record<string, OpRecord>;
};

/** Per-conversation operation journal: one durable record per host invocation. */
export const OpsDoc = defineDoc<OpsState>({
  kind: "orchard.ops",
  version: SCHEMA_VERSION,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ ops: {} }),
});

export type MetaState = {
  schemaVersion: number;
  runtime: string;
  createdAt: number;
  node: string;
};

/** Store identity/version: written on first open, verified on every reopen. */
export const MetaDoc = defineDoc<MetaState>({
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
