import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

// MV3 extension CSP (script-src 'self', no 'unsafe-eval') forbids eval and
// the Function constructor. This test bundles the shared contract module the
// way the extension does, then runs it in a context where both throw —
// reproducing the production CSP. It fails if bundled validation needs
// runtime code generation (e.g. Ajv compile).
test("bundled contract validates arguments without string code generation", async () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const out = await build({
    stdin: {
      contents: `
        import { validateArguments } from "./src/shared/contract.js";
        export const run = () => {
          const tool = {
            name: "demo_increment",
            description: "t",
            inputSchema: {
              type: "object",
              required: ["amount"],
              additionalProperties: false,
              properties: { amount: { type: "integer" } },
            },
            effect: "write",
          } as any;
          return [
            validateArguments(tool, { amount: 1 }),
            validateArguments(tool, { amount: "x" }),
            validateArguments(tool, { amount: 1, extra: true }),
            validateArguments(tool, { amount: 1.5 }),
          ];
        };
      `,
      resolveDir: path.join(dir, ".."),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "csp",
    platform: "neutral",
    write: false,
  });
  const denied = () => {
    throw new EvalError("Code generation from strings disallowed");
  };
  const sandbox: Record<string, unknown> = {
    Function: denied,
    eval: denied,
    console,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    fetch,
    crypto,
    structuredClone,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(out.outputFiles[0].text, sandbox);
  const csp = sandbox.csp as { run: () => boolean[] };
  assert.deepEqual([...csp.run()], [true, false, false, false]);
});
