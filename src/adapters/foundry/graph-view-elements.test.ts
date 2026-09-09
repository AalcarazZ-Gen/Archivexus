import { describe, expect, it } from 'vitest';
import { createNode } from '../../core/domain/node.js';
import { createRelationship } from '../../core/domain/relationship.js';
import type { TraversalResult } from '../../core/query/traversal.js';
import {
  buildGraphViewElements,
  buildGraphViewElementsFromTraversal,
  collectTraversalNodes,
  filterNodesForViewer,
  filterTraversalForViewer,
  type GraphViewEdgeElement,
  type GraphViewNodeElement,
} from './graph-view-elements.js';

const city = createNode({
  id: 'JournalEntry.k.JournalEntryPage.city',
  type: 'City',
  title: 'Puerto Umbral',
});
const kael = createNode({ id: 'Actor.kael', type: 'Character', title: 'Kael Verik' });
const guild = createNode({ id: 'Actor.guild', type: 'Organization', title: 'The Umbral Guild' });

const kaelResidesInCity = createRelationship({
  id: 'Rel.kael-city',
  origin: 'Actor.kael',
  target: 'JournalEntry.k.JournalEntryPage.city',
  definitionId: 'resides-in',
  title: 'Kael resides in Puerto Umbral',
});
const kaelInGuild = createRelationship({
  id: 'Rel.kael-guild',
  origin: 'Actor.kael',
  target: 'Actor.guild',
  definitionId: 'member-of',
  title: 'Kael is a member of The Umbral Guild',
});

describe('buildGraphViewElements', () => {
  it('maps every Node to a nodes-group element carrying id/label/nodeType/documentType', () => {
    const [element] = buildGraphViewElements([kael], []);
    expect(element).toEqual<GraphViewNodeElement>({
      group: 'nodes',
      data: {
        id: 'Actor.kael',
        label: 'Kael Verik',
        nodeType: 'Character',
        documentType: 'Actor',
      },
    });
  });

  it('derives documentType from the id prefix, or null when the id has no prefix', () => {
    const bare = createNode({ id: 'internal-id-only', type: 'Lore', title: 'A note' });
    const [pageNode] = buildGraphViewElements([city], []);
    const [bareNode] = buildGraphViewElements([bare], []);
    expect((pageNode as GraphViewNodeElement).data.documentType).toBe('JournalEntry');
    expect((bareNode as GraphViewNodeElement).data.documentType).toBeNull();
  });

  it('maps a Relationship to an edges-group element with source/target/label/definitionId', () => {
    const elements = buildGraphViewElements([kael, guild], [kaelInGuild]);
    const edge = elements.find((e) => e.group === 'edges');
    expect(edge).toEqual<GraphViewEdgeElement>({
      group: 'edges',
      data: {
        id: 'Rel.kael-guild',
        source: 'Actor.kael',
        target: 'Actor.guild',
        label: 'Kael is a member of The Umbral Guild',
        definitionId: 'member-of',
      },
    });
  });

  it('orders all node elements before any edge element', () => {
    const elements = buildGraphViewElements([kael, guild], [kaelInGuild]);
    expect(elements.map((e) => e.group)).toEqual(['nodes', 'nodes', 'edges']);
  });

  it('carries the resolved traversalCategory onto the edge when a definitions map is given (ADAPT-013)', () => {
    const definitionsById = new Map([
      ['member-of', { id: 'member-of', traversalCategory: 'affiliation' } as never],
    ]);
    const withDefs = buildGraphViewElements([kael, guild], [kaelInGuild], definitionsById);
    const withoutDefs = buildGraphViewElements([kael, guild], [kaelInGuild]);
    expect((withDefs.find((e) => e.group === 'edges') as GraphViewEdgeElement).data.category).toBe(
      'affiliation',
    );
    // an unresolved definition → 'other'; no map at all → the field is absent
    const unknownEdge = buildGraphViewElements([kael, guild], [kaelInGuild], new Map());
    expect(
      (unknownEdge.find((e) => e.group === 'edges') as GraphViewEdgeElement).data.category,
    ).toBe('other');
    expect(
      (withoutDefs.find((e) => e.group === 'edges') as GraphViewEdgeElement).data.category,
    ).toBeUndefined();
  });

  it('drops an edge whose origin or target Node is not in the set (dangling reference, ADR-0007 point 8)', () => {
    // guild is missing → the member-of edge has a dangling target.
    const elements = buildGraphViewElements([kael, city], [kaelResidesInCity, kaelInGuild]);
    const edgeIds = elements.filter((e) => e.group === 'edges').map((e) => e.data.id);
    expect(edgeIds).toEqual(['Rel.kael-city']);
  });

  it('returns only node elements when there are no (resolvable) relationships', () => {
    expect(buildGraphViewElements([kael, city], [])).toHaveLength(2);
  });

  it('returns an empty list for an empty graph', () => {
    expect(buildGraphViewElements([], [])).toEqual([]);
  });
});

describe('buildGraphViewElementsFromTraversal', () => {
  function traversalResult(overrides: Partial<TraversalResult>): TraversalResult {
    return {
      nodeId: 'Actor.kael',
      preset: 'direct-only',
      rootNode: kael,
      nodes: [],
      relationships: [],
      ...overrides,
    };
  }

  it('re-adds the traversal root (excluded from result.nodes by design) and its 1-hop neighbours', () => {
    const elements = buildGraphViewElementsFromTraversal(
      traversalResult({ nodes: [city, guild], relationships: [kaelResidesInCity, kaelInGuild] }),
    );
    const nodeIds = elements.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(nodeIds).toEqual(['Actor.kael', 'JournalEntry.k.JournalEntryPage.city', 'Actor.guild']);
    expect(elements.filter((e) => e.group === 'edges')).toHaveLength(2);
  });

  it('omits the root node element when the root no longer resolves in storage', () => {
    const elements = buildGraphViewElementsFromTraversal(
      traversalResult({ rootNode: undefined, nodes: [city], relationships: [] }),
    );
    const nodeIds = elements.filter((e) => e.group === 'nodes').map((e) => e.data.id);
    expect(nodeIds).toEqual(['JournalEntry.k.JournalEntryPage.city']);
  });

  it('drops a back-edge to the root that has no matching endpoint element', () => {
    // A "curated"-style result carrying an edge to a node that isn't in the set.
    const elements = buildGraphViewElementsFromTraversal(
      traversalResult({ nodes: [], relationships: [kaelInGuild] }),
    );
    expect(elements.filter((e) => e.group === 'edges')).toEqual([]);
  });
});

describe('collectTraversalNodes', () => {
  it('returns the root followed by the traversal nodes', () => {
    const result: TraversalResult = {
      nodeId: 'Actor.kael',
      preset: 'direct-only',
      rootNode: kael,
      nodes: [city, guild],
      relationships: [],
    };
    expect(collectTraversalNodes(result).map((n) => n.id)).toEqual([
      'Actor.kael',
      'JournalEntry.k.JournalEntryPage.city',
      'Actor.guild',
    ]);
  });

  it('drops the root when it no longer resolves', () => {
    const result: TraversalResult = {
      nodeId: 'Actor.kael',
      preset: 'direct-only',
      rootNode: undefined,
      nodes: [city],
      relationships: [],
    };
    expect(collectTraversalNodes(result).map((n) => n.id)).toEqual([
      'JournalEntry.k.JournalEntryPage.city',
    ]);
  });
});

describe('filterNodesForViewer (ADR-0003 visibility)', () => {
  const hiddenNote = createNode({
    id: 'JournalEntry.j.JournalEntryPage.secret',
    type: 'Lore',
    title: 'GM secret',
    visibility: 'hidden',
  });
  const visibleCity = createNode({
    id: 'Actor.c',
    type: 'City',
    title: 'A city',
    visibility: 'visible',
  });
  const ownedPc = createNode({
    id: 'Actor.p',
    type: 'Character',
    title: 'A PC',
    visibility: 'owned',
  });

  it('shows every Node to a GM', () => {
    const all = [hiddenNote, visibleCity, ownedPc];
    expect(filterNodesForViewer(all, { isGM: true })).toEqual(all);
  });

  it('drops hidden Nodes for a non-GM, keeping visible and owned', () => {
    const filtered = filterNodesForViewer([hiddenNote, visibleCity, ownedPc], { isGM: false });
    expect(filtered.map((n) => n.id)).toEqual(['Actor.c', 'Actor.p']);
  });

  it('returns an empty list when a non-GM can see nothing', () => {
    expect(filterNodesForViewer([hiddenNote], { isGM: false })).toEqual([]);
  });
});

describe('filterTraversalForViewer', () => {
  const secret = createNode({
    id: 'Actor.secret',
    type: 'Character',
    title: 'Hidden NPC',
    visibility: 'hidden',
  });
  const seen = createNode({
    id: 'Actor.seen',
    type: 'Character',
    title: 'Seen',
    visibility: 'visible',
  });
  const relToSecret = createRelationship({
    id: 'Rel.root-secret',
    origin: 'Actor.kael',
    target: 'Actor.secret',
    definitionId: 'knows',
    title: 'root knows the hidden one',
  });
  const relToSeen = createRelationship({
    id: 'Rel.root-seen',
    origin: 'Actor.kael',
    target: 'Actor.seen',
    definitionId: 'knows',
    title: 'root knows the seen one',
  });
  const traversal: TraversalResult = {
    nodeId: 'Actor.kael',
    preset: 'everything-connected',
    rootNode: kael,
    nodes: [secret, seen],
    relationships: [relToSecret, relToSeen],
  };

  it('returns the traversal untouched for a GM', () => {
    expect(filterTraversalForViewer(traversal, { isGM: true })).toBe(traversal);
  });

  it('drops hidden nodes and any relationship that then dangles, for a non-GM', () => {
    const filtered = filterTraversalForViewer(traversal, { isGM: false });
    expect(filtered.nodes.map((node) => node.id)).toEqual(['Actor.seen']);
    expect(filtered.relationships.map((relationship) => relationship.id)).toEqual([
      'Rel.root-seen',
    ]);
    expect(filtered.rootNode).toBe(kael);
  });
});
