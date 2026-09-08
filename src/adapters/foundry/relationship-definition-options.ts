import type { NodeType } from '../../core/domain/node.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';

/** Escapes text for safe embedding inside HTML markup (both attribute values and text content). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * RelationshipDefinition filtering for the Definition `<select>` (ADAPT-007,
 * ADR-0010 point 4; **ADR-0010 amendment, ADAPT-015**): a Definition is
 * eligible if its `validation` passes in **either** endpoint orientation, so
 * a relationship can be authored from either end (e.g. adding a member from
 * the Organization's sheet, not only the member's). It is shown disabled,
 * not removed, only when *neither* orientation validates, with its
 * `<option>` label carrying the reason. A Definition with no `validation`
 * (absent = unrestricted) is always eligible. Before either endpoint
 * resolves, the `<select>` is empty/disabled with placeholder text.
 */

/**
 * How the two resolved endpoint types line up with a Definition's
 * `validation`:
 * - `forward`  — the dropped (origin, target) validates; store as dropped.
 * - `reversed` — only (target, origin) validates; the window swaps them at save.
 * - `either`   — both orientations validate (unrestricted, or a symmetric
 *   allow-list); keep the dropped order.
 * - `none`     — neither validates; the option is disabled.
 */
export type DefinitionOrientation = 'forward' | 'reversed' | 'either' | 'none';

function validatesAs(
  definition: RelationshipDefinition,
  originType: NodeType,
  targetType: NodeType,
): boolean {
  const allowedOrigin = definition.validation?.allowedOriginTypes;
  const allowedTarget = definition.validation?.allowedTargetTypes;
  return (
    (allowedOrigin === undefined || allowedOrigin.includes(originType)) &&
    (allowedTarget === undefined || allowedTarget.includes(targetType))
  );
}

/** Pure: which orientation(s) of `(originType, targetType)` a Definition's validation accepts. */
export function resolveDefinitionOrientation(
  definition: RelationshipDefinition,
  originType: NodeType,
  targetType: NodeType,
): DefinitionOrientation {
  const forward = validatesAs(definition, originType, targetType);
  const reversed = validatesAs(definition, targetType, originType);
  if (forward && reversed) return 'either';
  if (forward) return 'forward';
  if (reversed) return 'reversed';
  return 'none';
}

export interface DefinitionOption {
  readonly definition: RelationshipDefinition;
  readonly disabled: boolean;
  /** The full `<option>` label text — includes the ineligibility reason when `disabled`. */
  readonly label: string;
  /** The orientation that will be used if this option is chosen (`'none'` iff `disabled`). */
  readonly orientation: DefinitionOrientation;
}

/** Placeholder shown while one or both endpoints haven't resolved yet (ADR-0010 point 4, last sentence). */
export const DEFINITION_SELECT_PLACEHOLDER = 'Drop both entities first';

/**
 * Builds the option list for the Definition `<select>`. Returns an empty
 * list when either endpoint type is still unknown — the caller renders
 * that as the empty/disabled placeholder state, not as "no Definitions
 * exist."
 */
export function buildDefinitionOptions(
  definitions: readonly RelationshipDefinition[],
  originType: NodeType | undefined,
  targetType: NodeType | undefined,
): readonly DefinitionOption[] {
  if (originType === undefined || targetType === undefined) {
    return [];
  }

  return definitions.map((definition) => {
    const orientation = resolveDefinitionOrientation(definition, originType, targetType);
    if (orientation !== 'none') {
      return { definition, disabled: false, label: definition.name, orientation };
    }

    // Neither orientation validates — surface the constraint against the
    // dropped order (the orientation the GM is looking at).
    const reasons: string[] = [];
    const allowedOriginTypes = definition.validation?.allowedOriginTypes;
    if (allowedOriginTypes !== undefined && !allowedOriginTypes.includes(originType)) {
      reasons.push(`requires origin type: ${allowedOriginTypes.join(', ')}`);
    }
    const allowedTargetTypes = definition.validation?.allowedTargetTypes;
    if (allowedTargetTypes !== undefined && !allowedTargetTypes.includes(targetType)) {
      reasons.push(`requires target type: ${allowedTargetTypes.join(', ')}`);
    }
    return {
      definition,
      disabled: true,
      label: `${definition.name} — ${reasons.join('; ')}`,
      orientation: 'none',
    };
  });
}

/**
 * Renders `buildDefinitionOptions`' result (or the pre-drop placeholder) as
 * the `<select>`'s inner `<option>` markup — pure string building, same
 * "content-builder function, unit-tested" split as
 * `actor-node-type-tag.ts`'s `buildNodeTypeDialogContent`. The live window
 * still owns actually setting `disabled`/replacing `innerHTML` on the real
 * `<select>` element (untestable without a real DOM) and re-invoking this
 * whenever either endpoint's resolved type changes.
 */
export function buildDefinitionSelectOptionsHTML(
  options: readonly DefinitionOption[],
  selectedDefinitionId: string | undefined,
): string {
  if (options.length === 0) {
    return `<option value="" selected disabled>${DEFINITION_SELECT_PLACEHOLDER}</option>`;
  }

  const placeholder = `<option value="" ${selectedDefinitionId === undefined ? 'selected' : ''} disabled>Select a Relationship Definition…</option>`;
  const entries = options
    .map(({ definition, disabled, label }) => {
      const selected = definition.id === selectedDefinitionId ? ' selected' : '';
      const disabledAttr = disabled ? ' disabled' : '';
      return `<option value="${escapeHtml(definition.id)}"${selected}${disabledAttr}>${escapeHtml(label)}</option>`;
    })
    .join('');

  return placeholder + entries;
}
