import { describe, expect, it } from 'vitest';
import { createNode } from '../domain/node.js';
import { createRelationship } from '../domain/relationship.js';
import { PORTABLE_SNAPSHOT_SCHEMA_VERSION, toPortableSnapshot } from './to-portable-snapshot.js';

const FIXED_NOW = new Date('2026-09-06T12:00:00.000Z');
const fixedClock = (): Date => FIXED_NOW;

const city = createNode({ id: 'Node.city', type: 'City', title: 'Puerto Umbral' });
const resident = createNode({
  id: 'Node.resident',
  type: 'Character',
  title: 'Kael Verik',
  visibility: 'visible',
  metadata: { archived: false },
  tags: ['npc'],
  history: [{ timestamp: new Date('2026-01-01T00:00:00.000Z'), description: 'Joined the party' }],
  blocks: [{ type: 'JournalEntryPage', uuid: 'JournalEntryPage.abc', title: 'Some Lore' }],
  references: [{ targetId: 'Node.city' }],
});

describe('toPortableSnapshot', () => {
  it('stamps schemaVersion and exportedAt (ISO) using the injected clock', () => {
    const snapshot = toPortableSnapshot([], [], { now: fixedClock });
    expect(snapshot.schemaVersion).toBe(PORTABLE_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.exportedAt).toBe('2026-09-06T12:00:00.000Z');
  });

  it('defaults to the real clock when no `now` is given', () => {
    const before = Date.now();
    const snapshot = toPortableSnapshot([], []);
    const after = Date.now();
    const exportedAtMs = new Date(snapshot.exportedAt).getTime();
    expect(exportedAtMs).toBeGreaterThanOrEqual(before);
    expect(exportedAtMs).toBeLessThanOrEqual(after);
  });

  it('maps every Node field onto the portable shape, including history/blocks/references (product-owner decision, 2026-09-06)', () => {
    const snapshot = toPortableSnapshot([resident], [], { now: fixedClock });
    expect(snapshot.nodes).toEqual([
      {
        id: 'Node.resident',
        type: 'Character',
        title: 'Kael Verik',
        visibility: 'visible',
        metadata: { archived: false },
        history: [{ timestamp: '2026-01-01T00:00:00.000Z', description: 'Joined the party' }],
        blocks: [{ type: 'JournalEntryPage', uuid: 'JournalEntryPage.abc', title: 'Some Lore' }],
        tags: ['npc'],
        references: [{ targetId: 'Node.city' }],
      },
    ]);
  });

  it('denormalizes a Relationship with its origin/target Node titles inlined, keeping its history/blocks/references intact', () => {
    const relationship = createRelationship({
      id: 'Rel.1',
      origin: 'Node.resident',
      target: 'Node.city',
      definitionId: 'resides-in',
      title: 'Kael resides in Puerto Umbral',
      history: [{ timestamp: new Date('2026-02-01T00:00:00.000Z'), description: 'Formed' }],
      blocks: [{ type: 'JournalEntryPage', uuid: 'JournalEntryPage.def', title: 'Some Other Lore' }],
      references: [{ targetId: 'Node.resident' }],
    });
    const snapshot = toPortableSnapshot([resident, city], [relationship], { now: fixedClock });
    expect(snapshot.relationships).toEqual([
      {
        id: 'Rel.1',
        definitionId: 'resides-in',
        title: 'Kael resides in Puerto Umbral',
        visibility: 'hidden',
        origin: 'Node.resident',
        originTitle: 'Kael Verik',
        target: 'Node.city',
        targetTitle: 'Puerto Umbral',
        metadata: {},
        history: [{ timestamp: '2026-02-01T00:00:00.000Z', description: 'Formed' }],
        blocks: [{ type: 'JournalEntryPage', uuid: 'JournalEntryPage.def', title: 'Some Other Lore' }],
        tags: [],
        references: [{ targetId: 'Node.resident' }],
      },
    ]);
  });

  it('inlines null for a dangling origin/target not present in the given nodes (ADR-0007 point 8)', () => {
    const relationship = createRelationship({
      id: 'Rel.2',
      origin: 'Node.deleted-origin',
      target: 'Node.city',
      definitionId: 'resides-in',
      title: 'A relationship whose origin Node no longer exists',
    });
    const snapshot = toPortableSnapshot([city], [relationship], { now: fixedClock });
    expect(snapshot.relationships).toHaveLength(1);
    expect(snapshot.relationships[0]?.originTitle).toBeNull();
    expect(snapshot.relationships[0]?.targetTitle).toBe('Puerto Umbral');
  });

  it('always includes an empty views array (View is not real Core state yet)', () => {
    const snapshot = toPortableSnapshot([], []);
    expect(snapshot.views).toEqual([]);
  });

  it('does not filter by Visibility - the export is full and unredacted (ADR-0008 point 6)', () => {
    const hiddenNode = createNode({
      id: 'Node.secret',
      type: 'Lore',
      title: 'GM-only secret',
      visibility: 'hidden',
    });
    const snapshot = toPortableSnapshot([hiddenNode], [], { now: fixedClock });
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.nodes[0]?.visibility).toBe('hidden');
  });

  it('returns a frozen snapshot and frozen collections', () => {
    const snapshot = toPortableSnapshot([resident], []);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.nodes)).toBe(true);
    expect(Object.isFrozen(snapshot.relationships)).toBe(true);
  });
});
