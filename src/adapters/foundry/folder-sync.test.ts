import { describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Node } from '../../core/domain/node.js';
import type { FoundryFolderLike } from './folder-to-node.js';
import { deleteFolderNode, syncAllFolders, syncFolder } from './folder-sync.js';

function fakeStorage(existing: Node[] = []): StorageProvider & {
  saved: Node[];
  deleted: string[];
} {
  const saved: Node[] = [];
  const deleted: string[] = [];
  return {
    saved,
    deleted,
    saveNode: vi.fn(async (n: Node) => {
      saved.push(n);
    }),
    getNode: vi.fn(async (id: string) => existing.find((n) => n.id === id)),
    deleteNode: vi.fn(async (id: string) => {
      deleted.push(id);
    }),
  } as unknown as StorageProvider & { saved: Node[]; deleted: string[] };
}

const tagged: FoundryFolderLike = {
  uuid: 'Folder.rc',
  name: 'Red Cuervo',
  flags: { archivexus: { nodeType: 'Organization' } },
};
const node = (id: string): Node => ({ id }) as Node;

describe('syncFolder', () => {
  it('upserts the Folder-Node for a tagged folder', async () => {
    const storage = fakeStorage();
    await syncFolder(tagged, storage);
    expect(storage.saved).toHaveLength(1);
    expect(storage.saved[0]?.id).toBe('Folder.rc');
    expect(storage.deleted).toEqual([]);
  });

  it('deletes a stale Folder-Node when the folder is no longer tagged', async () => {
    const storage = fakeStorage([node('Folder.rc')]);
    await syncFolder({ uuid: 'Folder.rc', name: 'Red Cuervo' }, storage);
    expect(storage.deleted).toEqual(['Folder.rc']);
    expect(storage.saved).toEqual([]);
  });

  it('is a no-op for an untagged folder that was never a Node', async () => {
    const storage = fakeStorage();
    await syncFolder({ uuid: 'Folder.npc', name: 'NPC' }, storage);
    expect(storage.saved).toEqual([]);
    expect(storage.deleted).toEqual([]);
  });
});

describe('deleteFolderNode', () => {
  it('removes the Node when one exists, no-ops otherwise', async () => {
    const withNode = fakeStorage([node('Folder.rc')]);
    await deleteFolderNode('Folder.rc', withNode);
    expect(withNode.deleted).toEqual(['Folder.rc']);

    const without = fakeStorage();
    await deleteFolderNode('Folder.gone', without);
    expect(without.deleted).toEqual([]);
  });
});

describe('syncAllFolders', () => {
  it('saves only the tagged folders', async () => {
    const storage = fakeStorage();
    await syncAllFolders(
      [tagged, { uuid: 'Folder.npc', name: 'NPC' }, { uuid: 'Folder.sw', name: 'Sword Mts', flags: { archivexus: { nodeType: 'Kingdom' } } }],
      storage,
    );
    expect(storage.saved.map((n) => n.id).sort()).toEqual(['Folder.rc', 'Folder.sw']);
  });
});
