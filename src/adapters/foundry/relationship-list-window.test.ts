import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';
import {
  buildRelationshipListContentHTML,
  buildRelationshipListRowsHTML,
  getRelationshipListApplicationClass,
  registerRelationshipListEntryPoints,
  type MinimalDomElementLike,
  type RelationshipListRow,
} from './relationship-list-window.js';
import type { FoundryHeaderControlsLike, FoundrySheetAppLike } from './relationship-authoring-window.js';

describe('buildRelationshipListRowsHTML', () => {
  it('renders the empty state when there are no rows', () => {
    const html = buildRelationshipListRowsHTML([]);
    expect(html).toContain('No relationships yet.');
    expect(html).toContain('data-role="empty"');
  });

  it('renders one <li> per row, each with its id and a Delete button', () => {
    const rows: RelationshipListRow[] = [
      { id: 'rel-1', title: 'Kharra resides-in Puerto Umbral' },
      { id: 'rel-2', title: 'Kharra is ally-of the Miller family' },
    ];
    const html = buildRelationshipListRowsHTML(rows);

    expect(html).toContain('<li data-relationship-id="rel-1">');
    expect(html).toContain('Kharra resides-in Puerto Umbral');
    expect(html).toContain('<li data-relationship-id="rel-2">');
    expect(html).toContain('Kharra is ally-of the Miller family');
    expect(html.match(/data-action="delete"/g)).toHaveLength(2);
  });

  it('renders the title verbatim - no re-derivation, no re-checking symmetry', () => {
    const html = buildRelationshipListRowsHTML([{ id: 'rel-1', title: 'Exactly this sentence' }]);
    expect(html).toContain('Exactly this sentence');
  });

  it('HTML-escapes both the id and the title', () => {
    const html = buildRelationshipListRowsHTML([
      { id: 'rel."1"', title: 'A <script>bad</script> & "quoted" title' },
    ]);
    expect(html).toContain('data-relationship-id="rel.&quot;1&quot;"');
    expect(html).toContain('A &lt;script&gt;bad&lt;/script&gt; &amp; &quot;quoted&quot; title');
    expect(html).not.toContain('<script>');
  });
});

describe('buildRelationshipListContentHTML', () => {
  it('wraps the rows region in a stable data-role="rows" container', () => {
    const html = buildRelationshipListContentHTML([]);
    expect(html).toContain('<div data-role="rows">');
    expect(html).toContain('No relationships yet.');
  });

  it('includes rendered rows inside the same container', () => {
    const html = buildRelationshipListContentHTML([{ id: 'rel-1', title: 'Some title' }]);
    expect(html).toContain('data-role="rows"');
    expect(html).toContain('data-relationship-id="rel-1"');
  });
});

describe('registerRelationshipListEntryPoints', () => {
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
    } as unknown as FoundrySheetAppLike;
  }

  it('registers exactly one handler on both getHeaderControlsActorSheetV2 and getHeaderControlsJournalEntryPageSheet', () => {
    registerRelationshipListEntryPoints(() => undefined, log);
    expect(Hooks.on).toHaveBeenCalledTimes(2);
    expect(Hooks.on).toHaveBeenCalledWith('getHeaderControlsActorSheetV2', expect.any(Function));
    expect(Hooks.on).toHaveBeenCalledWith(
      'getHeaderControlsJournalEntryPageSheet',
      expect.any(Function),
    );
  });

  it('pushes a "Connections" control on the Actor sheet hook', () => {
    registerRelationshipListEntryPoints(() => undefined, log);
    const controls = makeControls();
    hookHandlers['getHeaderControlsActorSheetV2']?.(makeApp('Actor'), controls);

    expect(controls.push).toHaveBeenCalledTimes(1);
    const [entry] = controls.push.mock.calls[0] as [{ icon: string; label: string }];
    expect(entry.label).toBe('Connections');
    expect(entry.icon).toBe('fa-solid fa-list');
  });

  it('pushes the same control on the JournalEntryPage sheet hook', () => {
    registerRelationshipListEntryPoints(() => undefined, log);
    const controls = makeControls();
    hookHandlers['getHeaderControlsJournalEntryPageSheet']?.(makeApp('JournalEntryPage'), controls);

    expect(controls.push).toHaveBeenCalledTimes(1);
  });

  it('warns and does not attempt to open the window when storage is not ready yet', () => {
    registerRelationshipListEntryPoints(() => undefined, log);
    const controls = makeControls();
    hookHandlers['getHeaderControlsActorSheetV2']?.(makeApp('Actor'), controls);

    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    // No `foundry.applications.api.ApplicationV2` stub is set up in this
    // describe block at all - if onClick tried to construct the window
    // instead of returning early, this would throw.
    expect(() => entry.onClick()).not.toThrow();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Storage provider not ready'));
  });

  it('warns and does not open the window for an unsupported document type', () => {
    registerRelationshipListEntryPoints(() => ({}) as unknown as StorageProvider, log);
    const controls = makeControls();
    hookHandlers['getHeaderControlsActorSheetV2']?.(makeApp('Scene'), controls);

    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    // No `foundry.applications.api.ApplicationV2` stub is set up here
    // either - if onClick tried to construct the window despite the
    // unresolved document, this would throw.
    expect(() => entry.onClick()).not.toThrow();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('unsupported document type'),
    );
  });
});

describe('getRelationshipListApplicationClass / the live window', () => {
  let log: Logger;
  let storage: StorageProvider;
  let renderMock: ReturnType<typeof vi.fn>;
  let closeMock: ReturnType<typeof vi.fn>;
  let dialogConfirmMock: ReturnType<typeof vi.fn>;

  const RELATIONSHIPS: Relationship[] = [
    {
      kind: 'relationship',
      id: 'rel-1',
      title: 'Kharra resides-in Puerto Umbral',
      origin: 'Actor.kharra',
      target: 'JournalEntryPage.puerto-umbral',
      definitionId: 'resides-in',
      metadata: {},
      visibility: 'gm-only',
      history: [],
      blocks: [],
      tags: [],
      references: [],
    } as unknown as Relationship,
    {
      kind: 'relationship',
      id: 'rel-2',
      title: 'Kharra is ally-of the Miller family',
      origin: 'Actor.kharra',
      target: 'Actor.miller-family',
      definitionId: 'ally-of',
      metadata: {},
      visibility: 'gm-only',
      history: [],
      blocks: [],
      tags: [],
      references: [],
    } as unknown as Relationship,
  ];

  beforeEach(() => {
    log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    renderMock = vi.fn();
    closeMock = vi.fn().mockResolvedValue(undefined);
    dialogConfirmMock = vi.fn();

    storage = {
      init: vi.fn(),
      saveNode: vi.fn(),
      getNode: vi.fn().mockResolvedValue(undefined as Node | undefined),
      deleteNode: vi.fn(),
      listNodes: vi.fn().mockResolvedValue([]),
      saveRelationship: vi.fn(),
      getRelationship: vi.fn(),
      deleteRelationship: vi.fn().mockResolvedValue(undefined),
      listRelationships: vi.fn().mockResolvedValue([]),
      getRelationshipsForNode: vi.fn().mockResolvedValue(RELATIONSHIPS),
      close: vi.fn(),
    } as unknown as StorageProvider;

    // Minimal ApplicationV2 stand-in - same tradeoff as
    // relationship-authoring-window.test.ts's own stub: proves the
    // subclass is a real, instantiable constructor that forwards to
    // Foundry's own render/close, without simulating a real DOM.
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
          DialogV2: { confirm: dialogConfirmMock },
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

  it('is a constructor that can be instantiated with storage/log/nodeId and calls through to render(true)', () => {
    const ApplicationClass = getRelationshipListApplicationClass();
    const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' });
    instance.render(true);
    expect(renderMock).toHaveBeenCalledWith(true);
  });

  it('returns the same class on repeated calls (memoized)', () => {
    const first = getRelationshipListApplicationClass();
    const second = getRelationshipListApplicationClass();
    expect(first).toBe(second);
  });

  describe('_renderHTML', () => {
    it('fetches this node\'s Relationships and renders one row per result, using the stored title verbatim', async () => {
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
      };

      const html = await instance._renderHTML();

      expect(storage.getRelationshipsForNode).toHaveBeenCalledWith('Actor.kharra');
      expect(html).toContain('Kharra resides-in Puerto Umbral');
      expect(html).toContain('Kharra is ally-of the Miller family');
      expect(html).toContain('data-relationship-id="rel-1"');
      expect(html).toContain('data-relationship-id="rel-2"');
    });

    it('renders the empty state when the node has no Relationships', async () => {
      (storage.getRelationshipsForNode as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
      };

      const html = await instance._renderHTML();
      expect(html).toContain('No relationships yet.');
    });

    it('logs and falls back to an empty list if the storage lookup throws', async () => {
      (storage.getRelationshipsForNode as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom'),
      );
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
      };

      const html = await instance._renderHTML();
      expect(html).toContain('No relationships yet.');
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
    });
  });

  describe('_onDeleteRow (actions map delete handler)', () => {
    /**
     * Builds a fake `target`/row pair matching `MinimalDomElementLike` -
     * plain objects, not a real DOM, but enough to exercise this file's
     * own `closest`/`getAttribute`/`remove` contract directly, the same
     * way `relationship-authoring-window.test.ts` exercises `_onSave`
     * directly rather than through a simulated DOM `click`.
     */
    function makeFakeDeleteTarget(rowId: string): {
      target: MinimalDomElementLike;
      remove: ReturnType<typeof vi.fn>;
    } {
      const remove = vi.fn();
      const row: MinimalDomElementLike = {
        innerHTML: '',
        getAttribute: vi.fn((name: string) => (name === 'data-relationship-id' ? rowId : null)),
        closest: vi.fn(() => row),
        remove,
        querySelector: vi.fn(() => null),
      };
      // The real `target` Foundry passes is the clicked <button> itself,
      // a *descendant* of the <li> that carries data-relationship-id -
      // its own `closest` call is what finds that ancestor row.
      const target: MinimalDomElementLike = {
        innerHTML: '',
        getAttribute: vi.fn(() => null),
        closest: vi.fn((selector: string) => (selector === '[data-relationship-id]' ? row : null)),
        remove: vi.fn(),
        querySelector: vi.fn(() => null),
      };
      return { target, remove };
    }

    it('shows a DialogV2.confirm with that row\'s own title text', async () => {
      dialogConfirmMock.mockResolvedValue(false);
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
        _onDeleteRow(target: MinimalDomElementLike): Promise<void>;
      };
      await instance._renderHTML();
      const { target } = makeFakeDeleteTarget('rel-1');

      await instance._onDeleteRow(target);

      expect(dialogConfirmMock).toHaveBeenCalledTimes(1);
      const [config] = dialogConfirmMock.mock.calls[0] as [{ content: string }];
      expect(config.content).toContain('Kharra resides-in Puerto Umbral');
    });

    it('does not call deleteRelationship when the dialog resolves false', async () => {
      dialogConfirmMock.mockResolvedValue(false);
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
        _onDeleteRow(target: MinimalDomElementLike): Promise<void>;
      };
      await instance._renderHTML();
      const { target, remove } = makeFakeDeleteTarget('rel-1');

      await instance._onDeleteRow(target);

      expect(storage.deleteRelationship).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('does not call deleteRelationship when the dialog is dismissed (null)', async () => {
      dialogConfirmMock.mockResolvedValue(null);
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
        _onDeleteRow(target: MinimalDomElementLike): Promise<void>;
      };
      await instance._renderHTML();
      const { target } = makeFakeDeleteTarget('rel-1');

      await instance._onDeleteRow(target);

      expect(storage.deleteRelationship).not.toHaveBeenCalled();
    });

    it('calls storage.deleteRelationship(id) and removes just that row when confirmed', async () => {
      dialogConfirmMock.mockResolvedValue(true);
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
        _onDeleteRow(target: MinimalDomElementLike): Promise<void>;
        close(): Promise<unknown>;
      };
      await instance._renderHTML();
      const { target, remove } = makeFakeDeleteTarget('rel-1');

      await instance._onDeleteRow(target);

      expect(storage.deleteRelationship).toHaveBeenCalledWith('rel-1');
      expect(remove).toHaveBeenCalledTimes(1);
      // The window itself never closes on a delete (ADR-0013 point 3).
      expect(closeMock).not.toHaveBeenCalled();
    });

    it('does not remove the row or call deleteRelationship again if it fails', async () => {
      dialogConfirmMock.mockResolvedValue(true);
      (storage.deleteRelationship as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db locked'),
      );
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
        _onDeleteRow(target: MinimalDomElementLike): Promise<void>;
      };
      await instance._renderHTML();
      const { target, remove } = makeFakeDeleteTarget('rel-1');

      await instance._onDeleteRow(target);

      expect(remove).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('db locked'));
    });

    it('refreshes the rows container to the empty state after the last row is deleted', async () => {
      dialogConfirmMock.mockResolvedValue(true);
      (storage.getRelationshipsForNode as ReturnType<typeof vi.fn>).mockResolvedValue([
        RELATIONSHIPS[0],
      ]);
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
        _onDeleteRow(target: MinimalDomElementLike): Promise<void>;
        element: MinimalDomElementLike;
      };
      await instance._renderHTML();

      const rowsContainer: MinimalDomElementLike = {
        innerHTML: '<ul>...</ul>',
        getAttribute: vi.fn(() => null),
        closest: vi.fn(() => null),
        remove: vi.fn(),
        querySelector: vi.fn(() => null),
      };
      instance.element = {
        innerHTML: '',
        getAttribute: vi.fn(() => null),
        closest: vi.fn(() => null),
        remove: vi.fn(),
        querySelector: vi.fn((selector: string) =>
          selector === '[data-role="rows"]' ? rowsContainer : null,
        ),
      };

      const { target } = makeFakeDeleteTarget('rel-1');
      await instance._onDeleteRow(target);

      expect(rowsContainer.innerHTML).toContain('No relationships yet.');
    });

    it('does nothing when the target has no resolvable data-relationship-id ancestor', async () => {
      const ApplicationClass = getRelationshipListApplicationClass();
      const instance = new ApplicationClass({ storage, log, nodeId: 'Actor.kharra' }) as unknown as {
        _renderHTML(): Promise<string>;
        _onDeleteRow(target: MinimalDomElementLike): Promise<void>;
      };
      await instance._renderHTML();

      const target: MinimalDomElementLike = {
        innerHTML: '',
        getAttribute: vi.fn(() => null),
        closest: vi.fn(() => null),
        remove: vi.fn(),
        querySelector: vi.fn(() => null),
      };

      await instance._onDeleteRow(target);

      expect(dialogConfirmMock).not.toHaveBeenCalled();
      expect(storage.deleteRelationship).not.toHaveBeenCalled();
    });
  });
});
