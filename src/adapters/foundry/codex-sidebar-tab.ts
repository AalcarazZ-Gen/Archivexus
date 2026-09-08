import type { Node } from '../../core/domain/node.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { isViewerGM } from './foundry-viewer.js';
import { filterNodesForViewer } from './graph-view-elements.js';
import { openGraphPopout } from './graph-popout-window.js';
import { openRelationshipDefinitionEditor } from './relationship-definition-editor-window.js';
import { openRelationshipConsole } from './relationship-console-window.js';
import { buildGuidancePanelHTML } from './first-run-guidance.js';
import type { Logger } from './logger.js';
import { groupNodesByType, type NavigatorGroup } from './node-navigator.js';

/**
 * The Codex: a first-level Foundry sidebar tab. Since the ADR-0014
 * Amendment (2026-09-08, A2) it is a **node navigator** — search + a
 * `node.type`-grouped list of every Node — not a graph. It is the launch
 * point for the graph popout (`graph-popout-window.ts`, VIEW-001b):
 * clicking a row opens/re-roots the popout on that Node; the "Open graph"
 * button opens it on the whole graph.
 *
 * VIEW-001a's in-tab Cytoscape rendering was removed in VIEW-001c — the
 * graph lives in the popout now (the ~300px sidebar was too cramped for a
 * canvas). `cytoscape-loader.ts` / `graph-view-elements.ts` are still used
 * by the popout, just no longer imported here.
 *
 * **Foundry sidebar-tab mechanics (verified live, VIEW-001a):**
 * `SidebarTabDescriptor` is `{ tooltip, icon }` (the core `settings` tab is
 * the model — no `documentName`); the tab class is registered at
 * `CONFIG.ui[tabName]` and `CONFIG.ui.sidebar.TABS === Sidebar.TABS`.
 * `AbstractSidebarTab → ApplicationV2 → EventEmitter`, no Handlebars mixin,
 * so the raw `_renderHTML` (returns a string) / `_replaceHTML` (inserts it)
 * contract applies.
 *
 * Non-GM viewers only see Nodes whose `visibility` isn't `hidden`
 * (ADR-0003) — `filterNodesForViewer`; the "N hidden" count is GM-only.
 *
 * The GM-only first-run guidance panel (VIEW-001g) renders into a
 * `data-role="guidance-mount"` on every load — `buildGuidancePanelHTML`
 * lives in `first-run-guidance.ts`; this file only mounts it and wires the
 * expand/collapse toggle.
 *
 * What's pure and unit-tested: `node-navigator.ts` (grouping/filter),
 * `buildNavigatorShellHTML` / `buildNavigatorGroupsHTML` /
 * `buildNavigatorStateHTML` (this file), and `registerCodexSidebarTab`'s
 * descriptor writing. Still flagged as glue: the `AbstractSidebarTab`
 * render lifecycle and the search-input / row-click wiring.
 */

const CODEX_TAB_NAME = 'codex';
const CODEX_TAB_ICON = 'fa-solid fa-share-nodes';
const CODEX_TAB_TOOLTIP = 'Codex';

// ---------------------------------------------------------------------------
// Minimal structural types — tsconfig omits the DOM lib, same
// cast-through-`unknown` tradeoff as the rest of this package.
// ---------------------------------------------------------------------------

interface MinimalDomElementLike {
  innerHTML: string;
  hidden: boolean;
  textContent: string | null;
  readonly value: string;
  querySelector(selector: string): MinimalDomElementLike | null;
  querySelectorAll(selector: string): Iterable<MinimalDomElementLike>;
  getAttribute(name: string): string | null;
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

interface SidebarTabInstanceLike {
  readonly element: MinimalDomElementLike;
  readonly active: boolean;
}

type SidebarTabConstructor = new (...args: readonly unknown[]) => SidebarTabInstanceLike;
type CodexSidebarTabConstructor = new (...args: readonly unknown[]) => SidebarTabInstanceLike;

/**
 * Minimal shape of the `CONFIG.ui` surface this module writes to — `CONFIG`
 * is otherwise untyped in `foundry-globals.d.ts`. `registerCodexSidebarTab`
 * takes this explicitly so it can be unit-tested against a plain object.
 */
export interface FoundryUiConfigLike {
  sidebar: { TABS: Record<string, unknown> };
  [tabName: string]: unknown;
}

// ---------------------------------------------------------------------------
// Pure markup builders
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The navigator's static shell — toolbar, search box, a `data-role="list"`
 * region the group markup drops into, a `data-role="hint"` count line. The
 * GM-only toolbar affordances (`isGM`, default true): "Relationships" (the
 * Console, VIEW-001i), "Relationship types" (the Definition editor, ADAPT-014),
 * "Getting started" + `data-role="guidance-mount"` for the first-run panel (VIEW-001g)
 * — both point at GM-only authoring surfaces.
 */
export function buildNavigatorShellHTML(options: { isGM?: boolean } = {}): string {
  const { isGM = true } = options;
  return (
    `<div class="archivexus-codex">` +
    `<div class="archivexus-codex-toolbar">` +
    `<button type="button" data-action="openWholeGraph" title="Open the campaign graph in a resizable window">Open graph ⧉</button>` +
    (isGM
      ? `<button type="button" data-action="openConsole" title="List, search, create and delete every relationship">Relationships</button>` +
        `<button type="button" data-action="openDefinitionEditor" title="Add or edit relationship types">Relationship types</button>` +
        `<button type="button" data-action="showGuidance" title="Show the getting-started guidance">Getting started</button>`
      : '') +
    `</div>` +
    (isGM ? `<div class="archivexus-codex-guidance-mount" data-role="guidance-mount"></div>` : '') +
    `<input type="search" class="archivexus-codex-search" data-role="search" placeholder="Filter nodes…" autocomplete="off" />` +
    `<div class="archivexus-codex-list" data-role="list"></div>` +
    `<div class="archivexus-codex-hint" data-role="hint"></div>` +
    `</div>`
  );
}

/** A loading / empty / error state for the `data-role="list"` region. */
export function buildNavigatorStateHTML(
  state: 'loading' | 'empty' | 'error',
): string {
  const text =
    state === 'loading'
      ? 'Loading campaign…'
      : state === 'error'
        ? "Couldn't load the campaign's nodes."
        : 'No knowledge yet. Tag an Actor or Journal page with a Node type (its sheet → header ⋯ menu → “Archivexus Node Type”) to see it here.';
  return `<p class="archivexus-codex-state">${text}</p>`;
}

/**
 * The grouped node list. Each row carries `data-node-id` (for the click
 * handler) and `data-title` (lowercased, for client-side search filtering
 * without a re-render — same "pure builder, live class toggles DOM"
 * split as `relationship-list-window.ts`).
 */
export function buildNavigatorGroupsHTML(groups: readonly NavigatorGroup[]): string {
  if (groups.length === 0) {
    return buildNavigatorStateHTML('empty');
  }
  return groups
    .map((group) => {
      const rows = group.nodes
        .map(
          (node) =>
            `<li data-node-id="${escapeHtml(node.id)}" data-title="${escapeHtml(node.title.toLowerCase())}">` +
            `<button type="button" data-action="focusNode" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.title)}</button>` +
            `</li>`,
        )
        .join('');
      return (
        `<section class="archivexus-codex-group" data-group="${escapeHtml(group.type)}">` +
        `<h4 class="archivexus-codex-group-header">${escapeHtml(group.type)} <span class="archivexus-codex-group-count">${group.nodes.length}</span></h4>` +
        `<ul class="archivexus-codex-rows">${rows}</ul>` +
        `</section>`
      );
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CODEX_STYLE_ELEMENT_ID = 'archivexus-codex-styles';

const CODEX_CSS = `
.archivexus-codex { display: flex; flex-direction: column; height: 100%; min-height: 0; gap: 0.25rem; }
.archivexus-codex-toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.archivexus-codex-search { width: 100%; }
.archivexus-codex-list { flex: 1 1 auto; overflow-y: auto; min-height: 0; }
.archivexus-codex-hint { font-size: var(--font-size-12, 12px); opacity: 0.7; padding: 0.15rem 0; }
.archivexus-codex-state { opacity: 0.6; font-style: italic; padding: 0.5rem 0; }
.archivexus-codex-group { margin-bottom: 0.35rem; }
.archivexus-codex-group[hidden] { display: none; }
.archivexus-codex-group-header { margin: 0.35rem 0 0.15rem; font-size: var(--font-size-11, 11px); text-transform: uppercase; opacity: 0.7; }
.archivexus-codex-group-count { opacity: 0.6; }
.archivexus-codex-rows { list-style: none; margin: 0; padding: 0; }
.archivexus-codex-rows li[hidden] { display: none; }
.archivexus-codex-rows button {
  display: block; width: 100%; text-align: left; border: 0; background: transparent;
  padding: 0.2rem 0.4rem; border-radius: 3px; cursor: pointer;
}
.archivexus-codex-rows button:hover { background: var(--color-hover-bg, rgba(0,0,0,0.06)); }
.archivexus-codex-guidance {
  border: 1px solid var(--color-border-light-primary, rgba(0,0,0,0.15));
  border-radius: 4px; padding: 0.25rem 0.5rem; margin: 0.15rem 0;
  background: var(--color-bg-option, rgba(0,0,0,0.03));
}
.archivexus-codex-guidance-toggle {
  display: block; width: 100%; text-align: left; border: 0; background: transparent;
  padding: 0.2rem 0; cursor: pointer; font-weight: bold;
  font-size: var(--font-size-12, 12px); text-transform: uppercase; opacity: 0.8;
}
.archivexus-codex-guidance-caret { display: inline-block; width: 1em; }
.archivexus-codex-guidance-body[hidden] { display: none; }
.archivexus-codex-guidance-body .archivexus-guidance-steps {
  margin: 0.25rem 0; padding-left: 1.2rem; font-size: var(--font-size-12, 12px);
}
.archivexus-codex-guidance-body .archivexus-guidance-steps li { margin-bottom: 0.35rem; }
.archivexus-codex-guidance-count { font-size: var(--font-size-11, 11px); opacity: 0.7; margin: 0.25rem 0 0; }
`;

/**
 * Injects the Codex's stylesheet into `<head>` once (ADR-0014 Amendment 2
 * decision 4: an injected `<style>` module, not a `module.json` styles
 * asset — keeps the hand-run build a single JS emit). `document` is
 * reached via `globalThis` since this package's tsconfig omits the DOM lib.
 */
export function ensureCodexStyles(): void {
  const doc = (globalThis as { document?: unknown }).document as
    | {
        getElementById(id: string): unknown;
        createElement(tag: string): { id: string; textContent: string };
        head: { appendChild(node: unknown): unknown };
      }
    | undefined;
  if (!doc || doc.getElementById(CODEX_STYLE_ELEMENT_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = CODEX_STYLE_ELEMENT_ID;
  style.textContent = CODEX_CSS;
  doc.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// The AbstractSidebarTab subclass (deferred — `foundry` is only an ambient
// type outside a live client)
// ---------------------------------------------------------------------------

let cachedTabClass: CodexSidebarTabConstructor | undefined;

/** Exported only for tests — production reaches it via `registerCodexSidebarTab`. */
export function getCodexSidebarTabClass(
  getStorage: () => StorageProvider | undefined,
  log: Logger,
): CodexSidebarTabConstructor {
  if (cachedTabClass) {
    return cachedTabClass;
  }

  const AbstractSidebarTabBase = (
    foundry as unknown as {
      applications: { sidebar: { AbstractSidebarTab: unknown } };
    }
  ).applications.sidebar.AbstractSidebarTab as unknown as SidebarTabConstructor;

  class CodexSidebarTab extends AbstractSidebarTabBase {
    static tabName = CODEX_TAB_NAME;

    static DEFAULT_OPTIONS = {
      classes: ['archivexus-codex-tab'],
      actions: {
        openWholeGraph(): void {
          openGraphPopout(getStorage, log);
        },
        focusNode(this: CodexSidebarTab, _event: unknown, target: MinimalDomElementLike): void {
          const id = target.getAttribute('data-node-id');
          if (id) {
            openGraphPopout(getStorage, log, { rootNodeId: id });
          }
        },
        showGuidance(this: CodexSidebarTab): void {
          this.#setGuidanceExpanded(true);
        },
        openDefinitionEditor(): void {
          openRelationshipDefinitionEditor(getStorage, log);
        },
        openConsole(): void {
          openRelationshipConsole(getStorage, log);
        },
      },
    };

    #storageReadyHookBound = false;

    _renderHTML(): string {
      return buildNavigatorShellHTML({ isGM: isViewerGM() });
    }

    _replaceHTML(result: string, content: MinimalDomElementLike): void {
      ensureCodexStyles();
      content.innerHTML = result;

      const search = content.querySelector('[data-role="search"]');
      search?.addEventListener('input', () => this.#applyFilter(search.value));

      // Storage is created on Foundry's `ready` hook (STORE-003) and the
      // sidebar can render before that — re-pull the list once module-entry
      // signals storage is up. Bound once (the tab is a singleton).
      if (!this.#storageReadyHookBound) {
        this.#storageReadyHookBound = true;
        Hooks.on('archivexus.ready', () => void this._loadNodes());
      }

      void this._loadNodes();
    }

    /** Foundry re-activates a hidden tab without a full re-render — refresh in case Nodes changed while it was hidden. */
    _onActivate(): void {
      (AbstractSidebarTabBase.prototype as { _onActivate?: () => void })._onActivate?.call(this);
      void this._loadNodes();
    }

    async _loadNodes(): Promise<void> {
      const listEl = this.element.querySelector('[data-role="list"]');
      const storage = getStorage();
      if (!storage) {
        if (listEl) listEl.innerHTML = buildNavigatorStateHTML('loading');
        return;
      }
      try {
        const isGM = isViewerGM();
        const allNodes = await storage.listNodes();
        const visible = filterNodesForViewer(allNodes, { isGM });
        // The first-run guidance panel is a GM concern (it points at
        // GM-only authoring surfaces) — skip the relationship count for
        // players, who never see it.
        const relationshipCount = isGM ? (await storage.listRelationships()).length : 0;
        this.#renderNodes(visible, allNodes.length - visible.length, isGM);
        if (isGM) {
          this.#renderGuidance({ nodeCount: visible.length, relationshipCount });
        }
      } catch (error) {
        log.error(`Codex: failed to load nodes: ${errorMessage(error)}`);
        if (listEl) listEl.innerHTML = buildNavigatorStateHTML('error');
      }
    }

    /**
     * Renders the first-run guidance panel into its mount and re-binds the
     * expand/collapse toggle (the mount's `innerHTML` is replaced on every
     * load, so the listener can't be bound once).
     */
    #renderGuidance(state: { nodeCount: number; relationshipCount: number }): void {
      const mount = this.element.querySelector('[data-role="guidance-mount"]');
      if (!mount) return;
      mount.innerHTML = buildGuidancePanelHTML(state);
      const toggle = mount.querySelector('[data-role="guidance-toggle"]');
      toggle?.addEventListener('click', () => {
        const body = this.element.querySelector('[data-role="guidance-body"]');
        this.#setGuidanceExpanded(body ? body.hidden : true);
      });
    }

    #setGuidanceExpanded(expanded: boolean): void {
      const body = this.element.querySelector('[data-role="guidance-body"]');
      if (body) body.hidden = !expanded;
      const caret = this.element.querySelector('.archivexus-codex-guidance-caret');
      if (caret) caret.textContent = expanded ? '▾' : '▸';
    }

    #renderNodes(nodes: readonly Node[], hiddenCount: number, isGM: boolean): void {
      const listEl = this.element.querySelector('[data-role="list"]');
      if (listEl) {
        listEl.innerHTML = buildNavigatorGroupsHTML(groupNodesByType(nodes));
      }
      const hintEl = this.element.querySelector('[data-role="hint"]');
      if (hintEl) {
        hintEl.textContent =
          `${nodes.length} node${nodes.length === 1 ? '' : 's'}` +
          (isGM && hiddenCount > 0 ? ` · ${hiddenCount} hidden` : '');
      }
      // Re-apply the current filter to the freshly-rendered rows.
      const search = this.element.querySelector('[data-role="search"]');
      if (search && search.value.trim().length > 0) {
        this.#applyFilter(search.value);
      }
    }

    /** Client-side filter — toggles row/group visibility by the lowercased `data-title`, no re-render (keeps search-input focus). */
    #applyFilter(query: string): void {
      const needle = query.trim().toLowerCase();
      for (const group of this.element.querySelectorAll('.archivexus-codex-group')) {
        let anyVisible = false;
        for (const row of group.querySelectorAll('li[data-title]')) {
          const match = needle.length === 0 || (row.getAttribute('data-title') ?? '').includes(needle);
          row.hidden = !match;
          if (match) anyVisible = true;
        }
        group.hidden = !anyVisible;
      }
    }
  }

  cachedTabClass = CodexSidebarTab as unknown as CodexSidebarTabConstructor;
  return cachedTabClass;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Registration (testable)
// ---------------------------------------------------------------------------

/**
 * Registers the Codex as a first-level sidebar tab. Call once at `init`.
 * Writes the descriptor in `CONFIG.ui.sidebar.TABS` and the tab class at
 * `CONFIG.ui[tabName]` (shape confirmed against v14's own `settings` tab).
 */
export function registerCodexSidebarTab(
  config: FoundryUiConfigLike,
  getStorage: () => StorageProvider | undefined,
  log: Logger,
): void {
  config.sidebar.TABS[CODEX_TAB_NAME] = {
    tooltip: CODEX_TAB_TOOLTIP,
    icon: CODEX_TAB_ICON,
  };
  config[CODEX_TAB_NAME] = getCodexSidebarTabClass(getStorage, log);
}
