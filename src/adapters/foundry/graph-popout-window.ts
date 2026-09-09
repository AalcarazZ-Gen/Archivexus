import type { Block } from '../../core/domain/block.js';
import type { Node } from '../../core/domain/node.js';
import { resolveTraversal } from '../../core/query/traversal.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
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
  filterTraversalForViewer,
  type GraphViewElement,
} from './graph-view-elements.js';
import {
  buildClusteredGraphElements,
  buildClusteredTraversal,
  isClusterNodeId,
} from './graph-clusters.js';
import type { Logger } from './logger.js';
import { buildNodeConnections, type NodeConnectionGroup } from './node-connections.js';

/**
 * The graph popout — a standalone, resizable, **singleton** `ApplicationV2`
 * window rendering the campaign's Knowledge-Element graph with Cytoscape.js
 * (VIEW-001b, implementing `decisions/ADR-0014-graph-view-sidebar-tab.md`'s
 * Amendment, A1/A3/A3a/A4/A5). Opened from the sidebar tab (VIEW-001a's
 * "Open graph ⧉" button, and — once VIEW-001c lands — a navigator row
 * click). The sidebar's own in-tab mini-graph stays until VIEW-001c guts it.
 *
 * Deferred-factory-class + raw `_renderHTML`/`_replaceHTML` pattern, same as
 * `relationship-authoring-window.ts` / `relationship-list-window.ts` —
 * `foundry` is only an ambient type outside a live client, so the
 * `ApplicationV2` subclass is built lazily on first `openGraphPopout()`.
 *
 * **What's pure and unit-tested:** `buildGraphPopoutContentHTML`,
 * `buildInspectorHTML`, `buildInspectorEmptyHTML`, `buildContextMenuHTML`,
 * `node-connections.ts`, `graph-view-elements.ts`, `graph-clusters.ts`,
 * `resolveTraversal` (CORE-005). **Still glue, flagged for live
 * verification:** the `ApplicationV2` window lifecycle, Cytoscape
 * mounting/gestures inside it (including VIEW-001e's tap-to-expand on a
 * compound cluster node), `foundry.utils.fromUuid` + `sheet.render(true)`
 * sheet-opening, and the right-click context menu's positioning/dismissal.
 *
 * Non-GM viewers (and a GM with "Preview as player" on) only see Nodes
 * whose `visibility` isn't `hidden` (ADR-0003 / Amendment A4) —
 * `filterNodesForViewer` / `filterTraversalForViewer`, applied on every
 * render path *before* clustering (a collapsed cluster's count must never
 * leak how many hidden Nodes it holds). The preview toggle is labelled
 * "approximate": it reads `Node.visibility` (default document ownership),
 * not per-user grants.
 *
 * VIEW-001e / ADR-0007 point 6 (mandatory) + ADR-0014 A5: the "Everything
 * connected" preset renders its depth-2 ring as collapsed,
 * category-labelled clusters by default (`graph-clusters.ts`), each a
 * Cytoscape compound node — tap to expand in place, "Collapse clusters" to
 * reset. Switching preset / re-rooting / "Whole graph" clears the expansion
 * state.
 */

type Preset = 'direct-only' | 'everything-connected';

const WINDOW_ID = 'archivexus-graph-popout';
const STYLE_ELEMENT_ID = 'archivexus-graph-popout-styles';
const SELECTED_CLASS = 'archivexus-selected';

const LAYOUT_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'cose', label: 'Force' },
  { value: 'grid', label: 'Grid' },
  { value: 'circle', label: 'Circle' },
  { value: 'concentric', label: 'Concentric' },
  { value: 'breadthfirst', label: 'Tree' },
];

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

/** The window's static shell — toolbar, canvas mount, Inspector dock, status line. `isGM` gates the "Preview as player" control. */
export function buildGraphPopoutContentHTML(options: { readonly isGM: boolean }): string {
  const layoutOptions = LAYOUT_OPTIONS.map(
    (option) => `<option value="${option.value}">${option.label}</option>`,
  ).join('');

  const previewControl = options.isGM
    ? `<button type="button" data-action="togglePreview" aria-pressed="false">Preview as player</button>`
    : '';

  return (
    `<div class="archivexus-graph-popout">` +
    `<div class="ax-gp-toolbar">` +
    `<button type="button" data-action="wholeGraph">Whole graph</button>` +
    `<span class="ax-gp-presets" role="group" aria-label="Traversal preset">` +
    `<button type="button" data-action="preset" data-preset="direct-only" aria-pressed="true">Direct</button>` +
    `<button type="button" data-action="preset" data-preset="everything-connected" aria-pressed="false">Everything</button>` +
    `<button type="button" disabled title="Saved curated views — VIEW-001f">Curated</button>` +
    `</span>` +
    `<button type="button" data-action="collapseClusters" data-role="collapse-clusters" hidden>Collapse clusters</button>` +
    `<label class="ax-gp-layout">Layout <select data-action="changeLayout" data-role="layout">${layoutOptions}</select></label>` +
    previewControl +
    `</div>` +
    `<div class="ax-gp-preview-banner" data-role="preview-banner" hidden></div>` +
    `<div class="ax-gp-body">` +
    `<div class="ax-gp-canvas" data-role="canvas"></div>` +
    `<aside class="ax-gp-inspector" data-role="inspector">${buildInspectorEmptyHTML()}</aside>` +
    `</div>` +
    `<div class="ax-gp-status" data-role="status"></div>` +
    `</div>`
  );
}

/** Inspector content before any Node is selected. */
export function buildInspectorEmptyHTML(): string {
  return `<p class="ax-gp-insp-empty">Select a node to see its attached content and connections.</p>`;
}

function buildBlockListHTML(blocks: readonly Block[]): string {
  if (blocks.length === 0) {
    return `<p class="ax-gp-insp-none">Nothing attached.</p>`;
  }
  const items = blocks
    .map((block) => {
      const label = escapeHtml(block.title ?? block.uuid);
      return `<li><a data-action="openBlock" data-uuid="${escapeHtml(block.uuid)}">${label}</a></li>`;
    })
    .join('');
  return `<ul class="ax-gp-insp-blocks">${items}</ul>`;
}

function buildConnectionsHTML(groups: readonly NodeConnectionGroup[]): string {
  if (groups.length === 0) {
    return `<p class="ax-gp-insp-none">No connections yet.</p>`;
  }
  return groups
    .map((group) => {
      const rows = group.rows
        .map((row) => {
          const badge = row.hasBackingActor
            ? ''
            : ` <span class="ax-gp-no-actor" title="Journal only — no Actor yet">◔</span>`;
          return (
            `<li>` +
            `<a data-action="openConnected" data-node-id="${escapeHtml(row.connectedNode.id)}">${escapeHtml(row.connectedNode.title)}</a>` +
            ` <em class="ax-gp-insp-verb">${escapeHtml(row.label)}</em>${badge}` +
            `</li>`
          );
        })
        .join('');
      return `<h5>${escapeHtml(group.label)}</h5><ul class="ax-gp-insp-conns">${rows}</ul>`;
    })
    .join('');
}

/** Inspector content for a selected Node — its type, attached Blocks (A3a), and grouped connections (ADR-0012 points 4–7). */
export function buildInspectorHTML(
  node: Node,
  connectionGroups: readonly NodeConnectionGroup[],
): string {
  const totalConnections = connectionGroups.reduce((n, group) => n + group.rows.length, 0);
  return (
    `<div class="ax-gp-insp-head">` +
    `<span class="ax-gp-insp-title">${escapeHtml(node.title)}</span>` +
    `<span class="ax-gp-insp-type">${escapeHtml(node.type)}</span>` +
    `<button type="button" data-action="openSelectedSheet" data-node-id="${escapeHtml(node.id)}">Open sheet</button>` +
    `</div>` +
    `<section class="ax-gp-insp-section">` +
    `<h4>Attached (${node.blocks.length})</h4>` +
    buildBlockListHTML(node.blocks) +
    `</section>` +
    `<section class="ax-gp-insp-section">` +
    `<h4>Connections (${totalConnections})</h4>` +
    buildConnectionsHTML(connectionGroups) +
    `</section>`
  );
}

/**
 * The right-click context menu (Amendment A3). "Add to favourites" is
 * deliberately not here yet — it needs VIEW-001d's `game.user`-flag store.
 */
export function buildContextMenuHTML(nodeId: string): string {
  const id = escapeHtml(nodeId);
  const items = [
    `<button type="button" data-action="menuOpenSheet" data-node-id="${id}">Open sheet</button>`,
    `<button type="button" data-action="menuReRoot" data-node-id="${id}">Re-root graph here</button>`,
    `<button type="button" data-action="menuEverything" data-node-id="${id}">Everything connected from here</button>`,
  ];
  return `<div class="ax-gp-context-menu" data-role="context-menu">${items.join('')}</div>`;
}

const POPOUT_CSS = `
.archivexus-graph-popout { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.ax-gp-toolbar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; padding: 0.35rem 0.25rem; }
.ax-gp-presets button[aria-pressed="true"] { font-weight: 700; text-decoration: underline; }
.ax-gp-preview-banner { background: var(--color-warm-2, #6a4a1a); color: #fff; padding: 0.25rem 0.5rem; font-size: var(--font-size-12, 12px); }
.ax-gp-body { display: flex; flex: 1 1 auto; min-height: 0; }
.ax-gp-canvas { flex: 1 1 auto; min-width: 0; }
.ax-gp-inspector { flex: 0 0 260px; overflow-y: auto; padding: 0.5rem; border-left: 1px solid var(--color-border-light-primary, #999); font-size: var(--font-size-13, 13px); }
.ax-gp-inspector[hidden] { display: none; }
.ax-gp-insp-head { display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.ax-gp-insp-title { font-weight: 700; }
.ax-gp-insp-type { opacity: 0.6; font-size: var(--font-size-11, 11px); }
.ax-gp-insp-section h4 { margin: 0.5rem 0 0.25rem; }
.ax-gp-insp-section h5 { margin: 0.4rem 0 0.15rem; opacity: 0.75; font-size: var(--font-size-11, 11px); text-transform: uppercase; }
.ax-gp-insp-blocks, .ax-gp-insp-conns { list-style: none; margin: 0; padding: 0; }
.ax-gp-insp-conns li, .ax-gp-insp-blocks li { padding: 0.1rem 0; }
.ax-gp-insp-verb { opacity: 0.6; }
.ax-gp-no-actor { opacity: 0.6; cursor: help; }
.ax-gp-insp-none, .ax-gp-insp-empty { opacity: 0.6; font-style: italic; }
.ax-gp-status { padding: 0.2rem 0.5rem; font-size: var(--font-size-11, 11px); opacity: 0.7; }
.ax-gp-context-overlay { position: fixed; inset: 0; z-index: 999; }
.ax-gp-context-menu { position: fixed; z-index: 1000; display: flex; flex-direction: column; background: var(--color-bg, #1b1b1d); border: 1px solid var(--color-border-light-primary, #999); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.ax-gp-context-menu button { text-align: left; border: 0; background: transparent; padding: 0.3rem 0.7rem; white-space: nowrap; }
.ax-gp-context-menu button:hover { background: var(--color-hover, rgba(255,255,255,0.08)); }
`;

/** Injects the popout stylesheet into `<head>` once (same reasoning as `ensureCodexStyles` — keeps the ship a single `archivexus.js`). */
export function ensureGraphPopoutStyles(): void {
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
  style.textContent = POPOUT_CSS;
  doc.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Data gathering (glue-adjacent, but storage-only — no DOM/Foundry)
// ---------------------------------------------------------------------------

/**
 * Resolves a Node's grouped connections for the Inspector (ADR-0012 points
 * 4–7): a "Direct only" traversal, then one `getRelationshipsForNode` per
 * distinct connected Node for the degree used to order rows. Cheap at
 * Alberto's scale (~102 Nodes); returns `[]` on a storage failure rather
 * than throwing.
 */
export async function gatherNodeConnections(
  storage: StorageProvider,
  nodeId: string,
): Promise<readonly NodeConnectionGroup[]> {
  const [result, definitions] = await Promise.all([
    resolveTraversal(storage, { preset: 'direct-only', nodeId }),
    storage.listRelationshipDefinitions(),
  ]);
  const connectedNodesById = new Map(result.nodes.map((node) => [node.id, node]));
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const degreeByNodeId = new Map<string, number>();
  for (const node of result.nodes) {
    degreeByNodeId.set(node.id, (await storage.getRelationshipsForNode(node.id)).length);
  }
  return buildNodeConnections({
    rootNodeId: nodeId,
    relationships: result.relationships,
    connectedNodesById,
    definitionsById,
    degreeByNodeId,
  });
}

// ---------------------------------------------------------------------------
// Foundry glue — the ApplicationV2 popout
// ---------------------------------------------------------------------------

interface MinimalElementLike {
  innerHTML: string;
  hidden: boolean;
  textContent: string | null;
  readonly value: string;
  readonly dataset?: Record<string, string | undefined>;
  style?: { left: string; top: string };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  querySelector(selector: string): MinimalElementLike | null;
  querySelectorAll(selector: string): Iterable<MinimalElementLike>;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  remove(): void;
  appendChild(node: unknown): unknown;
}

interface GraphPopoutInstanceLike {
  readonly element: MinimalElementLike;
  render(force?: boolean): unknown;
  close(options?: unknown): Promise<unknown>;
}

type ApplicationV2Constructor = new (options?: Record<string, unknown>) => GraphPopoutInstanceLike;
type GraphPopoutConstructor = new (options: GraphPopoutOptions) => GraphPopoutInstanceLike;

export interface GraphPopoutOptions {
  readonly getStorage: () => StorageProvider | undefined;
  readonly log: Logger;
  readonly rootNodeId?: string;
}

interface FoundryDocumentWithSheetLike {
  readonly sheet?: { render(force?: boolean): unknown } | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function openSheetFor(uuid: string, log: Logger): Promise<void> {
  try {
    const doc = (await foundry.utils.fromUuid(uuid)) as FoundryDocumentWithSheetLike | null;
    doc?.sheet?.render(true);
  } catch (error) {
    log.error(`Graph popout: failed to open the sheet for "${uuid}": ${errorMessage(error)}`);
  }
}

let cachedClass: GraphPopoutConstructor | undefined;
let openInstance: GraphPopoutInstanceLike | undefined;

function getGraphPopoutApplicationClass(): GraphPopoutConstructor {
  if (cachedClass) {
    return cachedClass;
  }

  const ApplicationV2Base = foundry.applications.api
    .ApplicationV2 as unknown as ApplicationV2Constructor;

  class GraphPopoutApplication extends ApplicationV2Base {
    static DEFAULT_OPTIONS = {
      id: WINDOW_ID,
      tag: 'div',
      window: { title: 'Codex — Graph', icon: 'fa-solid fa-share-nodes', resizable: true },
      position: { width: 900, height: 640 },
      actions: {
        wholeGraph(this: GraphPopoutApplication): void {
          this.#rootNodeId = undefined;
          this.#expandedClusters.clear();
          void this._renderGraph();
        },
        preset(this: GraphPopoutApplication, _event: unknown, target: MinimalElementLike): void {
          const value = target.getAttribute('data-preset');
          if (value === 'direct-only' || value === 'everything-connected') {
            this.#preset = value;
            this.#expandedClusters.clear();
            this.#syncPresetButtons();
            void this._renderGraph();
          }
        },
        collapseClusters(this: GraphPopoutApplication): void {
          if (this.#expandedClusters.size === 0) {
            return;
          }
          this.#expandedClusters.clear();
          void this._renderGraph();
        },
        changeLayout(
          this: GraphPopoutApplication,
          _event: unknown,
          target: MinimalElementLike,
        ): void {
          this.#layout = target.value || 'auto';
          this._applyLayout();
        },
        togglePreview(
          this: GraphPopoutApplication,
          _event: unknown,
          target: MinimalElementLike,
        ): void {
          this.#previewAsPlayer = !this.#previewAsPlayer;
          target.setAttribute('aria-pressed', String(this.#previewAsPlayer));
          void this._renderGraph();
        },
        openSelectedSheet(
          this: GraphPopoutApplication,
          _event: unknown,
          target: MinimalElementLike,
        ): void {
          const id = target.getAttribute('data-node-id');
          if (id) void openSheetFor(id, this.#log);
        },
        openBlock(this: GraphPopoutApplication, _event: unknown, target: MinimalElementLike): void {
          const uuid = target.getAttribute('data-uuid');
          if (uuid) void openSheetFor(uuid, this.#log);
        },
        openConnected(
          this: GraphPopoutApplication,
          _event: unknown,
          target: MinimalElementLike,
        ): void {
          const id = target.getAttribute('data-node-id');
          if (id) void this._selectNode(id);
        },
        // The right-click context menu is appended to `document.body` —
        // outside the app element — so its buttons are wired directly in
        // `#showContextMenu`, not through this `actions` map.
      },
    };

    readonly #getStorage: () => StorageProvider | undefined;
    readonly #log: Logger;
    #rootNodeId: string | undefined;
    #preset: Preset = 'direct-only';
    #layout = 'auto';
    #previewAsPlayer = false;
    #cy: CytoscapeCoreLike | undefined;
    #selectedNodeId: string | undefined;
    #contextMenu: MinimalElementLike | undefined;
    /** VIEW-001e — cluster node ids the GM has expanded in the "Everything connected" view. */
    readonly #expandedClusters = new Set<string>();
    #clusterCount = 0;

    constructor(options: GraphPopoutOptions) {
      super(options as unknown as Record<string, unknown>);
      this.#getStorage = options.getStorage;
      this.#log = options.log;
      this.#rootNodeId = options.rootNodeId;
    }

    /** Public — `openGraphPopout` re-points an already-open window at a new root without spawning a duplicate. */
    setRoot(rootNodeId: string | undefined): void {
      this.#rootNodeId = rootNodeId;
      this.#expandedClusters.clear();
      void this._renderGraph();
    }

    async _renderHTML(): Promise<string> {
      await ensureCytoscape().catch((error: unknown) => {
        this.#log.error(`Graph popout: Cytoscape failed to load: ${errorMessage(error)}`);
      });
      return buildGraphPopoutContentHTML({ isGM: isViewerGM() });
    }

    _replaceHTML(result: string, content: MinimalElementLike): void {
      ensureGraphPopoutStyles();
      content.innerHTML = result;

      const canvas = content.querySelector('[data-role="canvas"]');
      const factory = getLoadedCytoscape();
      if (!canvas || !factory) {
        this.#log.error('Graph popout: no canvas / Cytoscape not ready — cannot mount the graph.');
        return;
      }

      this.#cy?.destroy();
      this.#cy = factory({
        container: canvas,
        elements: [],
        style: CYTOSCAPE_STYLE,
        layout: { name: 'preset' },
        wheelSensitivity: 0.2,
      });

      // Gestures (Amendment A3): single-tap = select + Inspector; double-tap
      // = open sheet; right-click = context menu. A synthetic cluster node
      // (VIEW-001e) has none of those — a tap toggles its expansion instead.
      this.#cy.on('tap', 'node', (event) => {
        const id = event.target.id();
        if (isClusterNodeId(id)) {
          this.#toggleCluster(id);
        } else {
          void this._selectNode(id);
        }
      });
      this.#cy.on('dbltap', 'node', (event) => {
        const id = event.target.id();
        if (!isClusterNodeId(id)) void openSheetFor(id, this.#log);
      });
      this.#cy.on('cxttap', 'node', (event) => {
        const id = event.target.id();
        if (isClusterNodeId(id)) return;
        event.originalEvent?.preventDefault?.();
        this.#showContextMenu(
          id,
          event.originalEvent?.clientX ?? 0,
          event.originalEvent?.clientY ?? 0,
        );
      });
      this.#cy.on('tap', 'core', () => this.#dismissContextMenu());

      void this._renderGraph();
    }

    _onClose(): void {
      this.#dismissContextMenu();
      this.#cy?.destroy();
      this.#cy = undefined;
      if (openInstance === (this as unknown as GraphPopoutInstanceLike)) {
        openInstance = undefined;
      }
    }

    async _renderGraph(): Promise<void> {
      const storage = this.#getStorage();
      if (!storage) {
        this.#setStatus('Waiting for storage…');
        return;
      }
      const isGM = isViewerGM() && !this.#previewAsPlayer;
      try {
        let elements: readonly GraphViewElement[];
        let visibleCount: number;
        let hiddenCount: number;
        let relationshipCount: number;

        if (this.#rootNodeId === undefined) {
          const [allNodes, relationships] = await Promise.all([
            storage.listNodes(),
            storage.listRelationships(),
          ]);
          const nodes = filterNodesForViewer(allNodes, { isGM });
          elements = buildGraphViewElements(nodes, relationships);
          visibleCount = nodes.length;
          hiddenCount = allNodes.length - nodes.length;
          relationshipCount = relationships.length;
        } else {
          const traversal = await resolveTraversal(storage, {
            preset: this.#preset,
            nodeId: this.#rootNodeId,
          });
          const allReached = collectTraversalNodes(traversal);
          const visibleTraversal = filterTraversalForViewer(traversal, { isGM });
          const visibleReached = collectTraversalNodes(visibleTraversal);
          hiddenCount = allReached.length - visibleReached.length;
          relationshipCount = visibleTraversal.relationships.length;
          visibleCount = visibleReached.length;

          if (this.#preset === 'everything-connected') {
            // VIEW-001e / ADR-0007 point 6: the depth-2 ring renders as
            // collapsed, category-labelled clusters by default.
            const definitions = await storage.listRelationshipDefinitions();
            const definitionsById = new Map(definitions.map((d) => [d.id, d]));
            const clustered = buildClusteredTraversal(visibleTraversal, definitionsById);
            const liveClusterIds = new Set(clustered.clusters.map((c) => c.id));
            for (const id of [...this.#expandedClusters]) {
              if (!liveClusterIds.has(id)) this.#expandedClusters.delete(id);
            }
            elements = buildClusteredGraphElements(
              visibleTraversal,
              clustered,
              this.#expandedClusters,
            );
            this.#clusterCount = clustered.clusters.length;
          } else {
            elements = buildGraphViewElements(visibleReached, visibleTraversal.relationships);
            this.#clusterCount = 0;
          }
        }

        this.#applyElements(elements);
        this.#updatePreviewBanner(hiddenCount);
        this.#updateCollapseButton();
        const rootLabel = this.#rootNodeId
          ? ` · rooted (${this.#preset === 'direct-only' ? 'direct' : 'everything'})`
          : '';
        const hiddenLabel = isViewerGM() && hiddenCount > 0 ? ` · ${hiddenCount} hidden` : '';
        const clusterLabel =
          this.#clusterCount > 0
            ? ` · ${this.#expandedClusters.size}/${this.#clusterCount} clusters expanded`
            : '';
        this.#setStatus(
          `${visibleCount} nodes · ${relationshipCount} relationships${rootLabel}${clusterLabel}${hiddenLabel}`,
        );
        if (this.#selectedNodeId) {
          this.#cy?.getElementById(this.#selectedNodeId).addClass(SELECTED_CLASS);
        }
      } catch (error) {
        this.#log.error(`Graph popout: failed to render the graph: ${errorMessage(error)}`);
        this.#setStatus('Failed to load the graph.');
      }
    }

    async _selectNode(nodeId: string): Promise<void> {
      const storage = this.#getStorage();
      if (!storage) {
        return;
      }
      this.#selectedNodeId = nodeId;
      this.#cy?.nodes().removeClass(SELECTED_CLASS);
      this.#cy?.getElementById(nodeId).addClass(SELECTED_CLASS);

      const inspector = this.element.querySelector('[data-role="inspector"]');
      if (!inspector) {
        return;
      }
      try {
        const [node, groups] = await Promise.all([
          storage.getNode(nodeId),
          gatherNodeConnections(storage, nodeId),
        ]);
        inspector.innerHTML = node ? buildInspectorHTML(node, groups) : buildInspectorEmptyHTML();
      } catch (error) {
        this.#log.error(`Graph popout: failed to inspect "${nodeId}": ${errorMessage(error)}`);
      }
    }

    _applyLayout(): void {
      const cy = this.#cy;
      if (!cy) {
        return;
      }
      cy.resize();
      cy.layout(layoutFor(cy.edges().length, this.#layout)).run();
    }

    #applyElements(elements: readonly GraphViewElement[]): void {
      const cy = this.#cy;
      if (!cy) {
        return;
      }
      cy.elements().remove();
      cy.add(elements);
      cy.resize();
      const edgeCount = elements.reduce((n, element) => (element.group === 'edges' ? n + 1 : n), 0);
      cy.layout(layoutFor(edgeCount, this.#layout)).run();
    }

    #syncPresetButtons(): void {
      for (const button of this.element.querySelectorAll('[data-action="preset"]')) {
        button.setAttribute(
          'aria-pressed',
          String(button.getAttribute('data-preset') === this.#preset),
        );
      }
    }

    #toggleCluster(clusterId: string): void {
      if (this.#expandedClusters.has(clusterId)) {
        this.#expandedClusters.delete(clusterId);
      } else {
        this.#expandedClusters.add(clusterId);
      }
      void this._renderGraph();
    }

    #updateCollapseButton(): void {
      const button = this.element.querySelector('[data-role="collapse-clusters"]');
      if (button) {
        button.hidden = this.#expandedClusters.size === 0;
      }
    }

    #updatePreviewBanner(hiddenCount: number): void {
      const banner = this.element.querySelector('[data-role="preview-banner"]');
      if (!banner) {
        return;
      }
      if (this.#previewAsPlayer) {
        banner.hidden = false;
        banner.textContent = `Previewing as player (approximate) — ${hiddenCount} node(s) hidden.`;
      } else {
        banner.hidden = true;
      }
    }

    #setStatus(text: string): void {
      const status = this.element.querySelector('[data-role="status"]');
      if (status) {
        status.textContent = text;
      }
    }

    #showContextMenu(nodeId: string, x: number, y: number): void {
      this.#dismissContextMenu();
      const doc = (globalThis as { document?: unknown }).document as
        | {
            createElement(tag: string): MinimalElementLike;
            body: { appendChild(node: unknown): unknown };
          }
        | undefined;
      if (!doc) {
        return;
      }
      // A full-viewport overlay hosts the menu so a click anywhere else
      // dismisses it. ApplicationV2's `actions` map only dispatches for
      // clicks inside the app element, and this overlay is on `document.body`,
      // so the menu buttons are wired directly.
      const overlay = doc.createElement('div');
      overlay.setAttribute('class', 'ax-gp-context-overlay');
      overlay.innerHTML = buildContextMenuHTML(nodeId);
      overlay.addEventListener('click', () => this.#dismissContextMenu());
      const menu = overlay.querySelector('[data-role="context-menu"]');
      if (menu?.style) {
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        for (const button of menu.querySelectorAll('button[data-action]')) {
          const action = button.getAttribute('data-action');
          button.addEventListener('click', () => this.#runMenuAction(action, nodeId));
        }
      }
      doc.body.appendChild(overlay);
      this.#contextMenu = overlay;
    }

    #runMenuAction(action: string | null, nodeId: string): void {
      this.#dismissContextMenu();
      switch (action) {
        case 'menuOpenSheet':
          void openSheetFor(nodeId, this.#log);
          break;
        case 'menuReRoot':
          this.#rootNodeId = nodeId;
          this.#expandedClusters.clear();
          void this._renderGraph().then(() => this._selectNode(nodeId));
          break;
        case 'menuEverything':
          this.#rootNodeId = nodeId;
          this.#preset = 'everything-connected';
          this.#expandedClusters.clear();
          this.#syncPresetButtons();
          void this._renderGraph().then(() => this._selectNode(nodeId));
          break;
        default:
          break;
      }
    }

    #dismissContextMenu(): void {
      this.#contextMenu?.remove();
      this.#contextMenu = undefined;
    }
  }

  cachedClass = GraphPopoutApplication as unknown as GraphPopoutConstructor;
  return cachedClass;
}

/**
 * Opens the graph popout, or focuses (and optionally re-roots) the one
 * already open — singleton, per Amendment A1. Safe to call before a Foundry
 * client exists only in the sense that it builds the class lazily; it does
 * touch `foundry.applications.api.ApplicationV2`, so it's Foundry-runtime
 * code, not import-safe.
 */
export function openGraphPopout(
  getStorage: () => StorageProvider | undefined,
  log: Logger,
  options: { readonly rootNodeId?: string } = {},
): void {
  const ApplicationClass = getGraphPopoutApplicationClass();
  if (openInstance) {
    (openInstance as unknown as { setRoot(id: string | undefined): void }).setRoot(
      options.rootNodeId,
    );
    openInstance.render(true);
    return;
  }
  openInstance = new ApplicationClass({ getStorage, log, ...options });
  openInstance.render(true);
}
