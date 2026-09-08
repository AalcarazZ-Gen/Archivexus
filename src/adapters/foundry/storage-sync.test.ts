import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode, type Node } from '../../core/domain/node.js';
import { createRelationship, type Relationship } from '../../core/domain/relationship.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { syncActor, syncAllActorsAndPages, syncJournalEntryPage } from './storage-sync.js';

function fakeStorage(): StorageProvider & { saved: Node[] } {
  const saved: Node[] = [];
  return {
    saved,
    init: async () => undefined,
    saveNode: vi.fn(async (node: Node) => {
      saved.push(node);
    }),
    getNode: async () => undefined,
    deleteNode: async () => undefined,
    listNodes: async () => [],
    saveRelationship: async () => undefined,
    getRelationship: async () => undefined,
    deleteRelationship: async () => undefined,
    listRelationships: async () => [],
    getRelationshipsForNode: async () => [],
    saveView: async () => undefined,
    getView: async () => undefined,
    deleteView: async () => undefined,
    listViews: async () => [],
    close: async () => undefined,
  };
}

/**
 * A real, stateful in-memory `StorageProvider` fake (unlike `fakeStorage`
 * above, which is a dumb append-only sink) — ADR-0011's orchestration tests
 * below need `getNode`/`deleteNode`/`listNodes` to actually reflect prior
 * `saveNode` calls, since the orchestration reads its own writes within a
 * single `syncJournalEntryPage` call and across repeated calls.
 */
function fakeStatefulStorage(
  initialNodes: readonly Node[] = [],
  initialRelationships: readonly Relationship[] = [],
): StorageProvider & {
  nodes: Map<string, Node>;
  saveNode: ReturnType<typeof vi.fn>;
  deleteNode: ReturnType<typeof vi.fn>;
} {
  const nodes = new Map<string, Node>(initialNodes.map((node) => [node.id, node]));
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
    saveView: async () => undefined,
    getView: async () => undefined,
    deleteView: async () => undefined,
    listViews: async () => [],
    close: async () => undefined,
  };
}

describe('syncActor', () => {
  it('maps the Actor to a Node and saves it via the storage provider', async () => {
    const storage = fakeStorage();
    await syncActor({ uuid: 'Actor.1', name: 'Kael Verik' }, storage);
    expect(storage.saveNode).toHaveBeenCalledTimes(1);
    expect(storage.saved[0]?.id).toBe('Actor.1');
    expect(storage.saved[0]?.title).toBe('Kael Verik');
  });
});

describe('syncJournalEntryPage', () => {
  it('maps the page to a Node and saves it via the storage provider', async () => {
    const storage = fakeStorage();
    await syncJournalEntryPage({ uuid: 'JournalEntryPage.1', name: 'Some Lore' }, storage);
    expect(storage.saveNode).toHaveBeenCalledTimes(1);
    expect(storage.saved[0]?.id).toBe('JournalEntryPage.1');
  });
});

describe('syncJournalEntryPage — ADR-0011 attachment orchestration', () => {
  let warnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    warnMock = vi.fn();
    (globalThis as { ui?: unknown }).ui = { notifications: { warn: warnMock } };
  });

  afterEach(() => {
    delete (globalThis as { ui?: unknown }).ui;
  });

  it('attach + target exists: deletes the page\'s own standalone Node and upserts a Block on the target', async () => {
    const target = createNode({ id: 'Actor.fausto', type: 'Character', title: 'Fausto Farcon' });
    const existingStandalonePage = createNode({
      id: 'JournalEntryPage.bio',
      type: 'Lore',
      title: 'Biografía',
    });
    const storage = fakeStatefulStorage([target, existingStandalonePage]);

    await syncJournalEntryPage(
      {
        uuid: 'JournalEntryPage.bio',
        name: 'Biografía',
        flags: { archivexus: { attachedToNodeId: 'Actor.fausto' } },
      },
      storage,
    );

    expect(storage.deleteNode).toHaveBeenCalledWith('JournalEntryPage.bio');
    expect(await storage.getNode('JournalEntryPage.bio')).toBeUndefined();

    const updatedTarget = await storage.getNode('Actor.fausto');
    expect(updatedTarget?.blocks).toEqual([
      { type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Biografía' },
    ]);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('ADAPT-010/ADR-0011 point 5: warns the GM by name/count when retagging a page that already has real Relationships, but still proceeds with the delete/attach', async () => {
    const target = createNode({ id: 'Actor.fausto', type: 'Character', title: 'Fausto Farcon' });
    const existingStandalonePage = createNode({
      id: 'JournalEntryPage.bio',
      type: 'Lore',
      title: 'Biografía',
    });
    const someOtherNode = createNode({ id: 'Node.other', type: 'Lore', title: 'Something else' });
    const relationshipA = createRelationship({
      id: 'Relationship.1',
      origin: 'JournalEntryPage.bio',
      target: 'Node.other',
      definitionId: 'related-to',
      title: 'Biografía relates to Something else',
    });
    const relationshipB = createRelationship({
      id: 'Relationship.2',
      origin: 'Node.other',
      target: 'JournalEntryPage.bio',
      definitionId: 'related-to',
      title: 'Something else relates to Biografía',
    });
    const storage = fakeStatefulStorage(
      [target, existingStandalonePage, someOtherNode],
      [relationshipA, relationshipB],
    );

    await syncJournalEntryPage(
      {
        uuid: 'JournalEntryPage.bio',
        name: 'Biografía',
        flags: { archivexus: { attachedToNodeId: 'Actor.fausto' } },
      },
      storage,
    );

    // The warning fires with the correct count...
    expect(warnMock).toHaveBeenCalledTimes(1);
    const [message] = warnMock.mock.calls[0] as [string];
    expect(message).toContain('Biografía');
    expect(message).toContain('2');
    expect(message).toContain('Fausto Farcon');

    // ...but the delete/attach proceeds exactly as it would without any
    // Relationships — non-blocking, per ADR-0011 point 5.
    expect(storage.deleteNode).toHaveBeenCalledWith('JournalEntryPage.bio');
    expect(await storage.getNode('JournalEntryPage.bio')).toBeUndefined();
    const updatedTarget = await storage.getNode('Actor.fausto');
    expect(updatedTarget?.blocks).toEqual([
      { type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Biografía' },
    ]);
  });

  it('attach + no prior standalone Node existed: still upserts the Block onto the target', async () => {
    const target = createNode({ id: 'Actor.fausto', type: 'Character', title: 'Fausto Farcon' });
    const storage = fakeStatefulStorage([target]);

    await syncJournalEntryPage(
      {
        uuid: 'JournalEntryPage.new',
        name: 'A brand new page',
        flags: { archivexus: { attachedToNodeId: 'Actor.fausto' } },
      },
      storage,
    );

    const updatedTarget = await storage.getNode('Actor.fausto');
    expect(updatedTarget?.blocks).toEqual([
      { type: 'JournalEntryPage', uuid: 'JournalEntryPage.new', title: 'A brand new page' },
    ]);
    expect(await storage.getNode('JournalEntryPage.new')).toBeUndefined();
  });

  it('re-syncing the same attached page twice replaces the Block, never duplicates it (idempotent upsert)', async () => {
    const target = createNode({ id: 'Actor.fausto', type: 'Character', title: 'Fausto Farcon' });
    const storage = fakeStatefulStorage([target]);
    const page = {
      uuid: 'JournalEntryPage.bio',
      name: 'Biografía',
      flags: { archivexus: { attachedToNodeId: 'Actor.fausto' } },
    };

    await syncJournalEntryPage(page, storage);
    await syncJournalEntryPage({ ...page, name: 'Biografía (edited)' }, storage);

    const updatedTarget = await storage.getNode('Actor.fausto');
    expect(updatedTarget?.blocks).toHaveLength(1);
    expect(updatedTarget?.blocks[0]?.title).toBe('Biografía (edited)');
  });

  it('attach with a dangling target (does not resolve): falls back to the standalone path, never to nothing', async () => {
    const storage = fakeStatefulStorage([]);

    await syncJournalEntryPage(
      {
        uuid: 'JournalEntryPage.orphan',
        name: 'Orphaned Page',
        flags: { archivexus: { attachedToNodeId: 'Actor.does-not-exist' } },
      },
      storage,
    );

    expect(storage.deleteNode).not.toHaveBeenCalled();
    const standaloneNode = await storage.getNode('JournalEntryPage.orphan');
    expect(standaloneNode).toBeDefined();
    expect(standaloneNode?.title).toBe('Orphaned Page');
  });

  it('no attachedToNodeId flag at all: behaves exactly like the pre-ADR-0011 standalone path', async () => {
    const storage = fakeStatefulStorage([]);

    await syncJournalEntryPage({ uuid: 'JournalEntryPage.plain', name: 'Plain Lore' }, storage);

    const node = await storage.getNode('JournalEntryPage.plain');
    expect(node?.title).toBe('Plain Lore');
    expect(storage.deleteNode).not.toHaveBeenCalled();
  });

  it('unconditional cleanup: removes a stale Block referencing this page from a Node that is not the current target', async () => {
    const currentTarget = createNode({ id: 'Actor.fausto', type: 'Character', title: 'Fausto Farcon' });
    const staleTarget = createNode({
      id: 'Node.old-city',
      type: 'City',
      title: 'An old, wrong target',
      blocks: [{ type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Biografía' }],
    });
    const storage = fakeStatefulStorage([currentTarget, staleTarget]);

    await syncJournalEntryPage(
      {
        uuid: 'JournalEntryPage.bio',
        name: 'Biografía',
        flags: { archivexus: { attachedToNodeId: 'Actor.fausto' } },
      },
      storage,
    );

    const updatedStaleTarget = await storage.getNode('Node.old-city');
    expect(updatedStaleTarget?.blocks).toEqual([]);
    const updatedCurrentTarget = await storage.getNode('Actor.fausto');
    expect(updatedCurrentTarget?.blocks).toEqual([
      { type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Biografía' },
    ]);
  });

  it('detach: reverting to standalone recreates the page\'s own Node AND removes the stale Block from its old target', async () => {
    const oldTarget = createNode({
      id: 'Actor.fausto',
      type: 'Character',
      title: 'Fausto Farcon',
      blocks: [{ type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Biografía' }],
    });
    const storage = fakeStatefulStorage([oldTarget]);

    // GM cleared attachedToNodeId - the page reverts to standalone.
    await syncJournalEntryPage({ uuid: 'JournalEntryPage.bio', name: 'Biografía' }, storage);

    const restoredStandaloneNode = await storage.getNode('JournalEntryPage.bio');
    expect(restoredStandaloneNode?.title).toBe('Biografía');
    const updatedOldTarget = await storage.getNode('Actor.fausto');
    expect(updatedOldTarget?.blocks).toEqual([]);
  });

  it('cleanup runs even when the page is a plain standalone sync with no attachment involved', async () => {
    const unrelatedNode = createNode({
      id: 'Node.unrelated',
      type: 'Lore',
      title: 'Unrelated',
      blocks: [{ type: 'JournalEntryPage', uuid: 'JournalEntryPage.plain', title: 'Stale' }],
    });
    const storage = fakeStatefulStorage([unrelatedNode]);

    await syncJournalEntryPage({ uuid: 'JournalEntryPage.plain', name: 'Plain Lore' }, storage);

    const updated = await storage.getNode('Node.unrelated');
    expect(updated?.blocks).toEqual([]);
  });
});

describe('syncAllActorsAndPages', () => {
  it('saves every actor and every page exactly once', async () => {
    const storage = fakeStorage();
    await syncAllActorsAndPages(
      {
        actors: [
          { uuid: 'Actor.1', name: 'A' },
          { uuid: 'Actor.2', name: 'B' },
        ],
        journalPages: [{ uuid: 'JournalEntryPage.1', name: 'C' }],
      },
      storage,
    );
    expect(storage.saveNode).toHaveBeenCalledTimes(3);
    expect(storage.saved.map((n) => n.id).sort()).toEqual([
      'Actor.1',
      'Actor.2',
      'JournalEntryPage.1',
    ]);
  });

  it('handles an empty world with no actors or pages', async () => {
    const storage = fakeStorage();
    await syncAllActorsAndPages({ actors: [], journalPages: [] }, storage);
    expect(storage.saveNode).not.toHaveBeenCalled();
  });
});
