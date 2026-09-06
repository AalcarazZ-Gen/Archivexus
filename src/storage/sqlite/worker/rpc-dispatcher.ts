import type { StorageProvider } from '../../../core/storage/storage-provider.js';
import type { StorageRpcRequest, StorageRpcResponse } from './protocol.js';

/**
 * Worker-side half of the RPC: given the real `StorageProvider` instance
 * (a `SqliteStorageProvider` wired to the live OPFS-backed db in
 * `sqlite.worker.ts`), returns a function that executes one request and
 * resolves to its response — success or error, never a thrown exception,
 * since this always crosses a `postMessage` boundary. Pure with respect to
 * I/O framing (no `self`/`postMessage` calls here), so it's unit-testable
 * with a fake `StorageProvider` and no real Worker.
 */
export function createRpcDispatcher(
  provider: StorageProvider,
): (request: StorageRpcRequest) => Promise<StorageRpcResponse> {
  return async (request: StorageRpcRequest): Promise<StorageRpcResponse> => {
    try {
      const method = provider[request.method] as (...args: unknown[]) => Promise<unknown>;
      const result = await method.apply(provider, [...request.args]);
      return { id: request.id, ok: true, result };
    } catch (error) {
      return {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
