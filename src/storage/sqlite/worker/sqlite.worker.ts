import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { SqliteStorageProvider } from '../sqlite-storage-provider.js';
import { createSqliteExecutor, type SqliteDatabaseLike } from '../sqlite-executor.js';
import { createRpcDispatcher } from './rpc-dispatcher.js';
import type { StorageRpcRequest, StorageRpcResponse } from './protocol.js';

/**
 * The dedicated Worker ADR-0008 requires: OPFS `SyncAccessHandle`s (what
 * `opfs-sahpool` uses under the hood to persist synchronously) are only
 * obtainable inside a Worker, never on the main thread — this is the real
 * reason `StorageProvider` is Promise-based everywhere and
 * `WorkerStorageProvider` exists at all, not just a performance choice.
 * STORE-002 confirmed this exact shape (dynamic import of
 * `@sqlite.org/sqlite-wasm`, `installOpfsSAHPoolVfs`, a dedicated Worker)
 * round-trips a write/read cleanly inside a real Foundry client, after
 * fixing `vite.foundry.config.ts`'s `base` path (see its own comment) —
 * that fix is required for this file's own Worker chunk to resolve
 * correctly under Foundry's nested static-file serving path.
 *
 * Not unit-tested directly — needs a real browser Worker + OPFS, neither
 * available in this sandbox. Verified with `tsc --noEmit` only; needs live
 * re-verification inside a running Foundry client (see this ticket's
 * session-log entry for what specifically still needs checking).
 */

const DB_FILENAME = 'archivexus.sqlite3';
const OPFS_SAHPOOL_VFS_NAME = 'archivexus-opfs-sahpool';

type Dispatch = (request: StorageRpcRequest) => Promise<StorageRpcResponse>;

let dispatch: Dispatch | undefined;
const queuedRequests: StorageRpcRequest[] = [];

function drainQueueWith(activeDispatch: Dispatch): void {
  dispatch = activeDispatch;
  for (const request of queuedRequests.splice(0)) {
    void dispatch(request).then((response) => self.postMessage(response));
  }
}

self.onmessage = (event): void => {
  const request = event.data as StorageRpcRequest;
  if (dispatch) {
    void dispatch(request).then((response) => self.postMessage(response));
  } else {
    queuedRequests.push(request);
  }
};

async function main(): Promise<void> {
  const sqlite3 = await sqlite3InitModule();
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: OPFS_SAHPOOL_VFS_NAME });
  const db = new poolUtil.OpfsSAHPoolDb(DB_FILENAME);
  // `OpfsSAHPoolDatabase` is structurally close to, but not an exact
  // overload match for, our own narrower `SqliteDatabaseLike` (it has many
  // more `exec` overloads than this package uses) — same cast-through-
  // `unknown` pattern this codebase already uses for Foundry's own
  // complex types (see `sqlite-executor.ts`'s header comment).
  const executor = createSqliteExecutor(db as unknown as SqliteDatabaseLike);
  const provider = new SqliteStorageProvider(executor);
  drainQueueWith(createRpcDispatcher(provider));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // Startup failed before a real dispatcher exists — fail every queued (and
  // any future) request explicitly rather than leaving the caller's Promise
  // pending forever.
  drainQueueWith((request) =>
    Promise.resolve({
      id: request.id,
      ok: false,
      error: `Storage worker failed to start: ${message}`,
    }),
  );
});
