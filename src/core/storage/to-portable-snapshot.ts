import type { Block } from '../domain/block.js';
import type { HistoryEntry } from '../domain/history.js';
import type { Node } from '../domain/node.js';
import type { KnowledgeElementReference } from '../domain/reference.js';
import type { Relationship } from '../domain/relationship.js';
import type { Tag } from '../domain/tag.js';
import type { Visibility } from '../domain/visibility.js';

/**
 * The generated JSON export ADR-0008 settled on (point 4/5) — a Core-owned
 * transform, not a copy of the SQLite file. Takes already-materialized
 * domain objects and returns a plain, denormalized DTO with no I/O and no
 * SQLite/Foundry-specific code inside it, so any adapter that ever needs
 * "a portable copy of the knowledge graph" reuses this instead of
 * reimplementing it (ADR-0008's Decision, point 5).
 *
 * Deliberately full and unredacted (ADR-0008 point 6/point 9 of its
 * Alternatives) — it does not filter by Visibility. A visibility-filtered
 * "player-safe export" is named there as a separate, not-yet-built future
 * feature; this function has no knowledge of who's asking.
 *
 * Carries every one of `KnowledgeElement`'s nine fields, including
 * `history`/`blocks`/`references` — product-owner decision, 2026-09-06
 * (`03_DOMAIN_MODEL.md`'s Knowledge Element Decisions): this export is meant
 * to let an external AI or human agent reconstruct the whole world from it
 * alone, not just titles/tags, so nothing gets dropped on the way out.
 *
 * `views` isn't a parameter yet: View isn't real Core state (separate,
 * not-yet-scoped follow-up per `03_DOMAIN_MODEL.md`), so there's nothing
 * to gather. The output DTO still carries a `views: []` field so the
 * snapshot's shape doesn't need a breaking change once View lands — only
 * this function's signature gains a parameter.
 */

/** `HistoryEntry` with its `Date` timestamp as an ISO-8601 string — the one reshape this file does, and only for JSON-serializability (a `Date` doesn't survive `JSON.stringify` as itself). */
export interface PortableHistoryEntry {
  readonly timestamp: string;
  readonly description: string;
}

function toPortableHistory(history: readonly HistoryEntry[]): readonly PortableHistoryEntry[] {
  return history.map((entry) => ({
    timestamp: entry.timestamp.toISOString(),
    description: entry.description,
  }));
}

export interface PortableNode {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly history: readonly PortableHistoryEntry[];
  readonly blocks: readonly Block[];
  readonly tags: readonly Tag[];
  readonly references: readonly KnowledgeElementReference[];
}

/**
 * A Relationship with its origin/target Node titles inlined (ADR-0008
 * point 4: "a 1-hop read needs no join"). `originTitle`/`targetTitle` are
 * `null` when the referenced Node isn't present in the `nodes` passed to
 * `toPortableSnapshot` — including, but not limited to, a dangling
 * reference whose Node was deleted (ADR-0007 point 8). This function
 * doesn't fail or drop the Relationship in that case: a Relationship
 * surviving its endpoint's deletion is intended behavior, not corruption,
 * and the export should preserve that historical fact rather than hide it.
 */
export interface PortableRelationship {
  readonly id: string;
  readonly definitionId: string;
  readonly title: string;
  readonly visibility: Visibility;
  readonly origin: string;
  readonly originTitle: string | null;
  readonly target: string;
  readonly targetTitle: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly history: readonly PortableHistoryEntry[];
  readonly blocks: readonly Block[];
  readonly tags: readonly Tag[];
  readonly references: readonly KnowledgeElementReference[];
}

/** The export's own format version — independent of, and not to be confused with, the SQLite store's `PRAGMA user_version` (ADR-0008 point 4). */
export const PORTABLE_SNAPSHOT_SCHEMA_VERSION = 1;

export interface PortableSnapshot {
  readonly schemaVersion: number;
  /** ISO-8601 timestamp of when this snapshot was generated (ADR-0008: closes the "stale export" risk cheaply). */
  readonly exportedAt: string;
  readonly nodes: readonly PortableNode[];
  readonly relationships: readonly PortableRelationship[];
  /** Always empty until View is real Core state — see this file's header comment. */
  readonly views: readonly never[];
}

export interface ToPortableSnapshotOptions {
  /** Injectable clock for deterministic tests; defaults to `new Date()`. */
  readonly now?: () => Date;
}

function toPortableNode(node: Node): PortableNode {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    visibility: node.visibility,
    metadata: node.metadata,
    history: toPortableHistory(node.history),
    blocks: node.blocks,
    tags: node.tags,
    references: node.references,
  };
}

function toPortableRelationship(
  relationship: Relationship,
  titleById: ReadonlyMap<string, string>,
): PortableRelationship {
  return {
    id: relationship.id,
    definitionId: relationship.definitionId,
    title: relationship.title,
    visibility: relationship.visibility,
    origin: relationship.origin,
    originTitle: titleById.get(relationship.origin) ?? null,
    target: relationship.target,
    targetTitle: titleById.get(relationship.target) ?? null,
    metadata: relationship.metadata,
    history: toPortableHistory(relationship.history),
    blocks: relationship.blocks,
    tags: relationship.tags,
    references: relationship.references,
  };
}

/**
 * Builds the portable snapshot DTO. `nodes`/`relationships` should be the
 * full, current set the caller wants exported (gathering them — from
 * Storage's Query API, or however the Foundry Adapter's export action
 * assembles them — is the caller's job, not this function's).
 */
export function toPortableSnapshot(
  nodes: readonly Node[],
  relationships: readonly Relationship[],
  options: ToPortableSnapshotOptions = {},
): PortableSnapshot {
  const now = options.now ?? (() => new Date());
  const titleById = new Map(nodes.map((node) => [node.id, node.title] as const));

  return Object.freeze({
    schemaVersion: PORTABLE_SNAPSHOT_SCHEMA_VERSION,
    exportedAt: now().toISOString(),
    nodes: Object.freeze(nodes.map(toPortableNode)),
    relationships: Object.freeze(
      relationships.map((relationship) => toPortableRelationship(relationship, titleById)),
    ),
    views: Object.freeze([]),
  });
}
