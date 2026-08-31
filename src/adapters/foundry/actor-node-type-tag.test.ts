import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_NODE_TYPES } from '../../core/domain/node.js';
import {
  buildNodeTypeDialogContent,
  registerActorNodeTypeTag,
  type FoundryActorDocumentLike,
  type FoundryActorSheetAppLike,
  type FoundryHeaderControlsLike,
} from './actor-node-type-tag.js';

describe('buildNodeTypeDialogContent', () => {
  it('binds the input to name="nodeType" with the current value', () => {
    const html = buildNodeTypeDialogContent('actor-1', 'Character');
    expect(html).toContain('name="nodeType"');
    expect(html).toContain('value="Character"');
  });

  it('falls back to an empty value when there is no current type', () => {
    const html = buildNodeTypeDialogContent('actor-1', '');
    expect(html).toContain('value=""');
  });

  it('offers every KNOWN_NODE_TYPES entry as a datalist suggestion by default', () => {
    const html = buildNodeTypeDialogContent('actor-1', '');
    for (const type of KNOWN_NODE_TYPES) {
      expect(html).toContain(`<option value="${type}"></option>`);
    }
  });

  it('accepts a custom suggestions list instead of KNOWN_NODE_TYPES', () => {
    const html = buildNodeTypeDialogContent('actor-1', '', ['Custom']);
    expect(html).toContain('<option value="Custom"></option>');
    expect(html).not.toContain('<option value="Character"></option>');
  });

  it("links the input's list attribute to its own datalist's id", () => {
    const html = buildNodeTypeDialogContent('actor-1', '');
    const listMatch = /list="([^"]+)"/.exec(html);
    const datalistIdMatch = /<datalist id="([^"]+)"/.exec(html);
    expect(listMatch?.[1]).toBeDefined();
    expect(listMatch?.[1]).toBe(datalistIdMatch?.[1]);
  });

  it('produces non-colliding ids for two different elementIdSuffix values', () => {
    const htmlA = buildNodeTypeDialogContent('actor-a', '');
    const htmlB = buildNodeTypeDialogContent('actor-b', '');
    const idA = /<datalist id="([^"]+)"/.exec(htmlA)?.[1];
    const idB = /<datalist id="([^"]+)"/.exec(htmlB)?.[1];
    expect(idA).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  it('HTML-escapes special characters in the current value and the id suffix', () => {
    const html = buildNodeTypeDialogContent('actor"<1>', '<script>&"');
    expect(html).not.toContain('<script>&"');
    expect(html).toContain('&lt;script&gt;&amp;&quot;');
    expect(html).not.toContain('actor"<1>');
  });
});

describe('registerActorNodeTypeTag', () => {
  type HeaderControlsHandler = (
    app: FoundryActorSheetAppLike,
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
        if (hook === 'getHeaderControlsActorSheetV2') {
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
    overrides: Partial<FoundryActorDocumentLike> = {},
  ): FoundryActorDocumentLike & { setFlag: ReturnType<typeof vi.fn> } {
    return {
      uuid: 'Actor.1',
      name: 'Kharra',
      setFlag: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as FoundryActorDocumentLike & { setFlag: ReturnType<typeof vi.fn> };
  }

  function makeControls(): FoundryHeaderControlsLike & { push: ReturnType<typeof vi.fn> } {
    return { push: vi.fn() } as FoundryHeaderControlsLike & { push: ReturnType<typeof vi.fn> };
  }

  it('registers exactly one getHeaderControlsActorSheetV2 listener', () => {
    registerActorNodeTypeTag();
    expect(Hooks.on).toHaveBeenCalledTimes(1);
    expect(Hooks.on).toHaveBeenCalledWith('getHeaderControlsActorSheetV2', expect.any(Function));
  });

  it('pushes a single header control with the expected icon and label', () => {
    registerActorNodeTypeTag();
    const controls = makeControls();
    const app: FoundryActorSheetAppLike = { document: makeDocument() };

    headerControlsHandler?.(app, controls);

    expect(controls.push).toHaveBeenCalledTimes(1);
    const [entry] = controls.push.mock.calls[0] as [
      { icon: string; label: string; onClick: () => void },
    ];
    expect(entry.icon).toBe('fa-solid fa-tag');
    expect(entry.label).toBe('Archivexus Node Type');
    expect(typeof entry.onClick).toBe('function');
  });

  it("opens a DialogV2 prompt pre-filled with the Actor's current flag value when the control is clicked", async () => {
    registerActorNodeTypeTag();
    const controls = makeControls();
    const document_ = makeDocument({ flags: { archivexus: { nodeType: 'Character' } } });
    const app: FoundryActorSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue(null);

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
    const [config] = promptMock.mock.calls[0] as [{ window: { title: string }; content: string }];
    expect(config.window.title).toBe('Archivexus Node Type');
    expect(config.content).toContain('value="Character"');
  });

  it('falls back to an empty value in the dialog when the Actor has no flags.archivexus.nodeType', async () => {
    registerActorNodeTypeTag();
    const controls = makeControls();
    const app: FoundryActorSheetAppLike = { document: makeDocument() };
    promptMock.mockResolvedValue(null);

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
    const [config] = promptMock.mock.calls[0] as [{ content: string }];
    expect(config.content).toContain('value=""');
  });

  it("the dialog's ok.callback reads the submitted input's value from the form", async () => {
    registerActorNodeTypeTag();
    const controls = makeControls();
    const app: FoundryActorSheetAppLike = { document: makeDocument() };
    promptMock.mockResolvedValue(null);

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
    const [config] = promptMock.mock.calls[0] as [
      { ok: { callback: (event: unknown, button: unknown) => string } },
    ];
    const value = config.ok.callback(undefined, {
      form: { elements: { nodeType: { value: 'Monster' } } },
    });
    expect(value).toBe('Monster');
  });

  it('saves the resolved value to flags.archivexus.nodeType when the dialog resolves with a string', async () => {
    registerActorNodeTypeTag();
    const controls = makeControls();
    const document_ = makeDocument();
    const app: FoundryActorSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue('Monster');

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(document_.setFlag).toHaveBeenCalledTimes(1));
    expect(document_.setFlag).toHaveBeenCalledWith('archivexus', 'nodeType', 'Monster');
  });

  it('leaves the flag untouched when the dialog is cancelled (resolves with null)', async () => {
    registerActorNodeTypeTag();
    const controls = makeControls();
    const document_ = makeDocument();
    const app: FoundryActorSheetAppLike = { document: document_ };
    promptMock.mockResolvedValue(null);

    headerControlsHandler?.(app, controls);
    const [entry] = controls.push.mock.calls[0] as [{ onClick: () => void }];
    entry.onClick();

    await vi.waitFor(() => expect(promptMock).toHaveBeenCalledTimes(1));
    // Flush a few microtask ticks so any (incorrect) setFlag call has a
    // chance to happen before asserting it didn't — no DOM/node timer lib
    // is declared here (tsconfig omits it), so plain microtask flushes
    // stand in for a macrotask wait.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(document_.setFlag).not.toHaveBeenCalled();
  });
});
