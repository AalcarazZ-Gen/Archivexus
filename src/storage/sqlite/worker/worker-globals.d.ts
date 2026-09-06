/**
 * Minimal ambient declarations for the dedicated-Worker globals
 * `sqlite.worker.ts` needs — same no-DOM/WebWorker-lib tradeoff as
 * `src/adapters/foundry/foundry-globals.d.ts` (this project's tsconfig
 * deliberately omits the `webworker`/`dom` libs so Core stays
 * platform-agnostic; this file is the one place in the SQLite storage
 * layer that's genuinely Worker-specific, mirroring how
 * `foundry-globals.d.ts` is the one place that's genuinely Foundry-specific).
 */

interface AmbientMessageEvent<T> {
  readonly data: T;
}

declare const self: {
  onmessage: ((event: AmbientMessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
};
