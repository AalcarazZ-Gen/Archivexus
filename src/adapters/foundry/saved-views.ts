import type { View } from '../../core/domain/view.js';

/**
 * VIEW-001f — the saved-Views list shown in the Codex sidebar navigator.
 * Pure: sorting, the ADR-0003 visibility filter, and the list markup.
 * `codex-sidebar-tab.ts` calls `storage.listViews()`, resolves each View's
 * root-Node title, and renders this; a row opens the popout on that View
 * (`openGraphPopout(…, { viewId })`) or deletes it.
 */

const PRESET_LABELS: Readonly<Record<string, string>> = {
  'direct-only': 'Direct',
  'everything-connected': 'Everything',
  'curated-by-me': 'Curated',
};

export interface SavedViewRow {
  readonly id: string;
  readonly title: string;
  /** A short preset label — "Direct" / "Everything" / "Curated". */
  readonly presetLabel: string;
  /** The View's root Node's current title, or its raw id if that Node is gone. */
  readonly rootLabel: string;
  readonly hidden: boolean;
}

/** Alphabetical by title (case-insensitive), stable. */
export function sortViews(views: readonly View[]): readonly View[] {
  return [...views].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Drops `hidden` Views for a non-GM (ADR-0003) — a GM sees all, with the
 * hidden ones flagged. `visible`/`owned` Views show for everyone.
 */
export function filterViewsForViewer(
  views: readonly View[],
  options: { readonly isGM: boolean },
): readonly View[] {
  if (options.isGM) {
    return views;
  }
  return views.filter((view) => view.visibility !== 'hidden');
}

export function toSavedViewRow(view: View, rootLabel: string): SavedViewRow {
  return {
    id: view.id,
    title: view.title,
    presetLabel: PRESET_LABELS[view.spec.preset] ?? view.spec.preset,
    rootLabel,
    hidden: view.visibility === 'hidden',
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The collapsible "Saved views" panel. Empty → nothing renders (no dead
 * chrome in the navigator). Each row: open button + (GM only) a ✕ delete.
 */
export function buildSavedViewsPanelHTML(
  rows: readonly SavedViewRow[],
  options: { readonly isGM: boolean; readonly collapsed: boolean },
): string {
  if (rows.length === 0) {
    return '';
  }
  const items = rows
    .map((row) => {
      const hiddenMark = row.hidden
        ? ` <span class="ax-codex-view-hidden" title="Hidden from players">◻</span>`
        : '';
      const del = options.isGM
        ? `<button type="button" class="ax-codex-view-del" data-action="deleteSavedView" data-view-id="${escapeHtml(row.id)}" title="Delete this saved view">✕</button>`
        : '';
      return (
        `<li class="ax-codex-view-row">` +
        `<button type="button" class="ax-codex-view-open" data-action="openSavedView" data-view-id="${escapeHtml(row.id)}" title="Open “${escapeHtml(row.title)}” rooted on ${escapeHtml(row.rootLabel)}">` +
        `${escapeHtml(row.title)} <span class="ax-codex-view-meta">${escapeHtml(row.presetLabel)} · ${escapeHtml(row.rootLabel)}</span>${hiddenMark}` +
        `</button>${del}` +
        `</li>`
      );
    })
    .join('');

  return (
    `<section class="ax-codex-views" data-role="saved-views-panel">` +
    `<button type="button" class="ax-codex-views-header" data-action="toggleSavedViews" aria-expanded="${options.collapsed ? 'false' : 'true'}">` +
    `<span class="ax-codex-views-caret">${options.collapsed ? '▸' : '▾'}</span> Saved views <span class="ax-codex-views-count">${rows.length}</span>` +
    `</button>` +
    `<ul class="ax-codex-views-list"${options.collapsed ? ' hidden' : ''}>${items}</ul>` +
    `</section>`
  );
}
