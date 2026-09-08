import { beforeEach, describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
import { createRelationshipDefinition } from '../../core/domain/relationship-definition.js';
import { DEFAULT_RELATIONSHIP_DEFINITIONS } from '../../core/domain/relationship-definitions-default.js';
import { createView } from '../../core/domain/view.js';
import { SqliteStorageProvider } from './sqlite-storage-provider.js';
import { createInMemorySqliteExecutor } from './test-helpers/in-memory-sqlite.js';

/**
 * Exercises `SqliteStorageProvider` against a real, in-memory
 * `@sqlite.org/sqlite-wasm` engine (see `test-helpers/in-memory-sqlite.ts`)
 * — real SQL, real schema, real constraints, just no OPFS/Worker (neither
 * available in this sandbox; both still need live re-verification inside
 * a running Foundry client, per this ticket's session-log entry).
 */
describe('SqliteStorageProvider', () => {
  let provider: SqliteStorageProvider;

  beforeEach(async () => {
    const executor = await createInMemorySqliteExecutor();
    provider = new SqliteStorageProvider(executor);
    await provider.init();
  });

  it('init() is idempotent (safe to call again, e.g. on a second Adapter startup)', async () => {
    await expect(provider.init()).resolves.toBeUndefined();
  });

  it('round-trips a saved Node through getNode', async () => {
    const node = createNode({ id: 'Node.1', type: 'City', title: 'Puerto Umbral' });
    await provider.saveNode(node);
    const fetched = await provider.getNode('Node.1');
    expect(fetched).toEqual(node);
  });

  it('getNode returns undefined for an id that was never saved', async () => {
    await expect(provider.getNode('Node.missing')).resolves.toBeUndefined();
  });

  it('saveNode upserts - saving the same id twice overwrites the row rather than erroring', async () => {
    const first = createNode({ id: 'Node.1', type: 'City', title: 'Puerto Umbral' });
    const updated = createNode({ id: 'Node.1', type: 'City', title: 'Puerto Umbral (renamed)' });
    await provider.saveNode(first);
    await provider.saveNode(updated);
    const fetched = await provider.getNode('Node.1');
    expect(fetched?.title).toBe('Puerto Umbral (renamed)');
    expect(await provider.listNodes()).toHaveLength(1);
  });

  it('listNodes returns every saved Node', async () => {
    await provider.saveNode(createNode({ id: 'Node.1', type: 'City', title: 'A' }));
    await provider.saveNode(createNode({ id: 'Node.2', type: 'Character', title: 'B' }));
    const all = await provider.listNodes();
    expect(all.map((n) => n.id).sort()).toEqual(['Node.1', 'Node.2']);
  });

  it('deleteNode removes the Node', async () => {
    await provider.saveNode(createNode({ id: 'Node.1', type: 'City', title: 'A' }));
    await provider.deleteNode('Node.1');
    expect(await provider.getNode('Node.1')).toBeUndefined();
  });

  it('deleteNode does not cascade to Relationships referencing it (ADR-0007 point 8 / ADR-0008 point 2)', async () => {
    await provider.saveNode(createNode({ id: 'Node.origin', type: 'Character', title: 'Kael' }));
    await provider.saveNode(
      createNode({ id: 'Node.target', type: 'City', title: 'Puerto Umbral' }),
    );
    const relationship = createRelationship({
      id: 'Rel.1',
      origin: 'Node.origin',
      target: 'Node.target',
      definitionId: 'resides-in',
      title: 'Kael resides in Puerto Umbral',
    });
    await provider.saveRelationship(relationship);

    await provider.deleteNode('Node.origin');

    expect(await provider.getNode('Node.origin')).toBeUndefined();
    const survivingRelationship = await provider.getRelationship('Rel.1');
    expect(survivingRelationship).toEqual(relationship);
  });

  it('round-trips a saved Relationship through getRelationship', async () => {
    const relationship = createRelationship({
      id: 'Rel.1',
      origin: 'Node.1',
      target: 'Node.2',
      definitionId: 'resides-in',
      title: 'title',
    });
    await provider.saveRelationship(relationship);
    expect(await provider.getRelationship('Rel.1')).toEqual(relationship);
  });

  it('listRelationships returns every saved Relationship', async () => {
    await provider.saveRelationship(
      createRelationship({
        id: 'Rel.1',
        origin: 'Node.1',
        target: 'Node.2',
        definitionId: 'd',
        title: 't',
      }),
    );
    await provider.saveRelationship(
      createRelationship({
        id: 'Rel.2',
        origin: 'Node.2',
        target: 'Node.3',
        definitionId: 'd',
        title: 't',
      }),
    );
    const all = await provider.listRelationships();
    expect(all.map((r) => r.id).sort()).toEqual(['Rel.1', 'Rel.2']);
  });

  it('deleteRelationship removes the Relationship', async () => {
    await provider.saveRelationship(
      createRelationship({
        id: 'Rel.1',
        origin: 'Node.1',
        target: 'Node.2',
        definitionId: 'd',
        title: 't',
      }),
    );
    await provider.deleteRelationship('Rel.1');
    expect(await provider.getRelationship('Rel.1')).toBeUndefined();
  });

  describe('getRelationshipsForNode (ADR-0007 1-hop lookup)', () => {
    it('returns Relationships where the Node is the origin', async () => {
      const relationship = createRelationship({
        id: 'Rel.1',
        origin: 'Node.city',
        target: 'Node.resident',
        definitionId: 'governance',
        title: 't',
      });
      await provider.saveRelationship(relationship);
      const neighbors = await provider.getRelationshipsForNode('Node.city');
      expect(neighbors).toEqual([relationship]);
    });

    it('returns Relationships where the Node is the target', async () => {
      const relationship = createRelationship({
        id: 'Rel.1',
        origin: 'Node.resident',
        target: 'Node.city',
        definitionId: 'location',
        title: 't',
      });
      await provider.saveRelationship(relationship);
      const neighbors = await provider.getRelationshipsForNode('Node.city');
      expect(neighbors).toEqual([relationship]);
    });

    it('does not return Relationships unrelated to the given Node', async () => {
      await provider.saveRelationship(
        createRelationship({
          id: 'Rel.1',
          origin: 'Node.a',
          target: 'Node.b',
          definitionId: 'd',
          title: 't',
        }),
      );
      expect(await provider.getRelationshipsForNode('Node.city')).toEqual([]);
    });

    it('includes a Relationship whose other endpoint is dangling (no matching Node row)', async () => {
      const relationship = createRelationship({
        id: 'Rel.1',
        origin: 'Node.city',
        target: 'Node.deleted',
        definitionId: 'd',
        title: 't',
      });
      await provider.saveRelationship(relationship);
      // Node.deleted was never saved / no longer exists - the Relationship
      // itself still surfaces (ADR-0007 point 8: dangling refs are valid data).
      const neighbors = await provider.getRelationshipsForNode('Node.city');
      expect(neighbors).toEqual([relationship]);
    });
  });

  describe('View CRUD (CORE-006 / ADR-0014 points 6-7)', () => {
    it('round-trips a derived-preset View through getView', async () => {
      const view = createView({
        id: 'View.1',
        title: 'Puerto Umbral — direct',
        spec: { preset: 'direct-only', rootNodeId: 'Node.city' },
      });
      await provider.saveView(view);
      expect(await provider.getView('View.1')).toEqual(view);
    });

    it('round-trips a curated-by-me View, preserving its relationshipIds and layout', async () => {
      const view = createView({
        id: 'View.2',
        title: 'Curated map',
        visibility: 'visible',
        spec: {
          preset: 'curated-by-me',
          rootNodeId: 'Node.city',
          relationshipIds: ['Rel.1', 'Rel.2'],
          layout: { 'Node.a': { x: 10, y: -20.5 } },
        },
      });
      await provider.saveView(view);
      expect(await provider.getView('View.2')).toEqual(view);
    });

    it('getView returns undefined for an id that was never saved', async () => {
      await expect(provider.getView('View.missing')).resolves.toBeUndefined();
    });

    it('saveView upserts by id', async () => {
      await provider.saveView(
        createView({
          id: 'View.1',
          title: 'first',
          spec: { preset: 'direct-only', rootNodeId: 'Node.city' },
        }),
      );
      await provider.saveView(
        createView({
          id: 'View.1',
          title: 'renamed',
          spec: { preset: 'everything-connected', rootNodeId: 'Node.city' },
        }),
      );
      const fetched = await provider.getView('View.1');
      expect(fetched?.title).toBe('renamed');
      expect(fetched?.spec.preset).toBe('everything-connected');
      expect(await provider.listViews()).toHaveLength(1);
    });

    it('listViews returns every saved View', async () => {
      await provider.saveView(
        createView({
          id: 'View.1',
          title: 'A',
          spec: { preset: 'direct-only', rootNodeId: 'Node.1' },
        }),
      );
      await provider.saveView(
        createView({
          id: 'View.2',
          title: 'B',
          spec: { preset: 'direct-only', rootNodeId: 'Node.2' },
        }),
      );
      const all = await provider.listViews();
      expect(all.map((v) => v.id).sort()).toEqual(['View.1', 'View.2']);
    });

    it('deleteView removes the View', async () => {
      await provider.saveView(
        createView({
          id: 'View.1',
          title: 'A',
          spec: { preset: 'direct-only', rootNodeId: 'Node.1' },
        }),
      );
      await provider.deleteView('View.1');
      expect(await provider.getView('View.1')).toBeUndefined();
    });

    it('a View can be saved referencing a Node id that has no row, and deleting that Node never touches the View (ADR-0014 point 7)', async () => {
      await provider.saveNode(
        createNode({ id: 'Node.city', type: 'City', title: 'Puerto Umbral' }),
      );
      const view = createView({
        id: 'View.1',
        title: 'city map',
        spec: { preset: 'direct-only', rootNodeId: 'Node.city' },
      });
      await provider.saveView(view);

      await provider.deleteNode('Node.city');

      expect(await provider.getNode('Node.city')).toBeUndefined();
      expect(await provider.getView('View.1')).toEqual(view);
    });
  });

  describe('RelationshipDefinition CRUD (CORE-004 persistence fast-follow / migration 3)', () => {
    it('round-trips a definition with no validation', async () => {
      const definition = createRelationshipDefinition({
        id: 'ally-of',
        name: 'ally-of',
        inverse: 'ally-of',
        cardinality: 'many-to-many',
        symmetry: true,
        traversalCategory: 'affiliation',
      });
      await provider.saveRelationshipDefinition(definition);
      expect(await provider.getRelationshipDefinition('ally-of')).toEqual(definition);
    });

    it('round-trips a definition with a validation allow-list and version', async () => {
      const definition = createRelationshipDefinition({
        id: 'resides-in',
        name: 'resides-in',
        version: 2,
        inverse: 'resident-of',
        cardinality: 'one-to-many',
        symmetry: false,
        traversalCategory: 'location',
        validation: { allowedOriginTypes: ['Character'], allowedTargetTypes: ['City', 'Kingdom'] },
      });
      await provider.saveRelationshipDefinition(definition);
      const fetched = await provider.getRelationshipDefinition('resides-in');
      expect(fetched).toEqual(definition);
      expect(fetched?.version).toBe(2);
    });

    it('getRelationshipDefinition returns undefined for an unknown id', async () => {
      await expect(provider.getRelationshipDefinition('nope')).resolves.toBeUndefined();
    });

    it('saveRelationshipDefinition upserts by id (a later edit bumps the row in place)', async () => {
      const v1 = createRelationshipDefinition({
        id: 'knows',
        name: 'knows',
        inverse: 'known-by',
        cardinality: 'many-to-many',
        symmetry: false,
        traversalCategory: 'narrative',
      });
      await provider.saveRelationshipDefinition(v1);
      await provider.saveRelationshipDefinition({ ...v1, version: 2, inverse: 'is-known-by' });
      const all = await provider.listRelationshipDefinitions();
      expect(all).toHaveLength(1);
      expect(all[0]?.version).toBe(2);
      expect(all[0]?.inverse).toBe('is-known-by');
    });

    it('deleteRelationshipDefinition removes it, and does not touch a Relationship referencing it (no cascade)', async () => {
      await provider.saveRelationshipDefinition(
        createRelationshipDefinition({
          id: 'member-of',
          name: 'member-of',
          inverse: 'has-member',
          cardinality: 'many-to-many',
          symmetry: false,
          traversalCategory: 'affiliation',
        }),
      );
      const relationship = createRelationship({
        id: 'Rel.1',
        origin: 'Node.a',
        target: 'Node.b',
        definitionId: 'member-of',
        title: 'A is a member of B',
      });
      await provider.saveRelationship(relationship);

      await provider.deleteRelationshipDefinition('member-of');

      expect(await provider.getRelationshipDefinition('member-of')).toBeUndefined();
      expect(await provider.getRelationship('Rel.1')).toEqual(relationship);
    });

    it('persists the full DEFAULT_RELATIONSHIP_DEFINITIONS set through a save/list round-trip', async () => {
      for (const definition of DEFAULT_RELATIONSHIP_DEFINITIONS) {
        await provider.saveRelationshipDefinition(definition);
      }
      const stored = await provider.listRelationshipDefinitions();
      expect(stored).toHaveLength(DEFAULT_RELATIONSHIP_DEFINITIONS.length);
      // Every default survives the real SQLite CHECK constraints + round-trip unchanged.
      for (const definition of DEFAULT_RELATIONSHIP_DEFINITIONS) {
        expect(stored.find((d) => d.id === definition.id)).toEqual(definition);
      }
    });
    // The traversal_category / symmetry / cardinality CHECK constraints
    // themselves are exercised at the SQL layer in `migration.test.ts`.
  });

  it('close() resolves without throwing', async () => {
    await expect(provider.close()).resolves.toBeUndefined();
  });
});
