/**
 * Minimal ambient declarations for the Foundry VTT globals this package
 * touches — no real types dependency (same tradeoff as
 * FoundryJournalEntryPageLike). Extend as more globals are touched, and
 * keep eslint.config.js's FOUNDRY_ADAPTER_GLOBALS in sync.
 */
declare const Hooks: {
  once(hook: string, callback: () => void): void;
  on(hook: string, callback: (...args: never[]) => void): void;
};

// tsconfig omits the DOM lib (Core stays platform-agnostic), so `console`
// needs its own declaration here — just the shape logger.ts uses.
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

// `DialogV2.prompt(...)` is the only member of Foundry's `foundry` global
// this package touches so far (actor-node-type-tag.ts); callers immediately
// cast through `unknown` to a narrower structural type (FoundryDialogV2Like),
// so this stays deliberately loose rather than modeling the real API.
declare const foundry: {
  applications: {
    api: {
      DialogV2: unknown;
    };
  };
};
