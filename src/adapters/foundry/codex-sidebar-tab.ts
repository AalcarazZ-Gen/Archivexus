import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { resolveTraversal } from '../../core/query/traversal.js';
import {
  CYTOSCAPE_STYLE,
  ensureCytoscape,
  getLoadedCytoscape,
  layoutFor,
  type CytoscapeCoreLike,
} from './cytoscape-loader.js';
import { isViewerGM } from './foundry-viewer.js';
import {
  buildGraphViewElements,
  collectTraversalNodes,
  filterNodesForViewer,
  type GraphViewElement,
} from './graph-view-elements.js';
import { openGraphPopout } from './graph-popout-window.js';
import type { Logger } from './logger.js';

/**
 * The Codex: a first-level Foundry sidebar tab rendering the campaign's
 * whole Knowledge-Element graph (VIEW-001a, implementing
 * `decisions/ADR-0014-graph-view-sidebar-tab.md`). Registered via Foundry's
 * own native `CONFIG.ui.sidebar.TABS` (no third-party sidebar-registration
 * dependency — ADR-0009's posture), rendered with **Cytoscape.js** (the one
 * new runtime dependency ADR-0014 point 3 accepts, since no native Foundry
 * API renders a graph at all).
 *
 * **Verified against a live Foundry v14.367 client (2026-09-08):**
 * - `SidebarTabDescriptor` shape: `{ documentName?, tooltip?, icon?, gmOnly? }`
 *   — the core `settings` tab is the model (no `documentName`, explicit
 *   `tooltip` + `icon`). The tab class is registered at `CONFIG.ui[tabName]`
 *   and `CONFIG.ui.sidebar.TABS === Sidebar.TABS`.
 * - `AbstractSidebarTab` → `ApplicationV2` → `EventEmitter` — **no
 *   HandlebarsApplicationMixin**, so the raw `_renderHTML` (returns a
 *   string) / `_replaceHTML` (inserts it) contract applies, same as
 *   `relationship-list-window.ts`.
 * - **Cytoscape can NOT be a static `import`** — see `cytoscape-loader.ts`
 *   (the guarded lazy loader, extracted so `graph-popout-window.ts`
 *   reuses it). Foundry v13+ locks
 *   `Array.prototype.equals` (and `deepFlatten`/`filterJoin`/`findSplice`/
 *   `partition`) as non-writable, non-configurable. Cytoscape's collection
 *   prototype is `Object.create(Array.prototype)` and `Object.assign`s its
 *   own `equals` onto it during module evaluation → an uncatchable
 *   `TypeError` that killed the whole module bundle at load. Fixed by
 *   loading Cytoscape via a guarded dynamic `import()` (`ensureCytoscape`
 *   below) that swaps in a defensive `Object.assign` — one that falls back
 *   to `defineProperty` when the stock `[[Set]]` would throw — for the
 *   duration of Cytoscape's evaluation only. This also keeps Cytoscape in
 *   its own code-split chunk, off the module's synchronous load path.
 *
 * **Verified end-to-end on Foundry v14.367 (2026-09-08):** the tab loads,
 * auto-pulls the whole graph, single-tap re-renders via `resolveTraversal`,
 * double-tap opens the Node's real sheet, the player-visibility filter
 * works (a player sees only non-`hidden` Nodes).
 *
 * Gestures here are the subset of ADR-0014's Amendment (2026-09-08, A3)
 * that makes sense before VIEW-001b's popout exists: single-tap → "Direct
 * only" view, double-tap → open the Foundry sheet. The full design ("Everything
 * connected", a right-click context menu, and an attached-content Inspector
 * panel) all move to the VIEW-001b popout window — this sidebar tab is
 * slated to become a node navigator (VIEW-001c), not a graph, once that
 * lands.
 *
 * Non-GM viewers only see Nodes whose `visibility` isn't `hidden`
 * (ADR-0003) — `filterNodesForViewer` in `graph-view-elements.ts`, applied
 * to every render path here, and the "N hidden" hint suffix is GM-only.
 * Conservative: a `hidden` Node a specific player was granted access to is
 * still hidden (a per-user, live-permission resolution belongs with a real
 * `View` scope — see ADR-0014 Amendment A4 / A8).
 *
 * What's pure and unit-tested: `graph-view-elements.ts` (element transform
 * + `filterNodesForViewer`), `resolveTraversal` (CORE-005),
 * `buildCodexContentHTML`/`ensureCodexStyles`, and
 * `registerCodexSidebarTab`'s descriptor writing. Still flagged as glue:
 * the render lifecycle timing.
 */

const CODEX_TAB_NAME = 'codex';
const CODEX_TAB_ICON = 'fa-solid fa-share-nodes';
const CODEX_TAB_TOOLTIP = 'Codex';

// ---------------------------------------------------------------------------
// Minimal structural types — no real cytoscape/Foundry/DOM types dependency
// (tsconfig omits the DOM lib; same cast-through-`unknown` tradeoff as
// `sqlite-executor.ts` and `relationship-authoring-window.ts`). The
// Cytoscape shapes + the guarded loader live in `cytoscape-loader.ts`.
// ---------------------------------------------------------------------------

interface CodexContentElementLike {
  innerHTML: string;
  querySelector(selector: string): unknown;
}

interface FoundryDocumentWithSheetLike {
  readonly sheet?: { render(force?: boolean): unknown } | null;
}

interface SidebarTabInstanceLike {
  readonly element: CodexContentElementLike;
  /** `AbstractSidebarTab#active` — whether this tab is the one currently shown in the sidebar (so its container has non-zero size). */
  readonly active: boolean;
  render(force?: boolean): unknown;
}

type SidebarTabConstructor = new (...args: readonly unknown[]) => SidebarTabInstanceLike;
type CodexSidebarTabConstructor = new (...args: readonly unknown[]) => SidebarTabInstanceLike;

/**
 * Minimal shape of the `CONFIG.ui` surface this module writes to — `CONFIG`
 * is otherwise untyped in `foundry-globals.d.ts` (kept deliberately loose,
 * same as `game`/`ui`). `registerCodexSidebarTab` takes this explicitly so
 * it can be unit-tested against a plain object.
 */
export interface FoundryUiConfigLike {
  sidebar: { TABS: Record<string, unknown> };
  [tabName: string]: unknown;
}

// ---------------------------------------------------------------------------
// Rendering markup (pure)
// ---------------------------------------------------------------------------

/** The tab's static shell — a toolbar plus the Cytoscape mount point. Cytoscape needs an explicit height, injected once via `ensureCodexStyles`. */
export function buildCodexContentHTML(): string {
  return (
    `<div class="archivexus-codex">` +
    `<div class="archivexus-codex-toolbar">` +
    `<button type="button" data-action="openPopout" title="Open the full graph in a resizable window">Open graph ⧉</button>` +
    `<button type="button" data-action="resetGraph">Whole graph</button>` +
    `<span class="archivexus-codex-hint" data-role="hint"></span>` +
    `</div>` +
    `<div class="archivexus-codex-canvas" data-role="canvas"></div>` +
    `</div>`
  );
}

const CODEX_STYLE_ELEMENT_ID = 'archivexus-codex-styles';

const CODEX_CSS = `
.archivexus-codex { display: flex; flex-direction: column; height: 100%; }
.archivexus-codex-toolbar { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.archivexus-codex-hint { font-size: var(--font-size-12, 12px); opacity: 0.7; }
.archivexus-codex-canvas { flex: 1 1 auto; min-height: 240px; }
`;

/**
 * Injects the Codex's stylesheet into `<head>` once. Done from code rather
 * than a `module.json` `styles` entry so the Foundry build stays a single
 * `archivexus.js` with no separate CSS asset to wire up (same "keep the
 * ship surface minimal" reasoning as ADR-0006). Guarded by an id so
 * repeated tab renders don't stack duplicates. `document` is reached via
 * `globalThis` since this package's tsconfig omits the DOM lib.
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

/**
 * Lazily builds (and memoizes) the real `AbstractSidebarTab` subclass —
 * deferred behind a function for the same reason as
 * `relationship-list-window.ts`'s `getRelationshipListApplicationClass`:
 * `foundry` is only an ambient type outside a live client, so touching
 * `foundry.applications.sidebar.AbstractSidebarTab` at module-eval time
 * would throw the instant this module is imported anywhere (its own Vitest
 * run included). The class body itself no longer touches Cytoscape — that's
 * loaded on first render via `ensureCytoscape`.
 */
let cachedTabClass: CodexSidebarTabConstructor | undefined;

/** Exported only for tests — production code reaches it via `registerCodexSidebarTab`. */
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
        resetGraph(this: CodexSidebarTab): void {
          void this._renderWholeGraph();
        },
        openPopout(): void {
          openGraphPopout(getStorage, log);
        },
      },
    };

    #cyInstance: CytoscapeCoreLike | undefined;
    #storageReadyHookBound = false;
    /**
     * The most recent graph to show. Held here rather than applied
     * immediately because Cytoscape's layouts read the container's pixel
     * size — and the sidebar can build/refresh this tab while it's the
     * hidden tab (0×0), which piles every node at the origin. `#applyGraph`
     * only runs the layout once the tab is actually the active one; a
     * render that arrives while hidden is flushed by `_onActivate`.
     */
    #pendingElements: readonly GraphViewElement[] | undefined;

    async _prepareContext(options: unknown): Promise<Record<string, unknown>> {
      const base = (await (
        AbstractSidebarTabBase.prototype as {
          _prepareContext(options: unknown): Promise<Record<string, unknown>>;
        }
      )._prepareContext.call(this, options)) as Record<string, unknown>;
      return { ...base };
    }

    /** Awaited by ApplicationV2's render pipeline — the one place Cytoscape's guarded lazy load is driven from. */
    async _renderHTML(): Promise<string> {
      await ensureCytoscape().catch((error: unknown) => {
        log.error(`Codex: Cytoscape failed to load: ${errorMessage(error)}`);
      });
      return buildCodexContentHTML();
    }

    _replaceHTML(result: string, content: CodexContentElementLike): void {
      ensureCodexStyles();
      content.innerHTML = result;

      const cytoscapeFactory = getLoadedCytoscape();
      if (!cytoscapeFactory) {
        return;
      }

      const canvas = content.querySelector('[data-role="canvas"]');
      if (!canvas) {
        log.error('Codex: no canvas element after render — cannot mount the graph.');
        return;
      }

      this.#cyInstance?.destroy();
      this.#cyInstance = cytoscapeFactory({
        container: canvas,
        elements: [],
        style: CYTOSCAPE_STYLE,
        layout: { name: 'preset' },
        wheelSensitivity: 0.2,
      });

      // Gestures — the subset of ADR-0014's Amendment (2026-09-08, A3) that
      // makes sense before VIEW-001b's popout + Inspector panel exist:
      //   single tap  → "Direct only" (1-hop) view of that Node
      //   double tap  → open that Node's real Foundry sheet
      // "Everything connected", the right-click context menu and the
      // attached-content Inspector are all VIEW-001b, in the popout window.
      this.#cyInstance.on('tap', 'node', (event) => {
        void this._focusNode(event.target.id());
      });
      this.#cyInstance.on('dbltap', 'node', (event) => {
        void this._openNodeSheet(event.target.id());
      });

      // Storage is created on Foundry's `ready` hook (STORE-003) and the
      // sidebar can render before that — re-pull the graph once
      // module-entry signals storage is up. Bound once; the tab is a
      // singleton, and the re-render is idempotent.
      if (!this.#storageReadyHookBound) {
        this.#storageReadyHookBound = true;
        Hooks.on('archivexus.ready', () => void this._renderWholeGraph());
      }

      void this._renderWholeGraph();
    }

    /**
     * The tab just became visible — its container now has real dimensions.
     * Flush any graph that was rendered while hidden (layout piled it at the
     * origin), otherwise just re-fit an already-laid-out graph.
     */
    _onActivate(): void {
      (AbstractSidebarTabBase.prototype as { _onActivate?: () => void })._onActivate?.call(this);
      const cy = this.#cyInstance;
      if (!cy) {
        return;
      }
      cy.resize();
      if (this.#pendingElements) {
        this.#applyGraph(true);
      } else if (cy.nodes().length > 0) {
        cy.layout(layoutFor(cy.edges().length)).run();
      }
    }

    async _renderWholeGraph(): Promise<void> {
      const storage = getStorage();
      if (!storage) {
        this.#setHint('Waiting for storage…');
        return;
      }
      try {
        const [allNodes, relationships] = await Promise.all([
          storage.listNodes(),
          storage.listRelationships(),
        ]);
        const isGM = isViewerGM();
        const nodes = filterNodesForViewer(allNodes, { isGM });
        this.#render(buildGraphViewElements(nodes, relationships));
        const hidden = allNodes.length - nodes.length;
        this.#setHint(
          `${nodes.length} nodes · ${relationships.length} relationships` +
            // Only a GM is told how much is hidden — a player shouldn't
            // learn the size of the content they can't see.
            (isGM && hidden > 0 ? ` · ${hidden} hidden` : ''),
        );
      } catch (error) {
        log.error(`Codex: failed to load the whole graph: ${errorMessage(error)}`);
        this.#setHint('Failed to load the graph.');
      }
    }

    async _focusNode(nodeId: string): Promise<void> {
      const storage = getStorage();
      if (!storage) {
        return;
      }
      try {
        const result = await resolveTraversal(storage, { preset: 'direct-only', nodeId });
        const nodes = filterNodesForViewer(collectTraversalNodes(result), { isGM: isViewerGM() });
        this.#render(buildGraphViewElements(nodes, result.relationships));
        this.#setHint(
          `${result.rootNode?.title ?? nodeId} · direct connections (${Math.max(nodes.length - 1, 0)})`,
        );
      } catch (error) {
        log.error(`Codex: failed to focus node "${nodeId}": ${errorMessage(error)}`);
      }
    }

    async _openNodeSheet(nodeId: string): Promise<void> {
      try {
        const doc = (await foundry.utils.fromUuid(nodeId)) as FoundryDocumentWithSheetLike | null;
        doc?.sheet?.render(true);
      } catch (error) {
        log.error(`Codex: failed to open the sheet for "${nodeId}": ${errorMessage(error)}`);
      }
    }

    #render(elements: readonly GraphViewElement[]): void {
      this.#pendingElements = elements;
      this.#applyGraph();
    }

    /**
     * Swaps the canvas to `#pendingElements` and lays them out — but only
     * while the tab is visible (see `#pendingElements`' doc), unless
     * `force` (the tab just became visible via `_onActivate`, whose own
     * `this.active` may not be set yet).
     */
    #applyGraph(force = false): void {
      const cy = this.#cyInstance;
      const elements = this.#pendingElements;
      if (!cy || !elements || (!force && !this.active)) {
        return;
      }
      cy.elements().remove();
      cy.add(elements);
      cy.resize();
      const edgeCount = elements.reduce((n, element) => (element.group === 'edges' ? n + 1 : n), 0);
      cy.layout(layoutFor(edgeCount)).run();
      this.#pendingElements = undefined;
    }

    #setHint(text: string): void {
      const hint = this.element.querySelector('[data-role="hint"]') as {
        textContent: string;
      } | null;
      if (hint) {
        hint.textContent = text;
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
 * Writes both halves of Foundry's native sidebar-tab registration: the
 * descriptor in `CONFIG.ui.sidebar.TABS` (shape confirmed against v14's
 * own `settings` tab — `{ tooltip, icon }`, no `documentName`) and the tab
 * class at `CONFIG.ui[tabName]`.
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
