import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode, type Node } from '../../core/domain/node.js';
import { createRelationship, type Relationship } from '../../core/domain/relationship.js';
import {
  createRelationshipDefinition,
  type RelationshipDefinition,
} from '../../core/domain/relationship-definition.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { createLogger } from './logger.js';
import {
  buildConsoleContentHTML,
  buildConsoleFiltersHTML,
  buildConsoleRows,
  buildConsoleRowsHTML,
  EMPTY_CONSOLE_FILTERS,
  ensureConsoleStyles,
  filterConsoleRows,
  getRelationshipConsoleClass,
  groupConsoleRows,
  openRelationshipConsole,
  type ConsoleRow,
} from './relationship-console-window.js';

const log = createLogger('archivexus-test');

const cassandra = createNode({ id: 'Actor.cass', type: 'Character', title: 'Cassandra Vell' });
const voss = createNode({ id: 'Actor.voss', type: 'Character', title: 'Director Voss' });
const academy = createNode({ id: 'JournalEntry.j.JournalEntryPage.p', type: 'City', title: 'The Academy' });
const nodesById = new Map<string, Node>([
  [cassandra.id, cassandra],
  [voss.id, voss],
  [academy.id, academy],
]);

const allyOf = createRelationshipDefinition({
  id: 'ally-of',
  name: 'ally-of',
  inverse: 'ally-of',
  cardinality: 'many-to-many',
  symmetry: true,
  traversalCategory: 'affiliation',
});
const residesIn = createRelationshipDefinition({
  id: 'resides-in',
  name: 'resides-in',
  inverse: 'residence-of',
  cardinality: 'many-to-one',
  symmetry: false,
  traversalCategory: 'location',
});
const defsById = new Map<string, RelationshipDefinition>([
  [allyOf.id, allyOf],
  [residesIn.id, residesIn],
]);

function rel(overrides: Partial<Parameters<typeof createRelationship>[0]>): Relationship {
  return createRelationship({
    id: 'r1',
    origin: cassandra.id,
    target: voss.id,
    definitionId: 'ally-of',
    title: 'Cassandra Vell is an ally of Director Voss',
    ...overrides,
  });
}

function only(list: readonly ConsoleRow[]): ConsoleRow {
  expect(list).toHaveLength(1);
  return list[0] as ConsoleRow;
}

describe('buildConsoleRows', () => {
  it('resolves titles, category and definition name from the lookups', () => {
    const row = only(buildConsoleRows([rel({})], nodesById, defsById));
    expect(row.category).toBe('affiliation');
    expect(row.definitionName).toBe('ally-of');
    expect(row.originTitle).toBe('Cassandra Vell');
    expect(row.targetTitle).toBe('Director Voss');
    expect(row.dangling).toBe(false);
    expect(row.hasJournalOnlyEndpoint).toBe(false);
  });

  it('flags a JournalEntryPage-backed endpoint and falls back to ids for missing nodes', () => {
    const row = only(
      buildConsoleRows(
        [rel({ id: 'r2', origin: cassandra.id, target: academy.id, definitionId: 'resides-in', title: 'lives at the Academy' })],
        nodesById,
        defsById,
      ),
    );
    expect(row.hasJournalOnlyEndpoint).toBe(true);
    expect(row.category).toBe('location');
    expect(row.dangling).toBe(false);
  });

  it('marks a row dangling when an endpoint is not a stored Node, and category "other" for an unknown definition', () => {
    const row = only(
      buildConsoleRows([rel({ id: 'r3', target: 'Actor.ghost', definitionId: 'made-up' })], nodesById, defsById),
    );
    expect(row.dangling).toBe(true);
    expect(row.targetTitle).toBe('Actor.ghost');
    expect(row.category).toBe('other');
    expect(row.definitionName).toBe('made-up');
  });
});

const rows: readonly ConsoleRow[] = buildConsoleRows(
  [
    rel({ id: 'a', title: 'Cassandra Vell is an ally of Director Voss' }),
    rel({ id: 'b', origin: cassandra.id, target: academy.id, definitionId: 'resides-in', title: 'Cassandra Vell resides in The Academy' }),
    rel({ id: 'c', origin: voss.id, target: 'Actor.ghost', definitionId: 'made-up', title: 'Director Voss knows someone gone' }),
  ],
  nodesById,
  defsById,
);

describe('filterConsoleRows', () => {
  it('matches the query against title, endpoint titles and definition name', () => {
    expect(filterConsoleRows(rows, { ...EMPTY_CONSOLE_FILTERS, query: 'academy' }).map((r) => r.id)).toEqual(['b']);
    expect(filterConsoleRows(rows, { ...EMPTY_CONSOLE_FILTERS, query: 'ally-of' }).map((r) => r.id)).toEqual(['a']);
  });

  it('filters by category, definition, involves-node and dangling-only', () => {
    expect(filterConsoleRows(rows, { ...EMPTY_CONSOLE_FILTERS, category: 'location' }).map((r) => r.id)).toEqual(['b']);
    expect(filterConsoleRows(rows, { ...EMPTY_CONSOLE_FILTERS, definitionId: 'ally-of' }).map((r) => r.id)).toEqual(['a']);
    expect(
      filterConsoleRows(rows, { ...EMPTY_CONSOLE_FILTERS, involvesNodeId: voss.id }).map((r) => r.id).sort(),
    ).toEqual(['a', 'c']);
    expect(filterConsoleRows(rows, { ...EMPTY_CONSOLE_FILTERS, danglingOnly: true }).map((r) => r.id)).toEqual(['c']);
  });
});

describe('groupConsoleRows', () => {
  it('flat mode is one title-sorted group', () => {
    const groups = groupConsoleRows(rows, 'flat');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('');
    expect(groups[0]?.rows.map((r) => r.title[0])).toEqual(['C', 'C', 'D']);
  });

  it('category mode is taxonomy order with Other last and empty groups dropped', () => {
    expect(groupConsoleRows(rows, 'category').map((g) => g.key)).toEqual(['location', 'affiliation', 'other']);
  });

  it('is empty for no rows', () => {
    expect(groupConsoleRows([], 'category')).toEqual([]);
    expect(groupConsoleRows([], 'flat')).toEqual([]);
  });
});

describe('buildConsoleFiltersHTML', () => {
  it('renders the search value, both selects, the dangling checkbox and the group toggle', () => {
    const html = buildConsoleFiltersHTML(
      [allyOf, residesIn],
      { ...EMPTY_CONSOLE_FILTERS, query: 'foo', danglingOnly: true },
      'category',
      undefined,
    );
    expect(html).toContain('value="foo"');
    expect(html).toContain('name="category"');
    expect(html).toContain('<option value="ally-of"');
    expect(html).toContain('name="danglingOnly" checked');
    expect(html).toContain('Group: Category');
    expect(html).toContain('data-action="newRelationship"');
    expect(html).not.toContain('data-action="clearNodeFilter"');
  });

  it('shows a clearable chip when scoped to a node', () => {
    const html = buildConsoleFiltersHTML([], EMPTY_CONSOLE_FILTERS, 'flat', 'Cassandra Vell');
    expect(html).toContain('data-action="clearNodeFilter"');
    expect(html).toContain('Involving: Cassandra Vell');
    expect(html).toContain('Group: Flat');
  });
});

describe('buildConsoleRowsHTML', () => {
  it('has distinct empty states for "no matches" vs "none yet"', () => {
    expect(buildConsoleRowsHTML([], true)).toContain('match these filters');
    expect(buildConsoleRowsHTML([], false)).toContain('No relationships yet');
  });

  it('renders rows with the id, a data-search haystack, chips and both actions', () => {
    const html = buildConsoleRowsHTML(groupConsoleRows(rows, 'category'), true);
    expect(html).toContain('data-relationship-id="c"');
    expect(html).toContain('data-search="');
    expect(html).toContain('archivexus-console-flag--warn'); // dangling row "c"
    expect(html).toContain('◔'); // journal-only endpoint row "b"
    expect(html).toContain('data-action="seeInGraph"');
    expect(html).toContain('data-action="delete"');
    expect(html).toContain('data-console-group="location"');
  });

  it('omits group headers in flat mode', () => {
    const html = buildConsoleRowsHTML(groupConsoleRows(rows, 'flat'), true);
    expect(html).not.toContain('archivexus-console-group-header');
  });
});

describe('buildConsoleContentHTML', () => {
  it('shows the shown/total count', () => {
    const html = buildConsoleContentHTML(
      groupConsoleRows(rows, 'category'),
      [allyOf, residesIn],
      EMPTY_CONSOLE_FILTERS,
      'category',
      undefined,
      3,
      3,
    );
    expect(html).toContain('3 of 3 shown');
    expect(html).toContain('data-role="console-list"');
  });
});

describe('ensureConsoleStyles', () => {
  it('is a no-op without a document', () => {
    expect(() => ensureConsoleStyles()).not.toThrow();
  });

  it('injects a single <style> once', () => {
    const appended: { id: string }[] = [];
    const byId = new Map<string, unknown>();
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => byId.get(id) ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      head: {
        appendChild: (node: { id: string }) => {
          appended.push(node);
          byId.set(node.id, node);
        },
      },
    };
    ensureConsoleStyles();
    ensureConsoleStyles();
    expect(appended).toHaveLength(1);
    delete (globalThis as { document?: unknown }).document;
  });
});

describe('openRelationshipConsole', () => {
  class FakeApplicationV2 {
    static instances: FakeApplicationV2[] = [];
    element = { querySelector: () => null, querySelectorAll: () => [] };
    rendered = 0;
    constructor(public options: unknown) {
      FakeApplicationV2.instances.push(this);
    }
    render(): void {
      this.rendered += 1;
    }
    async close(): Promise<void> {
      (this as unknown as { _onClose?: () => void })._onClose?.();
    }
  }

  beforeEach(() => {
    FakeApplicationV2.instances = [];
    (globalThis as { foundry?: unknown }).foundry = {
      applications: { api: { ApplicationV2: FakeApplicationV2, DialogV2: {} } },
    };
    (globalThis as { Hooks?: unknown }).Hooks = {
      on: () => {},
      off: () => {},
      once: () => {},
      callAll: () => {},
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { foundry?: unknown }).foundry;
    delete (globalThis as { Hooks?: unknown }).Hooks;
  });

  const storage = (): StorageProvider =>
    ({
      listRelationships: async () => [],
      listNodes: async () => [],
      listRelationshipDefinitions: async () => [],
    }) as unknown as StorageProvider;

  it('warns and does not open without storage', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    openRelationshipConsole(() => undefined, log);
    expect(warn).toHaveBeenCalled();
    expect(FakeApplicationV2.instances).toHaveLength(0);
  });

  it('is a singleton — a second call re-renders it, a scoped call re-scopes + re-renders it', async () => {
    const s = storage();
    openRelationshipConsole(() => s, log);
    openRelationshipConsole(() => s, log);
    expect(FakeApplicationV2.instances).toHaveLength(1);
    expect(FakeApplicationV2.instances[0]?.rendered).toBe(2);

    // A scoped re-open goes through setNodeFilter, which re-renders.
    openRelationshipConsole(() => s, log, { involvesNodeId: 'Actor.x' });
    expect(FakeApplicationV2.instances).toHaveLength(1);
    expect(FakeApplicationV2.instances[0]?.rendered).toBe(3);

    await FakeApplicationV2.instances[0]?.close(); // clears the module-level singleton
  });
});

describe('getRelationshipConsoleClass', () => {
  beforeEach(() => {
    (globalThis as { foundry?: unknown }).foundry = {
      applications: { api: { ApplicationV2: class {}, DialogV2: {} } },
    };
  });
  afterEach(() => {
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  it('memoizes the built class', () => {
    expect(getRelationshipConsoleClass()).toBe(getRelationshipConsoleClass());
  });
});
