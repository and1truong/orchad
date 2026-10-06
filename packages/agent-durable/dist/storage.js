import { mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
export class StorageOwnerConflict extends Error {
    ownerPid;
    constructor(path, ownerPid) {
        super(`Storage already owned by a live process: ${path} (pid ${ownerPid ?? "?"})`);
        this.ownerPid = ownerPid;
        this.name = "StorageOwnerConflict";
    }
}
const pidAlive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
};
/**
 * Open the SQLite store under a single-owner guard. One process owns one
 * storage file; a second opener fails closed instead of corrupting WAL state.
 * A stale lock (dead owner pid) is taken over — sidecar/companion death is a
 * normal reopen path, not an error.
 */
export async function openOwnedStorage(path, context) {
    mkdirSync(dirname(path), { recursive: true });
    const lockPath = `${path}.owner`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const fd = openSync(lockPath, "wx");
            writeSync(fd, JSON.stringify({ pid: process.pid }));
            break;
        }
        catch {
            let ownerPid;
            try {
                ownerPid = JSON.parse(readFileSync(lockPath, "utf8")).pid;
            }
            catch { }
            // Any live owner blocks a second open — including this same process.
            // A same-pid hit means the previous runner never released; running two
            // Harnesses over one DB would split the journal's brain.
            if (ownerPid !== undefined && pidAlive(ownerPid))
                throw new StorageOwnerConflict(path, ownerPid);
            rmSync(lockPath, { force: true });
            if (attempt === 1)
                throw new StorageOwnerConflict(path, undefined);
        }
    }
    const storage = await openNodeSqliteStorage(path);
    return {
        storage,
        release: () => {
            try {
                rmSync(lockPath, { force: true });
            }
            catch { }
        },
    };
}
