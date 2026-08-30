import type { Block } from './block.js';
import type { HistoryEntry } from './history.js';
import {
  createKnowledgeElement,
  isKnowledgeElement,
  type KnowledgeElement,
} from './knowledge-element.js';
import type { KnowledgeElementReference } from './reference.js';
import type { Tag } from './tag.js';
import type { Visibility } from './visibility.js';

/**
 * Node — a standalone concept within the knowledge model
 * (docs/03_DOMAIN_MODEL.md's "Node"). Composed from KnowledgeElement plus
 * `type`, not subclassed (see knowledge-element.ts); `interface Node
 * extends KnowledgeElement` below is structural typing only.
 *
 * Note: shadows the DOM lib's global `Node`. Harmless today (this
 * package's tsconfig omits the DOM lib) — a future DOM-touching Adapter
 * should alias this import (`Node as KnowledgeNode`) rather than add "DOM"
 * to the package's own tsconfig lib.
 */

/**
 * Reference examples from docs/03_DOMAIN_MODEL.md's Node section — not a
 * closed enum (see NodeType below). `Lore` is the documented fallback for
 * an untyped page; applying it is the Foundry Adapter's job (ADAPT-001).
 */
export const KNOWN_NODE_TYPES = [
  'Character',
  'Creature',
  'City',
  'Kingdom',
  'Organization',
  'Quest',
  'Item',
  'Vehicle',
  'Event',
  'Lore',
  'Puzzle',
] as const;

/**
 * A Node's concept type (Character, City, Lore, ...). Plain string, not a
 * union of KNOWN_NODE_TYPES — 01_ARCHITECTURE.md's "Extensible" principle:
 * a new type shouldn't need a code change.
 */
export type NodeType = string;

export interface Node extends KnowledgeElement {
  readonly kind: 'node';
  /**
   * What concept this Node represents. Immutable — "Can a Node change its
   * type? No" (03_DOMAIN_MODEL.md). Nesting is a Relationship's job, not a
   * Node field ("Can Nodes be nested? No").
   */
  readonly type: NodeType;
}

export interface CreateNodeInput {
  readonly id: string;
  readonly type: NodeType;
  readonly title: string;
  readonly metadata?: Record<string, unknown>;
  readonly visibility?: Visibility;
  readonly history?: readonly HistoryEntry[];
  readonly blocks?: readonly Block[];
  readonly tags?: readonly Tag[];
  readonly references?: readonly KnowledgeElementReference[];
}

export class InvalidNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNodeError';
  }
}

/** Composes createKnowledgeElement (reusing its invariants) and adds/validates `type`. */
export function createNode(input: CreateNodeInput): Node {
  const type = input.type.trim();
  if (type.length === 0) {
    throw new InvalidNodeError('Node.type must be a non-empty string.');
  }

  const base = createKnowledgeElement({
    id: input.id,
    kind: 'node',
    title: input.title,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    ...(input.history !== undefined ? { history: input.history } : {}),
    ...(input.blocks !== undefined ? { blocks: input.blocks } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.references !== undefined ? { references: input.references } : {}),
  });

  // createKnowledgeElement's return type widens kind back to
  // KnowledgeElementKind; re-assert the literal we know it to be.
  return Object.freeze({ ...base, kind: 'node' as const, type });
}

export function isNode(value: unknown): value is Node {
  if (!isKnowledgeElement(value)) {
    return false;
  }
  const candidate = value as Partial<Node>;
  return candidate.kind === 'node' && typeof candidate.type === 'string' && candidate.type.length > 0;
}
