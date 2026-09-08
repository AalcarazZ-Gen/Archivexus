import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';
import {
  buildEndpointFieldHTML,
  buildRelationshipAuthoringContentHTML,
  getRelationshipAuthoringApplicationClass,
  parseDropPayloadUuid,
  registerRelationshipAuthoringEntryPoints,
  type FoundryHeaderControlsLike,
  type FoundrySheetAppLike,
} from './relationship-authoring-window.js';

describe('buildEndpointFieldHTML', () => {
  it('renders an empty field as a plain text input with a placeholder and a hidden clear button', () => {
    const html = buildEndpointFieldHTML('origin', 'Origin');
    expect(html).toContain('<input type="text" id="archivexus-relationship-origin" name="origin"');
    expect(html).toContain('placeholder="Drop an Actor or Journal page here');
    expect(html).toContain('data-action="clearOrigin"');
    expect(html).toContain('data-action="clearOrigin" title="Clear" aria-label="Clear Origin" hidden');
    expect(html).not.toContain('readonly');
    expect(html).toContain('data-role="origin-uuid" hidden');
  });

  it('renders a resolved field with the title in the input (read-only), the UUID in title + a dim line, clear shown', () => {
    const html = buildEndpointFieldHTML('target', 'Target', { title: 'Hodor', uuid: 'Actor.abc' });
    expect(html).toContain('value="Hodor" readonly');
    expect(html).toContain('title="Actor.abc"');
    expect(html).toContain('<p class="archivexus-rel-endpoint-uuid" data-role="target-uuid">Actor.abc</p>');
    expect(html).not.toContain('data-action="clearTarget" title="Clear" aria-label="Clear Target" hidden');
  });

  it('HTML-escapes the resolved title and uuid', () => {
    const html = buildEndpointFieldHTML('origin', 'Origin', { title: '"<x>', uuid: 'Actor."1"' });
    expect(html).toContain('value="&quot;&lt;x&gt;"');
    expect(html).toContain('title="Actor.&quot;1&quot;"');
    expect(html).not.toContain('<x>');
  });
});

describe('buildRelationshipAuthoringContentHTML', () => {
  it('renders both endpoints as controlled inputs, no <document-tags>', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).not.toContain('document-tags');
    expect(html).toContain('name="origin"');
    expect(html).toContain('name="target"');
    expect(html).toContain('data-endpoint="origin"');
    expect(html).toContain('data-endpoint="target"');
  });

  it('uses the given endpoint labels', () => {
    const html = buildRelationshipAuthoringContentHTML('First entity', 'Second entity');
    expect(html).toContain('>First entity</label>');
    expect(html).toContain('>Second entity</label>');
  });

  it('pre-fills the Origin field and leaves Target empty', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target', {
      title: 'Kharra',
      uuid: 'Actor.kharra',
    });
    expect(html).toContain('name="origin" data-role="origin-input" autocomplete="off" placeholder="Drop an Actor or Journal page here, or paste its UUID" value="Kharra" readonly');
    expect(html).toContain('name="target" data-role="target-input"');
    expect(html).toMatch(/name="target"[^>]*\/>\s*<button[^>]*data-action="clearTarget"[^>]*hidden/);
  });

  it('starts with the Definition select empty/disabled and the placeholder text (ADR-0010 point 4)', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain(
      '<select name="definitionId" id="archivexus-relationship-definition" disabled>',
    );
    expect(html).toContain('Drop both entities first');
  });

  it('starts with both Save buttons disabled', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain('<button type="button" data-action="save" disabled>Save</button>');
    expect(html).toContain(
      '<button type="button" data-action="saveAndNew" disabled>Save &amp; add another</button>',
    );
  });

  it('starts with the summary and warning regions hidden', () => {
    const html = buildRelationshipAuthoringContentHTML('Origin', 'Target');
    expect(html).toContain('data-role="summary" hidden');
    expect(html).toContain('data-role="warning" hidden');
  });
});

describe('parseDropPayloadUuid', () => {
  it('reads the uuid from a native Foundry drag payload', () => {
    expect(parseDropPayloadUuid('{"type":"Actor","uuid":"Actor.abc"}')).toBe('Actor.abc');
  });

  it('accepts a bare UUID string', () => {
    expect(parseDropPayloadUuid('  JournalEntry.a.JournalEntryPage.b  ')).toBe(
      'JournalEntry.a.JournalEntryPage.b',
    );
  });

  it('returns undefined for empty / non-UUID / payload-without-uuid input', () => {
    expect(parseDropPayloadUuid('')).toBeUndefined();
    expect(parseDropPayloadUuid('just some text')).toBeUndefined();
    expect(parseDropPayloadUuid('{"type":"Actor"}')).toBeUndefined();
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

    (globalThis as { Hooks?: unknown }).Hooks = { on: vi.fn(), once: vi.fn(), callAll: vi.fn() };
  });

  afterEach(() => {
    delete (globalThis as { foundry?: unknown }).foundry;
    delete (globalThis as { Hooks?: unknown }).Hooks;
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

  const memberOf = {
    id: 'member-of',
    name: 'member-of',
    version: 1,
    inverse: 'has-member',
    cardinality: 'many-to-many' as const,
    symmetry: false,
    traversalCategory: 'affiliation' as const,
    validation: { allowedOriginTypes: ['Character'], allowedTargetTypes: ['Organization'] },
  };

  interface FakeWindow {
    element: unknown;
    _onRender(): void;
    _resolveEndpoint(side: 'origin' | 'target', value: string): Promise<void>;
    _onSave(options?: { keepOpen?: boolean }): Promise<void>;
  }

  /**
   * A shared no-op DOM node — enough for `_resolveEndpoint` /
   * `#refreshDerivedUI` / `_onSave`, none of which assert per-element state.
   * `docs` maps a UUID to a fake Foundry document.
   */
  function setupFakeWindow(docs: Record<string, { name: string; nodeType: string }>): {
    instance: FakeWindow;
    node: { value: string };
    pickDefinition(id: string): void;
  } {
    const listeners: Record<string, (event: unknown) => void> = {};
    const node = new Proxy(
      {
        value: '',
        hidden: false,
        disabled: false,
        innerHTML: '',
        textContent: '',
        classList: { add() {}, remove() {} },
        getAttribute: () => null,
        setAttribute() {},
        removeAttribute() {},
        addEventListener(type: string, cb: (event: unknown) => void) {
          listeners[type] = cb;
        },
        querySelector() {
          return node;
        },
      },
      {},
    );
    (foundry as unknown as { utils: { fromUuid: ReturnType<typeof vi.fn> } }).utils.fromUuid = vi.fn(
      async (uuid: string) => {
        const d = docs[uuid];
        return d
          ? { documentName: 'Actor', uuid, name: d.name, flags: { archivexus: { nodeType: d.nodeType } } }
          : null;
      },
    );
    const ApplicationClass = getRelationshipAuthoringApplicationClass();
    const instance = new ApplicationClass({
      storage,
      log,
      definitions: [memberOf],
    }) as unknown as FakeWindow;
    instance.element = node;
    instance._onRender();
    return {
      instance,
      node: node as { value: string },
      pickDefinition(id: string) {
        (node as { value: string }).value = id;
        listeners['change']?.({});
      },
    };
  }

  it('saves the Relationship in the orientation the Definition validates (ADAPT-015 swap)', async () => {
    const { instance, pickDefinition } = setupFakeWindow({
      'Actor.party': { name: 'Party', nodeType: 'Organization' },
      'Actor.hodor': { name: 'Hodor', nodeType: 'Character' },
    });

    // GM opens it from the Party's sheet (origin = Party/Org), then drops Hodor as the target.
    await instance._resolveEndpoint('origin', 'Actor.party');
    await instance._resolveEndpoint('target', 'Actor.hodor');
    pickDefinition('member-of');
    await Promise.resolve();

    await instance._onSave();

    expect(savedRelationships).toHaveLength(1);
    // stored Hodor member-of Party, NOT Party member-of Hodor
    expect(savedRelationships[0]).toMatchObject({
      origin: 'Actor.hodor',
      target: 'Actor.party',
      definitionId: 'member-of',
    });
    expect(savedRelationships[0]?.title).toBe('Hodor member-of Party');
    expect(closeMock).toHaveBeenCalled();
  });

  it('"Save & add another" saves, keeps the window open, and clears only Target (ADAPT-015 follow-up)', async () => {
    const { instance, pickDefinition } = setupFakeWindow({
      'Actor.party': { name: 'Party', nodeType: 'Organization' },
      'Actor.hodor': { name: 'Hodor', nodeType: 'Character' },
      'Actor.kharra': { name: 'Kharra', nodeType: 'Character' },
    });

    await instance._resolveEndpoint('origin', 'Actor.party');
    await instance._resolveEndpoint('target', 'Actor.hodor');
    pickDefinition('member-of');
    await Promise.resolve();
    await instance._onSave({ keepOpen: true });

    expect(savedRelationships).toHaveLength(1);
    expect(savedRelationships[0]?.title).toBe('Hodor member-of Party');
    expect(closeMock).not.toHaveBeenCalled();

    // Origin still pinned; just drop the next member + re-pick the definition.
    await instance._resolveEndpoint('target', 'Actor.kharra');
    pickDefinition('member-of');
    await Promise.resolve();
    await instance._onSave();

    expect(savedRelationships).toHaveLength(2);
    expect(savedRelationships[1]?.title).toBe('Kharra member-of Party');
    expect(savedRelationships[1]).toMatchObject({ origin: 'Actor.kharra', target: 'Actor.party' });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
