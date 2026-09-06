import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';

/**
 * Symmetric-vs-asymmetric display for the Relationship-authoring window
 * (ADAPT-007, ADR-0010 point 5): "the two drop-zone labels read as neutral,
 * order-independent slots" for a symmetric Definition, vs. "the drop-zone
 * labels stay Origin/Target, and the confirmation text shows both
 * directional labels together" for an asymmetric one. Pure text-building —
 * `Relationship`'s own shape always has `origin`/`target` either way
 * (CORE-003, direction is structural); only what's *displayed* changes.
 */

export interface EndpointLabels {
  readonly originLabel: string;
  readonly targetLabel: string;
}

const ASYMMETRIC_LABELS: EndpointLabels = { originLabel: 'Origin', targetLabel: 'Target' };
const SYMMETRIC_LABELS: EndpointLabels = {
  originLabel: 'First entity',
  targetLabel: 'Second entity',
};

/** `definition` is `undefined` before a Definition is selected — defaults to the asymmetric (Origin/Target) labels. */
export function resolveEndpointLabels(
  definition: RelationshipDefinition | undefined,
): EndpointLabels {
  return definition?.symmetry ? SYMMETRIC_LABELS : ASYMMETRIC_LABELS;
}

/**
 * The confirmation/summary sentence shown once both endpoints and a
 * Definition are resolved — ADR-0010 point 5's exact worked examples:
 * - Symmetric: "Kharra is ally-of the Miller family" (no forward/inverse
 *   distinction, because none exists).
 * - Asymmetric: "Kharra resides-in Puerto Umbral — Puerto Umbral is
 *   resident-of Kharra" (both directional labels shown together, so the GM
 *   can see which phrasing applies to which side without re-deriving it).
 */
export function buildRelationshipSummary(
  definition: RelationshipDefinition,
  originTitle: string,
  targetTitle: string,
): string {
  if (definition.symmetry) {
    return `${originTitle} is ${definition.name} ${targetTitle}`;
  }
  return `${originTitle} ${definition.name} ${targetTitle} — ${targetTitle} is ${definition.inverse} ${originTitle}`;
}

/**
 * The saved Relationship's own `title` field (`Relationship.title` is
 * required, CORE-003 — ADR-0010 doesn't specify how the authoring window
 * should derive it, a judgment call made here): the forward-direction
 * phrase only, without `buildRelationshipSummary`'s extra inverse clause —
 * a concise label, not the fuller two-directions confirmation text shown
 * in the window itself.
 */
export function buildRelationshipTitle(
  definition: RelationshipDefinition,
  originTitle: string,
  targetTitle: string,
): string {
  const verb = definition.symmetry ? `is ${definition.name}` : definition.name;
  return `${originTitle} ${verb} ${targetTitle}`;
}
