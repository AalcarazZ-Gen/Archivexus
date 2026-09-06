import { describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
import { nodeToRow, relationshipToRow, rowToNode, rowToRelationship } from './row-mapping.js';

describe('node row round-trip', () => {
  it('round-trips a minimal Node unchanged', () => {
    const node = createNode({ id: 'Node.1', type: 'City', title: 'Puerto Umbral' });
    const roundTripped = rowToNode(nodeToRow(node));
    expect(roundTripped).toEqual(node);
  });

  it('round-trips metadata, tags, blocks, references and history (including Date fields)', () => {
    const node = createNode({
      id: 'Node.2',
      type: 'Character',
      title: 'Kael Verik',
      visibility: 'visible',
      metadata: { level: 5, aliases: ['K'] },
      tags: ['npc', 'ally'],
      blocks: [{ id: 'b1', type: 'scene', data: { uuid: 'Scene.1' } }],
      references: [{ targetId: 'Node.other' }],
      history: [{ timestamp: new Date('2026-01-01T00:00:00.000Z'), description: 'created' }],
    });
    const roundTripped = rowToNode(nodeToRow(node));
    expect(roundTripped).toEqual(node);
    expect(roundTripped.history[0]?.timestamp).toBeInstanceOf(Date);
    expect(roundTripped.history[0]?.timestamp.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('produces a row with JSON-string columns for metadata/tags/history/blocks/references', () => {
    const node = createNode({ id: 'Node.3', type: 'Lore', title: 'Some Lore', tags: ['x'] });
    const row = nodeToRow(node);
    expect(row.tags).toBe('["x"]');
    expect(() => JSON.parse(row.metadata)).not.toThrow();
  });
});

describe('relationship row round-trip', () => {
  it('round-trips a minimal Relationship unchanged', () => {
    const relationship = createRelationship({
      id: 'Rel.1',
      origin: 'Node.1',
      target: 'Node.2',
      definitionId: 'resides-in',
      title: 'Kael resides in Puerto Umbral',
    });
    const roundTripped = rowToRelationship(relationshipToRow(relationship));
    expect(roundTripped).toEqual(relationship);
  });

  it('maps definitionId <-> definition_id explicitly (column naming convention)', () => {
    const relationship = createRelationship({
      id: 'Rel.2',
      origin: 'Node.1',
      target: 'Node.2',
      definitionId: 'member-of',
      title: 'title',
    });
    const row = relationshipToRow(relationship);
    expect(row.definition_id).toBe('member-of');
    expect(rowToRelationship(row).definitionId).toBe('member-of');
  });
});
