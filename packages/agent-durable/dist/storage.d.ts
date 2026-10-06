import type { Context } from "@earendil-works/chord";
import type { Storage } from "@earendil-works/pi-durable";
export declare class StorageOwnerConflict extends Error {
    readonly ownerPid: number | undefined;
    constructor(path: string, ownerPid: number | undefined);
}
/**
 * Open the SQLite store under a single-owner guard. One process owns one
 * storage file; a second opener fails closed instead of corrupting WAL state.
 * A stale lock (dead owner pid) is taken over — sidecar/companion death is a
 * normal reopen path, not an error.
 */
export declare function openOwnedStorage(path: string, context: Context): Promise<{
    storage: Storage;
    release: () => void;
}>;
