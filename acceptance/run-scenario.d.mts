export type ScenarioStep = {
  name: string;
  op: "listTargets" | "getContext" | "listTools" | "call";
  approve?: boolean;
  abort?: boolean;
  ifReadsConsented?: boolean;
  call?: {
    toolName: string;
    arguments: Record<string, unknown>;
    expectedRevision: number | null;
    idempotencyKey: string | null;
    documentId?: string;
  };
  expect?: Record<string, unknown>;
};
export type Scenario = {
  scenario: string;
  target: Record<string, string>;
  catalog: { protocolVersion: string; requiredTool: string };
  steps: ScenarioStep[];
};
export type ScenarioHost = {
  target: Record<string, string>;
  readsConsented: boolean;
  listTargets(): Promise<unknown>;
  getContext(t: unknown): Promise<unknown>;
  listTools(t: unknown): Promise<unknown>;
  call(
    call: Record<string, unknown>,
    opts: { approve: boolean; signal: AbortSignal },
  ): Promise<unknown>;
  dispatched(): number;
  revision(): number;
};
export declare function checkStep(
  step: ScenarioStep,
  host: ScenarioHost,
  before: { revision: number; dispatched: number },
  result: { ok?: boolean; data?: any; error?: { code?: string } | null },
): string[];
export declare function runScenario(
  scenario: Scenario,
  host: ScenarioHost,
  onStep?: (name: string, status: string, detail: string) => void,
): Promise<{ name: string; problems: string[] }[]>;
