/**
 * Minimal ambient declarations for the Foundry VTT globals this package
 * touches — no real types dependency (same tradeoff as
 * FoundryJournalEntryPageLike). Extend as more globals are touched, and
 * keep eslint.config.js's FOUNDRY_ADAPTER_GLOBALS in sync.
 */
declare const Hooks: {
  once(hook: string, callback: () => void): void;
  on(hook: string, callback: (...args: never[]) => void): void;
  // `Hooks.off(hook, callback)` — the Relationship Console (VIEW-001i)
  // unbinds its `archivexus.relationshipsChanged` listener on close so a
  // closed window can't be re-rendered by a later change.
  off(hook: string, callback: (...args: never[]) => void): void;
  callAll(hook: string, ...args: unknown[]): void;
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
    // `foundry.applications.sidebar.AbstractSidebarTab` — the base class the
    // Codex graph tab (codex-sidebar-tab.ts, VIEW-001a) subclasses; loose
    // for the same cast-through-`unknown` reason as `api` above.
    sidebar: {
      AbstractSidebarTab: unknown;
    };
  };
  utils: {
    fromUuid(uuid: string): Promise<unknown>;
    randomID(length?: number): string;
  };
};

// `CONFIG.ui.sidebar.TABS` (the native sidebar-tab registry) and
// `CONFIG.ui[tabName]` (where a tab's class is registered) — written by
// codex-sidebar-tab.ts's `registerCodexSidebarTab`. Deliberately loose,
// same tradeoff as `game`/`ui`; the registration function takes a narrow
// structural type of its own so it stays unit-testable.
declare const CONFIG: {
  ui: {
    sidebar: { TABS: Record<string, unknown> };
    [key: string]: unknown;
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
  // `game.user.isGM` — the Codex (VIEW-001a) filters `hidden` Nodes out for
  // non-GM viewers (ADR-0003). Deliberately optional/loose: `game.user`
  // isn't populated until Foundry's setup phase.
  user?: { isGM?: boolean };
  // `game.settings` — the first-run guidance's world-scoped dismissal flag
  // (VIEW-001g, first `game.settings` use in the codebase). Loose, same
  // tradeoff as the rest of this file; `first-run-guidance.ts` takes a
  // narrow `FoundrySettingsLike` of its own so its logic stays testable.
  settings: {
    register(namespace: string, key: string, data: Record<string, unknown>): void;
    get(namespace: string, key: string): unknown;
    set(namespace: string, key: string, value: unknown): Promise<unknown>;
  };
};

// Foundry's own client-side "download this data as a file" helper
// (`saveDataToFile(data, mimeType, filename)`) — used by
// `export-snapshot.ts` instead of hand-rolled Blob/anchor-click DOM code,
// so this package needs no Blob/URL/document ambient surface for the
// export action.
declare function saveDataToFile(data: string, type: string, filename: string): void;

// `ui.notifications.warn(message)` (storage-sync.ts, ADR-0011 point 5) — the
// non-blocking GM-facing notification for a retag that orphans existing
// Relationships. Same minimal-surface tradeoff as everything else in this
// file: only the one method this codebase actually calls is declared.
declare const ui: {
  notifications: {
    warn(message: string): void;
  };
  // `ui.sidebar` — module-entry.ts switches the sidebar to the Codex tab
  // (and expands it) when the GM picks "Show me the Codex" in the welcome
  // dialog (VIEW-001g). Both tab-switch method names are declared because
  // the v13 ApplicationV2 Sidebar renamed `activateTab` → `changeTab`; the
  // caller tries whichever exists. `expand()` is needed because switching
  // the active tab is invisible while the sidebar is collapsed.
  sidebar?: {
    activateTab?(tabName: string): void;
    changeTab?(tab: string, group?: string, options?: Record<string, unknown>): void;
    expand?(): void;
  };
};

// `Boolean` etc. are ES globals available without the DOM lib; no extra
// declaration needed for `first-run-guidance.ts`'s `type: Boolean` setting.
