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
 * Node — a standalone concept within the knowledge model (see
 * docs/03_DOMAIN_MODEL.md's "Node" section). A Node *is* a KnowledgeElement
 * plus one field (`type`) — composed via createKnowledgeElement below, not
 * subclassed (see the composition-over-inheritance note in
 * knowledge-element.ts; CONTRIBUTING_GUIDE.md Rule 5). `interface Node
 * extends KnowledgeElement` below is structural typing only — there is no
 * class, no prototype chain, no behavior to override.
 *
 * NOTE: this shadows the DOM lib's global `Node` type. Harmless today —
 * this package's tsconfig only includes the ES2022 lib, not DOM — but a
 * future Adapter that touches the DOM should import it as
 * `import type { Node as KnowledgeNode } from '.../node.js'` rather than
 * adding "DOM" to this package's own tsconfig lib.
 */

/**
 * The examples listed in docs/03_DOMAIN_MODEL.md's Node section. This is a
 * reference list, not a closed enum — see NodeType below for why. `Lore`
 * is the documented fallback for a Foundry page that doesn't fit any of
 * the others (the Node section's "Is a Foundry Journal a Node?" Decision)
 * — applying that fallback is the Foundry Adapter's job (ADAPT-001), not
 * this module's.
 */
export const KNOWN_NODE_TYPES = [
  'Character',
  'Creature',
  'City',
  'Kingdom',
  'Organization',
  'Quest',
  'Item',
  'Event',
  'Lore',
  'Puzzle',
] as const;

/**
 * A Node's concept type (Character, City, Lore, ...). Deliberately a plain
 * string, not a union of KNOWN_NODE_TYPES: 01_ARCHITECTURE.md's
 * "Extensible" design principle says a new element type shouldn't need an
 * architectural change, and the domain model introduces its type examples
 * with "Examples include", not as an exhaustive list.
 */
export type NodeType = string;

export interface Node extends KnowledgeElement {
  readonly kind: 'node';
  /**
   * What concept this Node represents. Domain Invariant: "A Node never
   * derives its identity from another Node" — type is independent of id.
   * Decision: "Can a Node change its type? No" (03_DOMAIN_MODEL.md) — this
   * field is readonly, the returned Node is frozen, and there is no
   * update function; representing a new concept means creating a new Node.
   *
   * Nesting is deliberately not representable here either ("Can Nodes be
   * nested? No" — hierarchy is a Relationship's job, not a Node field).
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

/**
 * Constructs a Node. Reuses createKnowledgeElement for every Common
 * Characteristic (id, title, metadata, visibility, history, blocks, tags,
 * references) and its Domain Invariants — composition, not duplicated
 * validation — then adds and validates Node's own `type`.
 */
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

  // base.kind is widened back to KnowledgeElementKind by createKnowledgeElement's
  // return type; re-assert the literal we know it to be ('node', passed above).
  return Object.freeze({ ...base, kind: 'node' as const, type });
}

export function isNode(value: unknown): value is Node {
  if (!isKnowledgeElement(value)) {
    return false;
  }
  const candidate = value as Partial<Node>;
  return candidate.kind === 'node' && typeof candidate.type === 'string' && candidate.type.length > 0;
}
