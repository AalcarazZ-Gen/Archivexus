import { describe, expect, it } from 'vitest';
import {
  createRelationshipDefinition,
  type RelationshipDefinition,
} from '../../core/domain/relationship-definition.js';
import { DEFAULT_RELATIONSHIP_DEFINITIONS } from '../../core/domain/relationship-definitions-default.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { createLogger } from './logger.js';
import { bootstrapRelationshipDefinitions } from './relationship-definitions-bootstrap.js';

const log = createLogger('archivexus-test');

/** A minimal stateful `StorageProvider` fake covering only the Definition methods this touches. */
function fakeStorage(initial: readonly RelationshipDefinition[] = []): StorageProvider {
  const map = new Map(initial.map((d) => [d.id, d]));
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
    saveRelationshipDefinition: async (d: RelationshipDefinition) => {
      map.set(d.id, d);
    },
    getRelationshipDefinition: async (id: string) => map.get(id),
    deleteRelationshipDefinition: async (id: string) => {
      map.delete(id);
    },
    listRelationshipDefinitions: async () => [...map.values()],
    saveView: async () => undefined,
    getView: async () => undefined,
    deleteView: async () => undefined,
    listViews: async () => [],
    close: async () => undefined,
  };
}

describe('bootstrapRelationshipDefinitions', () => {
  it('seeds the full default set into an empty store', async () => {
    const storage = fakeStorage();
    const inserted = await bootstrapRelationshipDefinitions(storage, log);

    expect(inserted).toBe(DEFAULT_RELATIONSHIP_DEFINITIONS.length);
    const stored = await storage.listRelationshipDefinitions();
    expect(stored.map((d) => d.id).sort()).toEqual(
      DEFAULT_RELATIONSHIP_DEFINITIONS.map((d) => d.id).sort(),
    );
  });

  it('is a no-op when the store already has any Definition (a customized set is never re-clobbered)', async () => {
    const custom = createRelationshipDefinition({
      id: 'my-own-thing',
      name: 'my-own-thing',
      inverse: 'my-own-thing-of',
      cardinality: 'many-to-many',
      symmetry: false,
      traversalCategory: 'narrative',
    });
    const storage = fakeStorage([custom]);

    const inserted = await bootstrapRelationshipDefinitions(storage, log);

    expect(inserted).toBe(0);
    expect(await storage.listRelationshipDefinitions()).toEqual([custom]);
  });
});
