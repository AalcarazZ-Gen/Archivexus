import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';
import {
  buildRelationshipAuthoringContentHTML,
  getRelationshipAuthoringApplicationClass,
  registerRelationshipAuthoringEntryPoints,
  type FoundryHeaderControlsLike,
  type FoundrySheetAppLike,
} from './relationship-authoring-window.js';

describe('buildRelationshipAuthoringContentHTML', () => {
  it('renders both drop zones as document-tags single, with no type attribute', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain('<document-tags single name="origin"');
    expect(html).toContain('<document-tags single name="target"');
    expect(html).not.toMatch(/document-tags[^>]*\btype=/);
  });

  it('uses the given endpoint labels', () => {
    const html = buildRelationshipAuthoringContentHTML('First entity', 'Second entity');
    expect(html).toContain('>First entity</label>');
    expect(html).toContain('>Second entity</label>');
  });

  it('pre-fills the Origin drop zone with the given uuid, and leaves Target empty', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target', 'Actor.kharra');
    expect(html).toContain(
      'name="origin" id="archivexus-relationship-origin" value="Actor.kharra"',
    );
    expect(html).toContain(
      '<document-tags single name="target" id="archivexus-relationship-target"></document-tags>',
    );
  });

  it('omits the value attribute entirely when no prefill is given', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain(
      '<document-tags single name="origin" id="archivexus-relationship-origin"></document-tags>',
    );
  });

  it('HTML-escapes the prefilled uuid', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target', 'Actor."1"');
    expect(html).toContain('value="Actor.&quot;1&quot;"');
  });

  it('starts with the Definition select empty/disabled and the placeholder text (ADR-0010 point 4)', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain(
      '<select name="definitionId" id="archivexus-relationship-definition" disabled>',
    );
    expect(html).toContain('Drop both entities first');
  });

  it('starts with the Save button disabled and labeled "Save"', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain('<button type="button" data-action="save" disabled>Save</button>');
  });

  it('starts with the summary and warning regions hidden', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain('data-role="summary" hidden');
    expect(html).toContain('data-role="warning" hidden');
  });
});

describe('registerRelationshipAuthoringEntryPoints', () => {
  type HeaderControlsHandler = (
    app: FoundrySheetAppLike,
    controls: FoundryHeaderControlsLike,
  ) => void;

  let hookHandlers: Record<string, HeaderControlsHandler>;
  let log: Logger;

  beforeEach(() => {
    hookHandlers = {};
    log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    (globalThis as { Hooks?: unknown }).Hooks = {
      once: vi.fn(),
      on: vi.fn((hook: string, callback: HeaderControlsHandler) => {
        hookHandlers[hook] = callback;
      }),
    };
  });

  afterEach(() => {
    delete (globalThis as { Hooks?: unknown }).Hooks;
  });

  function makeControls(): FoundryHeaderControlsLike & { push: ReturnType<typeof vi.fn> } {
    return { push: vi.fn() } as FoundryHeaderControlsLike & { push: ReturnType<typeof vi.fn> };
  }

  function makeApp(documentName: string): FoundrySheetAppLike {
    return {
      document: {
        uuid: `${documentName}.1`,
        name: 'Some Document',
        documentName,
      },
    };
  }

  it('registers exactly one handler on both getHeaderControlsActorSheetV2 and getHeaderControlsJournalEntryPageSheet', () => {
    registerRelationshipAuthoringEntryPoints(() => undefined, log);
    expect(Hooks.on).toHaveBeenCalledTimes(2);
    expect(Hooks.on).toHaveBeenCalledWith('getHeaderControlsActorSheetV2', expect.any(Function));
    expect(Hooks.on).toHaveBeenCalledWith(
      'getHeaderControlsJournalEntryPageSheet',
      expect.any(Function),
    );
  });

  it('pushes a "New Relationship…" control on the Actor sheet hook', () => {
    registerRelationshipAuthoringEntryPoints(() => undefined, log);
    const controls = makeControls();
    hookHandlers['getHeaderControlsActorSheetV2']?.(makeApp('Actor'), controls);

    expect(controls.push).toHaveBeenCalledTimes(1);
    const [entry] = controls.push.mock.calls[0] as [{ icon: string; label: string }];
    expect(entry.label).toBe('New Relationship…');
  });

  it('pushes the same control on the JournalEntryPage sheet hook', () => {
    registerRelationshipAuthoringEntryPoints(() => undefined, log);
    const controls = makeControls();
    hookHandlers['getHeaderControlsJournalEntryPageSheet']?.(makeApp('JournalEntryPage'), controls);

    expect(controls.push).toHaveBeenCalledTimes(1);
  });

  it('warns and does not attempt to open the window when storage is not ready yet', () => {
    registerRelationshipAuthoringEntryPoints(() => undefined, log);
    const controls = makeControls();
    hookHandlers['getHeaderControlsActorSheetV2']?.(makeApp('Actor'), controls);

    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    // No `foundry.applications.api.ApplicationV2` stub is set up in this
    // describe block at all - if onClick tried to construct the window
    // instead of returning early, this would throw.
    expect(() => entry.onClick()).not.toThrow();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Storage provider not ready'));
  });
});

describe('getRelationshipAuthoringApplicationClass / the live window', () => {
  let log: Logger;
  let storage: StorageProvider;
  let savedRelationships: Relationship[];
  let renderMock: ReturnType<typeof vi.fn>;
  let closeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    savedRelationships = [];
    renderMock = vi.fn();
    closeMock = vi.fn().mockResolvedValue(undefined);

    storage = {
      init: vi.fn(),
      saveNode: vi.fn(),
      getNode: vi.fn().mockResolvedValue(undefined as Node | undefined),
      deleteNode: vi.fn(),
      listNodes: vi.fn().mockResolvedValue([]),
      saveRelationship: vi.fn(async (relationship: Relationship) => {
        savedRelationships.push(relationship);
      }),
      getRelationship: vi.fn(),
      deleteRelationship: vi.fn(),
      listRelationships: vi.fn().mockResolvedValue([]),
      getRelationshipsForNode: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    } as unknown as StorageProvider;

    // Minimal ApplicationV2 stand-in: enough to prove the subclass is a
    // real, instantiable constructor that forwards to Foundry's own
    // `render`/`close`. Does NOT simulate a real DOM (`element` is left
    // undefined) - `_onRender`'s querySelector-based wiring and the whole
    // interactive drop/select/save flow need a real `<document-tags>`/
    // `<select>` DOM this environment can't provide, which is exactly the
    // "needs live Foundry verification" gap this file's own top-level doc
    // comment names.
    (globalThis as { foundry?: unknown }).foundry = {
      applications: {
        api: {
          ApplicationV2: class {
            element: unknown;
            constructor() {
              this.element = undefined;
            }
            render(force?: boolean): unknown {
              renderMock(force);
              return this;
            }
            close(): Promise<unknown> {
              return closeMock();
            }
          },
        },
      },
      utils: {
        fromUuid: vi.fn(),
        randomID: vi.fn(() => 'generated-id'),
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  it('is a constructor that can be instantiated with storage/log and calls through to render(true)', () => {
    const ApplicationClass = getRelationshipAuthoringApplicationClass();
    const instance = new ApplicationClass({ storage, log });
    instance.render(true);
    expect(renderMock).toHaveBeenCalledWith(true);
  });

  it('returns the same class on repeated calls (memoized)', () => {
    const first = getRelationshipAuthoringApplicationClass();
    const second = getRelationshipAuthoringApplicationClass();
    expect(first).toBe(second);
  });
});
