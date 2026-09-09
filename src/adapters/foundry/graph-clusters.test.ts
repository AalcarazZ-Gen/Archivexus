import { describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';
import type { TraversalResult } from '../../core/query/traversal.js';
import {
  buildClusteredGraphElements,
  buildClusteredTraversal,
  CLUSTER_ID_PREFIX,
  isClusterNodeId,
} from './graph-clusters.js';
import type { GraphViewElement, GraphViewNodeElement } from './graph-view-elements.js';

const nodeEl = (
  elements: readonly GraphViewElement[],
  id: string,
): GraphViewNodeElement | undefined =>
  elements.find((el): el is GraphViewNodeElement => el.group === 'nodes' && el.data.id === id);

const n = (id: string, title = id) => createNode({ id, type: 'Character', title });
const hub = n('Actor.hub', 'Hub');
const a = n('Actor.a');
const b = n('Actor.b');
const c = n('Actor.c');
const d = n('Actor.d');
const e = n('Actor.e');
const f = n('Actor.f');
const g = n('Actor.g');

const rel = (id: string, origin: string, target: string, definitionId: string) =>
  createRelationship({
    id,
    origin,
    target,
    definitionId,
    title: `${origin} ${definitionId} ${target}`,
  });

// hub —knows→ a,b,c ; a —member-of→ d,e ; b —located-in→ f ; c —mystery→ g
const relationships = [
  rel('r.hub-a', 'Actor.hub', 'Actor.a', 'knows'),
  rel('r.hub-b', 'Actor.hub', 'Actor.b', 'knows'),
  rel('r.hub-c', 'Actor.hub', 'Actor.c', 'knows'),
  rel('r.a-d', 'Actor.a', 'Actor.d', 'member-of'),
  rel('r.a-e', 'Actor.a', 'Actor.e', 'member-of'),
  rel('r.b-f', 'Actor.b', 'Actor.f', 'located-in'),
  rel('r.c-g', 'Actor.c', 'Actor.g', 'mystery'),
];

const traversal: TraversalResult = {
  nodeId: 'Actor.hub',
  preset: 'everything-connected',
  rootNode: hub,
  nodes: [a, b, c, d, e, f, g],
  relationships,
};

const def = (
  id: string,
  category: RelationshipDefinition['traversalCategory'],
): RelationshipDefinition =>
  ({
    id,
    name: id,
    version: 1,
    inverse: `${id}-inv`,
    cardinality: 'many-to-many',
    symmetry: false,
    traversalCategory: category,
  }) as RelationshipDefinition;

const definitionsById = new Map<string, RelationshipDefinition>([
  ['knows', def('knows', 'kinship')],
  ['member-of', def('member-of', 'affiliation')],
  ['located-in', def('located-in', 'location')],
  // 'mystery' deliberately absent → uncategorized
]);

describe('isClusterNodeId', () => {
  it('recognises synthetic cluster ids only', () => {
    expect(isClusterNodeId(`${CLUSTER_ID_PREFIX}affiliation`)).toBe(true);
    expect(isClusterNodeId('Actor.hub')).toBe(false);
  });
});

describe('buildClusteredTraversal', () => {
  const clustered = buildClusteredTraversal(traversal, definitionsById);

  it('keeps the direct ring as plain node ids', () => {
    expect([...clustered.directNodeIds].sort()).toEqual(['Actor.a', 'Actor.b', 'Actor.c']);
  });

  it('groups depth-2 nodes by the linking relationship’s traversalCategory, taxonomy order, Other last', () => {
    expect(clustered.clusters.map((cluster) => cluster.categoryKey)).toEqual([
      'location',
      'affiliation',
      'other',
    ]);
    expect(clustered.clusters.map((cluster) => cluster.label)).toEqual([
      'Location (1)',
      'Affiliation (2)',
      'Other (1)',
    ]);
  });

  it('records each cluster’s members and anchor(s)', () => {
    const affiliation = clustered.clusters.find((cluster) => cluster.categoryKey === 'affiliation');
    expect(affiliation?.memberNodeIds).toEqual(['Actor.d', 'Actor.e']);
    expect(affiliation?.anchorNodeIds).toEqual(['Actor.a']);
    expect(affiliation?.id).toBe(`${CLUSTER_ID_PREFIX}affiliation`);
  });

  it('leaves nothing unclustered when every depth-2 node has a linking edge', () => {
    expect(clustered.unclusteredNodeIds).toEqual([]);
  });
});

describe('buildClusteredGraphElements', () => {
  const clustered = buildClusteredTraversal(traversal, definitionsById);

  it('collapsed — shows root + direct ring + one node per cluster + aggregate edges only', () => {
    const elements = buildClusteredGraphElements(traversal, clustered, new Set());
    const nodeIds = elements.filter((el) => el.group === 'nodes').map((el) => el.data.id);
    expect(nodeIds).toEqual(
      expect.arrayContaining([
        'Actor.hub',
        'Actor.a',
        'Actor.b',
        'Actor.c',
        `${CLUSTER_ID_PREFIX}location`,
        `${CLUSTER_ID_PREFIX}affiliation`,
        `${CLUSTER_ID_PREFIX}other`,
      ]),
    );
    // depth-2 members are hidden while collapsed
    expect(nodeIds).not.toContain('Actor.d');
    expect(nodeIds).not.toContain('Actor.f');
    // an aggregate edge anchors each cluster to its direct node
    const edges = elements.filter((el) => el.group === 'edges');
    expect(edges).toContainEqual(
      expect.objectContaining({
        group: 'edges',
        data: expect.objectContaining({
          source: 'Actor.a',
          target: `${CLUSTER_ID_PREFIX}affiliation`,
        }),
      }),
    );
  });

  it('collapsed cluster node carries isCluster/collapsed/count and a ▸ marker', () => {
    const elements = buildClusteredGraphElements(traversal, clustered, new Set());
    const affiliationNode = nodeEl(elements, `${CLUSTER_ID_PREFIX}affiliation`);
    expect(affiliationNode?.data).toMatchObject({
      isCluster: true,
      collapsed: true,
      clusterCount: 2,
      clusterCategory: 'affiliation',
    });
    expect(affiliationNode?.data.label).toContain('▸');
  });

  it('expanded — reveals the members as children of the cluster, no aggregate edge, ▾ marker', () => {
    const expanded = new Set([`${CLUSTER_ID_PREFIX}affiliation`]);
    const elements = buildClusteredGraphElements(traversal, clustered, expanded);
    const nodeIds = elements.filter((el) => el.group === 'nodes').map((el) => el.data.id);
    expect(nodeIds).toContain('Actor.d');
    expect(nodeIds).toContain('Actor.e');
    expect(nodeEl(elements, 'Actor.d')?.data.parent).toBe(`${CLUSTER_ID_PREFIX}affiliation`);
    const affiliationNode = nodeEl(elements, `${CLUSTER_ID_PREFIX}affiliation`);
    expect(affiliationNode?.data.collapsed).toBe(false);
    expect(affiliationNode?.data.label).toContain('▾');
    // no aggregate edge into an expanded cluster
    const aggregate = elements.filter(
      (el) => el.group === 'edges' && el.data.target === `${CLUSTER_ID_PREFIX}affiliation`,
    );
    expect(aggregate).toEqual([]);
  });

  it('parent (cluster) nodes are emitted before their child members for cy.add()', () => {
    const expanded = new Set([`${CLUSTER_ID_PREFIX}affiliation`]);
    const elements = buildClusteredGraphElements(traversal, clustered, expanded);
    const clusterIdx = elements.findIndex(
      (el) => el.group === 'nodes' && el.data.id === `${CLUSTER_ID_PREFIX}affiliation`,
    );
    const memberIdx = elements.findIndex((el) => el.group === 'nodes' && el.data.id === 'Actor.d');
    expect(clusterIdx).toBeLessThan(memberIdx);
  });
});
