import { readFileSync } from "node:fs";
import { SqliteStore } from "./store.js";
const store = new SqliteStore(process.env.SQLITE_PATH ?? "mango.sqlite");
try {
  const [action, id, modelList] = process.argv.slice(2);
  if (action === "issue" && id && modelList) {
    const token = store.provision({
      id,
      models: modelList.split(","),
      rpm: 30,
      concurrency: 2,
      quota: 1_000_000,
    });
    process.stdout.write(token + "\n");
  } else if (action === "revoke") {
    store.revoke(readFileSync(0, "utf8").trim());
  } else
    throw new Error(
      "Usage: token issue PRINCIPAL MODEL[,MODEL] | token revoke < token-file",
    );
} finally {
  store.close();
}
