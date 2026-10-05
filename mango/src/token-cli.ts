import { readFileSync } from "node:fs";
import { SqliteStore } from "./store.js";
const store = new SqliteStore(process.env.SQLITE_PATH ?? "mango.sqlite");
try {
  const [action, id, modelList] = process.argv.slice(2);
  const principalFor = (list: string) => ({
    id: id!,
    models: list.split(","),
    rpm: 30,
    concurrency: 2,
    quota: 1_000_000,
  });
  if (action === "issue" && id && modelList) {
    if (store.getPrincipal(id))
      throw new Error(
        `Principal ${id} already exists; use 'token update' to replace its model list (applies to all its tokens)`,
      );
    process.stdout.write(store.provision(principalFor(modelList)) + "\n");
  } else if (action === "update" && id && modelList) {
    if (!store.getPrincipal(id))
      throw new Error(`Principal ${id} does not exist; use 'token issue'`);
    store.setModels(id, modelList.split(","));
    process.stderr.write(
      `Replaced model list for ${id} (limits unchanged); every existing token now uses it\n`,
    );
  } else if (action === "revoke") {
    store.revoke(readFileSync(0, "utf8").trim());
  } else
    throw new Error(
      "Usage: token issue|update PRINCIPAL MODEL[,MODEL] | token revoke < token-file",
    );
} finally {
  store.close();
}
