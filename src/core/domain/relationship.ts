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
 * Relationship — a fact connecting exactly two Nodes
 * (docs/03_DOMAIN_MODEL.md's "Relationship"). Composed from KnowledgeElement
 * plus `origin`/`target`/`definitionId`, not subclassed (see
 * knowledge-element.ts); `interface Relationship extends KnowledgeElement`
 * below is structural typing only.
 *
 * Deliberately minimal for CORE-003: `origin`/`target` are plain Node ids
 * (no live check that they resolve to an existing Node — that's a
 * storage-layer concern, same as Node not validating its own references),
 * and `definitionId` is a plain string pointing at a Relationship
 * Definition that doesn't exist as real Core state yet (inverse,
 * cardinality, symmetry, validation, traversalCategory per ADR-0007 —
 * scoped as separate, future work). Direction isn't a separate field:
 * `origin` → `target` ordering already expresses it ("Relationships are
 * directional by default", 02_LANGUAGE.md).
 */
export interface Relationship extends KnowledgeElement {
  readonly kind: 'relationship';
  /** The Node this Relationship originates from. A Node id, not a live reference. */
  readonly origin: string;
  /** The Node this Relationship points to. A Node id, not a live reference. */
  readonly target: string;
  /**
   * The Relationship Definition governing this Relationship's behavior
   * (inverse, cardinality, symmetry, validation, traversalCategory) — "Every
   * Relationship has exactly one Relationship Definition." Just an id for
   * now; the Definition registry itself is separate, future work.
   */
  readonly definitionId: string;
}

export interface CreateRelationshipInput {
  readonly id: string;
  readonly origin: string;
  readonly target: string;
  readonly definitionId: string;
  readonly title: string;
  readonly metadata?: Record<string, unknown>;
  readonly visibility?: Visibility;
  readonly history?: readonly HistoryEntry[];
  readonly blocks?: readonly Block[];
  readonly tags?: readonly Tag[];
  readonly references?: readonly KnowledgeElementReference[];
}

export class InvalidRelationshipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRelationshipError';
  }
}

/** Composes createKnowledgeElement (reusing its invariants) and adds/validates `origin`/`target`/`definitionId`. */
export function createRelationship(input: CreateRelationshipInput): Relationship {
  const origin = input.origin.trim();
  if (origin.length === 0) {
    throw new InvalidRelationshipError('Relationship.origin must be a non-empty string.');
  }

  const target = input.target.trim();
  if (target.length === 0) {
    throw new InvalidRelationshipError('Relationship.target must be a non-empty string.');
  }

  const definitionId = input.definitionId.trim();
  if (definitionId.length === 0) {
    throw new InvalidRelationshipError('Relationship.definitionId must be a non-empty string.');
  }

  const base = createKnowledgeElement({
    id: input.id,
    kind: 'relationship',
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
  return Object.freeze({ ...base, kind: 'relationship' as const, origin, target, definitionId });
}

export function isRelationship(value: unknown): value is Relationship {
  if (!isKnowledgeElement(value)) {
    return false;
  }
  const candidate = value as Partial<Relationship>;
  return (
    candidate.kind === 'relationship' &&
    typeof candidate.origin === 'string' &&
    candidate.origin.length > 0 &&
    typeof candidate.target === 'string' &&
    candidate.target.length > 0 &&
    typeof candidate.definitionId === 'string' &&
    candidate.definitionId.length > 0
  );
}
