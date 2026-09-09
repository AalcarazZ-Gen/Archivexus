import type { Node } from '../../core/domain/node.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { isViewerGM } from './foundry-viewer.js';
import { filterNodesForViewer } from './graph-view-elements.js';
import { openGraphPopout } from './graph-popout-window.js';
import { openRelationshipDefinitionEditor } from './relationship-definition-editor-window.js';
import { openRelationshipConsole } from './relationship-console-window.js';
import { buildGuidancePanelHTML } from './first-run-guidance.js';
import {
  buildSavedViewsPanelHTML,
  filterViewsForViewer,
  sortViews,
  toSavedViewRow,
} from './saved-views.js';
import type { Logger } from './logger.js';
import {
  FAVOURITES_GROUP_TYPE,
  groupNodesWithFavourites,
  normalizeFavouriteNodeIds,
  type NavigatorGroup,
} from './node-navigator.js';

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

const MODULE_ID = 'archivexus';
const FAVOURITE_NODE_IDS_FLAG = 'favouriteNodeIds';

/**
 * The navigator's per-user favourites (VIEW-001d) — Foundry `game.user`
 * flags, deliberately NOT `StorageProvider` state / a `View` / in the
 * portable snapshot (ADR-0014 Amendment A2b / A8: a personal navigation
 * convenience, not campaign knowledge — `CONTRIBUTING_GUIDE.md` Rule 6).
 * Read defensively (returns an empty set if `game.user` isn't ready or the
 * flag is malformed); the write is fire-and-forget with the caller logging.
 */
function readFavouriteNodeIds(): ReadonlySet<string> {
  try {
    const raw = (globalThis as { game?: typeof game }).game?.user?.getFlag(
      MODULE_ID,
      FAVOURITE_NODE_IDS_FLAG,
    );
    return new Set(normalizeFavouriteNodeIds(raw));
  } catch {
    return new Set();
  }
}

function writeFavouriteNodeIds(ids: readonly string[]): Promise<unknown> {
  const user = (globalThis as { game?: typeof game }).game?.user;
  return user ? user.setFlag(MODULE_ID, FAVOURITE_NODE_IDS_FLAG, [...ids]) : Promise.resolve();
}

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
  setAttribute(name: string, value: string): void;
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
    `<div class="archivexus-codex-views-mount" data-role="saved-views"></div>` +
    `<input type="search" class="archivexus-codex-search" data-role="search" placeholder="Filter nodes…" autocomplete="off" />` +
    `<div class="archivexus-codex-list" data-role="list"></div>` +
    `<div class="archivexus-codex-hint" data-role="hint"></div>` +
    `</div>`
  );
}

/** A loading / empty / error state for the `data-role="list"` region. */
export function buildNavigatorStateHTML(state: 'loading' | 'empty' | 'error'): string {
  const text =
    state === 'loading'
      ? 'Loading campaign…'
      : state === 'error'
        ? "Couldn't load the campaign's nodes."
        : 'No knowledge yet. Tag an Actor or Journal page with a Node type (its sheet → header ⋯ menu → “Archivexus Node Type”) to see it here.';
  return `<p class="archivexus-codex-state">${text}</p>`;
}

/**
 * The auto-expand rule (VIEW-001h): a single group, or a short total list,
 * starts expanded — collapsing that just adds a click. Anything bigger
 * starts collapsed so the navigator is a compact index.
 */
export const NAVIGATOR_AUTO_EXPAND_MAX_NODES = 15;

export function navigatorGroupsStartExpanded(groups: readonly NavigatorGroup[]): boolean {
  const total = groups.reduce((sum, group) => sum + group.nodes.length, 0);
  return groups.length <= 1 || total <= NAVIGATOR_AUTO_EXPAND_MAX_NODES;
}

/**
 * The grouped node list (VIEW-001c). Each `<section>` is collapsible
 * (VIEW-001h): its header is a `data-action="toggleGroup"` button, and a
 * type in `collapsedTypes` renders with its rows `hidden` and a `▸` caret.
 * Each row carries `data-node-id` (the click handlers) and `data-title`
 * (lowercased, for client-side search filtering without a re-render — same
 * "pure builder, live class toggles DOM" split as `relationship-list-window.ts`),
 * plus a `data-action="toggleFavourite"` ☆/★ button reflecting membership
 * in `favouriteIds` (VIEW-001d).
 */
export function buildNavigatorGroupsHTML(
  groups: readonly NavigatorGroup[],
  collapsedTypes: ReadonlySet<string> = new Set(),
  favouriteIds: ReadonlySet<string> = new Set(),
): string {
  if (groups.length === 0) {
    return buildNavigatorStateHTML('empty');
  }
  return groups
    .map((group) => {
      const collapsed = collapsedTypes.has(group.type);
      const rows = group.nodes
        .map((node) => {
          const isFav = favouriteIds.has(node.id);
          return (
            `<li data-node-id="${escapeHtml(node.id)}" data-title="${escapeHtml(node.title.toLowerCase())}">` +
            `<button type="button" class="archivexus-codex-fav${isFav ? ' archivexus-codex-fav--on' : ''}" data-action="toggleFavourite" data-node-id="${escapeHtml(node.id)}" aria-pressed="${isFav ? 'true' : 'false'}" title="${isFav ? 'Remove from favourites' : 'Add to favourites'}">${isFav ? '★' : '☆'}</button>` +
            `<button type="button" class="archivexus-codex-row-label" data-action="focusNode" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.title)}</button>` +
            `</li>`
          );
        })
        .join('');
      return (
        `<section class="archivexus-codex-group" data-group="${escapeHtml(group.type)}">` +
        `<button type="button" class="archivexus-codex-group-header" data-action="toggleGroup" data-group="${escapeHtml(group.type)}" aria-expanded="${collapsed ? 'false' : 'true'}">` +
        `<span class="archivexus-codex-group-caret">${collapsed ? '▸' : '▾'}</span> ${escapeHtml(group.type)} <span class="archivexus-codex-group-count">${group.nodes.length}</span>` +
        `</button>` +
        `<ul class="archivexus-codex-rows"${collapsed ? ' hidden' : ''}>${rows}</ul>` +
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
.archivexus-codex-group-header {
  display: block; width: 100%; text-align: left; border: 0; background: transparent; cursor: pointer;
  margin: 0.35rem 0 0.15rem; padding: 0.1rem 0; font-size: var(--font-size-11, 11px);
  text-transform: uppercase; opacity: 0.7;
}
.archivexus-codex-group-header:hover { opacity: 1; }
.archivexus-codex-group-caret { display: inline-block; width: 1em; }
.archivexus-codex-group-count { opacity: 0.6; }
.archivexus-codex-rows { list-style: none; margin: 0; padding: 0; }
.archivexus-codex-rows[hidden] { display: none; }
.archivexus-codex-rows li { display: flex; align-items: center; }
.archivexus-codex-rows li[hidden] { display: none; }
.archivexus-codex-row-label {
  flex: 1 1 auto; min-width: 0; text-align: left; border: 0; background: transparent;
  padding: 0.2rem 0.4rem; border-radius: 3px; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.archivexus-codex-row-label:hover { background: var(--color-hover-bg, rgba(0,0,0,0.06)); }
.archivexus-codex-fav {
  flex: 0 0 auto; border: 0; background: transparent; cursor: pointer;
  padding: 0.2rem 0.3rem; opacity: 0; transition: opacity 0.1s;
}
.archivexus-codex-rows li:hover .archivexus-codex-fav,
.archivexus-codex-fav--on { opacity: 0.85; }
.archivexus-codex-fav:hover { opacity: 1; }
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
.ax-codex-views { margin-bottom: 0.35rem; }
.ax-codex-views-header { display: flex; align-items: center; gap: 0.35rem; width: 100%; text-align: left; background: transparent; border: 0; padding: 0.2rem 0; font-weight: 600; cursor: pointer; }
.ax-codex-views-caret { display: inline-block; width: 1em; }
.ax-codex-views-count { opacity: 0.6; font-size: var(--font-size-11, 11px); }
.ax-codex-views-list { list-style: none; margin: 0; padding: 0; }
.ax-codex-views-list[hidden] { display: none; }
.ax-codex-view-row { display: flex; align-items: center; gap: 0.25rem; }
.ax-codex-view-open { flex: 1 1 auto; text-align: left; background: transparent; border: 0; padding: 0.15rem 0.25rem; cursor: pointer; }
.ax-codex-view-meta { opacity: 0.6; font-size: var(--font-size-11, 11px); }
.ax-codex-view-del { background: transparent; border: 0; opacity: 0.5; cursor: pointer; padding: 0 0.25rem; }
.ax-codex-view-del:hover { opacity: 1; }
.ax-codex-view-hidden { opacity: 0.6; cursor: help; }
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
        toggleGroup(this: CodexSidebarTab, _event: unknown, target: MinimalDomElementLike): void {
          const type = target.getAttribute('data-group');
          if (type) this.#toggleGroup(type);
        },
        toggleFavourite(
          this: CodexSidebarTab,
          _event: unknown,
          target: MinimalDomElementLike,
        ): void {
          const id = target.getAttribute('data-node-id');
          if (id) void this.#toggleFavourite(id);
        },
        toggleSavedViews(this: CodexSidebarTab): void {
          this.#savedViewsCollapsed = !this.#savedViewsCollapsed;
          void this.#renderSavedViews();
        },
        openSavedView(this: CodexSidebarTab, _event: unknown, target: MinimalDomElementLike): void {
          const id = target.getAttribute('data-view-id');
          if (id) openGraphPopout(getStorage, log, { viewId: id });
        },
        deleteSavedView(
          this: CodexSidebarTab,
          _event: unknown,
          target: MinimalDomElementLike,
        ): void {
          const id = target.getAttribute('data-view-id');
          if (id) void this.#deleteSavedView(id);
        },
      },
    };

    #storageReadyHookBound = false;

    /**
     * Per-`node.type` collapsed state (VIEW-001h) — session-only, kept on
     * the singleton tab instance across re-renders. Seeded once from
     * `navigatorGroupsStartExpanded`; a user toggle then overrides per type.
     */
    #groupCollapsed = new Map<string, boolean>();
    #defaultCollapsed = false;
    #groupsSeeded = false;

    /** Per-user favourites (VIEW-001d), refreshed from `game.user` flags on every load. */
    #favouriteIds: ReadonlySet<string> = new Set();
    /** VIEW-001f — the "Saved views" panel's collapsed state (session-only). */
    #savedViewsCollapsed = false;
    /** Last render inputs, so a favourite toggle can re-render without a storage round-trip. */
    #lastRender: { nodes: readonly Node[]; hiddenCount: number; isGM: boolean } | undefined;

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
      // signals storage is up. `relationshipsChanged` also fires when the
      // folder-containment engine (ADAPT-017) adds/removes Nodes or edges.
      // Bound once (the tab is a singleton).
      if (!this.#storageReadyHookBound) {
        this.#storageReadyHookBound = true;
        Hooks.on('archivexus.ready', () => void this._loadNodes());
        Hooks.on('archivexus.relationshipsChanged', () => void this._loadNodes());
        // VIEW-001f — the popout fires this after a curated View is saved/updated.
        Hooks.on('archivexus.viewsChanged', () => void this.#renderSavedViews());
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
        this.#favouriteIds = readFavouriteNodeIds();
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
        await this.#renderSavedViews();
      } catch (error) {
        log.error(`Codex: failed to load nodes: ${errorMessage(error)}`);
        if (listEl) listEl.innerHTML = buildNavigatorStateHTML('error');
      }
    }

    /** VIEW-001f — renders the "Saved views" panel (empty → nothing). Own storage round-trip so `archivexus.viewsChanged` can refresh just this. */
    async #renderSavedViews(): Promise<void> {
      const mount = this.element.querySelector('[data-role="saved-views"]');
      const storage = getStorage();
      if (!mount || !storage) return;
      try {
        const isGM = isViewerGM();
        const views = filterViewsForViewer(sortViews(await storage.listViews()), { isGM });
        const rows = await Promise.all(
          views.map(async (view) => {
            const root = await storage.getNode(view.spec.rootNodeId);
            return toSavedViewRow(view, root?.title ?? view.spec.rootNodeId);
          }),
        );
        mount.innerHTML = buildSavedViewsPanelHTML(rows, {
          isGM,
          collapsed: this.#savedViewsCollapsed,
        });
      } catch (error) {
        log.error(`Codex: failed to load saved views: ${errorMessage(error)}`);
        mount.innerHTML = '';
      }
    }

    async #deleteSavedView(viewId: string): Promise<void> {
      const storage = getStorage();
      if (!storage) return;
      const view = await storage.getView(viewId);
      const dialogV2 = foundry.applications.api.DialogV2 as unknown as {
        confirm(config: { window: { title: string }; content: string }): Promise<boolean>;
      };
      const confirmed = await dialogV2.confirm({
        window: { title: 'Delete saved view' },
        content: `<p>Delete the saved view “<strong>${escapeHtml(view?.title ?? viewId)}</strong>”? The Nodes and relationships it showed are not affected.</p>`,
      });
      if (confirmed !== true) return;
      try {
        await storage.deleteView(viewId);
        await this.#renderSavedViews();
      } catch (error) {
        log.error(`Codex: failed to delete saved view "${viewId}": ${errorMessage(error)}`);
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
      this.#lastRender = { nodes, hiddenCount, isGM };
      const groups = groupNodesWithFavourites(nodes, this.#favouriteIds);
      if (!this.#groupsSeeded) {
        this.#defaultCollapsed = !navigatorGroupsStartExpanded(groups);
        this.#groupsSeeded = true;
      }
      const listEl = this.element.querySelector('[data-role="list"]');
      if (listEl) {
        listEl.innerHTML = buildNavigatorGroupsHTML(
          groups,
          // The pinned favourites group is never auto-collapsed.
          new Set(
            groups
              .map((g) => g.type)
              .filter((type) => type !== FAVOURITES_GROUP_TYPE && this.#collapsedFor(type)),
          ),
          this.#favouriteIds,
        );
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

    #collapsedFor(type: string): boolean {
      return this.#groupCollapsed.get(type) ?? this.#defaultCollapsed;
    }

    /** VIEW-001h: flip one group's collapsed state and reflect it in the DOM (no re-render). */
    #toggleGroup(type: string): void {
      this.#groupCollapsed.set(type, !this.#collapsedFor(type));
      const search = this.element.querySelector('[data-role="search"]');
      this.#applyFilter(search?.value ?? '');
    }

    /**
     * VIEW-001d: flip one Node's favourite state, re-render the list from
     * the cached nodes (so the pinned group and every star update at once),
     * then persist the `game.user` flag.
     */
    async #toggleFavourite(id: string): Promise<void> {
      const next = new Set(this.#favouriteIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      this.#favouriteIds = next;
      if (this.#lastRender) {
        this.#renderNodes(
          this.#lastRender.nodes,
          this.#lastRender.hiddenCount,
          this.#lastRender.isGM,
        );
      }
      try {
        await writeFavouriteNodeIds([...next]);
      } catch (error) {
        log.error(`Codex: failed to persist favourites: ${errorMessage(error)}`);
      }
    }

    /**
     * Client-side filter (no re-render — keeps search-input focus). Toggles
     * row visibility by the lowercased `data-title`; while a search is
     * active every matching group is force-expanded so results always show,
     * and the per-group collapsed state is restored once the query clears.
     */
    #applyFilter(query: string): void {
      const needle = query.trim().toLowerCase();
      const searching = needle.length > 0;
      for (const group of this.element.querySelectorAll('.archivexus-codex-group')) {
        const type = group.getAttribute('data-group') ?? '';
        let anyVisible = false;
        for (const row of group.querySelectorAll('li[data-title]')) {
          const match = !searching || (row.getAttribute('data-title') ?? '').includes(needle);
          row.hidden = !match;
          if (match) anyVisible = true;
        }
        group.hidden = !anyVisible;

        const collapsed = !searching && this.#collapsedFor(type);
        const rows = group.querySelector('.archivexus-codex-rows');
        if (rows) rows.hidden = collapsed;
        const caret = group.querySelector('.archivexus-codex-group-caret');
        if (caret) caret.textContent = collapsed ? '▸' : '▾';
        const header = group.querySelector('.archivexus-codex-group-header');
        header?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
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
