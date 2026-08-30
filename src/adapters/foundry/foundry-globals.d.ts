/**
 * Minimal ambient declarations for the Foundry VTT globals this package
 * touches — no real types dependency (same tradeoff as
 * FoundryJournalEntryPageLike). Extend as more globals are touched, and
 * keep eslint.config.js's FOUNDRY_ADAPTER_GLOBALS in sync.
 */
declare const Hooks: {
  once(hook: string, callback: () => void): void;
};

// tsconfig omits the DOM lib (Core stays platform-agnostic), so `console`
// needs its own declaration here — just the shape logger.ts uses.
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
