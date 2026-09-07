import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from './logger.js';
import { registerJournalEntryPageNodeTag } from './journal-entry-page-node-tag.js';
import { registerRelationshipAuthoringEntryPoints } from './relationship-authoring-window.js';
import { registerRelationshipListEntryPoints } from './relationship-list-window.js';

/**
 * ADAPT-010 follow-up (reviewer finding on ADAPT-009), extended by ADAPT-012
 * (ADR-0013 point 1 / Disadvantages) from n=2 to n=3:
 * `journal-entry-page-node-tag.ts`'s, `relationship-authoring-window.ts`'s,
 * and now `relationship-list-window.ts`'s `getHeaderControlsJournalEntryPageSheet`
 * (and, for the latter two, `getHeaderControlsActorSheetV2`) registrations
 * were each only ever tested in isolation, against their own separate mock
 * `Hooks` — each module's test suite only confirms *its own* `Hooks.on`
 * call, never that all three modules' handlers genuinely coexist on one
 * real, shared hook dispatch the way `module-entry.ts` actually wires them
 * (all three call `Hooks.on('getHeaderControlsJournalEntryPageSheet', ...)`
 * at startup, per real Foundry semantics where `Hooks.on` supports multiple
 * listeners per hook name and every one of them is invoked with the same
 * arguments).
 *
 * ADR-0013 named this explicitly rather than leaving it to be assumed by
 * extrapolation from the n=2 case: "coexistence has only been *proven* at
 * n=2 ... it should get its own (or an extended) coexistence assertion
 * rather than assuming it holds by extrapolation to n=3."
 *
 * This test builds a shared mock `Hooks` whose `on` pushes into an array
 * keyed by hook name (unlike any one module's own per-file mock, which only
 * ever tracks a single handler), registers all three real entry points
 * against it, fires every registered handler once with one shared
 * `app`/`controls`, and asserts all three modules' entries land in that one
 * `controls` array — not just that each module's own `Hooks.on` was called.
 * Covers both `getHeaderControlsJournalEntryPageSheet` (all three modules
 * register on it) and `getHeaderControlsActorSheetV2` (the two Relationship
 * modules register on it; the Node-type tag module is Actor-sheet-only via
 * a separate file, `actor-node-type-tag.ts`, not exercised here since it
 * isn't part of the JournalEntryPage-sheet coexistence this suite's
 * original name targets — its own Actor-sheet coexistence with the two
 * Relationship modules is asserted in the second describe block below).
 */
describe('getHeaderControlsJournalEntryPageSheet — cross-module coexistence (ADAPT-010, extended by ADAPT-012 to n=3)', () => {
  let hookHandlers: Record<string, ((...args: never[]) => void)[]>;

  beforeEach(() => {
    hookHandlers = {};
    (globalThis as { Hooks?: unknown }).Hooks = {
      once: vi.fn(),
      on: vi.fn((hook: string, callback: (...args: never[]) => void) => {
        (hookHandlers[hook] ??= []).push(callback);
      }),
    };
    (globalThis as { foundry?: unknown }).foundry = {
      applications: {
        api: {
          DialogV2: { prompt: vi.fn(), confirm: vi.fn() },
          ApplicationV2: class {},
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { Hooks?: unknown }).Hooks;
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  it('all three registrations add a listener under the same hook name, and firing the hook once invokes all three, pushing all three entries into the shared controls array', () => {
    const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    registerJournalEntryPageNodeTag();
    registerRelationshipAuthoringEntryPoints(() => undefined, log);
    registerRelationshipListEntryPoints(() => undefined, log);

    const handlers = hookHandlers['getHeaderControlsJournalEntryPageSheet'] ?? [];
    // Three independent `Hooks.on` calls under the same hook name really
    // did all register - none replacing another.
    expect(handlers).toHaveLength(3);

    const controls: { icon: string; label: string; onClick: () => void }[] = [];
    const push = (entry: { icon: string; label: string; onClick: () => void }): void => {
      controls.push(entry);
    };
    const app = {
      document: {
        uuid: 'JournalEntryPage.1',
        name: 'Biografía',
        documentName: 'JournalEntryPage',
      },
    };

    // Real Foundry dispatch: every listener registered for the hook fires,
    // in turn, against the same app/controls.
    for (const handler of handlers) {
      (handler as (app: unknown, controls: { push: typeof push }) => void)(app, { push });
    }

    expect(controls).toHaveLength(3);
    const labels = controls.map((entry) => entry.label);
    expect(labels).toContain('Archivexus Node Type');
    expect(labels).toContain('New Relationship…');
    expect(labels).toContain('Relationships…');
  });
});

/**
 * The Actor-sheet-side mirror: `getHeaderControlsActorSheetV2` gets a
 * listener from `actor-node-type-tag.ts` (a separate registration
 * function, `registerActorNodeTypeTag`, not exercised in the suite above)
 * plus the same two Relationship modules — also proven at n=3, not just
 * assumed from the JournalEntryPage case.
 */
describe('getHeaderControlsActorSheetV2 — cross-module coexistence (ADAPT-012, n=3)', () => {
  let hookHandlers: Record<string, ((...args: never[]) => void)[]>;

  beforeEach(async () => {
    hookHandlers = {};
    (globalThis as { Hooks?: unknown }).Hooks = {
      once: vi.fn(),
      on: vi.fn((hook: string, callback: (...args: never[]) => void) => {
        (hookHandlers[hook] ??= []).push(callback);
      }),
    };
    (globalThis as { foundry?: unknown }).foundry = {
      applications: {
        api: {
          DialogV2: { prompt: vi.fn(), confirm: vi.fn() },
          ApplicationV2: class {},
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { Hooks?: unknown }).Hooks;
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  it('all three registrations add a listener under the same hook name, and firing the hook once invokes all three, pushing all three entries into the shared controls array', async () => {
    const { registerActorNodeTypeTag } = await import('./actor-node-type-tag.js');
    const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    registerActorNodeTypeTag();
    registerRelationshipAuthoringEntryPoints(() => undefined, log);
    registerRelationshipListEntryPoints(() => undefined, log);

    const handlers = hookHandlers['getHeaderControlsActorSheetV2'] ?? [];
    expect(handlers).toHaveLength(3);

    const controls: { icon: string; label: string; onClick: () => void }[] = [];
    const push = (entry: { icon: string; label: string; onClick: () => void }): void => {
      controls.push(entry);
    };
    const app = {
      document: {
        uuid: 'Actor.1',
        name: 'Kharra',
        documentName: 'Actor',
        flags: {},
      },
    };

    for (const handler of handlers) {
      (handler as (app: unknown, controls: { push: typeof push }) => void)(app, { push });
    }

    expect(controls).toHaveLength(3);
    const labels = controls.map((entry) => entry.label);
    expect(labels).toContain('Archivexus Node Type');
    expect(labels).toContain('New Relationship…');
    expect(labels).toContain('Relationships…');
  });
});
