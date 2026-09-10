import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import {
  buildNavigatorGroupsHTML,
  buildNavigatorShellHTML,
  buildNavigatorStateHTML,
  getCodexSidebarTabClass,
  navigatorGroupsStartExpanded,
  registerCodexSidebarTab,
  type FoundryUiConfigLike,
} from './codex-sidebar-tab.js';
import { groupNodesByType } from './node-navigator.js';
import { createLogger } from './logger.js';

const log = createLogger('archivexus-test');
const noStorage = (): StorageProvider | undefined => undefined;

function fakeUiConfig(): FoundryUiConfigLike {
  return { sidebar: { TABS: {} } };
}

/**
 * A minimal stand-in for the `foundry` global so `getCodexSidebarTabClass`
 * can build its `AbstractSidebarTab` subclass without a real client — the
 * class body only needs the base constructor on its prototype.
 */
class FakeAbstractSidebarTab {
  element = { innerHTML: '', querySelector: () => null };
  active = false;
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

describe('buildNavigatorShellHTML', () => {
  it('renders the toolbar "Open graph" action, a search box, and a list region', () => {
    const html = buildNavigatorShellHTML();
    expect(html).toContain('data-action="openWholeGraph"');
    expect(html).toContain('data-role="search"');
    expect(html).toContain('data-role="list"');
    expect(html).toContain('data-role="hint"');
  });

  it('includes the GM affordances by default, and omits them when isGM is false', () => {
    const gm = buildNavigatorShellHTML();
    expect(gm).toContain('data-action="openConsole"');
    expect(gm).toContain('data-action="openDefinitionEditor"');
    expect(gm).toContain('data-role="guidance-mount"');

    const player = buildNavigatorShellHTML({ isGM: false });
    expect(player).not.toContain('data-action="openConsole"');
    expect(player).not.toContain('data-action="openDefinitionEditor"');
    expect(player).not.toContain('data-role="guidance-mount"');
  });
});

describe('buildNavigatorStateHTML', () => {
  it('has a loading, an error, and an empty message', () => {
    expect(buildNavigatorStateHTML('loading')).toContain('Loading');
    expect(buildNavigatorStateHTML('error')).toContain("Couldn't load");
    expect(buildNavigatorStateHTML('empty')).toContain('No knowledge yet');
  });
});

describe('buildNavigatorGroupsHTML', () => {
  it('shows the empty state when there are no groups', () => {
    expect(buildNavigatorGroupsHTML([])).toBe(buildNavigatorStateHTML('empty'));
  });

  it('emits one section per group and one row per node, carrying data-node-id and a lowercased data-title', () => {
    const nodes = [
      createNode({ id: 'City.1', type: 'City', title: 'Waterdeep' }),
      createNode({ id: 'Character.1', type: 'Character', title: 'Volo' }),
    ];
    const html = buildNavigatorGroupsHTML(groupNodesByType(nodes));
    expect(html).toContain('data-group="City"');
    expect(html).toContain('data-group="Character"');
    expect(html).toContain('data-node-id="City.1"');
    expect(html).toContain('data-title="waterdeep"');
    expect(html).toContain('data-action="focusNode"');
    expect(html).toContain('>Waterdeep<');
  });

  it('escapes node titles', () => {
    const html = buildNavigatorGroupsHTML(
      groupNodesByType([createNode({ id: 'Lore.1', type: 'Lore', title: '<script>' })]),
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders each group header as a toggleGroup button, expanded by default', () => {
    const html = buildNavigatorGroupsHTML(
      groupNodesByType([
        createNode({ id: 'City.1', type: 'City', title: 'Waterdeep' }),
        createNode({ id: 'Character.1', type: 'Character', title: 'Volo' }),
      ]),
    );
    expect(html).toContain('data-action="toggleGroup"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('▾');
    expect(html).not.toContain('class="archivexus-codex-rows" hidden');
  });

  it('hides rows and flips the caret for a collapsed type (VIEW-001h)', () => {
    const html = buildNavigatorGroupsHTML(
      groupNodesByType([createNode({ id: 'City.1', type: 'City', title: 'Waterdeep' })]),
      new Set(['City']),
    );
    expect(html).toContain('class="archivexus-codex-rows" hidden');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('▸');
  });

  it('renders a favourite ☆/★ toggle per row reflecting favouriteIds (VIEW-001d)', () => {
    const groups = groupNodesByType([
      createNode({ id: 'City.1', type: 'City', title: 'Waterdeep' }),
      createNode({ id: 'City.2', type: 'City', title: 'Baldur' }),
    ]);
    const html = buildNavigatorGroupsHTML(groups, new Set(), new Set(['City.1']));
    expect(html).toContain('data-action="toggleFavourite"');
    expect(html).toContain('aria-pressed="true"'); // City.1
    expect(html).toContain('aria-pressed="false"'); // City.2
    expect(html).toContain('★');
    expect(html).toContain('☆');
  });
});

describe('navigatorGroupsStartExpanded', () => {
  const groupOf = (type: string, n: number) => ({
    type,
    nodes: Array.from({ length: n }, (_, i) =>
      createNode({ id: `${type}.${i}`, type, title: `${type} ${i}` }),
    ),
  });

  it('starts expanded for a single group or a short total list', () => {
    expect(navigatorGroupsStartExpanded([groupOf('City', 40)])).toBe(true);
    expect(navigatorGroupsStartExpanded([groupOf('City', 8), groupOf('Character', 5)])).toBe(true);
  });

  it('starts collapsed for several groups with a long total list', () => {
    expect(
      navigatorGroupsStartExpanded([groupOf('City', 20), groupOf('Character', 41)]),
    ).toBe(false);
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

