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
    '<!doctype html><title>Demo Counter — test double</title><style>body{font:20px system-ui;background:#edf3ef;padding:60px;color:#243a30}h1{font-size:40px}#value{font-size:100px}small{color:#60776a}</style><h1>Demo Counter</h1><small>Interoperability fixture · NOT production authorization</small><div id="value">0</div><p id="revision">Revision 0</p><script src="/counter.js"></script>',
  );
});
server.listen(4313, "127.0.0.1", () =>
  console.log("Counter fixture http://127.0.0.1:4313 · unsupported /empty"),
);
