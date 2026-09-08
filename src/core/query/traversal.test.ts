import { describe, expect, it } from 'vitest';
import { createNode, type Node } from '../domain/node.js';
import { createRelationship, type Relationship } from '../domain/relationship.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import {
  EVERYTHING_CONNECTED_DEPTH,
  resolveTraversal,
  TRAVERSAL_PRESETS,
  type CuratedByMeTraversalQuery,
} from './traversal.js';

/**
 * A minimal in-memory `StorageProvider` fake, same "build a fake per test
 * file" precedent as `storage-sync.test.ts` — not a shared test helper,
 * since only this suite needs a fake that actually resolves
 * `getRelationshipsForNode`/`getNode` against a real graph shape rather
 * than a fixed canned response.
 */
function createFakeStorage(nodes: readonly Node[], relationships: readonly Relationship[]): StorageProvider {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const relationshipMap = new Map(relationships.map((relationship) => [relationship.id, relationship]));

  return {
    init: async () => undefined,
    saveNode: async () => undefined,
    getNode: async (id: string) => nodeMap.get(id),
    deleteNode: async () => undefined,
    listNodes: async () => nodes,
    saveRelationship: async () => undefined,
    getRelationship: async (id: string) => relationshipMap.get(id),
    deleteRelationship: async () => undefined,
    listRelationships: async () => relationships,
    getRelationshipsForNode: async (nodeId: string) =>
      relationships.filter((relationship) => relationship.origin === nodeId || relationship.target === nodeId),
    saveRelationshipDefinition: async () => undefined,
    getRelationshipDefinition: async () => undefined,
    deleteRelationshipDefinition: async () => undefined,
    listRelationshipDefinitions: async () => [],
    saveView: async () => undefined,
    getView: async () => undefined,
    deleteView: async () => undefined,
    listViews: async () => [],
    close: async () => undefined,
  };
}

function node(id: string, type = 'Lore'): Node {
  return createNode({ id, type, title: id });
}

function rel(id: string, origin: string, target: string): Relationship {
  return createRelationship({ id, origin, target, definitionId: 'def-generic', title: id });
}

/**
 * ADR-0007 point 5's worked example, rebuilt as a fixture: clicking City
 * "Puerto Umbral" — depth 1 returns its 6 direct neighbors (2 residents, 3
 * organizations, 1 event); depth 2 additionally pulls in a resident's
 * estranged parent, an organization's leader, a criminal org's hideout, and
 * an event participant who doesn't live in the city — none connected to
 * the City directly, all connected through something that is. Also
 * includes a depth-3-only Node (a leader's own secret) to confirm depth=2
 * doesn't reach it, and a direct relationship between two of the City's
 * own direct neighbors (resident-1 works for the political org) to confirm
 * that edge is still captured once depth-2 expansion visits either side.
 */
function puertoUmbralFixture() {
  const city = node('city-puerto-umbral', 'City');
  const resident1 = node('resident-1', 'Character');
  const resident2 = node('resident-2', 'Character');
  const orgPolitical = node('org-political', 'Organization');
  const orgCriminal = node('org-criminal', 'Organization');
  const orgReligious = node('org-religious', 'Organization');
  const event = node('event-1', 'Event');
  const estrangedParent = node('estranged-parent', 'Character');
  const orgLeader = node('org-leader', 'Character');
  const hideout = node('hideout', 'Item');
  const eventParticipant = node('event-participant', 'Character');
  const leaderSecret = node('leader-secret', 'Lore');

  const directRelationships = [
    rel('rel-city-resident1', city.id, resident1.id),
    rel('rel-city-resident2', city.id, resident2.id),
    rel('rel-city-org-political', city.id, orgPolitical.id),
    rel('rel-city-org-criminal', city.id, orgCriminal.id),
    rel('rel-city-org-religious', city.id, orgReligious.id),
    rel('rel-city-event', city.id, event.id),
  ];

  const depthTwoRelationships = [
    rel('rel-resident1-parent', resident1.id, estrangedParent.id),
    rel('rel-org-political-leader', orgPolitical.id, orgLeader.id),
    rel('rel-org-criminal-hideout', orgCriminal.id, hideout.id),
    rel('rel-event-participant', event.id, eventParticipant.id),
    // A relationship between two of the City's own direct neighbors.
    rel('rel-resident1-org-political', resident1.id, orgPolitical.id),
  ];

  const depthThreeRelationships = [rel('rel-leader-secret', orgLeader.id, leaderSecret.id)];

  const nodes = [
    city,
    resident1,
    resident2,
    orgPolitical,
    orgCriminal,
    orgReligious,
    event,
    estrangedParent,
    orgLeader,
    hideout,
    eventParticipant,
    leaderSecret,
  ];
  const relationships = [...directRelationships, ...depthTwoRelationships, ...depthThreeRelationships];

  return {
    city,
    resident1,
    orgPolitical,
    orgLeader,
    leaderSecret,
    directRelationships,
    depthTwoRelationships,
    depthThreeRelationships,
    storage: createFakeStorage(nodes, relationships),
  };
}

describe('TRAVERSAL_PRESETS / EVERYTHING_CONNECTED_DEPTH', () => {
  it('exposes exactly the 3 fixed MVP presets ADR-0007 point 6 names', () => {
    expect(TRAVERSAL_PRESETS).toEqual(['direct-only', 'everything-connected', 'curated-by-me']);
  });

  it('confirms depth=2 for "Everything connected" (ADR-0007 point 5)', () => {
    expect(EVERYTHING_CONNECTED_DEPTH).toBe(2);
  });
});

describe('resolveTraversal — "direct-only"', () => {
  it("returns exactly the City's 6 direct neighbors, per ADR-0007's worked example", async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'direct-only', nodeId: city.id });

    expect(result.rootNode).toBe(city);
    expect(result.nodes).toHaveLength(6);
    expect(result.relationships).toHaveLength(6);
    expect(result.nodes.map((n) => n.id).sort()).toEqual(
      [
        'resident-1',
        'resident-2',
        'org-political',
        'org-criminal',
        'org-religious',
        'event-1',
      ].sort(),
    );
  });

  it('does not pull in any depth-2-only Node', async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'direct-only', nodeId: city.id });

    expect(result.nodes.some((n) => n.id === 'estranged-parent')).toBe(false);
    expect(result.nodes.some((n) => n.id === 'org-leader')).toBe(false);
  });

  it('is every category at once — every direct traversalCategory is present regardless of Definition (ADR-0007 point 6, "1-hop, every category")', async () => {
    // All fixture Relationships share the same definitionId/category on
    // purpose — this test documents that resolveTraversal never filters
    // by category at all, so a mixed-category fixture would behave
    // identically; category filtering isn't part of any of the 3 presets.
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'direct-only', nodeId: city.id });
    expect(result.relationships).toHaveLength(6);
  });
});

describe('resolveTraversal — "everything-connected"', () => {
  it("additionally pulls in a resident's estranged parent, an org's leader, a criminal org's hideout, and an event participant not connected to the City directly", async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'everything-connected', nodeId: city.id });

    const ids = result.nodes.map((n) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining(['estranged-parent', 'org-leader', 'hideout', 'event-participant']),
    );
  });

  it('still includes every depth-1 direct neighbor', async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'everything-connected', nodeId: city.id });
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'resident-1',
        'resident-2',
        'org-political',
        'org-criminal',
        'org-religious',
        'event-1',
      ]),
    );
  });

  it('does not extend to depth 3 (a leader\'s own secret is not reached)', async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'everything-connected', nodeId: city.id });
    expect(result.nodes.some((n) => n.id === 'leader-secret')).toBe(false);
    expect(result.relationships.some((r) => r.id === 'rel-leader-secret')).toBe(false);
  });

  it('includes a Relationship directly connecting two of the root\'s own direct neighbors', async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'everything-connected', nodeId: city.id });
    expect(result.relationships.some((r) => r.id === 'rel-resident1-org-political')).toBe(true);
  });

  it('never double-counts a Node reached through two different depth-1 neighbors', async () => {
    const city = node('city-shared', 'City');
    const neighborA = node('neighbor-a');
    const neighborB = node('neighbor-b');
    const shared = node('shared-depth-2');
    const storage = createFakeStorage(
      [city, neighborA, neighborB, shared],
      [
        rel('rel-city-a', city.id, neighborA.id),
        rel('rel-city-b', city.id, neighborB.id),
        rel('rel-a-shared', neighborA.id, shared.id),
        rel('rel-b-shared', neighborB.id, shared.id),
      ],
    );

    const result = await resolveTraversal(storage, { preset: 'everything-connected', nodeId: city.id });

    expect(result.nodes.filter((n) => n.id === 'shared-depth-2')).toHaveLength(1);
    // Both edges into the shared Node are still real facts and both included.
    expect(result.relationships.map((r) => r.id).sort()).toEqual(
      ['rel-a-shared', 'rel-b-shared', 'rel-city-a', 'rel-city-b'].sort(),
    );
  });

  it('is cycle-safe: A -> B -> C -> A never infinite-loops and never double-counts', async () => {
    const a = node('cycle-a');
    const b = node('cycle-b');
    const c = node('cycle-c');
    const storage = createFakeStorage(
      [a, b, c],
      [rel('rel-a-b', a.id, b.id), rel('rel-b-c', b.id, c.id), rel('rel-c-a', c.id, a.id)],
    );

    const result = await resolveTraversal(storage, { preset: 'everything-connected', nodeId: a.id });

    expect(result.nodes.map((n) => n.id).sort()).toEqual(['cycle-b', 'cycle-c']);
    expect(result.relationships.map((r) => r.id).sort()).toEqual(['rel-a-b', 'rel-b-c', 'rel-c-a']);
  });
});

describe('resolveTraversal — dangling references and dangling root (ADR-0007 point 8)', () => {
  it("excludes a Relationship whose other endpoint Node no longer exists, without throwing", async () => {
    const city = node('city-1', 'City');
    const survivor = node('survivor', 'Character');
    const storage = createFakeStorage(
      [city, survivor],
      [
        rel('rel-city-survivor', city.id, survivor.id),
        rel('rel-city-ghost', city.id, 'node-deleted'),
      ],
    );

    const result = await resolveTraversal(storage, { preset: 'direct-only', nodeId: city.id });

    expect(result.nodes.map((n) => n.id)).toEqual(['survivor']);
    expect(result.relationships.map((r) => r.id)).toEqual(['rel-city-survivor']);
  });

  it("returns an empty, non-throwing result when the queried root Node itself doesn't resolve", async () => {
    const storage = createFakeStorage([], []);
    const result = await resolveTraversal(storage, {
      preset: 'everything-connected',
      nodeId: 'node-does-not-exist',
    });

    expect(result.rootNode).toBeUndefined();
    expect(result.nodes).toEqual([]);
    expect(result.relationships).toEqual([]);
  });
});

describe('resolveTraversal — "curated-by-me"', () => {
  it("resolves only the given Relationship ids, drawn from Direct only's own result", async () => {
    const { city, storage } = puertoUmbralFixture();
    const query: CuratedByMeTraversalQuery = {
      preset: 'curated-by-me',
      nodeId: city.id,
      includedRelationshipIds: ['rel-city-resident1', 'rel-city-org-political'],
    };

    const result = await resolveTraversal(storage, query);

    expect(result.nodes.map((n) => n.id).sort()).toEqual(['org-political', 'resident-1']);
    expect(result.relationships.map((r) => r.id).sort()).toEqual([
      'rel-city-org-political',
      'rel-city-resident1',
    ]);
  });

  it('silently skips a curated id that no longer resolves to a real Relationship', async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, {
      preset: 'curated-by-me',
      nodeId: city.id,
      includedRelationshipIds: ['rel-city-resident1', 'rel-does-not-exist'],
    });

    expect(result.relationships.map((r) => r.id)).toEqual(['rel-city-resident1']);
  });

  it("silently skips a curated Relationship id that doesn't actually connect to the queried Node", async () => {
    const { city, storage } = puertoUmbralFixture();
    // rel-resident1-parent connects resident-1 to estranged-parent, not the City.
    const result = await resolveTraversal(storage, {
      preset: 'curated-by-me',
      nodeId: city.id,
      includedRelationshipIds: ['rel-resident1-parent'],
    });

    expect(result.nodes).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it('silently skips a curated Relationship whose other endpoint Node no longer exists', async () => {
    const city = node('city-2', 'City');
    const storage = createFakeStorage([city], [rel('rel-city-ghost', city.id, 'node-deleted')]);

    const result = await resolveTraversal(storage, {
      preset: 'curated-by-me',
      nodeId: city.id,
      includedRelationshipIds: ['rel-city-ghost'],
    });

    expect(result.nodes).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it('returns an empty result for an empty curated list', async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, {
      preset: 'curated-by-me',
      nodeId: city.id,
      includedRelationshipIds: [],
    });

    expect(result.nodes).toEqual([]);
    expect(result.relationships).toEqual([]);
  });
});

describe('resolveTraversal — result shape', () => {
  it('always tags the result with the requested nodeId and preset', async () => {
    const { city, storage } = puertoUmbralFixture();
    const result = await resolveTraversal(storage, { preset: 'direct-only', nodeId: city.id });
    expect(result.nodeId).toBe(city.id);
    expect(result.preset).toBe('direct-only');
  });
});
