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

// `DialogV2.prompt(...)` (actor-node-type-tag.ts), `ApplicationV2` (the
// Relationship-authoring window's base class, relationship-authoring-
// window.ts) and `utils.fromUuid`/`utils.randomID` (resolving a dropped
// `<document-tags>` UUID to a real Document, and minting a new
// Relationship's id) are the only members of Foundry's `foundry` global
// this package touches so far; callers immediately cast through `unknown`
// to a narrower structural type of their own, so this stays deliberately
// loose rather than modeling the real API.
declare const foundry: {
  applications: {
    api: {
      DialogV2: unknown;
      ApplicationV2: unknown;
    };
  };
  utils: {
    fromUuid(uuid: string): Promise<unknown>;
    randomID(length?: number): string;
  };
};

// `game.actors`/`game.journal` (STORE-003, module-entry.ts's startup
// backfill) — deliberately loose (`unknown[]`), same no-inference/no-real-
// Foundry-types tradeoff as everywhere else in this file: callers cast each
// element to `FoundryActorLike`/`FoundryJournalEntryPageLike` themselves
// (storage-sync.ts already validates via those mapping functions, not here).
// `game.modules.get(id).api` is where module-entry.ts exposes
// `exportSnapshot` for now (no dedicated UI trigger yet - out of scope).
declare const game: {
  actors?: { contents: readonly unknown[] };
  journal?: { contents: readonly { pages: { contents: readonly unknown[] } }[] };
  modules: { get(id: string): { api?: Record<string, unknown> } | undefined };
};

// Foundry's own client-side "download this data as a file" helper
// (`saveDataToFile(data, mimeType, filename)`) — used by
// `export-snapshot.ts` instead of hand-rolled Blob/anchor-click DOM code,
// so this package needs no Blob/URL/document ambient surface for the
// export action.
declare function saveDataToFile(data: string, type: string, filename: string): void;
