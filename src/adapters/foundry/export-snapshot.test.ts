import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { downloadPortableSnapshot, gatherPortableSnapshot } from './export-snapshot.js';

function fakeStorage(overrides: Partial<StorageProvider> = {}): StorageProvider {
  return {
    init: async () => undefined,
    saveNode: async () => undefined,
    getNode: async () => undefined,
    deleteNode: async () => undefined,
    listNodes: async () => [],
    saveRelationship: async () => undefined,
    getRelationship: async () => undefined,
    deleteRelationship: async () => undefined,
    listRelationships: async () => [],
    getRelationshipsForNode: async () => [],
    close: async () => undefined,
    ...overrides,
  };
}

describe('gatherPortableSnapshot', () => {
  it('gathers Nodes/Relationships from storage and shapes them via toPortableSnapshot', async () => {
    const node = createNode({ id: 'Node.1', type: 'City', title: 'Puerto Umbral' });
    const storage = fakeStorage({
      listNodes: vi.fn(async () => [node]),
      listRelationships: vi.fn(async () => []),
    });

    const snapshot = await gatherPortableSnapshot(storage);

    expect(storage.listNodes).toHaveBeenCalledTimes(1);
    expect(storage.listRelationships).toHaveBeenCalledTimes(1);
    expect(snapshot.nodes).toEqual([
      {
        id: 'Node.1',
        type: 'City',
        title: 'Puerto Umbral',
        visibility: 'hidden',
        metadata: {},
        history: [],
        blocks: [],
        tags: [],
        references: [],
      },
    ]);
    expect(snapshot.views).toEqual([]);
  });
});

describe('downloadPortableSnapshot', () => {
  let saveDataToFileMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    saveDataToFileMock = vi.fn();
    (globalThis as { saveDataToFile?: unknown }).saveDataToFile = saveDataToFileMock;
  });

  afterEach(() => {
    delete (globalThis as { saveDataToFile?: unknown }).saveDataToFile;
  });

  it("triggers Foundry's own saveDataToFile with the JSON snapshot and an application/json mime type", async () => {
    const storage = fakeStorage();
    await downloadPortableSnapshot(storage, 'my-export.json');

    expect(saveDataToFileMock).toHaveBeenCalledTimes(1);
    const [data, mimeType, filename] = saveDataToFileMock.mock.calls[0] as [string, string, string];
    expect(mimeType).toBe('application/json');
    expect(filename).toBe('my-export.json');
    expect(() => JSON.parse(data)).not.toThrow();
    expect(JSON.parse(data)).toMatchObject({ nodes: [], relationships: [], views: [] });
  });

  it('defaults the filename to archivexus-snapshot.json', async () => {
    const storage = fakeStorage();
    await downloadPortableSnapshot(storage);
    const [, , filename] = saveDataToFileMock.mock.calls[0] as [string, string, string];
    expect(filename).toBe('archivexus-snapshot.json');
  });
});
