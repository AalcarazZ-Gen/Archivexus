import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';
import type { TraversalResult } from '../../core/query/traversal.js';

/**
 * Pure Node/Relationship → Cytoscape-element transform for the Codex graph
 * tab (VIEW-001a, `decisions/ADR-0014-graph-view-sidebar-tab.md`). No DOM,
 * no Cytoscape, no Foundry — just the shape Cytoscape's `elements` option
 * and `cy.add()` accept (`{ group, data }` objects). This is the part of
 * VIEW-001a that's fully unit-testable in-sandbox; the tab class itself
 * (`codex-sidebar-tab.ts`) is Foundry/Cytoscape glue flagged for live
 * verification.
 *
 * Two things this deliberately does NOT do, both out of scope per issue
 * #56 (→ VIEW-001b): resolve `RelationshipDefinition.traversalCategory`
 * for cluster grouping / edge styling (Definitions aren't persisted —
 * CORE-004 is domain-only), and carry any saved node-position layout.
 */

export interface GraphViewNodeElement {
  readonly group: 'nodes';
  readonly data: {
    readonly id: string;
    readonly label: string;
    /** The Node's own concept type (`Character`, `City`, `Lore`, …) — for per-type styling later. */
    readonly nodeType: string;
    /**
     * The backing Foundry document type, taken from the id/UUID prefix
     * (`Actor`, `JournalEntry`) per ADR-0001 — `null` if the id isn't a
     * recognizable Foundry UUID. Only a styling/telemetry hint here;
     * opening the real sheet uses `foundry.utils.fromUuid(id)` directly,
     * not this field.
     */
    readonly documentType: string | null;
    /**
     * Cytoscape compound-node parent id — set by VIEW-001e's
     * `buildClusteredGraphElements` on a Node that currently sits inside an
     * expanded cluster box. Absent for every normal node.
     */
    readonly parent?: string;
    /** VIEW-001e — `true` on a synthetic cluster node (not a real Knowledge Element). */
    readonly isCluster?: boolean;
    /** VIEW-001e — a cluster node's collapsed/expanded state, for styling + tap handling. */
    readonly collapsed?: boolean;
    /** VIEW-001e — how many depth-2 Nodes the cluster holds (viewer-filtered count). */
    readonly clusterCount?: number;
    /** VIEW-001e — the cluster's `traversalCategory` key (or `'other'`). */
    readonly clusterCategory?: string;
  };
}

export interface GraphViewEdgeElement {
  readonly group: 'edges';
  readonly data: {
    readonly id: string;
    readonly source: string;
    readonly target: string;
    readonly label: string;
    /** The Relationship's `definitionId`. */
    readonly definitionId: string;
    /**
     * The Relationship's `traversalCategory` (resolved from the Definition,
     * `'other'` when it doesn't resolve) — ADAPT-013 colours edges by it.
     * Only present when `buildGraphViewElements` was given a definitions map.
     */
    readonly category?: string;
  };
}

export type GraphViewElement = GraphViewNodeElement | GraphViewEdgeElement;

/** A UUID like `Actor.abc` or `JournalEntry.abc.JournalEntryPage.def` → `Actor` / `JournalEntry`; anything without a `.` → `null`. */
export function documentTypeFromId(id: string): string | null {
  const firstSegment = id.split('.')[0];
  return firstSegment && firstSegment !== id ? firstSegment : null;
}

function toNodeElement(node: Node): GraphViewNodeElement {
  return {
    group: 'nodes',
    data: {
      id: node.id,
      label: node.title,
      nodeType: node.type,
      documentType: documentTypeFromId(node.id),
    },
  };
}

function toEdgeElement(
  relationship: Relationship,
  definitionsById?: ReadonlyMap<string, RelationshipDefinition>,
): GraphViewEdgeElement {
  const category = definitionsById
    ? (definitionsById.get(relationship.definitionId)?.traversalCategory ?? 'other')
    : undefined;
  return {
    group: 'edges',
    data: {
      id: relationship.id,
      source: relationship.origin,
      target: relationship.target,
      label: relationship.title,
      definitionId: relationship.definitionId,
      ...(category !== undefined ? { category } : {}),
    },
  };
}

/**
 * Builds the Cytoscape element list for a set of Nodes and Relationships.
 * An edge is included only when BOTH its endpoints are present in `nodes`
 * — a Relationship with a dangling endpoint is valid data (ADR-0007 point
 * 8) but has nothing to attach to on the canvas, so it's dropped here the
 * same way `resolveTraversal` already drops it (never thrown, never a
 * placeholder node). Node order is preserved; edges follow all nodes so a
 * consumer that adds them in list order never references a not-yet-added
 * node.
 */
export function buildGraphViewElements(
  nodes: readonly Node[],
  relationships: readonly Relationship[],
  definitionsById?: ReadonlyMap<string, RelationshipDefinition>,
): readonly GraphViewElement[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodeElements = nodes.map(toNodeElement);
  const edgeElements = relationships
    .filter((relationship) => nodeIds.has(relationship.origin) && nodeIds.has(relationship.target))
    .map((relationship) => toEdgeElement(relationship, definitionsById));
  return [...nodeElements, ...edgeElements];
}

/** Every Node a `TraversalResult` reached, root included (it's `result.nodes`-excluded by design — see `traversal.ts`'s `TraversalResult` doc). */
export function collectTraversalNodes(result: TraversalResult): readonly Node[] {
  return result.rootNode ? [result.rootNode, ...result.nodes] : [...result.nodes];
}

/**
 * Same transform, fed from a CORE-005 `TraversalResult` (a Node click in
 * the Codex runs a traversal preset — ADR-0014 point 4). If the root no
 * longer resolves (`result.rootNode === undefined`) the result is whatever
 * the traversal still found, no root node element.
 */
export function buildGraphViewElementsFromTraversal(
  result: TraversalResult,
): readonly GraphViewElement[] {
  return buildGraphViewElements(collectTraversalNodes(result), result.relationships);
}

/**
 * Drops Nodes the current viewer isn't allowed to see, per ADR-0003:
 * `hidden` = GM-only, `visible`/`owned` = players may see. A GM (`isGM`)
 * sees everything.
 *
 * This is a conservative filter over `Node.visibility`, which the Foundry
 * Adapter derived from each document's *default* ownership (ADAPT-001/004):
 * a `hidden` Node that a specific player was granted OBSERVER on directly
 * is still hidden here (a false negative — safe direction). A per-user,
 * live-permission-accurate resolution belongs with a real `View` scope
 * (CORE-006 / VIEW-001b), not this Adapter-side pass.
 */
export function filterNodesForViewer(
  nodes: readonly Node[],
  options: { readonly isGM: boolean },
): readonly Node[] {
  if (options.isGM) {
    return nodes;
  }
  return nodes.filter((node) => node.visibility !== 'hidden');
}

/**
 * The same viewer filter, applied to a whole `TraversalResult` (VIEW-001e
 * needs to cluster the *viewer-visible* graph, not filter after clustering —
 * otherwise a collapsed cluster's count would leak how many hidden Nodes it
 * holds). The root is always kept (the viewer reached this graph by opening
 * it on that Node); a Relationship is kept only when both endpoints survive.
 */
export function filterTraversalForViewer(
  traversal: TraversalResult,
  options: { readonly isGM: boolean },
): TraversalResult {
  if (options.isGM) {
    return traversal;
  }
  const visibleNodes = filterNodesForViewer(traversal.nodes, options);
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  if (traversal.rootNode) {
    visibleIds.add(traversal.rootNode.id);
  }
  return {
    ...traversal,
    nodes: visibleNodes,
    relationships: traversal.relationships.filter(
      (relationship) => visibleIds.has(relationship.origin) && visibleIds.has(relationship.target),
    ),
  };
}
