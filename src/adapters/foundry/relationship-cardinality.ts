import type { Relationship } from '../../core/domain/relationship.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';

/**
 * Cardinality-conflict detection for the Relationship-authoring window
 * (ADAPT-007, ADR-0010 point 6): "Before saving, the window runs a real
 * check ... using `StorageProvider.getRelationshipsForNode` ... against
 * whichever endpoint(s) the selected Definition's `cardinality`
 * constrains ... If a conflicting Relationship under the same Definition
 * already exists on a constrained side, the window shows a clear,
 * specific, non-blocking inline warning." Warn, never block — this module
 * only ever *detects/describes* a conflict; the live window decides never
 * to use that to disable Save (relabels it "Save anyway" instead).
 *
 * Judgment call (not spelled out anywhere — `RelationshipDefinition`'s own
 * doc comment only says cardinality governs "how many Relationships of
 * this Definition an origin vs. a target Node may have", `RELATIONSHIP_
 * CARDINALITIES`'s four values aren't individually defined further):
 * `cardinality` is read as "{origin multiplicity}-to-{target multiplicity}",
 * matching the field order origin-then-target CORE-004's own doc comment
 * uses. "one" on a side means a Node may have at most one Relationship
 * under this Definition while playing that role; "many" means unconstrained.
 * So `one-to-many` constrains only the origin side, `many-to-one` only the
 * target side, `one-to-one` both, `many-to-many` neither (a Definition with
 * `many-to-many` cardinality can never produce a conflict here). This
 * reading is what makes ADR-0010 point 6's own worked example line up:
 * "Kharra already has a resides-in relationship to Villa Alta" is a
 * same-*origin* conflict (Kharra, the origin, already has one), which only
 * makes sense if `resides-in`'s cardinality constrains the origin side —
 * i.e. `one-to-many` under this reading (see
 * `core/domain/relationship-definitions-default.ts`'s `resides-in` entry).
 */

export type CardinalitySide = 'origin' | 'target';

export interface CardinalityConflict {
  readonly side: CardinalitySide;
  readonly conflictingRelationship: Relationship;
}

function isOriginConstrained(definition: RelationshipDefinition): boolean {
  return definition.cardinality === 'one-to-one' || definition.cardinality === 'one-to-many';
}

function isTargetConstrained(definition: RelationshipDefinition): boolean {
  return definition.cardinality === 'one-to-one' || definition.cardinality === 'many-to-one';
}

/**
 * Looks for an existing Relationship that would conflict with a new one
 * under `definition` between `originId` and `targetId`. `relationshipsFor
 * Origin`/`relationshipsForTarget` are each endpoint's own
 * `StorageProvider.getRelationshipsForNode` result (ADR-0007's 1-hop
 * primitive) — fetched by the live window, passed in here so this stays a
 * pure function over plain data.
 *
 * Only ever reports the *first* conflict found (origin checked before
 * target) — one specific, actionable warning beats enumerating every
 * existing Relationship that happens to also conflict.
 */
export function findCardinalityConflict(
  definition: RelationshipDefinition,
  originId: string,
  targetId: string,
  relationshipsForOrigin: readonly Relationship[],
  relationshipsForTarget: readonly Relationship[],
): CardinalityConflict | undefined {
  if (isOriginConstrained(definition)) {
    const conflict = relationshipsForOrigin.find(
      (relationship) =>
        relationship.definitionId === definition.id && relationship.origin === originId,
    );
    if (conflict) {
      return { side: 'origin', conflictingRelationship: conflict };
    }
  }

  if (isTargetConstrained(definition)) {
    const conflict = relationshipsForTarget.find(
      (relationship) =>
        relationship.definitionId === definition.id && relationship.target === targetId,
    );
    if (conflict) {
      return { side: 'target', conflictingRelationship: conflict };
    }
  }

  return undefined;
}

/**
 * Builds the inline warning text (ADR-0010 point 6's exact phrasing style:
 * "Kharra already has a resides-in relationship to Villa Alta. Saving this
 * will add a second one."). `resolveTitle` looks up a Node id's display
 * title (the live window backs this with `StorageProvider.getNode`, since
 * the conflicting Relationship's *other* endpoint is generally neither of
 * the two Nodes currently being authored) — passed in so this stays pure
 * and testable with a plain stub instead of a real, async storage call.
 */
export function buildCardinalityWarningMessage(
  definition: RelationshipDefinition,
  conflict: CardinalityConflict,
  resolveTitle: (nodeId: string) => string,
): string {
  const { conflictingRelationship } = conflict;

  if (conflict.side === 'origin') {
    const originTitle = resolveTitle(conflictingRelationship.origin);
    const existingTargetTitle = resolveTitle(conflictingRelationship.target);
    return `${originTitle} already has a ${definition.name} relationship to ${existingTargetTitle}. Saving this will add a second one.`;
  }

  const targetTitle = resolveTitle(conflictingRelationship.target);
  const existingOriginTitle = resolveTitle(conflictingRelationship.origin);
  return `${targetTitle} already has a ${definition.inverse} relationship to ${existingOriginTitle}. Saving this will add a second one.`;
}
