/**
 * Minimal ambient declarations for the handful of Foundry VTT globals this
 * package's module entry point touches. This is deliberately not a real
 * Foundry types dependency — the same tradeoff journal-entry-page-to-node.ts
 * makes for `FoundryJournalEntryPageLike`: no npm dependency on
 * @league-of-foundry-developers/foundry-vtt-types, just enough shape for
 * `tsc` to check module-entry.ts. Extend this file as more Foundry globals
 * are touched; only add the real types package if that tradeoff stops being
 * worth it (see ADR-0006).
 */
declare const Hooks: {
  once(hook: string, callback: () => void): void;
};

// Node's own lib.d.ts covers `console` at runtime; the project's tsconfig
// intentionally omits the DOM lib (Core stays platform-agnostic), so this
// module-only file declares just the `console.log` shape it actually uses.
declare const console: {
  log(...args: unknown[]): void;
};
