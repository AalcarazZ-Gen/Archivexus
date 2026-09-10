/**
 * ADAPT-013 — the **one** style source for every Archivexus surface, per
 * ADR-0014 Amendment 2 decision 4 (an injected `<style>` module, not a
 * `module.json` styles asset — the hand-run build stays a single
 * `archivexus.js` emit, ADR-0006).
 *
 * Before this ticket each surface injected its own `<style>` with a
 * divergent prefix (`.archivexus-codex-*`, `.ax-gp-*`, `.archivexus-console-*`,
 * …) and its own hardcoded hex; the popout preset toggle read as broken
 * (a bare underline), graph node labels collided, and nothing tracked
 * Foundry's light/dark theme. This file replaces all five `ensure*Styles`
 * functions with `ensureArchivexusStyles()`.
 *
 * **Structure:**
 * 1. A **token layer** on `.archivexus` (every surface wrapper carries that
 *    class): ~14 custom properties, each `var(--foundry-var, fallback)`, so
 *    the whole module tracks Foundry's own theme with no JS.
 * 2. **Base components** (`.ax-*`, all scoped under `.archivexus`):
 *    `.ax-toolbar`, `.ax-segmented`, `.ax-list` / `.ax-list-row`,
 *    `.ax-section-header`, `.ax-empty` / `.ax-loading` / `.ax-error`,
 *    `.ax-badge`, `.ax-canvas`.
 * 3. The per-surface rules, migrated verbatim except hex → token.
 *
 * Cytoscape can't read CSS custom properties, so its theme lives here too
 * as `buildCytoscapeStyle(scheme)` — two palettes selected from
 * `game.settings.get('core', 'colorScheme')` by the popout.
 */

const STYLE_ELEMENT_ID = 'archivexus-styles';

// ---------------------------------------------------------------------------
// 1. Token layer + 2. base components + 3. migrated per-surface rules
// ---------------------------------------------------------------------------

export const ARCHIVEXUS_CSS = `
.archivexus {
  --ax-gap: 0.5rem;
  --ax-gap-sm: 0.35rem;
  --ax-gap-xs: 0.2rem;
  --ax-pad: 0.5rem;
  --ax-pad-sm: 0.3rem;
  --ax-radius: 4px;
  --ax-border-color: var(--color-border-light-primary, rgba(127, 127, 127, 0.4));
  --ax-border-color-soft: var(--color-border-light-tertiary, rgba(127, 127, 127, 0.18));
  --ax-border: 1px solid var(--ax-border-color);
  --ax-text: var(--color-text-primary, var(--color-text-dark-primary, inherit));
  --ax-muted: var(--color-text-secondary, var(--color-text-dark-secondary, rgba(127, 127, 127, 0.9)));
  --ax-font-sm: var(--font-size-12, 12px);
  --ax-font-xs: var(--font-size-11, 11px);
  --ax-hover-bg: var(--color-hover-bg, rgba(127, 127, 127, 0.14));
  --ax-sunken-bg: var(--color-cool-5, rgba(127, 127, 127, 0.08));
  --ax-accent: var(--color-warm-2, #e0a54b);
  --ax-accent-contrast: #1b1b1d;
  color: var(--ax-text);
}

/* ---- 2. base components ------------------------------------------------- */

.archivexus .ax-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ax-gap);
  flex-wrap: wrap;
  padding: var(--ax-pad-sm) var(--ax-gap-xs);
  border-bottom: var(--ax-border);
}

.archivexus .ax-segmented {
  display: inline-flex;
  border: var(--ax-border);
  border-radius: var(--ax-radius);
  overflow: hidden;
}
.archivexus .ax-segmented button {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ax-muted);
  padding: 0.15rem 0.6rem;
  cursor: pointer;
  font-size: var(--ax-font-sm);
  line-height: 1.6;
}
.archivexus .ax-segmented button + button { border-left: var(--ax-border); }
.archivexus .ax-segmented button:hover:not(:disabled) { background: var(--ax-hover-bg); color: var(--ax-text); }
.archivexus .ax-segmented button[aria-pressed="true"] {
  background: var(--ax-accent);
  color: var(--ax-accent-contrast);
  font-weight: 600;
  text-decoration: none;
}
.archivexus .ax-segmented button:disabled { opacity: 0.45; cursor: default; }

/*
 * The plain button primitive — one token-driven look for every non-segmented
 * button (toolbars, list headers, dialogs). ADAPT-013 shipped .ax-toolbar and
 * .ax-segmented but left plain buttons on Foundry's defaults; ADAPT-022/024
 * put them here. Metrics match .ax-segmented button so a row of mixed
 * controls lines up.
 */
.archivexus .ax-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ax-gap-xs);
  white-space: nowrap;
  border: var(--ax-border);
  border-radius: var(--ax-radius);
  background: var(--ax-sunken-bg);
  color: var(--ax-text);
  padding: 0.15rem 0.6rem;
  font-size: var(--ax-font-sm);
  line-height: 1.6;
  cursor: pointer;
}
.archivexus .ax-btn:hover:not(:disabled) { background: var(--ax-hover-bg); }
.archivexus .ax-btn:disabled { opacity: 0.45; cursor: default; }

.archivexus .ax-list { list-style: none; margin: 0; padding: 0; }
.archivexus .ax-list-row {
  display: flex;
  align-items: center;
  gap: var(--ax-gap-sm);
  padding: var(--ax-pad-sm) var(--ax-pad-sm);
  border-radius: var(--ax-radius);
}
.archivexus .ax-list-row + .ax-list-row { border-top: 1px solid var(--ax-border-color-soft); }
.archivexus .ax-list-row[hidden] { display: none; }
.archivexus .ax-list-row:hover { background: var(--ax-hover-bg); }
.archivexus .ax-list-row--active { background: var(--ax-hover-bg); }

.archivexus .ax-section-header {
  margin: var(--ax-gap-sm) 0 var(--ax-gap-xs);
  font-size: var(--ax-font-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ax-muted);
}

.archivexus .ax-empty,
.archivexus .ax-loading { color: var(--ax-muted); font-style: italic; padding: 0.6rem 0; }
.archivexus .ax-error {
  color: var(--color-level-error, #c0392b);
  padding: 0.6rem 0;
}

.archivexus .ax-badge {
  display: inline-block;
  border-radius: 999px;
  border: 1px solid var(--ax-border-color);
  padding: 0 0.5rem;
  font-size: var(--ax-font-xs);
  background: var(--ax-sunken-bg);
}

.archivexus .ax-canvas {
  border: var(--ax-border);
  border-radius: var(--ax-radius);
  background: var(--ax-sunken-bg);
  min-width: 0;
}

/* ---- 3a. Codex sidebar navigator (was ensureCodexStyles) -------------- */

.archivexus.archivexus-codex { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: var(--ax-gap-xs); }
.archivexus .archivexus-codex-toolbar { display: flex; align-items: center; gap: var(--ax-gap-sm); padding: var(--ax-gap-xs) 0; flex-wrap: wrap; }
.archivexus .archivexus-codex-toolbar .ax-btn { flex: 0 0 auto; }
.archivexus .archivexus-codex-search { width: 100%; }
.archivexus .archivexus-codex-list { flex: 1 1 auto; overflow-y: auto; min-height: 0; }
.archivexus .archivexus-codex-hint { font-size: var(--ax-font-sm); color: var(--ax-muted); padding: 0.15rem 0; }
.archivexus .archivexus-codex-state { color: var(--ax-muted); font-style: italic; padding: var(--ax-pad) 0; }
.archivexus .archivexus-codex-group { margin-bottom: var(--ax-gap-sm); }
.archivexus .archivexus-codex-group[hidden] { display: none; }
.archivexus .archivexus-codex-group-header {
  display: block; width: 100%; text-align: left; border: 0; background: transparent; cursor: pointer;
  margin: var(--ax-gap-sm) 0 var(--ax-gap-xs); padding: 0.1rem 0; font-size: var(--ax-font-xs);
  text-transform: uppercase; letter-spacing: 0.03em; color: var(--ax-muted);
}
.archivexus .archivexus-codex-group-header:hover { color: var(--ax-text); }
.archivexus .archivexus-codex-group-caret { display: inline-block; width: 1em; }
.archivexus .archivexus-codex-group-count { opacity: 0.7; }
.archivexus .archivexus-codex-rows { list-style: none; margin: 0; padding: 0; }
.archivexus .archivexus-codex-rows[hidden] { display: none; }
.archivexus .archivexus-codex-rows li { display: flex; align-items: center; border-radius: var(--ax-radius); }
.archivexus .archivexus-codex-rows li[hidden] { display: none; }
.archivexus .archivexus-codex-rows li:hover { background: var(--ax-hover-bg); }
.archivexus .archivexus-codex-row-label {
  flex: 1 1 auto; min-width: 0; text-align: left; border: 0; background: transparent;
  padding: var(--ax-gap-xs) var(--ax-pad-sm); border-radius: var(--ax-radius); cursor: pointer; color: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.archivexus .archivexus-codex-fav {
  flex: 0 0 auto; border: 0; background: transparent; cursor: pointer;
  padding: var(--ax-gap-xs) 0.3rem; opacity: 0; transition: opacity 0.1s; color: var(--ax-accent);
}
.archivexus .archivexus-codex-rows li:hover .archivexus-codex-fav,
.archivexus .archivexus-codex-fav--on { opacity: 0.9; }
.archivexus .archivexus-codex-fav:hover { opacity: 1; }
.archivexus .archivexus-codex-guidance {
  border: var(--ax-border); border-radius: var(--ax-radius); padding: var(--ax-gap-xs) var(--ax-pad);
  margin: 0.15rem 0; background: var(--ax-sunken-bg);
}
.archivexus .archivexus-codex-guidance-toggle {
  display: block; width: 100%; text-align: left; border: 0; background: transparent; color: var(--ax-muted);
  padding: var(--ax-gap-xs) 0; cursor: pointer; font-weight: bold;
  font-size: var(--ax-font-sm); text-transform: uppercase; letter-spacing: 0.03em;
}
.archivexus .archivexus-codex-guidance-toggle:hover { color: var(--ax-text); }
.archivexus .archivexus-codex-guidance-caret { display: inline-block; width: 1em; }
.archivexus .archivexus-codex-guidance-body[hidden] { display: none; }
.archivexus .archivexus-codex-guidance-body .archivexus-guidance-steps {
  margin: var(--ax-gap-xs) 0; padding-left: 1.2rem; font-size: var(--ax-font-sm);
}
.archivexus .archivexus-codex-guidance-body .archivexus-guidance-steps li { margin-bottom: var(--ax-gap-sm); }
.archivexus .archivexus-codex-guidance-count { font-size: var(--ax-font-xs); color: var(--ax-muted); margin: var(--ax-gap-xs) 0 0; }

.archivexus .ax-codex-views { margin-bottom: var(--ax-gap-sm); }
.archivexus .ax-codex-views-header {
  display: flex; align-items: center; gap: var(--ax-gap-sm); width: 100%; text-align: left;
  background: transparent; border: 0; padding: var(--ax-gap-xs) 0; cursor: pointer; color: var(--ax-muted);
  font-size: var(--ax-font-xs); text-transform: uppercase; letter-spacing: 0.03em;
}
.archivexus .ax-codex-views-header:hover { color: var(--ax-text); }
.archivexus .ax-codex-views-caret { display: inline-block; width: 1em; }
.archivexus .ax-codex-views-count { opacity: 0.7; }
.archivexus .ax-codex-views-list { list-style: none; margin: 0; padding: 0; }
.archivexus .ax-codex-views-list[hidden] { display: none; }
.archivexus .ax-codex-view-row { display: flex; align-items: center; gap: var(--ax-gap-xs); border-radius: var(--ax-radius); }
.archivexus .ax-codex-view-row:hover { background: var(--ax-hover-bg); }
.archivexus .ax-codex-view-open {
  flex: 1 1 auto; text-align: left; background: transparent; border: 0; color: inherit;
  padding: 0.15rem var(--ax-pad-sm); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.archivexus .ax-codex-view-meta { color: var(--ax-muted); font-size: var(--ax-font-xs); }
.archivexus .ax-codex-view-del { background: transparent; border: 0; opacity: 0.45; cursor: pointer; padding: 0 var(--ax-gap-xs); color: inherit; }
.archivexus .ax-codex-view-del:hover { opacity: 1; }
.archivexus .ax-codex-view-hidden { opacity: 0.6; cursor: help; }

/* ---- 3b. graph popout (was ensureGraphPopoutStyles) ------------------- */

.archivexus.archivexus-graph-popout { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.archivexus .ax-gp-layout { font-size: var(--ax-font-sm); color: var(--ax-muted); }
.archivexus .ax-gp-preview-banner {
  background: var(--color-warm-2, #6a4a1a); color: #fff;
  padding: var(--ax-gap-xs) var(--ax-pad); font-size: var(--ax-font-sm);
}
.archivexus .ax-gp-body { display: flex; flex: 1 1 auto; min-height: 0; gap: var(--ax-gap-xs); padding: var(--ax-gap-xs); }
.archivexus .ax-gp-canvas {
  flex: 1 1 auto; min-width: 0;
  border: var(--ax-border); border-radius: var(--ax-radius); background: var(--ax-sunken-bg);
}
.archivexus .ax-gp-inspector {
  flex: 0 0 264px; overflow-y: auto; padding: var(--ax-pad);
  border: var(--ax-border); border-radius: var(--ax-radius);
  font-size: var(--font-size-13, 13px);
}
.archivexus .ax-gp-inspector[hidden] { display: none; }
.archivexus .ax-gp-insp-head { display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; margin-bottom: var(--ax-pad); }
.archivexus .ax-gp-insp-title { font-weight: 700; }
.archivexus .ax-gp-insp-type { color: var(--ax-muted); font-size: var(--ax-font-xs); }
.archivexus .ax-gp-insp-section h4 { margin: var(--ax-pad) 0 var(--ax-gap-xs); }
.archivexus .ax-gp-insp-section h5 {
  margin: var(--ax-gap-sm) 0 0.15rem; color: var(--ax-muted); font-size: var(--ax-font-xs);
  text-transform: uppercase; letter-spacing: 0.03em;
}
.archivexus .ax-gp-insp-blocks,
.archivexus .ax-gp-insp-conns { list-style: none; margin: 0; padding: 0; }
.archivexus .ax-gp-insp-conns li,
.archivexus .ax-gp-insp-blocks li { padding: 0.1rem 0; }
.archivexus .ax-gp-insp-verb { color: var(--ax-muted); }
.archivexus .ax-gp-no-actor { color: var(--ax-muted); cursor: help; }
.archivexus .ax-gp-insp-none,
.archivexus .ax-gp-insp-empty { color: var(--ax-muted); font-style: italic; }
.archivexus .ax-gp-curated { margin-bottom: 0.6rem; padding-bottom: var(--ax-pad); border-bottom: var(--ax-border); }
.archivexus .ax-gp-curated[hidden] { display: none; }
.archivexus .ax-gp-curate-head { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-bottom: var(--ax-gap-sm); }
.archivexus .ax-gp-curate-list { list-style: none; margin: 0 0 var(--ax-pad-sm); padding: 0; }
.archivexus .ax-gp-curate-row { display: flex; align-items: baseline; gap: var(--ax-gap-sm); padding: 0.1rem 0; cursor: pointer; }
.archivexus .ax-gp-curate-row em { color: var(--ax-muted); }
.archivexus .ax-gp-curate-empty { color: var(--ax-muted); font-style: italic; }
.archivexus .ax-gp-legend {
  display: flex; flex-wrap: wrap; gap: 0.15rem 0.7rem; padding: var(--ax-gap-xs) var(--ax-pad);
  font-size: var(--ax-font-xs); color: var(--ax-muted); border-bottom: var(--ax-border);
}
.archivexus .ax-gp-legend[hidden] { display: none; }
.archivexus .ax-gp-legend-swatch { display: inline-block; width: 0.7em; height: 0.7em; border-radius: 2px; margin-right: 0.3em; vertical-align: -1px; }
.archivexus .ax-gp-status { padding: var(--ax-gap-xs) var(--ax-pad); font-size: var(--ax-font-xs); color: var(--ax-muted); }
.archivexus .ax-gp-context-overlay { position: fixed; inset: 0; z-index: 999; }
.archivexus .ax-gp-context-menu {
  position: fixed; z-index: 1000; display: flex; flex-direction: column;
  background: var(--color-bg, #1b1b1d); border: var(--ax-border); border-radius: var(--ax-radius);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.archivexus .ax-gp-context-menu button { text-align: left; border: 0; background: transparent; color: inherit; padding: var(--ax-pad-sm) 0.7rem; white-space: nowrap; cursor: pointer; }
.archivexus .ax-gp-context-menu button:hover { background: var(--ax-hover-bg); }

/* ---- 3c. relationship console (was ensureConsoleStyles) --------------- */

.archivexus.archivexus-console { display: flex; flex-direction: column; gap: var(--ax-pad); }
.archivexus .archivexus-console-filters { display: flex; flex-direction: column; gap: var(--ax-gap-sm); }
.archivexus .archivexus-console-filter-row { display: flex; gap: var(--ax-gap); align-items: center; flex-wrap: wrap; }
.archivexus .archivexus-console-filter-row [data-role="console-search"] { flex: 1 1 12rem; }
.archivexus .archivexus-console-new { margin-left: auto; }
.archivexus .archivexus-console-check { display: flex; gap: 0.3rem; align-items: center; font-weight: normal; white-space: nowrap; }
.archivexus .archivexus-console-chip {
  border: 1px solid var(--ax-border-color); border-radius: 999px; padding: 0.1rem 0.6rem;
  background: var(--ax-sunken-bg); cursor: pointer; color: inherit;
}
.archivexus .archivexus-console-list { max-height: 60vh; overflow-y: auto; }
.archivexus .archivexus-console-group[hidden] { display: none; }
.archivexus .archivexus-console-group-header {
  margin: var(--ax-pad) 0 0.15rem; font-size: var(--ax-font-xs);
  text-transform: uppercase; letter-spacing: 0.03em; color: var(--ax-muted);
}
.archivexus .archivexus-console-group-count { opacity: 0.7; }
.archivexus .archivexus-console-rows { list-style: none; margin: 0; padding: 0; }
.archivexus .archivexus-console-row { padding: var(--ax-gap-sm) 0.4rem; border-radius: var(--ax-radius); }
.archivexus .archivexus-console-row[hidden] { display: none; }
.archivexus .archivexus-console-row + .archivexus-console-row { border-top: 1px solid var(--ax-border-color-soft); }
.archivexus .archivexus-console-row:hover { background: var(--ax-hover-bg); }
.archivexus .archivexus-console-row-title { font-weight: 600; }
.archivexus .archivexus-console-row-meta { font-size: var(--ax-font-xs); color: var(--ax-muted); }
.archivexus .archivexus-console-cat { text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.8; }
.archivexus .archivexus-console-flag { border-radius: 3px; padding: 0 0.3rem; background: var(--ax-sunken-bg); }
.archivexus .archivexus-console-flag--warn { background: var(--color-level-warning-bg, rgba(190, 120, 0, 0.2)); }
.archivexus .archivexus-console-row-actions { display: flex; gap: var(--ax-gap-sm); margin-top: var(--ax-gap-xs); }
.archivexus .archivexus-console-empty { color: var(--ax-muted); font-style: italic; padding: 0.75rem 0; }
.archivexus .archivexus-console-count { font-size: var(--ax-font-xs); color: var(--ax-muted); }

/* ---- 3d. definition editor (was ensureDefinitionEditorStyles) -------- */

.archivexus.archivexus-def-editor { display: flex; gap: 1rem; align-items: flex-start; }
.archivexus .archivexus-def-editor-list { flex: 1 1 55%; min-width: 0; }
.archivexus .archivexus-def-editor-form { flex: 1 1 45%; min-width: 0; }
.archivexus .archivexus-def-editor-list-header { display: flex; align-items: center; justify-content: space-between; gap: var(--ax-gap); }
.archivexus .archivexus-def-editor-list-header h3,
.archivexus .archivexus-def-form-heading { margin: 0 0 var(--ax-pad); }
.archivexus .archivexus-def-count { color: var(--ax-muted); font-weight: normal; }
.archivexus .archivexus-def-rows { list-style: none; margin: 0; padding: 0; max-height: 60vh; overflow-y: auto; }
.archivexus .archivexus-def-row { padding: var(--ax-gap-sm) 0.4rem; border-radius: var(--ax-radius); }
.archivexus .archivexus-def-row + .archivexus-def-row { border-top: 1px solid var(--ax-border-color-soft); }
.archivexus .archivexus-def-row:hover { background: var(--ax-hover-bg); }
.archivexus .archivexus-def-row--active { background: var(--ax-hover-bg); }
.archivexus .archivexus-def-row-arrow,
.archivexus .archivexus-def-row-sym { color: var(--ax-muted); }
.archivexus .archivexus-def-row-meta { font-size: var(--ax-font-xs); color: var(--ax-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.archivexus .archivexus-def-row-actions { display: flex; gap: var(--ax-gap-sm); margin-top: var(--ax-gap-xs); }
.archivexus .archivexus-def-empty { color: var(--ax-muted); font-style: italic; padding: var(--ax-pad) 0; }
.archivexus .archivexus-def-form .form-group { margin-bottom: 0.6rem; }
.archivexus .archivexus-def-form .hint { font-size: var(--ax-font-xs); color: var(--ax-muted); margin: 0.15rem 0 0; }
.archivexus .archivexus-def-form label.checkbox { display: flex; gap: 0.4rem; align-items: flex-start; font-weight: normal; }
.archivexus .archivexus-def-form .form-footer { display: flex; gap: var(--ax-gap); margin-top: 0.75rem; }

/* ---- 3e. relationship authoring (was ensureRelationshipAuthoringStyles) */

.archivexus .archivexus-rel-endpoint-control { display: flex; align-items: center; gap: var(--ax-gap-sm); }
.archivexus .archivexus-rel-endpoint-control input { flex: 1 1 auto; min-width: 0; }
.archivexus .archivexus-rel-endpoint-control input[readonly] { font-weight: 600; }
.archivexus .archivexus-rel-endpoint-clear {
  flex: 0 0 auto; border: 0; background: transparent; cursor: pointer; padding: 0.15rem 0.4rem; opacity: 0.7; color: inherit;
}
.archivexus .archivexus-rel-endpoint-clear:hover { opacity: 1; }
.archivexus .archivexus-rel-endpoint-uuid {
  margin: 0.1rem 0 0; font-size: var(--ax-font-xs); font-family: var(--font-mono, monospace); color: var(--ax-muted);
}
.archivexus .archivexus-rel-endpoint-control.archivexus-rel-drop-active input { outline: 1px dashed var(--ax-accent); }
.archivexus.archivexus-relationship-authoring .form-footer { display: flex; gap: var(--ax-gap); }
.archivexus.archivexus-relationship-authoring p.notification[data-role="saved-notice"] {
  background: var(--color-level-success-bg, rgba(0, 140, 0, 0.15));
  border: 1px solid var(--color-level-success-border, rgba(0, 140, 0, 0.4));
}
`;

/** Injects the single Archivexus stylesheet into `<head>` once. Idempotent, safe to call on every surface render. */
export function ensureArchivexusStyles(): void {
  const doc = (globalThis as { document?: unknown }).document as
    | {
        getElementById(id: string): unknown;
        createElement(tag: string): { id: string; textContent: string };
        head: { appendChild(node: unknown): unknown };
      }
    | undefined;
  if (!doc || doc.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = ARCHIVEXUS_CSS;
  doc.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Cytoscape theme — CSS custom properties don't reach the canvas, so the
// graph's palette lives here (ADAPT-013). Two schemes, chosen by the popout
// from `game.settings.get('core', 'colorScheme')`.
// ---------------------------------------------------------------------------

export type ColorScheme = 'light' | 'dark';

export const DEFAULT_NODE_COLOR = '#8a8a8a';
export const DEFAULT_EDGE_COLOR = '#7a7a7a';

/**
 * A fixed hue per `node.type`, keyed by `KNOWN_NODE_TYPES` (`node.ts`); a
 * GM-invented type falls to `DEFAULT_NODE_COLOR`. One map, tuned to read on
 * both a light and a dark canvas; the popout legend renders straight from it.
 */
export const NODE_TYPE_COLORS: Readonly<Record<string, string>> = {
  Character: '#5b8def',
  Creature: '#8e6bd4',
  City: '#e0a54b',
  Kingdom: '#d4783a',
  Organization: '#4bb0a5',
  Quest: '#c05fa8',
  Item: '#7a8a99',
  Vehicle: '#6a9a5b',
  Event: '#d45b5b',
  Lore: '#9aa0a6',
  Puzzle: '#b59a3a',
};

/** A hue per `RelationshipDefinition.traversalCategory` (ADR-0007's closed 8-value taxonomy); anything else → `DEFAULT_EDGE_COLOR`. */
export const CATEGORY_EDGE_COLORS: Readonly<Record<string, string>> = {
  location: '#c98a3a',
  affiliation: '#4b90c0',
  kinship: '#7bb56a',
  conflict: '#cc5b5b',
  governance: '#9a7bd0',
  participation: '#4bb0a5',
  ownership: '#b0873a',
  narrative: '#9aa0a6',
};

export function nodeTypeColor(nodeType: string): string {
  return NODE_TYPE_COLORS[nodeType] ?? DEFAULT_NODE_COLOR;
}

export function categoryEdgeColor(category: string | undefined): string {
  return (category !== undefined && CATEGORY_EDGE_COLORS[category]) || DEFAULT_EDGE_COLOR;
}

/**
 * The Cytoscape `style` array (replaces the old flat `CYTOSCAPE_STYLE`).
 * `scheme` swaps label ink + label-plate + edge base so the graph stays
 * legible on Foundry's light or dark chrome.
 */
export function buildCytoscapeStyle(scheme: ColorScheme): readonly Record<string, unknown>[] {
  const dark = scheme === 'dark';
  const labelInk = dark ? '#e8e8e8' : '#1c1c1c';
  const labelPlate = dark ? 'rgba(20,20,22,0.72)' : 'rgba(255,255,255,0.78)';
  const edgeInk = dark ? '#c2c2c2' : '#3a3a3a';
  const clusterFill = dark ? '#3a3f52' : '#d9ddec';
  const clusterBorder = dark ? '#8a93c0' : '#5a63a0';

  const nodeTypeRules = Object.entries(NODE_TYPE_COLORS).map(([type, color]) => ({
    selector: `node[nodeType = "${type}"]`,
    style: { 'background-color': color },
  }));

  const categoryEdgeRules = Object.entries(CATEGORY_EDGE_COLORS).map(([category, color]) => ({
    selector: `edge[category = "${category}"]`,
    style: { 'line-color': color, 'target-arrow-color': color },
  }));

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'font-size': 11,
        'min-zoomed-font-size': 8,
        'text-wrap': 'ellipsis',
        'text-max-width': 120,
        'background-color': DEFAULT_NODE_COLOR,
        color: labelInk,
        'text-valign': 'bottom',
        'text-margin-y': 3,
        'text-background-color': labelPlate,
        'text-background-opacity': 1,
        'text-background-padding': 2,
        'text-background-shape': 'roundrectangle',
        'border-width': 0,
      },
    },
    ...nodeTypeRules,
    {
      selector: 'edge',
      style: {
        label: 'data(label)',
        'font-size': 8,
        'min-zoomed-font-size': 10,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'line-color': edgeInk,
        'target-arrow-color': edgeInk,
        color: edgeInk,
        'text-rotation': 'autorotate',
        'text-background-color': labelPlate,
        'text-background-opacity': 1,
        'text-background-padding': 2,
      },
    },
    ...categoryEdgeRules,
    {
      selector: 'node.archivexus-selected',
      style: {
        'background-color': '#e0a54b',
        'border-width': 3,
        'border-color': '#f5d089',
      },
    },
    {
      selector: 'node[?isCluster]',
      style: {
        shape: 'round-rectangle',
        'background-color': clusterFill,
        'background-opacity': 0.22,
        'border-width': 2,
        'border-style': 'dashed',
        'border-color': clusterBorder,
        color: labelInk,
        'font-size': 11,
        'font-weight': 'bold',
        'text-valign': 'top',
        'text-halign': 'center',
        'text-background-opacity': 0,
        padding: 14,
      },
    },
    {
      selector: 'node[?collapsed]',
      style: {
        shape: 'round-rectangle',
        'background-opacity': 0.9,
        'background-color': clusterFill,
        'text-valign': 'center',
        padding: 8,
      },
    },
    {
      selector: 'edge[source *= "ax-cluster:"], edge[target *= "ax-cluster:"]',
      style: {
        'line-style': 'dashed',
        'line-color': clusterBorder,
        'target-arrow-shape': 'none',
        width: 1,
      },
    },
  ];
}
