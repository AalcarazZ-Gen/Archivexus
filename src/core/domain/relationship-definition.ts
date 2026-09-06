import type { NodeType } from './node.js';

/**
 * Relationship Definition — a reusable domain rule governing how a
 * Relationship *type* behaves (docs/03_DOMAIN_MODEL.md's "Definitions"
 * section, `02_LANGUAGE.md`'s "Relationship Definition" entry). Deliberately
 * does NOT compose `KnowledgeElement` — "Definitions are not Knowledge
 * Elements" (03_DOMAIN_MODEL.md's Definitions Domain Invariants): it has no
 * title/visibility/history/Blocks/tags/references, only identity plus the
 * behavior it governs. `createRelationshipDefinition`/`isRelationshipDefinition`
 * mirror `createNode`/`isNode`'s validating-factory style (CORE-002/CORE-003)
 * as a code convention only, not composition.
 *
 * `Relationship.definitionId` (CORE-003) stays a plain string reference —
 * this module doesn't change Relationship's own shape, it only gives that id
 * something real to point at.
 */

/**
 * Starter taxonomy from ADR-0007 — small and *closed* (unlike NodeType,
 * which is deliberately open per 01_ARCHITECTURE.md's Extensible principle):
 * "closed except for a deliberate migration". Category lives on the
 * Definition, not each Relationship instance, so a taxonomy change stays
 * bounded to a small number of Definitions.
 */
export const RELATIONSHIP_TRAVERSAL_CATEGORIES = [
  'location',
  'affiliation',
  'kinship',
  'conflict',
  'governance',
  'participation',
  'ownership',
  'narrative',
] as const;

export type RelationshipTraversalCategory = (typeof RELATIONSHIP_TRAVERSAL_CATEGORIES)[number];

/**
 * Judgment call (not specified by any ADR/domain-model text — see
 * CORE-004's report): how many Relationships of this Definition an origin
 * vs. a target Node may have. A closed enum, same reasoning as
 * `traversalCategory` — this is a small, slow-changing vocabulary describing
 * behavior, not campaign content.
 */
export const RELATIONSHIP_CARDINALITIES = [
  'one-to-one',
  'one-to-many',
  'many-to-one',
  'many-to-many',
] as const;

export type RelationshipCardinality = (typeof RELATIONSHIP_CARDINALITIES)[number];

/**
 * Judgment call (see CORE-004's report): the "validation rules" 02_LANGUAGE.md
 * names but never shapes. Modeled as an optional allow-list of Node types for
 * each endpoint — optional/absent means "no restriction", per the Optional
 * Structure principle (a Definition is never blocked from existing just
 * because this ticket didn't anticipate its use case).
 */
export interface RelationshipDefinitionValidation {
  readonly allowedOriginTypes?: readonly NodeType[];
  readonly allowedTargetTypes?: readonly NodeType[];
}

export interface RelationshipDefinition {
  readonly id: string;
  /** Forward-direction label, e.g. "resides-in". */
  readonly name: string;
  /** "Should Definitions be versioned? Yes" (03_DOMAIN_MODEL.md). Migration itself is an open question, out of scope here. */
  readonly version: number;
  /** Reverse-direction label, e.g. "resident-of". "Should every Relationship have an inverse? Yes." */
  readonly inverse: string;
  readonly cardinality: RelationshipCardinality;
  /** Whether the forward and inverse direction describe the same fact (e.g. "ally-of"). */
  readonly symmetry: boolean;
  /** ADR-0007: what View traversal presets group/filter this Definition by. */
  readonly traversalCategory: RelationshipTraversalCategory;
  readonly validation?: RelationshipDefinitionValidation;
}

export interface CreateRelationshipDefinitionInput {
  readonly id: string;
  readonly name: string;
  readonly version?: number;
  readonly inverse: string;
  readonly cardinality: RelationshipCardinality;
  readonly symmetry: boolean;
  readonly traversalCategory: RelationshipTraversalCategory;
  readonly validation?: RelationshipDefinitionValidation;
}

export class InvalidRelationshipDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRelationshipDefinitionError';
  }
}

const DEFAULT_VERSION = 1;

function normalizeValidation(
  validation: RelationshipDefinitionValidation | undefined,
): RelationshipDefinitionValidation | undefined {
  if (validation === undefined) {
    return undefined;
  }

  const normalizeTypeList = (
    label: 'allowedOriginTypes' | 'allowedTargetTypes',
    types: readonly NodeType[] | undefined,
  ): readonly NodeType[] | undefined => {
    if (types === undefined) {
      return undefined;
    }
    if (types.length === 0) {
      throw new InvalidRelationshipDefinitionError(
        `RelationshipDefinition.validation.${label}, if provided, must not be empty.`,
      );
    }
    return Object.freeze(
      types.map((type) => {
        const trimmed = type.trim();
        if (trimmed.length === 0) {
          throw new InvalidRelationshipDefinitionError(
            `RelationshipDefinition.validation.${label} must not contain empty entries.`,
          );
        }
        return trimmed;
      }),
    );
  };

  const allowedOriginTypes = normalizeTypeList('allowedOriginTypes', validation.allowedOriginTypes);
  const allowedTargetTypes = normalizeTypeList('allowedTargetTypes', validation.allowedTargetTypes);

  return Object.freeze({
    ...(allowedOriginTypes !== undefined ? { allowedOriginTypes } : {}),
    ...(allowedTargetTypes !== undefined ? { allowedTargetTypes } : {}),
  });
}

/**
 * Validates and freezes a RelationshipDefinition. Beyond the per-field
 * checks, enforces two cross-field invariants that aren't stated verbatim in
 * any doc but follow directly from what "symmetry" and "inverse" mean as
 * domain concepts (flagged as a judgment call in CORE-004's report, same
 * spirit as CORE-003's self-relationship catch):
 *
 * - A symmetric Definition (forward and inverse describe the same fact, e.g.
 *   "ally-of") must use the same label for both directions — `inverse` must
 *   equal `name`. A non-symmetric Definition must NOT reuse the same label
 *   for both directions, or it would claim asymmetry while being unable to
 *   express it.
 * - A symmetric Definition can't have an asymmetric cardinality
 *   (`one-to-many`/`many-to-one`): those shapes distinguish an origin-side
 *   count from a target-side count, which only makes sense when origin and
 *   target aren't interchangeable.
 */
export function createRelationshipDefinition(
  input: CreateRelationshipDefinitionInput,
): RelationshipDefinition {
  const id = input.id.trim();
  if (id.length === 0) {
    throw new InvalidRelationshipDefinitionError(
      'RelationshipDefinition.id must be a non-empty string.',
    );
  }

  const name = input.name.trim();
  if (name.length === 0) {
    throw new InvalidRelationshipDefinitionError(
      'RelationshipDefinition.name must be a non-empty string.',
    );
  }

  const inverse = input.inverse.trim();
  if (inverse.length === 0) {
    throw new InvalidRelationshipDefinitionError(
      'RelationshipDefinition.inverse must be a non-empty string.',
    );
  }

  const version = input.version ?? DEFAULT_VERSION;
  if (!Number.isInteger(version) || version < 1) {
    throw new InvalidRelationshipDefinitionError(
      `RelationshipDefinition.version must be an integer >= 1, got "${String(version)}".`,
    );
  }

  if (!RELATIONSHIP_CARDINALITIES.includes(input.cardinality)) {
    throw new InvalidRelationshipDefinitionError(
      `RelationshipDefinition.cardinality must be one of ${RELATIONSHIP_CARDINALITIES.join(', ')}, got "${String(input.cardinality)}".`,
    );
  }

  if (typeof input.symmetry !== 'boolean') {
    throw new InvalidRelationshipDefinitionError(
      `RelationshipDefinition.symmetry must be a boolean, got "${String(input.symmetry)}".`,
    );
  }

  if (!RELATIONSHIP_TRAVERSAL_CATEGORIES.includes(input.traversalCategory)) {
    throw new InvalidRelationshipDefinitionError(
      `RelationshipDefinition.traversalCategory must be one of ${RELATIONSHIP_TRAVERSAL_CATEGORIES.join(', ')}, got "${String(input.traversalCategory)}".`,
    );
  }

  if (input.symmetry) {
    if (inverse !== name) {
      throw new InvalidRelationshipDefinitionError(
        'A symmetric RelationshipDefinition must use the same label for both directions: inverse must equal name.',
      );
    }
    if (input.cardinality === 'one-to-many' || input.cardinality === 'many-to-one') {
      throw new InvalidRelationshipDefinitionError(
        `A symmetric RelationshipDefinition cannot use an asymmetric cardinality ("${input.cardinality}"); use "one-to-one" or "many-to-many".`,
      );
    }
  } else if (inverse === name) {
    throw new InvalidRelationshipDefinitionError(
      'A non-symmetric RelationshipDefinition must have an inverse label distinct from its name.',
    );
  }

  const validation = normalizeValidation(input.validation);

  return Object.freeze({
    id,
    name,
    version,
    inverse,
    cardinality: input.cardinality,
    symmetry: input.symmetry,
    traversalCategory: input.traversalCategory,
    ...(validation !== undefined ? { validation } : {}),
  });
}

export function isRelationshipDefinition(value: unknown): value is RelationshipDefinition {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<RelationshipDefinition>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.version === 'number' &&
    Number.isInteger(candidate.version) &&
    candidate.version >= 1 &&
    typeof candidate.inverse === 'string' &&
    candidate.inverse.length > 0 &&
    typeof candidate.cardinality === 'string' &&
    RELATIONSHIP_CARDINALITIES.includes(candidate.cardinality as RelationshipCardinality) &&
    typeof candidate.symmetry === 'boolean' &&
    typeof candidate.traversalCategory === 'string' &&
    RELATIONSHIP_TRAVERSAL_CATEGORIES.includes(
      candidate.traversalCategory as RelationshipTraversalCategory,
    )
  );
}

/**
 * The minimal Core "resolve a Relationship's definition" query surface this
 * ticket needs (issue #39, scope item 4) — a plain lookup by id over an
 * in-memory collection. Deliberately not a stateful registry/storage-backed
 * repository (that's STORE-003's Storage Provider's concern, and it's an
 * optional stretch for this ticket) and not the View Query API/traversal
 * engine (out of scope, separate future work).
 */
export function resolveRelationshipDefinition(
  definitions: readonly RelationshipDefinition[],
  definitionId: string,
): RelationshipDefinition | undefined {
  return definitions.find((definition) => definition.id === definitionId);
}
