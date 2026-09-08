import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import {
  buildCodexContentHTML,
  ensureCodexStyles,
  getCodexSidebarTabClass,
  registerCodexSidebarTab,
  type FoundryUiConfigLike,
} from './codex-sidebar-tab.js';
import { createLogger } from './logger.js';

const log = createLogger('archivexus-test');
const noStorage = (): StorageProvider | undefined => undefined;

function fakeUiConfig(): FoundryUiConfigLike {
  return { sidebar: { TABS: {} } };
}

/**
 * A minimal stand-in for the `foundry` global so `getCodexSidebarTabClass`
 * can build its `AbstractSidebarTab` subclass without a real client — the
 * class body only needs the base constructor and `_prepareContext` on its
 * prototype (Cytoscape is a separate lazy dynamic import, not touched at
 * class-build time).
 */
class FakeAbstractSidebarTab {
  element = { innerHTML: '', querySelector: () => null };
  active = false;
  async _prepareContext(): Promise<Record<string, unknown>> {
    return {};
  }
  _onActivate(): void {}
  render(): void {}
}

beforeEach(() => {
  (globalThis as { foundry?: unknown }).foundry = {
    applications: { sidebar: { AbstractSidebarTab: FakeAbstractSidebarTab } },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { foundry?: unknown }).foundry;
});

describe('buildCodexContentHTML', () => {
  it('renders a toolbar with a "Whole graph" reset action and a canvas mount point', () => {
    const html = buildCodexContentHTML();
    expect(html).toContain('data-action="resetGraph"');
    expect(html).toContain('data-role="canvas"');
    expect(html).toContain('data-role="hint"');
  });
});

describe('registerCodexSidebarTab', () => {
  it('writes a { tooltip, icon } SidebarTabDescriptor into CONFIG.ui.sidebar.TABS.codex (v14 "settings"-tab shape)', () => {
    const config = fakeUiConfig();
    registerCodexSidebarTab(config, noStorage, log);
    expect(config.sidebar.TABS.codex).toEqual({
      tooltip: 'Codex',
      icon: 'fa-solid fa-share-nodes',
    });
  });

  it('registers the tab class at CONFIG.ui.codex', () => {
    const config = fakeUiConfig();
    registerCodexSidebarTab(config, noStorage, log);
    expect(typeof config.codex).toBe('function');
    // The class extends whatever AbstractSidebarTab the foundry global exposes.
    expect(Object.getPrototypeOf(config.codex as new () => unknown)).toBe(FakeAbstractSidebarTab);
    expect((config.codex as { tabName: string }).tabName).toBe('codex');
  });
});

describe('getCodexSidebarTabClass', () => {
  it('memoizes — repeated calls return the same class', () => {
    const a = getCodexSidebarTabClass(noStorage, log);
    const b = getCodexSidebarTabClass(noStorage, log);
    expect(a).toBe(b);
  });
});

describe('ensureCodexStyles', () => {
  it('is a no-op when there is no document (Worker/Node context)', () => {
    expect(() => ensureCodexStyles()).not.toThrow();
  });

  it('injects a single <style> element into <head>, and does not duplicate it on a second call', () => {
    const appended: { id: string; textContent: string }[] = [];
    const byId = new Map<string, unknown>();
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => byId.get(id) ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      head: {
        appendChild: (node: { id: string; textContent: string }) => {
          appended.push(node);
          byId.set(node.id, node);
        },
      },
    };

    ensureCodexStyles();
    ensureCodexStyles();

    expect(appended).toHaveLength(1);
    expect(appended[0]?.id).toBe('archivexus-codex-styles');
    expect(appended[0]?.textContent).toContain('.archivexus-codex-canvas');
  });
});
