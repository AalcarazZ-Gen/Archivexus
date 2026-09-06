import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { WorkerStorageProvider } from './worker-storage-provider.js';

/**
 * The real, browser-side entry point: creates the dedicated Worker
 * `worker/sqlite.worker.ts` runs in, wraps it in a `WorkerStorageProvider`,
 * awaits `init()` (running pending migrations — ADR-0008 point 3), and
 * hands back a ready-to-use `StorageProvider`. This is the one function
 * the Foundry Adapter (or a future Web UI) needs to call to get real
 * persistence; everything else in this package is an implementation
 * detail behind the `StorageProvider` interface.
 *
 * `new URL('./worker/sqlite.worker.ts', import.meta.url)` is what makes
 * Vite emit a separate, code-split Worker chunk (`worker: { format: 'es' }`
 * in `vite.foundry.config.ts`) resolved relative to *this* module's own
 * location — which only resolves correctly under Foundry's nested static
 * path because of that config's `base: './'` fix (STORE-002's finding).
 *
 * Not unit-tested directly — needs a real browser `Worker` constructor.
 * `WorkerStorageProvider`'s request/response correlation logic (the part
 * that's actually non-trivial) is unit-tested against a fake transport in
 * `worker-storage-provider.test.ts`; this function is the thin, verified
 * only by `tsc --noEmit` and manual/live Foundry re-verification.
 */
export async function createSqliteStorageProvider(): Promise<StorageProvider> {
  const worker = new Worker(new URL('./worker/sqlite.worker.ts', import.meta.url), {
    type: 'module',
  });
  const provider = new WorkerStorageProvider(worker);
  await provider.init();
  return provider;
}
