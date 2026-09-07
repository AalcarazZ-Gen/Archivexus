import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger } from './logger.js';
import { registerJournalEntryPageNodeTag } from './journal-entry-page-node-tag.js';
import { registerRelationshipAuthoringEntryPoints } from './relationship-authoring-window.js';

/**
 * ADAPT-010 follow-up (reviewer finding on ADAPT-009): both
 * `journal-entry-page-node-tag.ts`'s and `relationship-authoring-window.ts`'s
 * `getHeaderControlsJournalEntryPageSheet` registrations were each only ever
 * tested in isolation, against their own separate mock `Hooks` — each
 * module's test suite only confirms *its own* `Hooks.on` call, never that
 * the two modules' handlers genuinely coexist on one real, shared hook
 * dispatch the way `module-entry.ts` actually wires them (both call
 * `Hooks.on('getHeaderControlsJournalEntryPageSheet', ...)` at startup,
 * per real Foundry semantics where `Hooks.on` supports multiple listeners
 * per hook name and every one of them is invoked with the same arguments).
 *
 * This test builds a shared mock `Hooks` whose `on` pushes into an array
 * keyed by hook name (unlike either module's own per-file mock, which only
 * ever tracks a single handler), registers both real entry points against
 * it, fires every registered `getHeaderControlsJournalEntryPageSheet`
 * handler once with one shared `app`/`controls`, and asserts both modules'
 * entries land in that one `controls` array — not just that each module's
 * own `Hooks.on` was called.
 */
describe('getHeaderControlsJournalEntryPageSheet — cross-module coexistence (ADAPT-010)', () => {
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
          DialogV2: { prompt: vi.fn() },
          ApplicationV2: class {},
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { Hooks?: unknown }).Hooks;
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  it('both registrations add a listener under the same hook name, and firing the hook once invokes both, pushing both entries into the shared controls array', () => {
    const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    registerJournalEntryPageNodeTag();
    registerRelationshipAuthoringEntryPoints(() => undefined, log);

    const handlers = hookHandlers['getHeaderControlsJournalEntryPageSheet'] ?? [];
    // Two independent `Hooks.on` calls under the same hook name really did
    // both register - not one replacing the other.
    expect(handlers).toHaveLength(2);

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

    expect(controls).toHaveLength(2);
    const labels = controls.map((entry) => entry.label);
    expect(labels).toContain('Archivexus Node Type');
    expect(labels).toContain('New Relationship…');
  });
});
