import { describe, expect, it } from 'vitest';
import { createRelationship, type Relationship } from '../../core/domain/relationship.js';
import { derivedRelationshipMetadata } from '../../core/domain/relationship-provenance.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import {
  reconcileFolderContainment,
  type ContainmentSnapshot,
} from './folder-containment-sync.js';

function fakeStorage(
  relationships: Relationship[] = [],
  definitions: RelationshipDefinition[] = [],
): StorageProvider & { rels: Relationship[] } {
  const rels = [...relationships];
  return {
    rels,
    listRelationships: async () => rels,
    listRelationshipDefinitions: async () => definitions,
    saveRelationship: async (r: Relationship) => {
      rels.push(r);
    },
    deleteRelationship: async (id: string) => {
      const i = rels.findIndex((r) => r.id === id);
      if (i >= 0) rels.splice(i, 1);
    },
  } as unknown as StorageProvider & { rels: Relationship[] };
}

let idCounter = 0;
const deps = (storage: StorageProvider) => ({
  storage,
  newId: () => `derived-${(idCounter += 1)}`,
});

const HORDA = 'Folder.horda';
const LEGION = 'Folder.legion';

// Horda (Organization) contains: the Legión Carmesí sub-folder + the actor Krunk.
const snapshot: ContainmentSnapshot = {
  folders: [
    { nodeId: HORDA, nodeType: 'Organization', title: 'Horda', ancestorFolderNodeIds: ['Folder.npc'] },
    { nodeId: LEGION, nodeType: 'Organization', title: 'Legión Carmesí', ancestorFolderNodeIds: [HORDA, 'Folder.npc'] },
  ],
  entities: [{ nodeId: 'Actor.krunk', title: 'Krunk', ancestorFolderNodeIds: [HORDA, 'Folder.npc'] }],
};

describe('reconcileFolderContainment', () => {
  it('creates the derived member-of edges, all carrying the folder-containment marker', async () => {
    const storage = fakeStorage();
    const result = await reconcileFolderContainment(snapshot, deps(storage));
    expect(result).toEqual({ added: 2, removed: 0 });
    expect(storage.rels.map((r) => [r.origin, r.target, r.definitionId])).toEqual([
      ['Folder.legion', 'Folder.horda', 'member-of'],
      ['Actor.krunk', 'Folder.horda', 'member-of'],
    ]);
    for (const r of storage.rels) {
      expect(r.metadata.archivexus).toMatchObject({ derived: true, source: 'folder-containment', container: 'Folder.horda' });
    }
    expect(storage.rels[1]?.title).toBe('Krunk member-of Horda');
  });

  it('is idempotent — a second run with the same snapshot changes nothing', async () => {
    const storage = fakeStorage();
    await reconcileFolderContainment(snapshot, deps(storage));
    const result = await reconcileFolderContainment(snapshot, deps(storage));
    expect(result).toEqual({ added: 0, removed: 0 });
    expect(storage.rels).toHaveLength(2);
  });

  it('removes a derived edge whose containment disappeared (Krunk left the folder)', async () => {
    const storage = fakeStorage();
    await reconcileFolderContainment(snapshot, deps(storage));
    const withoutKrunk: ContainmentSnapshot = { ...snapshot, entities: [] };
    const result = await reconcileFolderContainment(withoutKrunk, deps(storage));
    expect(result).toEqual({ added: 0, removed: 1 });
    expect(storage.rels.map((r) => r.origin)).toEqual(['Folder.legion']);
  });

  it('never touches a hand-authored edge, and does not duplicate one it would have derived', async () => {
    const handAuthored = createRelationship({
      id: 'human-1',
      origin: 'Actor.krunk',
      target: 'Folder.horda',
      definitionId: 'member-of',
      title: 'Krunk is a member of the Horda (hand-authored)',
    });
    const storage = fakeStorage([handAuthored]);

    const first = await reconcileFolderContainment(snapshot, deps(storage));
    // Legión's edge is created; Krunk's is left to the human edge.
    expect(first).toEqual({ added: 1, removed: 0 });
    expect(storage.rels.find((r) => r.id === 'human-1')).toBeDefined();

    // Containment disappears entirely — the human edge still survives.
    const removeAll = await reconcileFolderContainment({ folders: [], entities: [] }, deps(storage));
    expect(removeAll.removed).toBe(1); // only the derived Legión edge
    expect(storage.rels.map((r) => r.id)).toEqual(['human-1']);
  });

  it('titles the edge from the Definition name when it resolves', async () => {
    const memberOf = {
      id: 'member-of',
      name: 'member-of',
      version: 1,
      inverse: 'has-member',
      cardinality: 'many-to-many' as const,
      symmetry: false,
      traversalCategory: 'affiliation' as const,
    } as RelationshipDefinition;
    const storage = fakeStorage([], [memberOf]);
    await reconcileFolderContainment(snapshot, deps(storage));
    expect(storage.rels[0]?.title).toBe('Legión Carmesí member-of Horda');
  });

  it('respects isContainmentRoot and a folder-level relationship override', async () => {
    const custom: ContainmentSnapshot = {
      folders: [
        { nodeId: HORDA, nodeType: 'Organization', title: 'Horda', ancestorFolderNodeIds: [], containmentRelationshipOverride: 'serves' },
        { nodeId: LEGION, nodeType: 'Organization', title: 'Legión', ancestorFolderNodeIds: [HORDA] },
      ],
      entities: [
        { nodeId: 'Actor.root', title: 'Root', ancestorFolderNodeIds: [HORDA], isContainmentRoot: true },
      ],
    };
    const storage = fakeStorage();
    await reconcileFolderContainment(custom, deps(storage));
    expect(storage.rels.map((r) => [r.origin, r.definitionId])).toEqual([['Folder.legion', 'serves']]);
  });

  it('leaves a marked edge from a *different* engine alone', async () => {
    const groupDerived = createRelationship({
      id: 'grp-1',
      origin: 'Actor.krunk',
      target: 'Folder.horda',
      definitionId: 'member-of',
      title: 'from a group actor',
      metadata: derivedRelationshipMetadata('group-membership', 'Actor.someGroup'),
    });
    const storage = fakeStorage([groupDerived]);
    // Containment is empty; the group-membership edge must survive.
    const result = await reconcileFolderContainment({ folders: [], entities: [] }, deps(storage));
    expect(result).toEqual({ added: 0, removed: 0 });
    expect(storage.rels.map((r) => r.id)).toEqual(['grp-1']);
  });
});
