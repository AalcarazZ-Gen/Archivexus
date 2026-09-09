import { describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';
import type { TraversalResult } from '../../core/query/traversal.js';
import {
  buildCuratedCandidates,
  buildCuratedChecklistHTML,
  defaultCuratedRelationshipIds,
} from './curated-view.js';

const root = 'Actor.hub';
const ally = createNode({ id: 'Actor.ally', type: 'Character', title: 'Ally' });
const rival = createNode({ id: 'Actor.rival', type: 'Character', title: 'Rival' });
const city = createNode({ id: 'Actor.city', type: 'City', title: 'Home City' });

const rel = (id: string, origin: string, target: string, definitionId: string) =>
  createRelationship({ id, origin, target, definitionId, title: `${origin}-${target}` });

const direct: TraversalResult = {
  nodeId: root,
  preset: 'direct-only',
  rootNode: createNode({ id: root, type: 'Character', title: 'Hub' }),
  nodes: [ally, rival, city],
  relationships: [
    rel('r.ally', root, 'Actor.ally', 'ally-of'),
    rel('r.rival', 'Actor.rival', root, 'rival-of'),
    rel('r.city', root, 'Actor.city', 'resides-in'),
  ],
};

const def = (
  id: string,
  name: string,
  inverse: string,
  category: RelationshipDefinition['traversalCategory'],
): RelationshipDefinition =>
  ({
    id,
    name,
    version: 1,
    inverse,
    cardinality: 'many-to-many',
    symmetry: false,
    traversalCategory: category,
  }) as RelationshipDefinition;

const definitionsById = new Map<string, RelationshipDefinition>([
  ['ally-of', def('ally-of', 'ally of', 'ally of', 'affiliation')],
  ['rival-of', def('rival-of', 'rival of', 'rival of', 'conflict')],
  ['resides-in', def('resides-in', 'resides in', 'home to', 'location')],
]);

describe('defaultCuratedRelationshipIds', () => {
  it('is every relationship id in the direct result', () => {
    expect(defaultCuratedRelationshipIds(direct)).toEqual(['r.ally', 'r.rival', 'r.city']);
  });
});

describe('buildCuratedCandidates', () => {
  it('groups by category (taxonomy order) with direction-correct verbs and included flags', () => {
    const groups = buildCuratedCandidates(
      root,
      direct,
      definitionsById,
      new Set(['r.ally', 'r.city']),
    );
    expect(groups.map((g) => g.categoryKey)).toEqual(['location', 'affiliation', 'conflict']);
    const rival = groups.find((g) => g.categoryKey === 'conflict')?.rows[0];
    // root is the *target* of r.rival → the inverse verb
    expect(rival).toMatchObject({ relationshipId: 'r.rival', verb: 'rival of', included: false });
    const ally = groups.find((g) => g.categoryKey === 'affiliation')?.rows[0];
    expect(ally).toMatchObject({ relationshipId: 'r.ally', verb: 'ally of', included: true });
  });

  it('falls back to the raw definitionId and Other for an unresolved definition', () => {
    const groups = buildCuratedCandidates(root, direct, new Map(), new Set());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.categoryKey).toBe('other');
    expect(groups[0]?.rows.map((r) => r.verb)).toEqual(
      expect.arrayContaining(['ally-of', 'rival-of', 'resides-in']),
    );
  });
});

describe('buildCuratedChecklistHTML', () => {
  it('renders a checkbox per relationship with the checked state and a save button', () => {
    const groups = buildCuratedCandidates(root, direct, definitionsById, new Set(['r.city']));
    const html = buildCuratedChecklistHTML(groups);
    expect(html).toContain('data-action="saveCuratedView"');
    expect(html).toContain('data-relationship-id="r.city" checked');
    expect(html).toContain('data-relationship-id="r.ally"');
    expect(html).not.toContain('data-relationship-id="r.ally" checked');
    expect(html).toContain('<strong>1</strong>/3');
  });

  it('shows an empty message when the Node has no direct relationships', () => {
    expect(buildCuratedChecklistHTML([])).toContain('no direct relationships to curate');
  });
});
