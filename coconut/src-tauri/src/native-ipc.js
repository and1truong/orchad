// Tauri invoke_system: deny subframes before creating a closure with the IPC key.
// Windows executes initialization scripts in subframes as well as the top frame.
(() => {
  if (window !== window.top) {
    Object.defineProperty(window.__TAURI_INTERNALS__, 'postMessage', {value: () => {throw Error('Native IPC forbidden in subframes');}});
    return;
  }
  const invokeKey = __INVOKE_KEY__;
  Object.defineProperty(window.__TAURI_INTERNALS__, 'postMessage', {value: ({cmd, callback, error, payload, options}) => {
    // ponytail: Coconut commands/events use JSON only; add binary/channel support when required.
    window.ipc.postMessage(JSON.stringify({cmd, callback, error, payload, options: {...options, customProtocolIpcBlocked: true}, __TAURI_INVOKE_KEY__: invokeKey}));
  }});
})();
