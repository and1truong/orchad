chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});
// Worker owns no run, secret or queued write. Suspension cannot replay anything.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.tab ||
    sender.url !== chrome.runtime.getURL("sidepanel.html") ||
    (sender.frameId && sender.frameId !== 0)
  )
    return false;
  if (message?.type === "health" && Object.keys(message).length === 1)
    respond({ ok: true });
  return false;
});
