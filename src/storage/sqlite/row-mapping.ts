import type { Block } from '../../core/domain/block.js';
import type { HistoryEntry } from '../../core/domain/history.js';
import { createNode, type Node } from '../../core/domain/node.js';
import type { KnowledgeElementReference } from '../../core/domain/reference.js';
import { createRelationship, type Relationship } from '../../core/domain/relationship.js';
import type { Tag } from '../../core/domain/tag.js';
import {
  createView,
  type GraphViewSpec,
  type View,
  type ViewFormat,
} from '../../core/domain/view.js';
import type { Visibility } from '../../core/domain/visibility.js';

/**
 * Node/Relationship/View <-> SQL row conversion (migration.ts's schema).
 * Pure — no I/O — so it's unit-testable on its own, independent of whether
 * a real or fake `SqliteExecutor` is wired up. Reconstructs domain objects
 * via `createNode`/`createRelationship`/`createView` on read rather than
 * casting stored data directly, so every Domain Invariant is re-validated
 * exactly like a freshly-created instance would be, and the returned object
 * is frozen.
 */

interface CommonRow {
  readonly title: string;
  readonly visibility: string;
  readonly metadata: string;
  readonly tags: string;
  readonly history: string;
  readonly blocks: string;
  readonly references: string;
}

export interface NodeRow extends CommonRow {
  readonly id: string;
  readonly type: string;
}

export interface RelationshipRow extends CommonRow {
  readonly id: string;
  readonly origin: string;
  readonly target: string;
  readonly definition_id: string;
}

export interface ViewRow extends CommonRow {
  readonly id: string;
  readonly format: string;
  /** JSON-encoded `GraphViewSpec` — see migration.ts's `views` table comment. */
  readonly spec: string;
}

function serializeHistory(history: readonly HistoryEntry[]): string {
  return JSON.stringify(
    history.map((entry) => ({
      timestamp: entry.timestamp.toISOString(),
      description: entry.description,
    })),
  );
}

function deserializeHistory(json: string): HistoryEntry[] {
  const parsed = JSON.parse(json) as readonly { timestamp: string; description: string }[];
  return parsed.map((entry) => ({
    timestamp: new Date(entry.timestamp),
    description: entry.description,
  }));
}

function serializeCommon(element: {
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly tags: readonly Tag[];
  readonly history: readonly HistoryEntry[];
  readonly blocks: readonly Block[];
  readonly references: readonly KnowledgeElementReference[];
}): {
  metadata: string;
  tags: string;
  history: string;
  blocks: string;
  references: string;
} {
  return {
    metadata: JSON.stringify(element.metadata),
    tags: JSON.stringify(element.tags),
    history: serializeHistory(element.history),
    blocks: JSON.stringify(element.blocks),
    references: JSON.stringify(element.references),
  };
}

export function nodeToRow(node: Node): NodeRow {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    visibility: node.visibility,
    ...serializeCommon(node),
  };
}

export function rowToNode(row: NodeRow): Node {
  return createNode({
    id: row.id,
    type: row.type,
    title: row.title,
    visibility: row.visibility as Visibility,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    tags: JSON.parse(row.tags) as Tag[],
    history: deserializeHistory(row.history),
    blocks: JSON.parse(row.blocks) as Block[],
    references: JSON.parse(row.references) as KnowledgeElementReference[],
  });
}

export function relationshipToRow(relationship: Relationship): RelationshipRow {
  return {
    id: relationship.id,
    origin: relationship.origin,
    target: relationship.target,
    definition_id: relationship.definitionId,
    title: relationship.title,
    visibility: relationship.visibility,
    ...serializeCommon(relationship),
  };
}

export function rowToRelationship(row: RelationshipRow): Relationship {
  return createRelationship({
    id: row.id,
    origin: row.origin,
    target: row.target,
    definitionId: row.definition_id,
    title: row.title,
    visibility: row.visibility as Visibility,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    tags: JSON.parse(row.tags) as Tag[],
    history: deserializeHistory(row.history),
    blocks: JSON.parse(row.blocks) as Block[],
    references: JSON.parse(row.references) as KnowledgeElementReference[],
  });
}

export function viewToRow(view: View): ViewRow {
  return {
    id: view.id,
    format: view.format,
    title: view.title,
    visibility: view.visibility,
    spec: JSON.stringify(view.spec),
    ...serializeCommon(view),
  };
}

export function rowToView(row: ViewRow): View {
  return createView({
    id: row.id,
    format: row.format as ViewFormat,
    title: row.title,
    spec: JSON.parse(row.spec) as GraphViewSpec,
    visibility: row.visibility as Visibility,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    tags: JSON.parse(row.tags) as Tag[],
    history: deserializeHistory(row.history),
    blocks: JSON.parse(row.blocks) as Block[],
    references: JSON.parse(row.references) as KnowledgeElementReference[],
  });
}
