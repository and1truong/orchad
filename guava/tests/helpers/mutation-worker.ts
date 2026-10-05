import { parentPort, workerData } from "node:worker_threads";
import { openDatabase } from "../../src/server/database.ts";
import { CanvasService } from "../../src/server/service.ts";
const db = openDatabase(workerData.path, false);
parentPort!.postMessage("ready");
parentPort!.once("message", () => {
  const result = new CanvasService(db).invoke(
    { id: "investigator", role: "investigator" },
    workerData.call,
  );
  parentPort!.postMessage(result);
  db.close();
});
