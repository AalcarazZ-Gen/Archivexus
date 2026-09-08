import { describe, expect, it } from 'vitest';
import { createNode, type Node } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
import { createRelationshipDefinition } from '../../core/domain/relationship-definition.js';
import { buildNodeConnections, UNCATEGORIZED_KEY } from './node-connections.js';

const ROOT = 'Actor.root';

const residesIn = createRelationshipDefinition({
  id: 'resides-in',
  name: 'resides-in',
  inverse: 'resident-of',
  cardinality: 'one-to-many',
  symmetry: false,
  traversalCategory: 'location',
});
const memberOf = createRelationshipDefinition({
  id: 'member-of',
  name: 'member-of',
  inverse: 'has-member',
  cardinality: 'many-to-many',
  symmetry: false,
  traversalCategory: 'affiliation',
});
const allyOf = createRelationshipDefinition({
  id: 'ally-of',
  name: 'ally-of',
  inverse: 'ally-of',
  cardinality: 'many-to-many',
  symmetry: true,
  traversalCategory: 'affiliation',
});

const definitionsById = new Map([
  ['resides-in', residesIn],
  ['member-of', memberOf],
  ['ally-of', allyOf],
]);

function node(id: string, title = id): Node {
  return createNode({ id, type: 'Lore', title });
}

function baseInput(overrides: {
  relationships: Parameters<typeof buildNodeConnections>[0]['relationships'];
  connectedNodes: readonly Node[];
  degree?: Record<string, number>;
}) {
  return {
    rootNodeId: ROOT,
    relationships: overrides.relationships,
    connectedNodesById: new Map(overrides.connectedNodes.map((n) => [n.id, n])),
    definitionsById,
    degreeByNodeId: new Map(Object.entries(overrides.degree ?? {})),
  };
}

describe('buildNodeConnections', () => {
  it('groups rows by the Relationship Definition traversalCategory, in taxonomy order', () => {
    const city = node('JournalEntry.city', 'Puerto Umbral');
    const guild = node('Actor.guild', 'The Guild');
    const groups = buildNodeConnections(
      baseInput({
        relationships: [
          createRelationship({
            id: 'r1',
            origin: ROOT,
            target: city.id,
            definitionId: 'resides-in',
            title: 't',
          }),
          createRelationship({
            id: 'r2',
            origin: ROOT,
            target: guild.id,
            definitionId: 'member-of',
            title: 't',
          }),
        ],
        connectedNodes: [city, guild],
      }),
    );
    expect(groups.map((g) => g.category)).toEqual(['location', 'affiliation']);
    expect(groups[0]?.label).toBe('Location');
    expect(groups[1]?.label).toBe('Affiliation');
  });

  it('uses the direction-correct label: name when root is origin, inverse when root is target', () => {
    const city = node('JournalEntry.city', 'Puerto Umbral');
    const resident = node('Actor.resident', 'Kael');
    const groups = buildNodeConnections(
      baseInput({
        relationships: [
          createRelationship({
            id: 'r1',
            origin: ROOT,
            target: city.id,
            definitionId: 'resides-in',
            title: 't',
          }),
          createRelationship({
            id: 'r2',
            origin: resident.id,
            target: ROOT,
            definitionId: 'resides-in',
            title: 't',
          }),
        ],
        connectedNodes: [city, resident],
      }),
    );
    const rows = groups[0]!.rows;
    expect(rows.find((r) => r.connectedNode.id === city.id)?.label).toBe('resides-in');
    expect(rows.find((r) => r.connectedNode.id === resident.id)?.label).toBe('resident-of');
  });

  it('sorts rows within a group by degree descending, then alphabetically by title', () => {
    const a = node('Actor.a', 'Alpha');
    const b = node('Actor.b', 'Bravo');
    const c = node('Actor.c', 'Charlie');
    const groups = buildNodeConnections(
      baseInput({
        relationships: [a, b, c].map((n, i) =>
          createRelationship({
            id: `r${i}`,
            origin: ROOT,
            target: n.id,
            definitionId: 'member-of',
            title: 't',
          }),
        ),
        connectedNodes: [a, b, c],
        degree: { 'Actor.a': 2, 'Actor.b': 5, 'Actor.c': 2 },
      }),
    );
    // b (degree 5) first; a and c tie on degree 2 → alpha: Alpha before Charlie.
    expect(groups[0]!.rows.map((r) => r.connectedNode.title)).toEqual([
      'Bravo',
      'Alpha',
      'Charlie',
    ]);
  });

  it('lets one connected Node appear in two groups when reached via two categories', () => {
    const org = node('Actor.org', 'The Order');
    const groups = buildNodeConnections(
      baseInput({
        relationships: [
          createRelationship({
            id: 'r1',
            origin: ROOT,
            target: org.id,
            definitionId: 'member-of',
            title: 't',
          }),
          createRelationship({
            id: 'r2',
            origin: ROOT,
            target: org.id,
            definitionId: 'resides-in',
            title: 't',
          }),
        ],
        connectedNodes: [org],
      }),
    );
    expect(groups.map((g) => g.category)).toEqual(['location', 'affiliation']);
    expect(groups.every((g) => g.rows.length === 1)).toBe(true);
  });

  it('skips a Relationship whose other endpoint is not among the connected Nodes (dangling — ADR-0007 point 8)', () => {
    const groups = buildNodeConnections(
      baseInput({
        relationships: [
          createRelationship({
            id: 'r1',
            origin: ROOT,
            target: 'Actor.gone',
            definitionId: 'member-of',
            title: 't',
          }),
        ],
        connectedNodes: [],
      }),
    );
    expect(groups).toEqual([]);
  });

  it('puts a Relationship whose Definition does not resolve into an "Other" group last, labelled by the raw definitionId', () => {
    const known = node('Actor.known', 'Known');
    const unknown = node('Actor.unknown', 'Mystery');
    const groups = buildNodeConnections(
      baseInput({
        relationships: [
          createRelationship({
            id: 'r1',
            origin: ROOT,
            target: known.id,
            definitionId: 'member-of',
            title: 't',
          }),
          createRelationship({
            id: 'r2',
            origin: ROOT,
            target: unknown.id,
            definitionId: 'not-in-seed',
            title: 't',
          }),
        ],
        connectedNodes: [known, unknown],
      }),
    );
    expect(groups.map((g) => g.category)).toEqual(['affiliation', UNCATEGORIZED_KEY]);
    expect(groups[1]?.label).toBe('Other');
    expect(groups[1]?.rows[0]?.label).toBe('not-in-seed');
  });

  it('derives hasBackingActor from the connected Node id prefix', () => {
    const actor = node('Actor.x', 'An Actor');
    const page = node('JournalEntry.y.JournalEntryPage.z', 'A Page');
    const groups = buildNodeConnections(
      baseInput({
        relationships: [actor, page].map((n, i) =>
          createRelationship({
            id: `r${i}`,
            origin: ROOT,
            target: n.id,
            definitionId: 'member-of',
            title: 't',
          }),
        ),
        connectedNodes: [actor, page],
      }),
    );
    const rows = groups[0]!.rows;
    expect(rows.find((r) => r.connectedNode.id === actor.id)?.hasBackingActor).toBe(true);
    expect(rows.find((r) => r.connectedNode.id === page.id)?.hasBackingActor).toBe(false);
  });
});
