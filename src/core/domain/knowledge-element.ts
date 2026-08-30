import type { Block } from './block.js';
import type { HistoryEntry } from './history.js';
import type { KnowledgeElementReference } from './reference.js';
import type { Tag } from './tag.js';
import { isVisibility, type Visibility } from './visibility.js';

/**
 * Base abstraction of Archivexus (docs/03_DOMAIN_MODEL.md). One flat shape,
 * not mixins/traits (see the Decision there) — Node/Relationship/View
 * compose this shape rather than subclass it (Rule 5: composition over
 * inheritance, CONTRIBUTING_GUIDE.md).
 */
export type KnowledgeElementKind = 'node' | 'relationship' | 'view';

export interface KnowledgeElement {
  /** Opaque here — how it's produced (Foundry UUID, internal id, ...) is an adapter/ADR-0001 concern. */
  readonly id: string;
  readonly kind: KnowledgeElementKind;
  readonly title: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly visibility: Visibility;
  readonly history: readonly HistoryEntry[];
  readonly blocks: readonly Block[];
  readonly tags: readonly Tag[];
  readonly references: readonly KnowledgeElementReference[];
}

/** Fail-closed default when none is given — matches how ADR-0003 treats ambiguous input. */
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

/** Enforces the Domain Invariants (docs/03_DOMAIN_MODEL.md); collections are copied and frozen. */
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
