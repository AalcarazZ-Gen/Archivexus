/**
 * Minimal ambient declarations for the browser globals
 * `create-sqlite-storage-provider.ts` needs to spin up the dedicated
 * Worker `worker/sqlite.worker.ts` runs in — same no-DOM-lib tradeoff as
 * `worker/worker-globals.d.ts` and `src/adapters/foundry/foundry-globals.d.ts`.
 */

declare class URL {
  constructor(url: string, base?: string);
}

/**
 * This project's tsconfig omits the `dom` lib (which is what normally
 * supplies `ImportMeta.url`'s typing) — declaration-merge it back in just
 * for the one property `create-sqlite-storage-provider.ts` needs to
 * resolve the Worker's script URL relative to its own module location.
 */
interface ImportMeta {
  readonly url: string;
}

declare class Worker {
  constructor(scriptUrl: URL | string, options?: { type?: 'module' | 'classic' });
  postMessage(message: unknown): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  terminate(): void;
}
