import { describe, expect, it } from 'vitest';
import { createView, type View } from '../../core/domain/view.js';
import {
  buildSavedViewsPanelHTML,
  filterViewsForViewer,
  sortViews,
  toSavedViewRow,
} from './saved-views.js';

const view = (
  id: string,
  title: string,
  extra: Partial<Parameters<typeof createView>[0]> = {},
): View =>
  createView({
    id,
    title,
    spec: { preset: 'curated-by-me', rootNodeId: 'Actor.hub', relationshipIds: ['r.1'] },
    ...extra,
  });

describe('sortViews', () => {
  it('orders alphabetically by title, case-insensitively', () => {
    const sorted = sortViews([view('v1', 'zephyr'), view('v2', 'Alpha'), view('v3', 'beta')]);
    expect(sorted.map((v) => v.title)).toEqual(['Alpha', 'beta', 'zephyr']);
  });
});

describe('filterViewsForViewer', () => {
  const hidden = view('h', 'Secret plot', { visibility: 'hidden' });
  const shown = view('s', 'Town map', { visibility: 'visible' });

  it('shows everything to a GM', () => {
    expect(filterViewsForViewer([hidden, shown], { isGM: true })).toHaveLength(2);
  });

  it('drops hidden Views for a non-GM', () => {
    expect(filterViewsForViewer([hidden, shown], { isGM: false }).map((v) => v.id)).toEqual(['s']);
  });
});

describe('buildSavedViewsPanelHTML', () => {
  it('renders nothing when there are no views', () => {
    expect(buildSavedViewsPanelHTML([], { isGM: true, collapsed: false })).toBe('');
  });

  it('renders a row per view with an open action, and a delete action for a GM only', () => {
    const rows = [toSavedViewRow(view('v1', 'Power map'), 'Puerto Umbral')];
    const gm = buildSavedViewsPanelHTML(rows, { isGM: true, collapsed: false });
    expect(gm).toContain('data-action="openSavedView" data-view-id="v1"');
    expect(gm).toContain('data-action="deleteSavedView" data-view-id="v1"');
    expect(gm).toContain('Curated · Puerto Umbral');

    const player = buildSavedViewsPanelHTML(rows, { isGM: false, collapsed: false });
    expect(player).toContain('data-action="openSavedView"');
    expect(player).not.toContain('data-action="deleteSavedView"');
  });

  it('reflects the collapsed state on the caret and list', () => {
    const rows = [toSavedViewRow(view('v1', 'X'), 'Root')];
    expect(buildSavedViewsPanelHTML(rows, { isGM: true, collapsed: true })).toContain(
      'aria-expanded="false"',
    );
    expect(buildSavedViewsPanelHTML(rows, { isGM: true, collapsed: true })).toContain(
      'ax-codex-views-list" hidden',
    );
  });

  it('flags a hidden view for the GM', () => {
    const rows = [toSavedViewRow(view('v1', 'X', { visibility: 'hidden' }), 'Root')];
    expect(buildSavedViewsPanelHTML(rows, { isGM: true, collapsed: false })).toContain(
      'ax-codex-view-hidden',
    );
  });
});
