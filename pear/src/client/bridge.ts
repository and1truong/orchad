import type { Bridge } from "../shared/contract.ts";

// Stable runtime baseline; hosts discover tools via describe() and bind
// authority through getContext()/invoke() only — never trust page state.
export function installBridge(bridge: Bridge) {
  window.agentBridgeV1 = Object.freeze(bridge);
  return () => {
    if (window.agentBridgeV1 === bridge) delete window.agentBridgeV1;
  };
}
