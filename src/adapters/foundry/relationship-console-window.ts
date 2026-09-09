import type { Node } from '../../core/domain/node.js';
import type { Relationship } from '../../core/domain/relationship.js';
import {
  RELATIONSHIP_TRAVERSAL_CATEGORIES,
  type RelationshipDefinition,
  type RelationshipTraversalCategory,
} from '../../core/domain/relationship-definition.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { openGraphPopout } from './graph-popout-window.js';
import type { Logger } from './logger.js';
import { ensureArchivexusStyles } from './archivexus-styles.js';
import { categoryLabel, UNCATEGORIZED_KEY } from './node-connections.js';
import { openRelationshipAuthoringWindow } from './relationship-authoring-window.js';
import type { ResolvedDroppedNode } from './relationship-node-resolution.js';

/**
 * VIEW-001i — the Relationship Console. Alberto's ask: *"I need a way to
 * easily set up all relations… I haven't seen a clear way to set up the
 * whole world."* Relationship authoring isn't broken, it's scattered across
 * per-sheet header dropdowns. This is the one visible, world-level
 * "sit down and wire the campaign" surface — a singleton `ApplicationV2`
 * launched from a button in the Codex sidebar toolbar (ADR-0014 Amendment 2:
 * not a second sidebar tab — too narrow; not a tab in the graph popout —
 * couples lifetimes).
 *
 * **Subsumes ADAPT-011** (the never-built per-node connections panel):
 * "filter: involves node X" is that view. Category labelling is shared with
 * the Inspector via `node-connections.ts`'s `categoryLabel` (Rule 4).
 *
 * **Scope (v1, issue #67):** list every Relationship, search, filter (by
 * category / Definition / involves-node / dangling-only), group by category
 * or flat, create (→ the canonical ADAPT-007 authoring window, prefilled),
 * delete (the ADAPT-013 `DialogV2.confirm`), "See in graph" per row. **Not**
 * v1: relationship-instance editing (swap-direction / change-Definition —
 * ADR-0013 scoped it out; type-authoring is ADAPT-014), bulk / multi-select.
 *
 * **Pure and unit-tested:** `buildConsoleRows`, `filterConsoleRows`,
 * `groupConsoleRows`, and every `build*HTML`. **Foundry glue, flagged for
 * live verification:** the `ApplicationV2` subclass, its `actions` wiring,
 * `DialogV2.confirm`, and the filter-control `[name=…]` reads.
 */

// ---------------------------------------------------------------------------
// Pure row model + transforms
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export type ConsoleCategory = RelationshipTraversalCategory | typeof UNCATEGORIZED_KEY;

export interface ConsoleRow {
  readonly id: string;
  readonly title: string;
  readonly category: ConsoleCategory;
  readonly definitionId: string;
  readonly definitionName: string;
  readonly originId: string;
  readonly targetId: string;
  readonly originTitle: string;
  readonly targetTitle: string;
  /** An endpoint is JournalEntryPage-backed with no Actor (ADR-0012 point 6 — id prefix, ADR-0001). */
  readonly hasJournalOnlyEndpoint: boolean;
  /** An endpoint no longer resolves to a stored Node (ADR-0007 point 8) — the "dangling only" cleanup filter. */
  readonly dangling: boolean;
}

function endpointIsActor(nodeId: string): boolean {
  return nodeId.startsWith('Actor.');
}

/** Pure: one `ConsoleRow` per Relationship, resolving titles/category/flags from the given lookups. */
export function buildConsoleRows(
  relationships: readonly Relationship[],
  nodesById: ReadonlyMap<string, Node>,
  definitionsById: ReadonlyMap<string, RelationshipDefinition>,
): readonly ConsoleRow[] {
  return relationships.map((relationship) => {
    const definition = definitionsById.get(relationship.definitionId);
    const originNode = nodesById.get(relationship.origin);
    const targetNode = nodesById.get(relationship.target);
    return {
      id: relationship.id,
      title: relationship.title,
      category: definition?.traversalCategory ?? UNCATEGORIZED_KEY,
      definitionId: relationship.definitionId,
      definitionName: definition?.name ?? relationship.definitionId,
      originId: relationship.origin,
      targetId: relationship.target,
      originTitle: originNode?.title ?? relationship.origin,
      targetTitle: targetNode?.title ?? relationship.target,
      hasJournalOnlyEndpoint:
        !endpointIsActor(relationship.origin) || !endpointIsActor(relationship.target),
      dangling: !originNode || !targetNode,
    };
  });
}

export interface ConsoleFilters {
  /** Free-text, matched against title + both endpoint titles + definition name. */
  readonly query: string;
  /** `''` = all. */
  readonly category: string;
  /** `''` = all. */
  readonly definitionId: string;
  /** `''` = off. A Node id — keeps only rows with that Node as an endpoint (subsumes ADAPT-011). */
  readonly involvesNodeId: string;
  readonly danglingOnly: boolean;
}

export const EMPTY_CONSOLE_FILTERS: ConsoleFilters = {
  query: '',
  category: '',
  definitionId: '',
  involvesNodeId: '',
  danglingOnly: false,
};

function rowHaystack(row: ConsoleRow): string {
  return `${row.title} ${row.originTitle} ${row.targetTitle} ${row.definitionName}`.toLowerCase();
}

/** Pure: applies every active filter. */
export function filterConsoleRows(
  rows: readonly ConsoleRow[],
  filters: ConsoleFilters,
): readonly ConsoleRow[] {
  const needle = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (needle.length > 0 && !rowHaystack(row).includes(needle)) return false;
    if (filters.category.length > 0 && row.category !== filters.category) return false;
    if (filters.definitionId.length > 0 && row.definitionId !== filters.definitionId) return false;
    if (
      filters.involvesNodeId.length > 0 &&
      row.originId !== filters.involvesNodeId &&
      row.targetId !== filters.involvesNodeId
    ) {
      return false;
    }
    if (filters.danglingOnly && !row.dangling) return false;
    return true;
  });
}

export interface ConsoleGroup {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly ConsoleRow[];
}

const CATEGORY_KEYS: readonly ConsoleCategory[] = [
  ...RELATIONSHIP_TRAVERSAL_CATEGORIES,
  UNCATEGORIZED_KEY,
];

/** Pure: `'flat'` → one title-sorted group; `'category'` → taxonomy order, `Other` last, empty groups dropped. */
export function groupConsoleRows(
  rows: readonly ConsoleRow[],
  mode: 'category' | 'flat',
): readonly ConsoleGroup[] {
  const byTitle = (a: ConsoleRow, b: ConsoleRow): number => a.title.localeCompare(b.title);
  if (mode === 'flat') {
    return rows.length > 0 ? [{ key: 'all', label: '', rows: [...rows].sort(byTitle) }] : [];
  }
  const groups: ConsoleGroup[] = [];
  for (const key of CATEGORY_KEYS) {
    const groupRows = rows.filter((row) => row.category === key);
    if (groupRows.length > 0) {
      groups.push({ key, label: categoryLabel(key), rows: groupRows.sort(byTitle) });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Pure markup builders
// ---------------------------------------------------------------------------

function selectOptionsHTML(
  entries: readonly { value: string; label: string }[],
  selected: string,
  allLabel: string,
): string {
  const head = `<option value=""${selected.length === 0 ? ' selected' : ''}>${escapeHtml(allLabel)}</option>`;
  return (
    head +
    entries
      .map(
        ({ value, label }) =>
          `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`,
      )
      .join('')
  );
}

export function buildConsoleFiltersHTML(
  definitions: readonly RelationshipDefinition[],
  filters: ConsoleFilters,
  groupMode: 'category' | 'flat',
  involvesNodeTitle: string | undefined,
): string {
  const categoryEntries = CATEGORY_KEYS.map((key) => ({ value: key, label: categoryLabel(key) }));
  const definitionEntries = definitions.map((definition) => ({
    value: definition.id,
    label: definition.name,
  }));
  const nodeChip =
    involvesNodeTitle !== undefined
      ? `<button type="button" class="archivexus-console-chip" data-action="clearNodeFilter" title="Clear this filter">Involving: ${escapeHtml(involvesNodeTitle)} ✕</button>`
      : '';
  return (
    `<div class="archivexus-console-filters">` +
    `<div class="archivexus-console-filter-row">` +
    `<input type="search" data-role="console-search" placeholder="Search relationships…" value="${escapeHtml(filters.query)}" autocomplete="off" />` +
    `<button type="button" data-action="newRelationship" class="archivexus-console-new">+ New relationship</button>` +
    `</div>` +
    `<div class="archivexus-console-filter-row">` +
    `<select name="category" title="Filter by traversal category">${selectOptionsHTML(categoryEntries, filters.category, 'All categories')}</select>` +
    `<select name="definitionId" title="Filter by relationship type">${selectOptionsHTML(definitionEntries, filters.definitionId, 'All types')}</select>` +
    `<label class="archivexus-console-check"><input type="checkbox" name="danglingOnly"${filters.danglingOnly ? ' checked' : ''} /> Dangling only</label>` +
    `<button type="button" data-action="toggleGroup" title="Toggle grouping">Group: ${groupMode === 'category' ? 'Category' : 'Flat'}</button>` +
    `</div>` +
    (nodeChip ? `<div class="archivexus-console-filter-row">${nodeChip}</div>` : '') +
    `</div>`
  );
}

export function buildConsoleRowsHTML(
  groups: readonly ConsoleGroup[],
  hasAnyRelationships: boolean,
): string {
  if (groups.length === 0) {
    return `<p class="archivexus-console-empty" data-role="console-empty">${
      hasAnyRelationships
        ? 'No relationships match these filters.'
        : 'No relationships yet. Use “+ New relationship” to connect two Nodes.'
    }</p>`;
  }
  return groups
    .map((group) => {
      const rows = group.rows
        .map((row) => {
          const search = escapeHtml(rowHaystack(row));
          const chips =
            `<span class="archivexus-console-cat">${escapeHtml(categoryLabel(row.category))}</span>` +
            ` <span class="archivexus-console-def">${escapeHtml(row.definitionName)}</span>` +
            (row.dangling
              ? ` <span class="archivexus-console-flag archivexus-console-flag--warn" title="An endpoint no longer exists">dangling</span>`
              : '') +
            (row.hasJournalOnlyEndpoint
              ? ` <span class="archivexus-console-flag" title="An endpoint is a Journal page with no Actor">◔</span>`
              : '');
          return (
            `<li class="archivexus-console-row" data-relationship-id="${escapeHtml(row.id)}" data-search="${search}">` +
            `<div class="archivexus-console-row-title">${escapeHtml(row.title)}</div>` +
            `<div class="archivexus-console-row-meta">${chips}</div>` +
            `<div class="archivexus-console-row-actions">` +
            `<button type="button" data-action="seeInGraph" data-relationship-id="${escapeHtml(row.id)}">See in graph</button>` +
            `<button type="button" data-action="delete" data-relationship-id="${escapeHtml(row.id)}">Delete</button>` +
            `</div>` +
            `</li>`
          );
        })
        .join('');
      const header = group.label
        ? `<h4 class="archivexus-console-group-header">${escapeHtml(group.label)} <span class="archivexus-console-group-count">${group.rows.length}</span></h4>`
        : '';
      return `<section class="archivexus-console-group" data-console-group="${escapeHtml(group.key)}">${header}<ul class="archivexus-console-rows">${rows}</ul></section>`;
    })
    .join('');
}

export function buildConsoleContentHTML(
  groups: readonly ConsoleGroup[],
  definitions: readonly RelationshipDefinition[],
  filters: ConsoleFilters,
  groupMode: 'category' | 'flat',
  involvesNodeTitle: string | undefined,
  shownCount: number,
  totalCount: number,
): string {
  return (
    `<div class="archivexus archivexus-console">` +
    buildConsoleFiltersHTML(definitions, filters, groupMode, involvesNodeTitle) +
    `<div class="archivexus-console-list" data-role="console-list">${buildConsoleRowsHTML(groups, totalCount > 0)}</div>` +
    `<div class="archivexus-console-count" data-role="console-count">${shownCount} of ${totalCount} shown</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Foundry glue — minimal structural types, deferred singleton class
// ---------------------------------------------------------------------------

interface MinimalDomElementLike {
  innerHTML: string;
  hidden: boolean;
  textContent: string | null;
  readonly value: string;
  readonly checked: boolean;
  getAttribute(name: string): string | null;
  querySelector(selector: string): MinimalDomElementLike | null;
  querySelectorAll(selector: string): Iterable<MinimalDomElementLike>;
  addEventListener(type: string, listener: (event: unknown) => void): void;
}

interface ConsoleInstanceLike {
  readonly element: MinimalDomElementLike;
  render(force?: boolean): unknown;
  close(options?: unknown): Promise<unknown>;
}

type ApplicationV2Constructor = new (options?: Record<string, unknown>) => ConsoleInstanceLike;
type ConsoleConstructor = new (options: ConsoleApplicationOptions) => ConsoleInstanceLike;

export interface ConsoleApplicationOptions {
  readonly storage: StorageProvider;
  readonly log: Logger;
  /** Pre-set the "involves node X" filter — how a navigator row / sheet context menu opens the Console scoped to one Node. */
  readonly involvesNodeId?: string;
}

interface FoundryDialogV2Like {
  confirm(config: {
    window?: { title?: string };
    content?: string;
    modal?: boolean;
  }): Promise<boolean | null | undefined>;
}

type ConsoleInstance = ConsoleInstanceLike & { setNodeFilter(id: string | undefined): void };

let cachedClass: ConsoleConstructor | undefined;
let openInstance: ConsoleInstance | undefined;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Exported only for tests — production reaches it via `openRelationshipConsole`. */
export function getRelationshipConsoleClass(): ConsoleConstructor {
  if (cachedClass) {
    return cachedClass;
  }

  const ApplicationV2Base = foundry.applications.api
    .ApplicationV2 as unknown as ApplicationV2Constructor;

  class RelationshipConsoleApplication extends ApplicationV2Base {
    static DEFAULT_OPTIONS = {
      id: 'archivexus-relationship-console',
      tag: 'div',
      window: {
        title: 'Codex — Relationships',
        icon: 'fa-solid fa-diagram-project',
        resizable: true,
      },
      position: { width: 640, height: 'auto' },
      actions: {
        newRelationship(this: RelationshipConsoleApplication): void {
          void this._openAuthoring();
        },
        toggleGroup(this: RelationshipConsoleApplication): void {
          this.#groupMode = this.#groupMode === 'category' ? 'flat' : 'category';
          this.render(true);
        },
        clearNodeFilter(this: RelationshipConsoleApplication): void {
          this.#involvesNodeId = undefined;
          this.render(true);
        },
        seeInGraph(
          this: RelationshipConsoleApplication,
          _event: unknown,
          target: MinimalDomElementLike,
        ): void {
          const id = target.getAttribute('data-relationship-id');
          const row = id ? this.#rows.find((candidate) => candidate.id === id) : undefined;
          if (row) {
            openGraphPopout(() => this.#storage, this.#log, { rootNodeId: row.originId });
          }
        },
        delete(
          this: RelationshipConsoleApplication,
          _event: unknown,
          target: MinimalDomElementLike,
        ): void {
          const id = target.getAttribute('data-relationship-id');
          if (id) void this._onDelete(id);
        },
      },
    };

    readonly #storage: StorageProvider;
    readonly #log: Logger;

    #rows: readonly ConsoleRow[] = [];
    #definitions: readonly RelationshipDefinition[] = [];
    #nodesById: ReadonlyMap<string, Node> = new Map();
    #dataLoaded = false;
    #changeHookBound = false;
    readonly #onRelationshipsChanged = (): void => this.#reload();

    #query = '';
    #category = '';
    #definitionId = '';
    #danglingOnly = false;
    #groupMode: 'category' | 'flat' = 'category';
    #involvesNodeId: string | undefined;

    constructor(options: ConsoleApplicationOptions) {
      super(options as unknown as Record<string, unknown>);
      this.#storage = options.storage;
      this.#log = options.log;
      this.#involvesNodeId = options.involvesNodeId;
    }

    setNodeFilter(id: string | undefined): void {
      this.#involvesNodeId = id;
      this.render(true);
    }

    #filters(): ConsoleFilters {
      return {
        query: this.#query,
        category: this.#category,
        definitionId: this.#definitionId,
        involvesNodeId: this.#involvesNodeId ?? '',
        danglingOnly: this.#danglingOnly,
      };
    }

    async _renderHTML(): Promise<string> {
      if (!this.#dataLoaded) {
        await this.#loadData();
      }
      const filtered = filterConsoleRows(this.#rows, this.#filters());
      const groups = groupConsoleRows(filtered, this.#groupMode);
      const involvesTitle =
        this.#involvesNodeId !== undefined
          ? (this.#nodesById.get(this.#involvesNodeId)?.title ?? this.#involvesNodeId)
          : undefined;
      return buildConsoleContentHTML(
        groups,
        this.#definitions,
        this.#filters(),
        this.#groupMode,
        involvesTitle,
        filtered.length,
        this.#rows.length,
      );
    }

    async #loadData(): Promise<void> {
      try {
        const [relationships, nodes, definitions] = await Promise.all([
          this.#storage.listRelationships(),
          this.#storage.listNodes(),
          this.#storage.listRelationshipDefinitions(),
        ]);
        this.#nodesById = new Map(nodes.map((node) => [node.id, node]));
        this.#definitions = [...definitions].sort((a, b) => a.name.localeCompare(b.name));
        this.#rows = buildConsoleRows(
          relationships,
          this.#nodesById,
          new Map(definitions.map((definition) => [definition.id, definition])),
        );
      } catch (error) {
        this.#log.error(`Relationship Console: failed to load: ${errorMessage(error)}`);
        this.#rows = [];
        this.#definitions = [];
      }
      this.#dataLoaded = true;
    }

    _replaceHTML(result: string, content: MinimalDomElementLike): void {
      ensureArchivexusStyles();
      content.innerHTML = result;
    }

    _onRender(): void {
      const root = this.element;

      const search = root.querySelector('[data-role="console-search"]');
      search?.addEventListener('input', () => {
        this.#query = search.value;
        this.#applySearch();
      });

      const category = root.querySelector('[name="category"]');
      category?.addEventListener('change', () => {
        this.#category = category.value;
        this.render(true);
      });

      const definitionId = root.querySelector('[name="definitionId"]');
      definitionId?.addEventListener('change', () => {
        this.#definitionId = definitionId.value;
        this.render(true);
      });

      const dangling = root.querySelector('[name="danglingOnly"]');
      dangling?.addEventListener('change', () => {
        this.#danglingOnly = dangling.checked;
        this.render(true);
      });

      if (!this.#changeHookBound) {
        this.#changeHookBound = true;
        Hooks.on('archivexus.relationshipsChanged', this.#onRelationshipsChanged);
      }

      this.#applySearch();
    }

    _onClose(): void {
      Hooks.off('archivexus.relationshipsChanged', this.#onRelationshipsChanged);
      if (openInstance === (this as unknown as ConsoleInstance)) {
        openInstance = undefined;
      }
    }

    #reload(): void {
      this.#dataLoaded = false;
      this.render(true);
    }

    /** Client-side text filter — toggles row/group visibility, no re-render (keeps the search input focused). */
    #applySearch(): void {
      const needle = this.#query.trim().toLowerCase();
      for (const group of this.element.querySelectorAll('[data-console-group]')) {
        let anyVisible = false;
        for (const row of group.querySelectorAll('[data-relationship-id]')) {
          const match =
            needle.length === 0 || (row.getAttribute('data-search') ?? '').includes(needle);
          row.hidden = !match;
          if (match) anyVisible = true;
        }
        group.hidden = !anyVisible;
      }
    }

    #resolvePrefill(nodeId: string): ResolvedDroppedNode | undefined {
      const node = this.#nodesById.get(nodeId);
      if (!node) return undefined;
      return {
        nodeId: node.id,
        nodeType: node.type,
        title: node.title,
        documentKind: endpointIsActor(node.id) ? 'Actor' : 'JournalEntryPage',
      };
    }

    async _openAuthoring(): Promise<void> {
      const prefillOrigin =
        this.#involvesNodeId !== undefined ? this.#resolvePrefill(this.#involvesNodeId) : undefined;
      await openRelationshipAuthoringWindow(
        this.#storage,
        this.#log,
        prefillOrigin ? { prefillOrigin } : {},
      );
    }

    async _onDelete(id: string): Promise<void> {
      const row = this.#rows.find((candidate) => candidate.id === id);
      const dialogV2 = foundry.applications.api.DialogV2 as unknown as FoundryDialogV2Like;
      const confirmed = await dialogV2.confirm({
        window: { title: 'Delete Relationship' },
        content: `<p>Delete "<strong>${escapeHtml(row?.title ?? id)}</strong>"? This cannot be undone. The connected Nodes are not affected.</p>`,
      });
      if (confirmed !== true) return;

      try {
        await this.#storage.deleteRelationship(id);
      } catch (error) {
        this.#log.error(`Failed to delete Relationship "${id}": ${errorMessage(error)}`);
        return;
      }
      // The bound `archivexus.relationshipsChanged` handler re-loads + re-renders.
      Hooks.callAll('archivexus.relationshipsChanged');
    }
  }

  cachedClass = RelationshipConsoleApplication as unknown as ConsoleConstructor;
  return cachedClass;
}

/**
 * Opens the singleton Console, or focuses/re-scopes the one already open.
 * No-ops with a warning if storage isn't ready yet (startup only).
 */
export function openRelationshipConsole(
  getStorage: () => StorageProvider | undefined,
  log: Logger,
  options: { involvesNodeId?: string } = {},
): void {
  const storage = getStorage();
  if (!storage) {
    log.warn('Storage provider not ready yet - cannot open the Relationship Console.');
    return;
  }
  const ConsoleClass = getRelationshipConsoleClass();
  if (openInstance) {
    if (options.involvesNodeId !== undefined) {
      openInstance.setNodeFilter(options.involvesNodeId);
    } else {
      openInstance.render(true);
    }
    return;
  }
  openInstance = new ConsoleClass({ storage, log, ...options }) as unknown as ConsoleInstance;
  openInstance.render(true);
}
