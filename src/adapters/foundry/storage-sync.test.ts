import { describe, expect, it, vi } from 'vitest';
import type { Node } from '../../core/domain/node.js';
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
