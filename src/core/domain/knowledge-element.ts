import type { Block } from './block.js';
import type { HistoryEntry } from './history.js';
import type { KnowledgeElementReference } from './reference.js';
import type { Tag } from './tag.js';
import { isVisibility, type Visibility } from './visibility.js';

/**
 * KnowledgeElement — the base abstraction of Archivexus (see
 * docs/01_ARCHITECTURE.md's "Knowledge Elements" section and
 * docs/03_DOMAIN_MODEL.md's "Knowledge Element" section).
 *
 * Every managed piece of knowledge derives from this concept. Per the
 * domain model's Decision ("Do Knowledge Elements expose their
 * capabilities directly, or through composable behaviors?" → Directly),
 * this is one flat shape, not assembled from mixins/traits — the
 * type-specific variability (a simple Item vs. a complex City) is absorbed
 * by Blocks (content) and Relationships (structure), not the base
 * contract. Node, Relationship and View (CORE-002 and beyond) are built by
 * *composing* this shape with their own additional fields — composition
 * over inheritance (CONTRIBUTING_GUIDE.md, Rule 5) — not by subclassing it.
 */

/**
 * The three branches of the Domain Hierarchy (docs/03_DOMAIN_MODEL.md).
 * Fixed by the domain model as it stands today; a future domain concept
 * that legitimately needs a new branch is a domain-model change, not
 * something a caller should be able to spell by passing an arbitrary
 * string here.
 */
export type KnowledgeElementKind = 'node' | 'relationship' | 'view';

export interface KnowledgeElement {
  /**
   * Unique identifier. Opaque to the base abstraction — *how* an id is
   * produced (a Foundry UUID vs. an Archivexus-internal id) is decided per
   * concrete type/adapter by ADR-0001, not here.
   */
  readonly id: string;
  readonly kind: KnowledgeElementKind;
  /** Human-readable title (Domain Invariant: every element has one). */
  readonly title: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly visibility: Visibility;
  readonly history: readonly HistoryEntry[];
  readonly blocks: readonly Block[];
  readonly tags: readonly Tag[];
  readonly references: readonly KnowledgeElementReference[];
}

/**
 * Default Visibility for a newly created Knowledge Element when none is
 * given. Not specified by the domain model — chosen fail-closed (GM-only)
 * rather than fail-open, matching how ADR-0003 treats Foundry's own
 * ambiguous `LIMITED` tier (→ `hidden`, not `visible`). Worth a domain
 * Decision entry if this default ever needs to be relied on by more than
 * one call site.
 */
export const DEFAULT_VISIBILITY: Visibility = 'hidden';

export interface CreateKnowledgeElementInput {
  readonly id: string;
  readonly kind: KnowledgeElementKind;
  readonly title: string;
  readonly metadata?: Record<string, unknown>;
  readonly visibility?: Visibility;
  readonly history?: readonly HistoryEntry[];
  readonly blocks?: readonly Block[];
  readonly tags?: readonly Tag[];
  readonly references?: readonly KnowledgeElementReference[];
}

export class InvalidKnowledgeElementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidKnowledgeElementError';
  }
}

const KNOWLEDGE_ELEMENT_KINDS: readonly KnowledgeElementKind[] = ['node', 'relationship', 'view'];

/**
 * Constructs a KnowledgeElement, enforcing the Domain Invariants from
 * docs/03_DOMAIN_MODEL.md:
 *  - has a unique identifier (non-empty `id`; uniqueness itself is a
 *    storage/repository concern, out of scope for this pure factory)
 *  - has a human-readable title (non-empty `title`)
 *  - belongs to exactly one domain type (`kind`, required)
 *  - may exist without additional content (blocks default to `[]`)
 *  - may exist without Relationships (nothing here requires one — a
 *    Knowledge Element never holds a reference to "its" Relationships)
 *
 * Collections are defensively copied and frozen so the returned value
 * can't be mutated out from under callers holding a reference to it.
 */
export function createKnowledgeElement(input: CreateKnowledgeElementInput): KnowledgeElement {
  const id = input.id.trim();
  if (id.length === 0) {
    throw new InvalidKnowledgeElementError('KnowledgeElement.id must be a non-empty string.');
  }

  if (!KNOWLEDGE_ELEMENT_KINDS.includes(input.kind)) {
    throw new InvalidKnowledgeElementError(
      `KnowledgeElement.kind must be one of ${KNOWLEDGE_ELEMENT_KINDS.join(', ')}, got "${String(input.kind)}".`,
    );
  }

  const title = input.title.trim();
  if (title.length === 0) {
    throw new InvalidKnowledgeElementError('KnowledgeElement.title must be a non-empty string.');
  }

  if (input.visibility !== undefined && !isVisibility(input.visibility)) {
    throw new InvalidKnowledgeElementError(
      `KnowledgeElement.visibility must be one of hidden, visible, owned, got "${String(input.visibility)}".`,
    );
  }

  return Object.freeze({
    id,
    kind: input.kind,
    title,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    visibility: input.visibility ?? DEFAULT_VISIBILITY,
    history: Object.freeze([...(input.history ?? [])]),
    blocks: Object.freeze([...(input.blocks ?? [])]),
    tags: Object.freeze([...(input.tags ?? [])]),
    references: Object.freeze([...(input.references ?? [])]),
  });
}

export function isKnowledgeElement(value: unknown): value is KnowledgeElement {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<KnowledgeElement>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.kind === 'string' &&
    KNOWLEDGE_ELEMENT_KINDS.includes(candidate.kind as KnowledgeElementKind) &&
    typeof candidate.title === 'string' &&
    candidate.title.length > 0 &&
    isVisibility(candidate.visibility) &&
    Array.isArray(candidate.history) &&
    Array.isArray(candidate.blocks) &&
    Array.isArray(candidate.tags) &&
    Array.isArray(candidate.references)
  );
}
