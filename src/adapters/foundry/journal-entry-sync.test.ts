import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import {
  deleteJournalEntryNode,
  syncAllJournalEntries,
  syncJournalEntry,
  syncJournalEntryPageOrParent,
} from './journal-entry-sync.js';
import type { FoundryJournalEntryLike } from './journal-entry-to-node.js';

function fakeStorage(
  initialNodes: readonly Node[] = [],
  initialRelationships: readonly Relationship[] = [],
): StorageProvider & { nodes: Map<string, Node>; deleteNode: ReturnType<typeof vi.fn> } {
  const nodes = new Map<string, Node>(initialNodes.map((n) => [n.id, n]));
  return {
    nodes,
    init: async () => undefined,
    saveNode: vi.fn(async (node: Node) => {
      nodes.set(node.id, node);
    }),
    getNode: async (id: string) => nodes.get(id),
    deleteNode: vi.fn(async (id: string) => {
      nodes.delete(id);
    }),
    listNodes: async () => Array.from(nodes.values()),
    saveRelationship: async () => undefined,
    getRelationship: async () => undefined,
    deleteRelationship: async () => undefined,
    listRelationships: async () => [],
    getRelationshipsForNode: async (nodeId: string) =>
      initialRelationships.filter((r) => r.origin === nodeId || r.target === nodeId),
    saveRelationshipDefinition: async () => undefined,
    getRelationshipDefinition: async () => undefined,
    deleteRelationshipDefinition: async () => undefined,
    listRelationshipDefinitions: async () => [],
    saveView: async () => undefined,
    getView: async () => undefined,
    deleteView: async () => undefined,
    listViews: async () => [],
    close: async () => undefined,
  } as unknown as StorageProvider & {
    nodes: Map<string, Node>;
    deleteNode: ReturnType<typeof vi.fn>;
  };
}

const node = (id: string, extra: Partial<Node> = {}): Node =>
  ({ id, title: id, type: 'Lore', visibility: 'hidden', blocks: [], ...extra }) as Node;

const taggedViolet: FoundryJournalEntryLike = {
  uuid: 'JournalEntry.violet',
  name: 'Violet Meyer',
  ownership: { default: 2 },
  flags: { archivexus: { nodeType: 'Character' } },
  pages: {
    contents: [
      { uuid: 'JournalEntry.violet.JournalEntryPage.retrato', name: 'Retrato' },
      { uuid: 'JournalEntry.violet.JournalEntryPage.bio', name: 'Biografía' },
    ],
  },
};

describe('syncJournalEntry — tagged', () => {
  let warnMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    warnMock = vi.fn();
    (globalThis as { ui?: unknown }).ui = { notifications: { warn: warnMock } };
  });
  afterEach(() => {
    delete (globalThis as { ui?: unknown }).ui;
  });

  it('saves one entry-Node carrying the pages as Blocks', async () => {
    const storage = fakeStorage();
    await syncJournalEntry(taggedViolet, storage);
    const saved = storage.nodes.get('JournalEntry.violet');
    expect(saved?.type).toBe('Character');
    expect(saved?.blocks.map((b) => b.uuid)).toEqual([
      'JournalEntry.violet.JournalEntryPage.retrato',
      'JournalEntry.violet.JournalEntryPage.bio',
    ]);
  });

  it('deletes the pages’ pre-existing standalone Nodes', async () => {
    const storage = fakeStorage([
      node('JournalEntry.violet.JournalEntryPage.retrato'),
      node('JournalEntry.violet.JournalEntryPage.bio'),
    ]);
    await syncJournalEntry(taggedViolet, storage);
    expect(storage.nodes.has('JournalEntry.violet.JournalEntryPage.retrato')).toBe(false);
    expect(storage.nodes.has('JournalEntry.violet.JournalEntryPage.bio')).toBe(false);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('warns non-blockingly when a superseded page-Node carried Relationships', async () => {
    const storage = fakeStorage(
      [node('JournalEntry.violet.JournalEntryPage.bio', { title: 'Biografía' })],
      [
        {
          id: 'r1',
          origin: 'JournalEntry.violet.JournalEntryPage.bio',
          target: 'Actor.x',
        } as Relationship,
      ],
    );
    await syncJournalEntry(taggedViolet, storage);
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock.mock.calls[0]?.[0]).toContain('Violet Meyer');
    expect(storage.nodes.has('JournalEntry.violet')).toBe(true);
  });

  it('removes a stale Block for one of its pages from another Node (detach-cleanup)', async () => {
    const storage = fakeStorage([
      node('Actor.fausto', {
        blocks: [
          {
            type: 'JournalEntryPage',
            uuid: 'JournalEntry.violet.JournalEntryPage.bio',
            title: 'x',
          },
        ],
      }),
    ]);
    await syncJournalEntry(taggedViolet, storage);
    expect(storage.nodes.get('Actor.fausto')?.blocks).toEqual([]);
  });
});

describe('syncJournalEntry — untagged', () => {
  const untagged: FoundryJournalEntryLike = {
    uuid: 'JournalEntry.violet',
    name: 'Violet Meyer',
    pages: {
      contents: [{ uuid: 'JournalEntry.violet.JournalEntryPage.retrato', name: 'Retrato' }],
    },
  };

  it('deletes a stale entry-Node and returns pages to individual mapping', async () => {
    const storage = fakeStorage([node('JournalEntry.violet', { type: 'Character' })]);
    await syncJournalEntry(untagged, storage);
    expect(storage.nodes.has('JournalEntry.violet')).toBe(false);
    expect(storage.nodes.has('JournalEntry.violet.JournalEntryPage.retrato')).toBe(true);
  });
});

describe('syncJournalEntryPageOrParent', () => {
  it('re-syncs the whole entry when the parent is tagged (returns true)', async () => {
    const storage = fakeStorage();
    const tookEntryPath = await syncJournalEntryPageOrParent(
      {
        uuid: 'JournalEntry.violet.JournalEntryPage.retrato',
        name: 'Retrato',
        parent: taggedViolet as never,
      },
      storage,
    );
    expect(tookEntryPath).toBe(true);
    expect(storage.nodes.has('JournalEntry.violet')).toBe(true);
    expect(storage.nodes.has('JournalEntry.violet.JournalEntryPage.retrato')).toBe(false);
  });

  it('syncs the page standalone when the parent is not tagged (returns false)', async () => {
    const storage = fakeStorage();
    const tookEntryPath = await syncJournalEntryPageOrParent(
      { uuid: 'JournalEntryPage.loose', name: 'Loose Lore', parent: { name: 'Notes' } },
      storage,
    );
    expect(tookEntryPath).toBe(false);
    expect(storage.nodes.has('JournalEntryPage.loose')).toBe(true);
  });
});

describe('deleteJournalEntryNode', () => {
  it('removes the entry-Node when present, no-ops otherwise', async () => {
    const storage = fakeStorage([node('JournalEntry.violet')]);
    await deleteJournalEntryNode('JournalEntry.violet', storage);
    expect(storage.nodes.has('JournalEntry.violet')).toBe(false);
    await deleteJournalEntryNode('JournalEntry.gone', storage); // no throw
  });
});

describe('syncAllJournalEntries', () => {
  it('processes only the tagged entries', async () => {
    const storage = fakeStorage();
    await syncAllJournalEntries(
      [taggedViolet, { uuid: 'JournalEntry.plain', name: 'Plain', pages: { contents: [] } }],
      storage,
    );
    expect(Array.from(storage.nodes.keys())).toEqual(['JournalEntry.violet']);
  });
});
