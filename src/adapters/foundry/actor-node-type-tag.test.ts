import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_NODE_TYPES } from '../../core/domain/node.js';
import {
  buildNodeTypeTagHTML,
  registerActorNodeTypeTag,
  type FoundryActorSheetAppLike,
  type FoundryHTMLElementLike,
} from './actor-node-type-tag.js';

describe('buildNodeTypeTagHTML', () => {
  it('binds the input to flags.archivexus.nodeType with the current value', () => {
    const html = buildNodeTypeTagHTML('actor-1', 'Character');
    expect(html).toContain('name="flags.archivexus.nodeType"');
    expect(html).toContain('value="Character"');
  });

  it('falls back to an empty value when there is no current type', () => {
    const html = buildNodeTypeTagHTML('actor-1', '');
    expect(html).toContain('value=""');
  });

  it('offers every KNOWN_NODE_TYPES entry as a datalist suggestion by default', () => {
    const html = buildNodeTypeTagHTML('actor-1', '');
    for (const type of KNOWN_NODE_TYPES) {
      expect(html).toContain(`<option value="${type}"></option>`);
    }
  });

  it('accepts a custom suggestions list instead of KNOWN_NODE_TYPES', () => {
    const html = buildNodeTypeTagHTML('actor-1', '', ['Custom']);
    expect(html).toContain('<option value="Custom"></option>');
    expect(html).not.toContain('<option value="Character"></option>');
  });

  it("links the input's list attribute to its own datalist's id", () => {
    const html = buildNodeTypeTagHTML('actor-1', '');
    const listMatch = /list="([^"]+)"/.exec(html);
    const datalistIdMatch = /<datalist id="([^"]+)"/.exec(html);
    expect(listMatch?.[1]).toBeDefined();
    expect(listMatch?.[1]).toBe(datalistIdMatch?.[1]);
  });

  it('produces non-colliding ids for two different elementIdSuffix values', () => {
    const htmlA = buildNodeTypeTagHTML('actor-a', '');
    const htmlB = buildNodeTypeTagHTML('actor-b', '');
    const idA = /<datalist id="([^"]+)"/.exec(htmlA)?.[1];
    const idB = /<datalist id="([^"]+)"/.exec(htmlB)?.[1];
    expect(idA).toBeDefined();
    expect(idA).not.toBe(idB);
  });

  it('HTML-escapes special characters in the current value and the id suffix', () => {
    const html = buildNodeTypeTagHTML('actor"<1>', '<script>&"');
    expect(html).not.toContain('<script>&"');
    expect(html).toContain('&lt;script&gt;&amp;&quot;');
    expect(html).not.toContain('actor"<1>');
  });
});

describe('registerActorNodeTypeTag', () => {
  let renderHandler:
    ((app: FoundryActorSheetAppLike, htmlElement: FoundryHTMLElementLike) => void) | undefined;

  beforeEach(() => {
    renderHandler = undefined;
    (globalThis as { Hooks?: unknown }).Hooks = {
      once: vi.fn(),
      on: vi.fn((hook: string, callback: typeof renderHandler) => {
        if (hook === 'renderActorSheetV2') {
          renderHandler = callback;
        }
      }),
    };
  });

  afterEach(() => {
    delete (globalThis as { Hooks?: unknown }).Hooks;
  });

  function makeHtmlElement(
    overrides: Partial<FoundryHTMLElementLike> = {},
  ): FoundryHTMLElementLike & {
    insertAdjacentHTML: ReturnType<typeof vi.fn>;
  } {
    return {
      querySelector: vi.fn(() => null),
      insertAdjacentHTML: vi.fn(),
      ...overrides,
    } as FoundryHTMLElementLike & { insertAdjacentHTML: ReturnType<typeof vi.fn> };
  }

  it('registers exactly one renderActorSheetV2 listener', () => {
    registerActorNodeTypeTag();
    expect(Hooks.on).toHaveBeenCalledTimes(1);
    expect(Hooks.on).toHaveBeenCalledWith('renderActorSheetV2', expect.any(Function));
  });

  it('does nothing when the sheet has no .window-content', () => {
    registerActorNodeTypeTag();
    const htmlElement = makeHtmlElement({ querySelector: vi.fn(() => null) });
    const app: FoundryActorSheetAppLike = { document: { uuid: 'Actor.1', name: 'Kharra' } };

    renderHandler?.(app, htmlElement);

    expect(htmlElement.insertAdjacentHTML).not.toHaveBeenCalled();
  });

  it('injects the tag control into .window-content, using the current flag value', () => {
    registerActorNodeTypeTag();
    const container = makeHtmlElement();
    const htmlElement = makeHtmlElement({
      querySelector: vi.fn((selector: string) =>
        selector === '.window-content' ? container : null,
      ),
    });
    const app: FoundryActorSheetAppLike = {
      document: {
        uuid: 'Actor.1',
        name: 'Kharra',
        flags: { archivexus: { nodeType: 'Character' } },
      },
    };

    renderHandler?.(app, htmlElement);

    expect(container.insertAdjacentHTML).toHaveBeenCalledTimes(1);
    const [position, html] = container.insertAdjacentHTML.mock.calls[0] as [string, string];
    expect(position).toBe('afterbegin');
    expect(html).toContain('value="Character"');
  });

  it('falls back to an empty value when the Actor has no flags.archivexus.nodeType', () => {
    registerActorNodeTypeTag();
    const container = makeHtmlElement();
    const htmlElement = makeHtmlElement({
      querySelector: vi.fn((selector: string) =>
        selector === '.window-content' ? container : null,
      ),
    });
    const app: FoundryActorSheetAppLike = { document: { uuid: 'Actor.1', name: 'Kharra' } };

    renderHandler?.(app, htmlElement);

    const [, html] = container.insertAdjacentHTML.mock.calls[0] as [string, string];
    expect(html).toContain('value=""');
  });

  it('does not inject a second copy if .window-content already has one (idempotency)', () => {
    registerActorNodeTypeTag();
    const existingTag = makeHtmlElement();
    const container = makeHtmlElement({
      querySelector: vi.fn((selector: string) =>
        selector === '.archivexus-node-type-tag' ? existingTag : null,
      ),
    });
    const htmlElement = makeHtmlElement({
      querySelector: vi.fn((selector: string) =>
        selector === '.window-content' ? container : null,
      ),
    });
    const app: FoundryActorSheetAppLike = { document: { uuid: 'Actor.1', name: 'Kharra' } };

    renderHandler?.(app, htmlElement);

    expect(container.insertAdjacentHTML).not.toHaveBeenCalled();
  });
});
