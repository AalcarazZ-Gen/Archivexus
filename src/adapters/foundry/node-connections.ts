import type { Block } from '../../core/domain/block.js';
import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import {
  RELATIONSHIP_TRAVERSAL_CATEGORIES,
  type RelationshipDefinition,
  type RelationshipTraversalCategory,
} from '../../core/domain/relationship-definition.js';

/**
 * A Node's direct connections, grouped and ordered for display — the logic
 * `decisions/ADR-0012-node-connections-panel.md` points 4–7 specify. Pure
 * (no storage, no DOM, no Foundry): the caller resolves a "Direct only"
 * `resolveTraversal` result (CORE-005), the connected `Node`s by id, the
 * `RelationshipDefinition`s by id (from
 * `StorageProvider.listRelationshipDefinitions()` — real persisted state),
 * and each connected Node's total degree (`getRelationshipsForNode
 * (id).length`), and hands them in.
 *
 * VIEW-001b's Inspector panel (`graph-popout-window.ts`) is the first
 * consumer; the still-unbuilt ADAPT-011 standalone Connections panel
 * (ADR-0012) is meant to reuse this same module rather than re-deriving it
 * (Rule 4).
 *
 * ADR-0012 point 4: one row per (Relationship, connected Node) pair — a
 * Node reached via two Relationships of different categories legitimately
 * appears in both groups; that's one category of fact each, not a
 * partition of Nodes, so it is NOT deduped.
 */

/** Title-cased labels for ADR-0007's closed 8-value `traversalCategory` taxonomy (ADR-0012 point 4 — no new vocabulary). */
const CATEGORY_LABELS: Readonly<Record<RelationshipTraversalCategory, string>> = {
  location: 'Location',
  affiliation: 'Affiliation',
  kinship: 'Kinship',
  conflict: 'Conflict',
  governance: 'Governance',
  participation: 'Participation',
  ownership: 'Ownership',
  narrative: 'Narrative',
};

/** Group key for a Relationship whose Definition doesn't resolve (not in the store). Rendered last. */
export const UNCATEGORIZED_KEY = 'other';
const UNCATEGORIZED_LABEL = 'Other';

/**
 * The display label for a `traversalCategory` (or `UNCATEGORIZED_KEY`) —
 * the single source of truth for category labelling, shared with the
 * Relationship Console (VIEW-001i) so its group headers and chips match the
 * Inspector's exactly (Rule 4).
 */
export function categoryLabel(category: RelationshipTraversalCategory | typeof UNCATEGORIZED_KEY): string {
  return category === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : CATEGORY_LABELS[category];
}

export interface NodeConnectionRow {
  readonly relationshipId: string;
  readonly connectedNode: Node;
  /**
   * The direction-correct phrase for this connection relative to the
   * queried root (ADR-0012 point 4): the Definition's `name` when the root
   * is the Relationship's `origin`, its `inverse` when the root is the
   * `target`. Falls back to the raw `definitionId` when the Definition
   * doesn't resolve.
   */
  readonly label: string;
  /**
   * `false` when the connected Node is JournalEntryPage-backed with no
   * Actor (ADR-0012 point 6 — derived purely from the id/UUID prefix, per
   * ADR-0001: an Actor's UUID always starts with `Actor.`).
   */
  readonly hasBackingActor: boolean;
  /** The connected Node's attached Blocks (ADR-0012 point 7) — already on the Node, no extra lookup. */
  readonly blocks: readonly Block[];
}

export interface NodeConnectionGroup {
  readonly category: RelationshipTraversalCategory | typeof UNCATEGORIZED_KEY;
  readonly label: string;
  readonly rows: readonly NodeConnectionRow[];
}

export interface BuildNodeConnectionsInput {
  readonly rootNodeId: string;
  /** Every Relationship touching the root (a "Direct only" `TraversalResult.relationships`). */
  readonly relationships: readonly Relationship[];
  /** The connected Nodes (a "Direct only" `TraversalResult.nodes`), keyed by id. A Relationship whose other endpoint is absent here is a dangling reference (ADR-0007 point 8) and is skipped. */
  readonly connectedNodesById: ReadonlyMap<string, Node>;
  readonly definitionsById: ReadonlyMap<string, RelationshipDefinition>;
  /** `getRelationshipsForNode(id).length` per connected Node id — the degree used for ordering (ADR-0012 point 5). Missing entries sort as degree 0. */
  readonly degreeByNodeId: ReadonlyMap<string, number>;
}

function hasBackingActor(nodeId: string): boolean {
  return nodeId.startsWith('Actor.');
}

/**
 * Builds the grouped, ordered connection list. Groups appear in the fixed
 * taxonomy order, `Other` last; empty groups are omitted. Within a group:
 * degree-descending, then alphabetical by connected Node title (ADR-0012
 * point 5).
 */
export function buildNodeConnections(
  input: BuildNodeConnectionsInput,
): readonly NodeConnectionGroup[] {
  const rowsByCategory = new Map<string, NodeConnectionRow[]>();

  for (const relationship of input.relationships) {
    const otherNodeId =
      relationship.origin === input.rootNodeId ? relationship.target : relationship.origin;
    const connectedNode = input.connectedNodesById.get(otherNodeId);
    if (!connectedNode) {
      // Dangling reference (ADR-0007 point 8) — no Node to show a row for.
      continue;
    }

    const definition = input.definitionsById.get(relationship.definitionId);
    const rootIsOrigin = relationship.origin === input.rootNodeId;
    const label = definition
      ? rootIsOrigin
        ? definition.name
        : definition.inverse
      : relationship.definitionId;
    const categoryKey: string = definition?.traversalCategory ?? UNCATEGORIZED_KEY;

    const row: NodeConnectionRow = {
      relationshipId: relationship.id,
      connectedNode,
      label,
      hasBackingActor: hasBackingActor(connectedNode.id),
      blocks: connectedNode.blocks,
    };

    const bucket = rowsByCategory.get(categoryKey);
    if (bucket) {
      bucket.push(row);
    } else {
      rowsByCategory.set(categoryKey, [row]);
    }
  }

  const sortRows = (rows: readonly NodeConnectionRow[]): readonly NodeConnectionRow[] =>
    [...rows].sort((a, b) => {
      const degreeA = input.degreeByNodeId.get(a.connectedNode.id) ?? 0;
      const degreeB = input.degreeByNodeId.get(b.connectedNode.id) ?? 0;
      if (degreeA !== degreeB) {
        return degreeB - degreeA;
      }
      return a.connectedNode.title.localeCompare(b.connectedNode.title);
    });

  const groups: NodeConnectionGroup[] = [];
  for (const category of RELATIONSHIP_TRAVERSAL_CATEGORIES) {
    const rows = rowsByCategory.get(category);
    if (rows && rows.length > 0) {
      groups.push({ category, label: CATEGORY_LABELS[category], rows: sortRows(rows) });
    }
  }
  const other = rowsByCategory.get(UNCATEGORIZED_KEY);
  if (other && other.length > 0) {
    groups.push({ category: UNCATEGORIZED_KEY, label: UNCATEGORIZED_LABEL, rows: sortRows(other) });
  }
  return groups;
}
