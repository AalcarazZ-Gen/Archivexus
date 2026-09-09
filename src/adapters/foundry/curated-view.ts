import {
  RELATIONSHIP_TRAVERSAL_CATEGORIES,
  type RelationshipDefinition,
  type RelationshipTraversalCategory,
} from '../../core/domain/relationship-definition.js';
import type { TraversalResult } from '../../core/query/traversal.js';
import { categoryLabel, UNCATEGORIZED_KEY } from './node-connections.js';

/**
 * VIEW-001f / ADR-0007 point 6 — "Curated by me" starts from the root Node's
 * **"Direct only"** result and lets the GM tick which Relationships to keep.
 * The ticked set (plus, optionally, a hand-placed node layout) is what a
 * saved `View`'s `CuratedGraphViewSpec` persists; the Nodes themselves are
 * always re-resolved live (`resolveTraversal` with `preset: 'curated-by-me'`).
 *
 * This module is the pure part: turning a "Direct only" `TraversalResult`
 * plus the `RelationshipDefinition`s into a category-grouped checklist and
 * back. No DOM, no storage, no Foundry — `graph-popout-window.ts` owns the
 * checkbox wiring, the "Save view…" prompt and capturing `cy` positions.
 */

export type CuratedCategoryKey = RelationshipTraversalCategory | typeof UNCATEGORIZED_KEY;

export interface CuratedCandidateRow {
  readonly relationshipId: string;
  readonly otherNodeId: string;
  readonly otherNodeTitle: string;
  /** Direction-correct verb relative to the root (Definition `name` when root is origin, `inverse` when target). */
  readonly verb: string;
  readonly categoryKey: CuratedCategoryKey;
  readonly included: boolean;
}

export interface CuratedCandidateGroup {
  readonly categoryKey: CuratedCategoryKey;
  readonly label: string;
  readonly rows: readonly CuratedCandidateRow[];
}

/** Every Relationship id in a "Direct only" result — the default "keep everything" curated set for a fresh View. */
export function defaultCuratedRelationshipIds(direct: TraversalResult): readonly string[] {
  return direct.relationships.map((relationship) => relationship.id);
}

/**
 * Category-grouped checklist rows for the curated editor. `direct` must be a
 * `preset: 'direct-only'` result for `rootNodeId`; a Relationship whose other
 * endpoint isn't in `direct.nodes` (dangling — ADR-0007 point 8) is skipped.
 * Groups follow the fixed taxonomy order, `Other` last; rows within a group
 * are alphabetical by the connected Node's title.
 */
export function buildCuratedCandidates(
  rootNodeId: string,
  direct: TraversalResult,
  definitionsById: ReadonlyMap<string, RelationshipDefinition>,
  includedIds: ReadonlySet<string>,
): readonly CuratedCandidateGroup[] {
  const nodesById = new Map(direct.nodes.map((node) => [node.id, node]));
  const rowsByCategory = new Map<CuratedCategoryKey, CuratedCandidateRow[]>();

  for (const relationship of direct.relationships) {
    const rootIsOrigin = relationship.origin === rootNodeId;
    const otherNodeId = rootIsOrigin ? relationship.target : relationship.origin;
    const otherNode = nodesById.get(otherNodeId);
    if (!otherNode) {
      continue;
    }
    const definition = definitionsById.get(relationship.definitionId);
    const verb = definition
      ? rootIsOrigin
        ? definition.name
        : definition.inverse
      : relationship.definitionId;
    const categoryKey: CuratedCategoryKey = definition?.traversalCategory ?? UNCATEGORIZED_KEY;

    const row: CuratedCandidateRow = {
      relationshipId: relationship.id,
      otherNodeId,
      otherNodeTitle: otherNode.title,
      verb,
      categoryKey,
      included: includedIds.has(relationship.id),
    };
    const bucket = rowsByCategory.get(categoryKey);
    if (bucket) bucket.push(row);
    else rowsByCategory.set(categoryKey, [row]);
  }

  const orderedKeys: CuratedCategoryKey[] = [
    ...RELATIONSHIP_TRAVERSAL_CATEGORIES,
    UNCATEGORIZED_KEY,
  ];
  const groups: CuratedCandidateGroup[] = [];
  for (const key of orderedKeys) {
    const rows = rowsByCategory.get(key);
    if (!rows || rows.length === 0) continue;
    groups.push({
      categoryKey: key,
      label: categoryLabel(key),
      rows: [...rows].sort((a, b) => a.otherNodeTitle.localeCompare(b.otherNodeTitle)),
    });
  }
  return groups;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The curated-editor markup: a category-grouped list of checkboxes, each
 * `data-action="toggleCurated" data-relationship-id="…"`. Pure and
 * unit-testable; the popout binds the checkboxes and the "Save view…" button
 * that sits above this.
 */
export function buildCuratedChecklistHTML(groups: readonly CuratedCandidateGroup[]): string {
  const includedCount = groups.reduce(
    (sum, group) => sum + group.rows.filter((row) => row.included).length,
    0,
  );
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);

  if (total === 0) {
    return `<p class="ax-gp-curate-empty">This Node has no direct relationships to curate yet.</p>`;
  }

  const body = groups
    .map((group) => {
      const rows = group.rows
        .map(
          (row) =>
            `<li><label class="ax-gp-curate-row">` +
            `<input type="checkbox" data-action="toggleCurated" data-relationship-id="${escapeHtml(row.relationshipId)}"${row.included ? ' checked' : ''} />` +
            ` ${escapeHtml(row.otherNodeTitle)} <em>${escapeHtml(row.verb)}</em>` +
            `</label></li>`,
        )
        .join('');
      return `<h5>${escapeHtml(group.label)}</h5><ul class="ax-gp-curate-list">${rows}</ul>`;
    })
    .join('');

  return (
    `<div class="ax-gp-curate">` +
    `<div class="ax-gp-curate-head">` +
    `<span>Curating: <strong>${includedCount}</strong>/${total} relationship(s)</span>` +
    `<button type="button" data-action="saveCuratedView">Save view…</button>` +
    `</div>` +
    body +
    `</div>`
  );
}
