import type { Node } from '../domain/node.js';
import type { Relationship } from '../domain/relationship.js';
import type { StorageProvider } from '../storage/storage-provider.js';

/**
 * Core Query API — the "one execution path every View format can call"
 * ADR-0007 point 2 requires: given a starting Node and one of the 3 fixed
 * MVP presets (point 6), resolves which Nodes/Relationships to include.
 * Engine-agnostic (programs only against `StorageProvider`, never a
 * concrete storage engine) and platform-agnostic (no Foundry-specific
 * code) — lives in `src/core/`, never imported by a View format directly
 * reimplementing its own traversal (01_ARCHITECTURE.md's Domain Ownership,
 * `docs/PROJECT.md`'s "Core's platform independence" sensitive area).
 *
 * Deliberately does NOT filter or group by `RelationshipDefinition.
 * traversalCategory`: none of the 3 presets restrict by category (point 6 —
 * "Direct only" and "Everything connected" are both "every category"), and
 * category-based grouping for display (e.g. "Political factions (3)") is
 * explicitly named as the View/UI's responsibility, not the selection
 * mechanism's (point 1). A View that needs a Relationship's category can
 * resolve it itself via `resolveRelationshipDefinition` using the
 * `definitionId` already present on every returned Relationship — this
 * module doesn't need to call it, so it doesn't (CORE-005 judgment call,
 * flagged in the PR/session log rather than invented silently).
 */

/** ADR-0007 point 6's 3 fixed MVP presets — no open per-category config yet. */
export const TRAVERSAL_PRESETS = ['direct-only', 'everything-connected', 'curated-by-me'] as const;
export type TraversalPreset = (typeof TRAVERSAL_PRESETS)[number];

/**
 * "Everything connected"'s depth bound (ADR-0007 point 5): "Depth bounded
 * by a Core-level constant... confirmed at depth = 2... The exact depth
 * value is a tunable parameter, not a structural decision — it lives as
 * Core config, one place to adjust it." This is that one place.
 */
export const EVERYTHING_CONNECTED_DEPTH = 2;

/** "Direct only" (ADR-0007 point 6): "1-hop, every category." */
const DIRECT_ONLY_DEPTH = 1;

export interface DirectOnlyTraversalQuery {
  readonly preset: 'direct-only';
  readonly nodeId: string;
}

export interface EverythingConnectedTraversalQuery {
  readonly preset: 'everything-connected';
  readonly nodeId: string;
}

/**
 * "Curated by me" (ADR-0007 point 6): "starts from the 'Direct only'
 * expansion, not a blank canvas; the GM prunes and adds from there... The
 * edited result is saved as the View's own content." This ticket (issue
 * #42) is scoped to *executing* an already-curated selection — a given
 * list of Relationship ids the GM has already pruned/kept — not the
 * pruning UI itself (a View-layer concern, VIEW-001).
 */
export interface CuratedByMeTraversalQuery {
  readonly preset: 'curated-by-me';
  readonly nodeId: string;
  /** Relationship ids to include, expected to be drawn from "Direct only"'s own result for this same `nodeId`. */
  readonly includedRelationshipIds: readonly string[];
}

export type TraversalQuery =
  | DirectOnlyTraversalQuery
  | EverythingConnectedTraversalQuery
  | CuratedByMeTraversalQuery;

export interface TraversalResult {
  readonly nodeId: string;
  readonly preset: TraversalPreset;
  /**
   * The queried Node itself, or `undefined` if it no longer resolves in
   * storage. Not an ADR-0007 case by name (that ADR addresses a
   * Relationship's origin/target endpoint going dangling, not the query's
   * own root) — extended here as the same no-throw philosophy applied to
   * the one remaining case it didn't name (CORE-005 judgment call): a
   * View asking to traverse from a Node that's since been deleted gets an
   * empty result, not a thrown error.
   */
  readonly rootNode: Node | undefined;
  /** Every distinct Node the traversal reached, root excluded, in discovery order. Never contains duplicates, even for a Node reached by two different paths. */
  readonly nodes: readonly Node[];
  /** Every distinct Relationship the traversal included, in discovery order. Never contains duplicates. */
  readonly relationships: readonly Relationship[];
}

/**
 * Resolves one of ADR-0007's 3 fixed traversal presets against a Node,
 * against whatever `StorageProvider` the caller wires in — the only thing
 * that changes when STORE-001's underlying engine changes is that
 * implementation, never this function (ADR-0007 point 2).
 */
export async function resolveTraversal(
  storage: StorageProvider,
  query: TraversalQuery,
): Promise<TraversalResult> {
  const rootNode = await storage.getNode(query.nodeId);

  if (rootNode === undefined) {
    return {
      nodeId: query.nodeId,
      preset: query.preset,
      rootNode: undefined,
      nodes: [],
      relationships: [],
    };
  }

  const { nodes, relationships } =
    query.preset === 'curated-by-me'
      ? await resolveCuratedByMe(storage, query)
      : await traverse(
          storage,
          query.nodeId,
          query.preset === 'direct-only' ? DIRECT_ONLY_DEPTH : EVERYTHING_CONNECTED_DEPTH,
        );

  return { nodeId: query.nodeId, preset: query.preset, rootNode, nodes, relationships };
}

interface TraversalAccumulation {
  readonly nodes: readonly Node[];
  readonly relationships: readonly Relationship[];
}

/**
 * The N-hop composition ADR-0007 point 4 assigns to Core, built from
 * repeated calls to `getRelationshipsForNode`'s 1-hop primitive — storage
 * is never asked for a multi-hop capability of its own.
 *
 * Cycle-safe (ADR-0007 point 5): a `visited` set of Node ids stops a
 * Node from ever being re-expanded (pushed onto the BFS frontier twice),
 * which is what actually prevents an infinite loop on a graph with cycles
 * (A -> B -> C -> A) — bounding by `maxDepth` alone isn't sufficient on
 * its own if a Node could be expanded repeatedly within that bound.
 * Already-visited Nodes/Relationships are still recorded as edges/nodes in
 * the result the first time they're encountered (e.g. a Relationship
 * connecting two of the root's own direct neighbors to each other) — only
 * *re-expanding* an already-visited Node's own neighbors is skipped, per
 * the worked example's "for each of those direct neighbors, also follow
 * one more hop from them" (point 5).
 *
 * Dangling references (ADR-0007 point 8) are excluded naturally: if the
 * other endpoint of a Relationship doesn't resolve to an existing Node,
 * that Relationship is skipped, no throw.
 */
async function traverse(
  storage: StorageProvider,
  rootNodeId: string,
  maxDepth: number,
): Promise<TraversalAccumulation> {
  const visited = new Set<string>([rootNodeId]);
  const nodeCache = new Map<string, Node | undefined>();
  const resultNodes = new Map<string, Node>();
  const resultRelationships = new Map<string, Relationship>();

  const resolveNode = async (id: string): Promise<Node | undefined> => {
    if (!nodeCache.has(id)) {
      nodeCache.set(id, await storage.getNode(id));
    }
    return nodeCache.get(id);
  };

  let frontier: readonly string[] = [rootNodeId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const nextFrontier: string[] = [];

    for (const currentNodeId of frontier) {
      const relationshipsForNode = await storage.getRelationshipsForNode(currentNodeId);

      for (const relationship of relationshipsForNode) {
        const otherNodeId =
          relationship.origin === currentNodeId ? relationship.target : relationship.origin;

        const otherNode = await resolveNode(otherNodeId);
        if (otherNode === undefined) {
          // Dangling reference (ADR-0007 point 8) — skip silently.
          continue;
        }

        resultRelationships.set(relationship.id, relationship);
        // The root itself is excluded from `nodes` (see TraversalResult's
        // doc comment) even though a back-edge to it — e.g. a cycle's last
        // hop, C -> A above — is still a real fact and stays in
        // `relationships`. Without this guard, expanding a depth-2 Node
        // whose own neighbor lookup includes its edge back to the root
        // would silently re-insert the root into `resultNodes` (caught by
        // the A -> B -> C -> A cycle-safety test).
        if (otherNodeId !== rootNodeId && !resultNodes.has(otherNode.id)) {
          resultNodes.set(otherNode.id, otherNode);
        }

        if (!visited.has(otherNodeId)) {
          visited.add(otherNodeId);
          nextFrontier.push(otherNodeId);
        }
      }
    }

    frontier = nextFrontier;
  }

  return { nodes: [...resultNodes.values()], relationships: [...resultRelationships.values()] };
}

/**
 * "Curated by me" execution: resolves a given list of Relationship ids
 * (already curated by the GM from "Direct only", per the ADR) against
 * storage. Single-hop by construction — it only ever looks at the
 * relationship the given id names and the Node on its other end relative
 * to `query.nodeId`, never composes further hops.
 *
 * Two silent-skip cases, deliberately not thrown (CORE-005 judgment
 * call — the curated id list is persisted View content this ticket
 * doesn't validate at write time, that's VIEW-001's concern): a curated id
 * that no longer resolves to a real Relationship (dangling relationship
 * id), and a curated id that doesn't actually connect to `query.nodeId`
 * (defensive — shouldn't happen if the id list truly came from this same
 * Node's "Direct only" result, but this function doesn't trust that
 * unchecked).
 */
async function resolveCuratedByMe(
  storage: StorageProvider,
  query: CuratedByMeTraversalQuery,
): Promise<TraversalAccumulation> {
  const resultNodes = new Map<string, Node>();
  const resultRelationships = new Map<string, Relationship>();

  for (const relationshipId of query.includedRelationshipIds) {
    const relationship = await storage.getRelationship(relationshipId);
    if (relationship === undefined) {
      continue;
    }

    const otherNodeId =
      relationship.origin === query.nodeId
        ? relationship.target
        : relationship.target === query.nodeId
          ? relationship.origin
          : undefined;

    if (otherNodeId === undefined) {
      continue;
    }

    const otherNode = await storage.getNode(otherNodeId);
    if (otherNode === undefined) {
      // Dangling reference (ADR-0007 point 8) — skip silently.
      continue;
    }

    resultRelationships.set(relationship.id, relationship);
    resultNodes.set(otherNode.id, otherNode);
  }

  return { nodes: [...resultNodes.values()], relationships: [...resultRelationships.values()] };
}
