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
 * View — a first-class, persisted projection of existing knowledge
 * (docs/03_DOMAIN_MODEL.md's "View"). Composed from KnowledgeElement plus
 * `format`/`spec`, not subclassed (see knowledge-element.ts); `interface
 * View extends KnowledgeElement` below is structural typing only.
 *
 * Scope for CORE-006 (`decisions/ADR-0014-graph-view-sidebar-tab.md`): the
 * Core shape only — the Foundry sidebar tab, Cytoscape rendering and the
 * "Curated by me" pruning UI are all VIEW-001a/VIEW-001b's job, in the
 * Adapter, not here.
 *
 * A View never owns knowledge: `spec` records only *which* preset and root
 * Node a GM saved (plus, for "Curated by me" only, the curated Relationship
 * ids and an optional hand-placed layout) — the Nodes/Relationships
 * themselves are re-resolved live against `src/core/query/traversal.ts`
 * (CORE-005) on every load. This is what satisfies the "A View's content is
 * always derivable from current Knowledge Elements" Domain Invariant with
 * no extra effort (ADR-0007 point 7 / ADR-0014 point 6).
 */

/**
 * A View's rendering format. Deliberately a plain closed-union of one value,
 * not a registry/`ViewDefinition` entity — same "don't build a registry for
 * a single case" reasoning as `NodeType`'s plain-string decision
 * (ADR-0014 point 6b). Revisit when a second format (Timeline is the likely
 * next candidate, per `02_LANGUAGE.md`) has a real, named use case.
 */
export const VIEW_FORMATS = ['graph'] as const;

export type ViewFormat = (typeof VIEW_FORMATS)[number];

/**
 * The traversal presets a graph View can be saved against (ADR-0007 point 6
 * / ADR-0014 point 6). Must stay in sync with
 * `src/core/query/traversal.ts`'s `TRAVERSAL_PRESETS` (CORE-005) — a saved
 * View's preset is resolved through that engine. Kept as its own literal set
 * here, not imported, to keep `core/domain` free of a dependency on
 * `core/query` (the same non-dependency `relationship-definition.ts` keeps
 * from the traversal engine).
 */
export const GRAPH_VIEW_PRESETS = ['direct-only', 'everything-connected', 'curated-by-me'] as const;

export type GraphViewPreset = (typeof GRAPH_VIEW_PRESETS)[number];

/** A saved node position in a "Curated by me" layout — an id-keyed `{x, y}` map, the one shape borrowed from the Obsidian Canvas spec (ADR-0014 point 6). */
export interface GraphViewNodePosition {
  readonly x: number;
  readonly y: number;
}

/**
 * "Direct only" / "Everything connected" persist only the preset and the
 * root Node — nothing that must actually be saved, since both re-resolve
 * live against CORE-005 on every load.
 */
export interface DerivedGraphViewSpec {
  readonly preset: 'direct-only' | 'everything-connected';
  readonly rootNodeId: string;
}

/**
 * "Curated by me" is the only spec carrying saved content: the GM's curated
 * Relationship-id set (per ADR-0007 point 6, expected to be drawn from this
 * same root Node's "Direct only" result) and, optionally, a hand-placed
 * node layout (presentation metadata over already-derivable content, ADR-0007
 * point 7 — not new knowledge).
 */
export interface CuratedGraphViewSpec {
  readonly preset: 'curated-by-me';
  readonly rootNodeId: string;
  readonly relationshipIds: readonly string[];
  readonly layout?: Readonly<Record<string, GraphViewNodePosition>>;
}

export type GraphViewSpec = DerivedGraphViewSpec | CuratedGraphViewSpec;

export interface View extends KnowledgeElement {
  readonly kind: 'view';
  readonly format: ViewFormat;
  readonly spec: GraphViewSpec;
}

export interface CreateViewInput {
  readonly id: string;
  readonly title: string;
  /** Optional — defaults to the only current format, `'graph'`. */
  readonly format?: ViewFormat;
  readonly spec: GraphViewSpec;
  readonly metadata?: Record<string, unknown>;
  readonly visibility?: Visibility;
  readonly history?: readonly HistoryEntry[];
  readonly blocks?: readonly Block[];
  readonly tags?: readonly Tag[];
  readonly references?: readonly KnowledgeElementReference[];
}

export class InvalidViewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidViewError';
  }
}

const DEFAULT_FORMAT: ViewFormat = 'graph';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeRelationshipIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new InvalidViewError(
      'GraphViewSpec.relationshipIds must be an array of Relationship ids for a "curated-by-me" View.',
    );
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      throw new InvalidViewError('GraphViewSpec.relationshipIds must not contain empty entries.');
    }
    const trimmed = entry.trim();
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      ids.push(trimmed);
    }
  }
  return Object.freeze(ids);
}

function normalizeLayout(
  value: unknown,
): Readonly<Record<string, GraphViewNodePosition>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidViewError(
      'GraphViewSpec.layout, if provided, must be an object keyed by Node id.',
    );
  }
  const layout: Record<string, GraphViewNodePosition> = {};
  for (const [nodeId, position] of Object.entries(value)) {
    if (nodeId.trim().length === 0) {
      throw new InvalidViewError('GraphViewSpec.layout must not use an empty Node id as a key.');
    }
    if (
      typeof position !== 'object' ||
      position === null ||
      !isFiniteNumber((position as Partial<GraphViewNodePosition>).x) ||
      !isFiniteNumber((position as Partial<GraphViewNodePosition>).y)
    ) {
      throw new InvalidViewError(
        `GraphViewSpec.layout["${nodeId}"] must be a { x, y } pair of finite numbers.`,
      );
    }
    layout[nodeId.trim()] = Object.freeze({
      x: (position as GraphViewNodePosition).x,
      y: (position as GraphViewNodePosition).y,
    });
  }
  return Object.freeze(layout);
}

/**
 * Validates and freezes a `GraphViewSpec`. Beyond the per-field checks,
 * enforces the two cross-field invariants the discriminated union implies
 * (same spirit as `relationship-definition.ts`'s symmetry/inverse checks):
 * a derived preset ("direct-only"/"everything-connected") must NOT carry
 * `relationshipIds`/`layout` (it has nothing to save), and "curated-by-me"
 * MUST carry `relationshipIds`.
 */
function normalizeSpec(spec: GraphViewSpec): GraphViewSpec {
  if (typeof spec !== 'object' || spec === null) {
    throw new InvalidViewError('View.spec must be an object.');
  }

  if (!GRAPH_VIEW_PRESETS.includes(spec.preset)) {
    throw new InvalidViewError(
      `GraphViewSpec.preset must be one of ${GRAPH_VIEW_PRESETS.join(', ')}, got "${String(spec.preset)}".`,
    );
  }

  const rootNodeId = typeof spec.rootNodeId === 'string' ? spec.rootNodeId.trim() : '';
  if (rootNodeId.length === 0) {
    throw new InvalidViewError('GraphViewSpec.rootNodeId must be a non-empty Node id.');
  }

  if (spec.preset === 'curated-by-me') {
    const relationshipIds = normalizeRelationshipIds(
      (spec as Partial<CuratedGraphViewSpec>).relationshipIds,
    );
    const layout = normalizeLayout((spec as Partial<CuratedGraphViewSpec>).layout);
    return Object.freeze({
      preset: 'curated-by-me' as const,
      rootNodeId,
      relationshipIds,
      ...(layout !== undefined ? { layout } : {}),
    });
  }

  if ('relationshipIds' in spec || 'layout' in spec) {
    throw new InvalidViewError(
      `GraphViewSpec with preset "${spec.preset}" must not carry relationshipIds/layout — those belong only to "curated-by-me".`,
    );
  }
  return Object.freeze({ preset: spec.preset, rootNodeId });
}

/** Composes createKnowledgeElement (reusing its invariants) and adds/validates `format`/`spec`. */
export function createView(input: CreateViewInput): View {
  const format = input.format ?? DEFAULT_FORMAT;
  if (!VIEW_FORMATS.includes(format)) {
    throw new InvalidViewError(
      `View.format must be one of ${VIEW_FORMATS.join(', ')}, got "${String(format)}".`,
    );
  }

  const spec = normalizeSpec(input.spec);

  const base = createKnowledgeElement({
    id: input.id,
    kind: 'view',
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
  return Object.freeze({ ...base, kind: 'view' as const, format, spec });
}

export function isGraphViewSpec(value: unknown): value is GraphViewSpec {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<CuratedGraphViewSpec>;
  if (
    typeof candidate.preset !== 'string' ||
    !GRAPH_VIEW_PRESETS.includes(candidate.preset as GraphViewPreset) ||
    typeof candidate.rootNodeId !== 'string' ||
    candidate.rootNodeId.length === 0
  ) {
    return false;
  }
  if (candidate.preset === 'curated-by-me') {
    return (
      Array.isArray(candidate.relationshipIds) &&
      candidate.relationshipIds.every((id) => typeof id === 'string' && id.length > 0)
    );
  }
  return candidate.relationshipIds === undefined && candidate.layout === undefined;
}

export function isView(value: unknown): value is View {
  if (!isKnowledgeElement(value)) {
    return false;
  }
  const candidate = value as Partial<View>;
  return (
    candidate.kind === 'view' &&
    typeof candidate.format === 'string' &&
    VIEW_FORMATS.includes(candidate.format as ViewFormat) &&
    isGraphViewSpec(candidate.spec)
  );
}
