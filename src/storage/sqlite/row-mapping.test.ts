import { describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
import { createRelationshipDefinition } from '../../core/domain/relationship-definition.js';
import { createView } from '../../core/domain/view.js';
import {
  nodeToRow,
  relationshipDefinitionToRow,
  relationshipToRow,
  rowToNode,
  rowToRelationship,
  rowToRelationshipDefinition,
  rowToView,
  viewToRow,
} from './row-mapping.js';

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
      blocks: [{ type: 'scene', uuid: 'Scene.1', title: 'A scene' }],
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

describe('view row round-trip', () => {
  it('round-trips a minimal derived-preset View unchanged', () => {
    const view = createView({
      id: 'View.1',
      title: 'Puerto Umbral — direct',
      spec: { preset: 'direct-only', rootNodeId: 'Node.city' },
    });
    expect(rowToView(viewToRow(view))).toEqual(view);
  });

  it('round-trips a curated-by-me View, serializing its spec (relationshipIds + layout) as JSON', () => {
    const view = createView({
      id: 'View.2',
      title: 'Curated map',
      visibility: 'visible',
      metadata: { note: 'two kingdoms' },
      spec: {
        preset: 'curated-by-me',
        rootNodeId: 'Node.city',
        relationshipIds: ['Rel.1', 'Rel.2'],
        layout: { 'Node.a': { x: 10, y: -20.5 } },
      },
    });
    const row = viewToRow(view);
    expect(JSON.parse(row.spec)).toEqual({
      preset: 'curated-by-me',
      rootNodeId: 'Node.city',
      relationshipIds: ['Rel.1', 'Rel.2'],
      layout: { 'Node.a': { x: 10, y: -20.5 } },
    });
    expect(rowToView(row)).toEqual(view);
  });
});

describe('relationship definition row round-trip', () => {
  it('round-trips a definition with no validation (validation column is null)', () => {
    const definition = createRelationshipDefinition({
      id: 'ally-of',
      name: 'ally-of',
      inverse: 'ally-of',
      cardinality: 'many-to-many',
      symmetry: true,
      traversalCategory: 'affiliation',
    });
    const row = relationshipDefinitionToRow(definition);
    expect(row.validation).toBeNull();
    expect(row.symmetry).toBe(1);
    expect(rowToRelationshipDefinition(row)).toEqual(definition);
  });

  it('round-trips a definition with a validation allow-list (JSON-encoded), and asymmetric symmetry as 0', () => {
    const definition = createRelationshipDefinition({
      id: 'resides-in',
      name: 'resides-in',
      inverse: 'resident-of',
      cardinality: 'one-to-many',
      symmetry: false,
      traversalCategory: 'location',
      validation: {
        allowedOriginTypes: ['Character', 'Organization'],
        allowedTargetTypes: ['City'],
      },
    });
    const row = relationshipDefinitionToRow(definition);
    expect(row.symmetry).toBe(0);
    expect(JSON.parse(row.validation as string)).toEqual({
      allowedOriginTypes: ['Character', 'Organization'],
      allowedTargetTypes: ['City'],
    });
    expect(rowToRelationshipDefinition(row)).toEqual(definition);
  });
});
