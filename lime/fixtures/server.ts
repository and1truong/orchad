import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const server = createServer(async (req, res) => {
  if (req.url === "/empty") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      "<!doctype html><title>Unsupported fixture</title><h1>No bridge here</h1>",
    );
    return;
  }
  if (req.url === "/counter.js") {
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.end(
      await readFile(
        fileURLToPath(new URL("./counter-page.js", import.meta.url)),
      ),
    );
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(
    '<!doctype html><title>Demo Counter — test double</title><style>body{font:20px system-ui;background:#edf3ef;padding:60px;color:#243a30}h1{font-size:40px}#value{font-size:100px}small{color:#60776a}#ask{font:16px system-ui;margin-top:24px}#ask input{font:16px system-ui;width:420px}</style><h1>Demo Counter</h1><small>Interoperability fixture · NOT production authorization</small><div id="value">0</div><p id="revision">Revision 0</p><div id="ask"><input id="asktext" value="Increment the counter by one" aria-label="App prompt"><button id="askgo">Request agent turn</button> <span id="askout"></span></div><script src="/counter.js"></script><script>document.getElementById("askgo").onclick=async()=>{const out=document.getElementById("askout");const f=window.agentBridgeV1&&window.agentBridgeV1.requestAgentTurn;if(typeof f!=="function"){out.textContent="requestAgentTurn unavailable — pin and consent in Lime first";return}out.textContent="requesting…";const r=await f(document.getElementById("asktext").value);out.textContent=r.ok?("agent: "+(r.text||"")):("failed: "+(r.error||""))};</script>',
  );
});
server.listen(4313, "127.0.0.1", () =>
  console.log("Counter fixture http://127.0.0.1:4313 · unsupported /empty"),
);
