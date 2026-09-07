import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_NODE_TYPES } from '../../core/domain/node.js';
import {
  buildJournalEntryPageNodeTagDialogContent,
  registerJournalEntryPageNodeTag,
  type FoundryHeaderControlsLike,
  type FoundryJournalEntryPageDocumentLike,
  type FoundryJournalEntryPageSheetAppLike,
} from './journal-entry-page-node-tag.js';

describe('buildJournalEntryPageNodeTagDialogContent', () => {
  it('binds the type input to name="nodeType" with the current value', () => {
    const html = buildJournalEntryPageNodeTagDialogContent('Page.1', 'Lore', '');
    expect(html).toContain('name="nodeType"');
    expect(html).toContain('value="Lore"');
  });

  it('renders a document-tags single element for the attach field, with no type restriction', () => {
    const html = buildJournalEntryPageNodeTagDialogContent('Page.1', '', '');
    expect(html).toContain('<document-tags single name="attachedToNodeId"');
    expect(html).not.toMatch(/document-tags[^>]*\btype=/);
  });

  it('pre-fills the attach field when a current attachedToNodeId is given', () => {
    const html = buildJournalEntryPageNodeTagDialogContent('Page.1', '', 'Actor.fausto');
    expect(html).toContain('<document-tags single name="attachedToNodeId"');
    expect(html).toContain('value="Actor.fausto"');
  });

  it('leaves the attach field with no value attribute when there is no current attachment', () => {
    const html = buildJournalEntryPageNodeTagDialogContent('Page.1', '', '');
    const attachTag = /<document-tags single name="attachedToNodeId"[^>]*>/.exec(html)?.[0];
    expect(attachTag).toBeDefined();
    expect(attachTag).not.toContain('value=');
  });

  it('offers every KNOWN_NODE_TYPES entry as a datalist suggestion by default', () => {
    const html = buildJournalEntryPageNodeTagDialogContent('Page.1', '', '');
    for (const type of KNOWN_NODE_TYPES) {
      expect(html).toContain(`<option value="${type}"></option>`);
    }
  });

  it('produces non-colliding ids for two different elementIdSuffix values', () => {
    const htmlA = buildJournalEntryPageNodeTagDialogContent('Page.a', '', '');
    const htmlB = buildJournalEntryPageNodeTagDialogContent('Page.b', '', '');
    const idA = /<datalist id="([^"]+)"/.exec(htmlA)?.[1];
    const idB = /<datalist id="([^"]+)"/.exec(htmlB)?.[1];
    expect(idA).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  it('HTML-escapes special characters in the current values and the id suffix', () => {
    const html = buildJournalEntryPageNodeTagDialogContent('page"<1>', '<script>&"', '<script>&"');
    expect(html).not.toContain('<script>&"');
    expect(html).toContain('&lt;script&gt;&amp;&quot;');
  });
});

describe('registerJournalEntryPageNodeTag', () => {
  type HeaderControlsHandler = (
    app: FoundryJournalEntryPageSheetAppLike,
    controls: FoundryHeaderControlsLike,
  ) => void;

  let headerControlsHandler: HeaderControlsHandler | undefined;
  let promptMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    headerControlsHandler = undefined;
    promptMock = vi.fn();

    (globalThis as { Hooks?: unknown }).Hooks = {
      once: vi.fn(),
      on: vi.fn((hook: string, callback: HeaderControlsHandler) => {
        if (hook === 'getHeaderControlsJournalEntryPageSheet') {
          headerControlsHandler = callback;
        }
      }),
    };

    (globalThis as { foundry?: unknown }).foundry = {
      applications: {
        api: {
          DialogV2: {
            prompt: promptMock,
          },
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { Hooks?: unknown }).Hooks;
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  function makeDocument(
    overrides: Partial<FoundryJournalEntryPageDocumentLike> = {},
  ): FoundryJournalEntryPageDocumentLike & {
    setFlag: ReturnType<typeof vi.fn>;
    unsetFlag: ReturnType<typeof vi.fn>;
  } {
    return {
      uuid: 'JournalEntryPage.1',
      name: 'Biografía',
      setFlag: vi.fn().mockResolvedValue(undefined),
      unsetFlag: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as FoundryJournalEntryPageDocumentLike & {
      setFlag: ReturnType<typeof vi.fn>;
      unsetFlag: ReturnType<typeof vi.fn>;
    };
  }

  function makeControls(): FoundryHeaderControlsLike & { push: ReturnType<typeof vi.fn> } {
    return { push: vi.fn() } as FoundryHeaderControlsLike & { push: ReturnType<typeof vi.fn> };
  }

  it('registers exactly one getHeaderControlsJournalEntryPageSheet listener', () => {
    registerJournalEntryPageNodeTag();
    expect(Hooks.on).toHaveBeenCalledTimes(1);
    expect(Hooks.on).toHaveBeenCalledWith(
      'getHeaderControlsJournalEntryPageSheet',
      expect.any(Function),
    );
  });

  it('pushes a single header control with the expected icon and label', () => {
    registerJournalEntryPageNodeTag();
    const controls = makeControls();
    const app: FoundryJournalEntryPageSheetAppLike = { document: makeDocument() };

    headerControlsHandler?.(app, controls);

    expect(controls.push).toHaveBeenCalledTimes(1);
    const [entry] = controls.push.mock.calls[0] as [
      { icon: string; label: string; onClick: () => void },
    ];
    expect(entry.icon).toBe('fa-solid fa-tag');
    expect(entry.label).toBe('Archivexus Node Type');
    expect(typeof entry.onClick).toBe('function');
  });

  it("opens a DialogV2 prompt pre-filled with the page's current flags when the control is clicked", async () => {
    registerJournalEntryPageNodeTag();
    const controls = makeControls();
    const document_ = makeDocument({
      flags: { archivexus: { nodeType: 'Lore', attachedToNodeId: 'Actor.fausto' } },
    });
    const app: FoundryJournalEntryPageSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue(null);

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
    const [config] = promptMock.mock.calls[0] as [{ window: { title: string }; content: string }];
    expect(config.window.title).toBe('Archivexus Node Type');
    expect(config.content).toContain('value="Lore"');
    expect(config.content).toContain('value="Actor.fausto"');
  });

  it("the dialog's ok.callback reads both submitted fields' values from the form", async () => {
    registerJournalEntryPageNodeTag();
    const controls = makeControls();
    const app: FoundryJournalEntryPageSheetAppLike = { document: makeDocument() };
    promptMock.mockResolvedValue(null);

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
    const [config] = promptMock.mock.calls[0] as [
      {
        ok: {
          callback: (
            event: unknown,
            button: unknown,
          ) => { nodeType: string; attachedToNodeId: string };
        };
      },
    ];
    const value = config.ok.callback(undefined, {
      form: {
        elements: {
          nodeType: { value: 'Monster' },
          attachedToNodeId: { value: 'Actor.fausto' },
        },
      },
    });
    expect(value).toEqual({ nodeType: 'Monster', attachedToNodeId: 'Actor.fausto' });
  });

  it('sets attachedToNodeId and leaves nodeType untouched when the attach field resolves to a non-empty uuid (attach wins)', async () => {
    registerJournalEntryPageNodeTag();
    const controls = makeControls();
    const document_ = makeDocument();
    const app: FoundryJournalEntryPageSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue({ nodeType: 'Character', attachedToNodeId: 'Actor.fausto' });

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(document_.setFlag).toHaveBeenCalledTimes(1));
    expect(document_.setFlag).toHaveBeenCalledWith('archivexus', 'attachedToNodeId', 'Actor.fausto');
    expect(document_.unsetFlag).not.toHaveBeenCalled();
  });

  it('sets nodeType and unsets attachedToNodeId when the attach field is empty (standalone mode)', async () => {
    registerJournalEntryPageNodeTag();
    const controls = makeControls();
    const document_ = makeDocument();
    const app: FoundryJournalEntryPageSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue({ nodeType: 'Lore', attachedToNodeId: '' });

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(document_.setFlag).toHaveBeenCalledTimes(1));
    expect(document_.setFlag).toHaveBeenCalledWith('archivexus', 'nodeType', 'Lore');
    expect(document_.unsetFlag).toHaveBeenCalledWith('archivexus', 'attachedToNodeId');
  });

  it('treats a whitespace-only attach value as empty (standalone mode, not attach mode)', async () => {
    registerJournalEntryPageNodeTag();
    const controls = makeControls();
    const document_ = makeDocument();
    const app: FoundryJournalEntryPageSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue({ nodeType: 'Lore', attachedToNodeId: '   ' });

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(document_.setFlag).toHaveBeenCalledTimes(1));
    expect(document_.setFlag).toHaveBeenCalledWith('archivexus', 'nodeType', 'Lore');
    expect(document_.unsetFlag).toHaveBeenCalledWith('archivexus', 'attachedToNodeId');
  });

  it('leaves both flags untouched when the dialog is cancelled (resolves with null)', async () => {
    registerJournalEntryPageNodeTag();
    const controls = makeControls();
    const document_ = makeDocument();
    const app: FoundryJournalEntryPageSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue(null);

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document_.setFlag).not.toHaveBeenCalled();
    expect(document_.unsetFlag).not.toHaveBeenCalled();
  });
});
