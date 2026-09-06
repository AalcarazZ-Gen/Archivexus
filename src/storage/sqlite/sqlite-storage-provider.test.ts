import { beforeEach, describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
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

  it('close() resolves without throwing', async () => {
    await expect(provider.close()).resolves.toBeUndefined();
  });
});
