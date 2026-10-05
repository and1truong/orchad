import type { Bridge } from "../shared/contract.ts";
// Stable runtime baseline. Native WebMCP is intentionally not guessed or polyfilled.
// A separately verified engine adapter can consume this registry without changing handlers.
export function installBridge(bridge: Bridge) {
  window.agentBridgeV1 = Object.freeze(bridge);
  return () => {
    if (window.agentBridgeV1 === bridge) delete window.agentBridgeV1;
  };
}
