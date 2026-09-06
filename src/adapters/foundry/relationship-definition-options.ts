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
 * ADR-0010 point 4): "A Definition with a `validation.allowedOriginTypes`/
 * `allowedTargetTypes` that doesn't include the two resolved types is shown
 * disabled, not removed, with its `<option>` label carrying the reason ...
 * A Definition with no `validation` (absent = unrestricted) is always
 * eligible. Before either endpoint resolves, the `<select>` is
 * empty/disabled with placeholder text."
 */

export interface DefinitionOption {
  readonly definition: RelationshipDefinition;
  readonly disabled: boolean;
  /** The full `<option>` label text — includes the ineligibility reason when `disabled`. */
  readonly label: string;
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
    const reasons: string[] = [];

    const allowedOriginTypes = definition.validation?.allowedOriginTypes;
    if (allowedOriginTypes !== undefined && !allowedOriginTypes.includes(originType)) {
      reasons.push(`requires origin type: ${allowedOriginTypes.join(', ')}`);
    }

    const allowedTargetTypes = definition.validation?.allowedTargetTypes;
    if (allowedTargetTypes !== undefined && !allowedTargetTypes.includes(targetType)) {
      reasons.push(`requires target type: ${allowedTargetTypes.join(', ')}`);
    }

    const disabled = reasons.length > 0;
    const label = disabled ? `${definition.name} — ${reasons.join('; ')}` : definition.name;

    return { definition, disabled, label };
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
