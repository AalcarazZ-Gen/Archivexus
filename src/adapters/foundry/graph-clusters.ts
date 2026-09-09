import type { Node } from '../../core/domain/node.js';
import {
  RELATIONSHIP_TRAVERSAL_CATEGORIES,
  type RelationshipDefinition,
  type RelationshipTraversalCategory,
} from '../../core/domain/relationship-definition.js';
import type { TraversalResult } from '../../core/query/traversal.js';
import { buildGraphViewElements, type GraphViewElement } from './graph-view-elements.js';
import { categoryLabel, UNCATEGORIZED_KEY } from './node-connections.js';

/**
 * VIEW-001e / ADR-0007 point 6 (mandatory) + ADR-0014 Amendment A5 — the
 * "Everything connected" preset must render its **depth-2** ring as
 * **collapsed, category-labelled clusters by default**, or a hub Node floods
 * the canvas the first time a GM opens it.
 *
 * This module is the pure part: given a depth-2 `TraversalResult` and the
 * `RelationshipDefinition`s (real persisted state, from
 * `listRelationshipDefinitions()`), it partitions the reached Nodes into
 * - the **direct ring** (depth 1 — always shown expanded, the immediate
 *   context of the root), and
 * - **clusters** over the depth-2 Nodes, keyed by the `traversalCategory`
 *   of the Relationship that links each into the direct ring.
 *
 * `buildClusteredGraphElements` then turns that plus a set of
 * *currently-expanded* cluster ids into Cytoscape elements (compound nodes:
 * a collapsed cluster is one node with aggregate edges; an expanded one is a
 * parent box holding its members). No DOM, no Cytoscape, no Foundry — the
 * popout glue in `graph-popout-window.ts` owns the tap-to-toggle and styling.
 *
 * A canvas has effectively infinite 2D space, so an expanded cluster shows
 * **all** of its members — no paging, no "+N more" (unlike the Inspector's
 * list). ADR-0012's degree-desc / alpha node cap is the named escalation
 * path if Cytoscape ever chokes, not built now (~100 Nodes).
 */

export const CLUSTER_ID_PREFIX = 'ax-cluster:';

export type ClusterCategoryKey = RelationshipTraversalCategory | typeof UNCATEGORIZED_KEY;

export interface GraphCluster {
  /** Synthetic Cytoscape node id — `${CLUSTER_ID_PREFIX}${categoryKey}`. */
  readonly id: string;
  readonly categoryKey: ClusterCategoryKey;
  /** `"Affiliation (12)"` — the shared `categoryLabel` plus the member count. */
  readonly label: string;
  /** The depth-2 Node ids in this cluster, in traversal discovery order. */
  readonly memberNodeIds: readonly string[];
  /** The direct-ring Node ids that link into this cluster — the aggregate-edge endpoints when collapsed. */
  readonly anchorNodeIds: readonly string[];
}

export interface ClusteredTraversal {
  /** Depth-1 Node ids — always rendered expanded. The root is separate (`traversal.rootNode`). */
  readonly directNodeIds: readonly string[];
  /** Clusters over the depth-2 Nodes: fixed taxonomy order, `Other` last, empty categories omitted. */
  readonly clusters: readonly GraphCluster[];
  /**
   * Depth-2 Node ids that reached no cluster (defensive — every depth-2
   * Node is discovered via some Relationship, so this is normally empty;
   * anything here is rendered as a plain node so it never silently vanishes).
   */
  readonly unclusteredNodeIds: readonly string[];
}

function clusterId(key: ClusterCategoryKey): string {
  return `${CLUSTER_ID_PREFIX}${key}`;
}

/** `true` iff `id` is a synthetic cluster node id (not a real Node/Foundry uuid). */
export function isClusterNodeId(id: string): boolean {
  return id.startsWith(CLUSTER_ID_PREFIX);
}

/**
 * Partitions an "everything-connected" `TraversalResult` into its direct
 * ring + depth-2 clusters. `traversal.nodes` already excludes the root and
 * is de-duplicated (see `traversal.ts`); a Node counts as **direct** when
 * some Relationship in the result connects it straight to the root.
 */
export function buildClusteredTraversal(
  traversal: TraversalResult,
  definitionsById: ReadonlyMap<string, RelationshipDefinition>,
): ClusteredTraversal {
  const rootId = traversal.nodeId;

  const directNodeIds = new Set<string>();
  for (const relationship of traversal.relationships) {
    if (relationship.origin === rootId) directNodeIds.add(relationship.target);
    else if (relationship.target === rootId) directNodeIds.add(relationship.origin);
  }
  // A Relationship can name the root on both ends only via a self-link,
  // which the traversal never produces; but guard anyway.
  directNodeIds.delete(rootId);

  const depthTwoNodeIds = traversal.nodes
    .map((node) => node.id)
    .filter((id) => !directNodeIds.has(id));
  const depthTwoSet = new Set(depthTwoNodeIds);

  // Assign each depth-2 Node to the category of the first Relationship (in
  // discovery order) that links it into the direct ring. Unlike the
  // Inspector's connection list (a list, not a partition), a Node lands in
  // exactly one cluster here so the collapsed canvas stays unambiguous.
  const categoryByNodeId = new Map<string, ClusterCategoryKey>();
  const anchorsByCategory = new Map<ClusterCategoryKey, Set<string>>();
  const membersByCategory = new Map<ClusterCategoryKey, string[]>();

  for (const relationship of traversal.relationships) {
    const { origin, target } = relationship;
    let depthTwoId: string | undefined;
    let anchorId: string | undefined;
    if (depthTwoSet.has(target) && directNodeIds.has(origin)) {
      depthTwoId = target;
      anchorId = origin;
    } else if (depthTwoSet.has(origin) && directNodeIds.has(target)) {
      depthTwoId = origin;
      anchorId = target;
    }
    if (depthTwoId === undefined || anchorId === undefined || categoryByNodeId.has(depthTwoId)) {
      continue;
    }
    const definition = definitionsById.get(relationship.definitionId);
    const key: ClusterCategoryKey = definition?.traversalCategory ?? UNCATEGORIZED_KEY;
    categoryByNodeId.set(depthTwoId, key);

    let members = membersByCategory.get(key);
    if (!members) {
      members = [];
      membersByCategory.set(key, members);
    }
    members.push(depthTwoId);

    let anchors = anchorsByCategory.get(key);
    if (!anchors) {
      anchors = new Set();
      anchorsByCategory.set(key, anchors);
    }
    anchors.add(anchorId);
  }

  const orderedKeys: ClusterCategoryKey[] = [
    ...RELATIONSHIP_TRAVERSAL_CATEGORIES,
    UNCATEGORIZED_KEY,
  ];
  const clusters: GraphCluster[] = [];
  for (const key of orderedKeys) {
    const members = membersByCategory.get(key);
    if (!members || members.length === 0) continue;
    clusters.push({
      id: clusterId(key),
      categoryKey: key,
      label: `${categoryLabel(key)} (${members.length})`,
      memberNodeIds: members,
      anchorNodeIds: [...(anchorsByCategory.get(key) ?? [])],
    });
  }

  const unclusteredNodeIds = depthTwoNodeIds.filter((id) => !categoryByNodeId.has(id));

  return { directNodeIds: [...directNodeIds], clusters, unclusteredNodeIds };
}

/**
 * Cytoscape elements for the clustered "everything-connected" view, given
 * which clusters are currently expanded. Collapsed cluster → one node +
 * aggregate edges from its anchors. Expanded cluster → a parent (compound)
 * node whose members carry `data.parent`, with their real Relationships.
 *
 * `visibleNodesById` is the already-viewer-filtered Node set
 * (`filterTraversalForViewer`); a cluster whose members are all filtered
 * out is dropped, and its count reflects only what the viewer may see.
 */
export function buildClusteredGraphElements(
  traversal: TraversalResult,
  clustered: ClusteredTraversal,
  expandedClusterIds: ReadonlySet<string>,
  definitionsById?: ReadonlyMap<string, RelationshipDefinition>,
): readonly GraphViewElement[] {
  const nodesById = new Map<string, Node>();
  if (traversal.rootNode) nodesById.set(traversal.rootNode.id, traversal.rootNode);
  for (const node of traversal.nodes) nodesById.set(node.id, node);

  const visibleIds = new Set<string>();
  if (traversal.rootNode) visibleIds.add(traversal.rootNode.id);
  for (const id of clustered.directNodeIds) if (nodesById.has(id)) visibleIds.add(id);
  for (const id of clustered.unclusteredNodeIds) if (nodesById.has(id)) visibleIds.add(id);
  for (const cluster of clustered.clusters) {
    if (!expandedClusterIds.has(cluster.id)) continue;
    for (const id of cluster.memberNodeIds) if (nodesById.has(id)) visibleIds.add(id);
  }

  const plainNodes: Node[] = [];
  for (const id of visibleIds) {
    const node = nodesById.get(id);
    if (node) plainNodes.push(node);
  }

  // Real nodes + the Relationships among them, via the existing transform.
  const baseElements = buildGraphViewElements(plainNodes, traversal.relationships, definitionsById);

  const parentByMemberId = new Map<string, string>();
  for (const cluster of clustered.clusters) {
    if (!expandedClusterIds.has(cluster.id)) continue;
    for (const id of cluster.memberNodeIds) parentByMemberId.set(id, cluster.id);
  }

  const withParents: GraphViewElement[] = baseElements.map((element) => {
    if (element.group !== 'nodes') return element;
    const parent = parentByMemberId.get(element.data.id);
    return parent ? { ...element, data: { ...element.data, parent } } : element;
  });

  const clusterNodeElements: GraphViewElement[] = [];
  const aggregateEdgeElements: GraphViewElement[] = [];
  for (const cluster of clustered.clusters) {
    const expanded = expandedClusterIds.has(cluster.id);
    const memberCount = cluster.memberNodeIds.filter((id) => nodesById.has(id)).length;
    if (memberCount === 0) continue;

    clusterNodeElements.push({
      group: 'nodes',
      data: {
        id: cluster.id,
        label: `${categoryLabel(cluster.categoryKey)} (${memberCount})${expanded ? ' ▾' : ' ▸'}`,
        nodeType: 'cluster',
        documentType: null,
        isCluster: true,
        collapsed: !expanded,
        clusterCount: memberCount,
        clusterCategory: cluster.categoryKey,
      },
    });

    if (!expanded) {
      for (const anchorId of cluster.anchorNodeIds) {
        if (!visibleIds.has(anchorId)) continue;
        aggregateEdgeElements.push({
          group: 'edges',
          data: {
            id: `${cluster.id}::${anchorId}`,
            source: anchorId,
            target: cluster.id,
            label: '',
            definitionId: '',
          },
        });
      }
    }
  }

  // Order matters for `cy.add()`: a compound parent must precede its
  // children, and every edge its endpoints. Cluster (parent) nodes first,
  // then member/plain nodes, then real edges, then the aggregate edges.
  const baseNodeElements = withParents.filter((element) => element.group === 'nodes');
  const baseEdgeElements = withParents.filter((element) => element.group === 'edges');
  return [
    ...clusterNodeElements,
    ...baseNodeElements,
    ...baseEdgeElements,
    ...aggregateEdgeElements,
  ];
}
