import type { Relationship } from '../../core/domain/relationship.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';
import { resolveDroppedDocumentNode } from './relationship-node-resolution.js';
import type {
  FoundryDroppableDocumentLike,
  FoundryHeaderControlsLike,
  FoundrySheetAppLike,
} from './relationship-authoring-window.js';

/**
 * The Relationship-*deletion* `ApplicationV2` list window (ADAPT-012,
 * implementing `docs/decisions/ADR-0013-relationship-deletion-ui.md`) — a
 * dedicated, lightweight window (same shape family as
 * `relationship-authoring-window.ts`: raw-HTML `_renderHTML`/`_replaceHTML`,
 * no Handlebars, the deferred-factory-function trick for the subclass) that
 * lists a Node's own Relationships (`StorageProvider.getRelationshipsForNode`,
 * STORE-003) and lets a GM delete any one of them, one confirmed click at a
 * time, without closing the window (ADR-0013 point 3's named "batch cleanup
 * in one sitting" requirement).
 *
 * **What's pure and unit-tested vs. what's Foundry glue trusted only via
 * research (no live Foundry client in this environment — same discipline
 * ADR-0009/ADR-0010/ADR-0013 itself asks for):**
 * - `buildRelationshipListRowsHTML`/`buildRelationshipListContentHTML` (this
 *   file) are pure/tested, same "content-builder function" split as every
 *   prior file in this family.
 * - `RelationshipListApplication` itself and `registerRelationshipListEntryPoints`'s
 *   two `getHeaderControls*` registrations are Foundry glue. Two genuinely
 *   new-to-this-codebase API surfaces needed live-render verification
 *   (ADR-0013 Disadvantages' own named gaps), researched here against
 *   Foundry v14's public API docs (`https://foundryvtt.com/api/`) rather
 *   than assumed:
 *   1. **The `actions` map's per-element `(event, target)` argument form.**
 *      `relationship-authoring-window.ts`'s own single Save button never
 *      needed this — it used the no-argument `onClick`-via-`getHeaderControls*`
 *      shape (a different mechanism entirely, ADR-0009's Amendment). The
 *      documented type (`ApplicationClickAction`,
 *      `https://foundryvtt.com/api/types/foundry.applications.types.ApplicationClickAction.html`)
 *      is `(event: PointerEvent, target: HTMLElement) => void | Promise<void>`,
 *      bound with `this` as the Application instance (Community Wiki's
 *      ApplicationV2 guide: "these should be static functions, but their
 *      `this` value will still point to the specific class instance").
 *      `target` is "the capturing HTML element which defined a
 *      `[data-action]`" — i.e. the exact clicked Delete button, not
 *      necessarily the row. Each row's own id lives on the enclosing
 *      `<li data-relationship-id="...">` (not the button itself), resolved
 *      here via `target.closest('[data-relationship-id]')` — real DOM
 *      `closest()` semantics (Element.closest checks the element itself
 *      first, then ancestors), used the same way `<document-tags>`'s
 *      `change`-event handling already assumes standard DOM behavior in
 *      `relationship-authoring-window.ts`.
 *   2. **`foundry.applications.api.DialogV2.confirm(...)`** — only
 *      `DialogV2.prompt` was previously used (`actor-node-type-tag.ts`,
 *      ADR-0009's Amendment). Researched against the official API docs
 *      (`https://foundryvtt.com/api/classes/foundry.applications.api.DialogV2.html`):
 *      `static confirm(config)` takes the same `DialogV2Configuration`
 *      shape `prompt` does (`window`, `content`, `modal`, `rejectClose`)
 *      plus `yes`/`no` button overrides instead of `ok`; it resolves `true`
 *      when the "Yes" button is pressed, `false` for "No", and (with the
 *      documented default `rejectClose: false`) `null` if the dialog is
 *      dismissed without a button click — mirrored here as "anything other
 *      than exactly `true` cancels the delete," which treats a dismissed
 *      dialog the same as an explicit "No."
 *   Neither of these two pieces has been verified against a real Foundry
 *   render in this environment — flagged for live verification before
 *   Alberto trusts it, same discipline as every prior Foundry-glue file in
 *   this lineage.
 * - `getHeaderControlsJournalEntryPageSheet` as the second entry point's
 *   hook name is the same one `relationship-authoring-window.ts` already
 *   uses and documents its own research trail for — not re-researched here.
 */

// ---------------------------------------------------------------------------
// Pure content builders
// ---------------------------------------------------------------------------

/** Escapes text for safe embedding inside HTML markup (both attribute values and text content). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** One row's worth of display data — deliberately just `id`/`title`, ADR-0013 point 2: the Relationship's own already-persisted `title`, verbatim, no re-derivation. */
export interface RelationshipListRow {
  readonly id: string;
  readonly title: string;
}

const EMPTY_STATE_HTML = '<p data-role="empty">No relationships yet.</p>';

/**
 * Builds the rows-or-empty-state markup only (not the whole window body) —
 * exported separately from `buildRelationshipListContentHTML` so the live
 * class can re-render just this inner region after the last row is deleted
 * (ADR-0013 point 3: the window stays open, and reaching zero rows should
 * show the same empty state a fresh open would) without re-running
 * `_renderHTML`'s full async storage round-trip.
 */
export function buildRelationshipListRowsHTML(rows: readonly RelationshipListRow[]): string {
  if (rows.length === 0) {
    return EMPTY_STATE_HTML;
  }

  const items = rows
    .map(
      (row) =>
        `<li data-relationship-id="${escapeHtml(row.id)}">` +
        `<span class="archivexus-relationship-title">${escapeHtml(row.title)}</span>` +
        `<button type="button" data-action="delete">Delete</button>` +
        `</li>`,
    )
    .join('');

  return `<ul class="archivexus-relationship-rows">${items}</ul>`;
}

/**
 * Builds the window's whole content markup. Pure and unit-testable (no
 * DOM) — same "content-builder function" split as every prior file in this
 * family. `data-role="rows"` marks the inner region `buildRelationshipListRowsHTML`
 * alone re-renders after a delete.
 */
export function buildRelationshipListContentHTML(rows: readonly RelationshipListRow[]): string {
  return (
    `<div class="archivexus-relationship-list">` +
    `<div data-role="rows">${buildRelationshipListRowsHTML(rows)}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Foundry glue — minimal structural types, no real DOM/Foundry-types dependency
// ---------------------------------------------------------------------------

/**
 * Minimal structural subset of a real DOM element this class needs —
 * deliberately loose, same no-real-DOM-types tradeoff as
 * `relationship-authoring-window.ts`'s own `MinimalDomElementLike`
 * (`tsconfig.json` omits the DOM lib entirely). Extended with `closest`/
 * `getAttribute`/`remove` — genuinely new members that window never
 * needed, since its own single Save button had no per-element id to
 * resolve and never removed a node from the DOM.
 */
export interface MinimalDomElementLike {
  innerHTML: string;
  getAttribute(name: string): string | null;
  closest(selector: string): MinimalDomElementLike | null;
  remove(): void;
  querySelector(selector: string): MinimalDomElementLike | null;
}

export interface FoundryApplicationV2InstanceLike {
  readonly element: MinimalDomElementLike;
  render(force?: boolean): unknown;
  close(options?: unknown): Promise<unknown>;
}

type ApplicationV2Constructor = new (
  options?: Record<string, unknown>,
) => FoundryApplicationV2InstanceLike;

type RelationshipListApplicationConstructor = new (
  options: RelationshipListApplicationOptions,
) => FoundryApplicationV2InstanceLike;

export interface RelationshipListApplicationOptions {
  readonly storage: StorageProvider;
  readonly log: Logger;
  /** The clicked document's own Node id (ADR-0013 point 1 — pre-scoped, no drop/resolution step here). */
  readonly nodeId: string;
}

/**
 * Minimal structural subset of `foundry.applications.api.DialogV2.confirm`
 * this needs — see this file's top-level doc comment, point 2, for the
 * research behind this shape.
 */
export interface FoundryDialogV2Like {
  confirm(config: {
    window?: { title?: string };
    content?: string;
    modal?: boolean;
  }): Promise<boolean | null | undefined>;
}

/**
 * Lazily builds (and memoizes) the actual `ApplicationV2` subclass —
 * deferred behind a function for the exact reason
 * `getRelationshipAuthoringApplicationClass` is (see that file's own doc
 * comment): `foundry` is only a TypeScript ambient declaration, not a real
 * runtime binding outside an actual Foundry client, so touching it at
 * module-evaluation time would throw the instant this module is imported
 * anywhere else (this package's own Vitest suite included).
 */
let cachedApplicationClass: RelationshipListApplicationConstructor | undefined;

/** Exported only for tests — production code only ever calls this indirectly, via `registerRelationshipListEntryPoints`. */
export function getRelationshipListApplicationClass(): RelationshipListApplicationConstructor {
  if (cachedApplicationClass) {
    return cachedApplicationClass;
  }

  const ApplicationV2Base = foundry.applications.api
    .ApplicationV2 as unknown as ApplicationV2Constructor;

  class RelationshipListApplication extends ApplicationV2Base {
    static DEFAULT_OPTIONS = {
      id: 'archivexus-relationship-list',
      tag: 'div',
      window: {
        title: 'Relationships',
        icon: 'fa-solid fa-list',
        resizable: true,
      },
      position: { width: 420, height: 'auto' },
      actions: {
        delete(
          this: RelationshipListApplication,
          _event: unknown,
          target: MinimalDomElementLike,
        ): void {
          void this._onDeleteRow(target);
        },
      },
    };

    readonly #storage: StorageProvider;
    readonly #log: Logger;
    readonly #nodeId: string;

    /**
     * Populated by `_renderHTML`, keyed by Relationship id — lets
     * `_onDeleteRow` show that row's own `title` in the confirm dialog and
     * know when the list has reached zero, without a second storage
     * round-trip or parsing the (already-escaped) title back out of the
     * rendered DOM.
     */
    #titlesById: ReadonlyMap<string, string> = new Map();

    constructor(options: RelationshipListApplicationOptions) {
      super(options as unknown as Record<string, unknown>);
      this.#storage = options.storage;
      this.#log = options.log;
      this.#nodeId = options.nodeId;
    }

    // -- ApplicationV2's raw-HTML rendering contract (no HandlebarsApplicationMixin) --

    async _renderHTML(): Promise<string> {
      let relationships: readonly Relationship[];
      try {
        relationships = await this.#storage.getRelationshipsForNode(this.#nodeId);
      } catch (error) {
        this.#log.error(
          `Failed to load Relationships for node "${this.#nodeId}": ${error instanceof Error ? error.message : String(error)}`,
        );
        relationships = [];
      }

      this.#titlesById = new Map(relationships.map((relationship) => [relationship.id, relationship.title]));
      const rows = relationships.map((relationship) => ({
        id: relationship.id,
        title: relationship.title,
      }));
      return buildRelationshipListContentHTML(rows);
    }

    _replaceHTML(result: string, content: MinimalDomElementLike): void {
      content.innerHTML = result;
    }

    // -- Delete (ADR-0013 points 3/4/6) --

    /**
     * `target` is the clicked Delete `<button>` itself (the element that
     * actually carries `data-action="delete"`) — the row's id lives on the
     * enclosing `<li data-relationship-id="...">`, resolved via
     * `closest()`. Not private (`#`) so it can be exercised directly from
     * tests without a real Foundry render, same reasoning
     * `relationship-authoring-window.ts`'s `_onSave` already established
     * for this file family.
     */
    async _onDeleteRow(target: MinimalDomElementLike): Promise<void> {
      const row = target.closest('[data-relationship-id]');
      const id = row?.getAttribute('data-relationship-id');
      if (!row || !id) {
        return;
      }

      const title = this.#titlesById.get(id) ?? '';
      const dialogV2 = foundry.applications.api.DialogV2 as unknown as FoundryDialogV2Like;
      const confirmed = await dialogV2.confirm({
        window: { title: 'Delete Relationship' },
        content: `<p>Delete "${escapeHtml(title)}"? This cannot be undone.</p>`,
      });
      if (confirmed !== true) {
        // Anything other than an explicit "Yes" (a "No", or the dialog
        // being dismissed) cancels the delete (ADR-0013 point 3).
        return;
      }

      try {
        await this.#storage.deleteRelationship(id);
      } catch (error) {
        this.#log.error(
          `Failed to delete Relationship "${id}": ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }

      this.#titlesById = new Map(
        [...this.#titlesById].filter(([existingId]) => existingId !== id),
      );
      // Remove just that one row (ADR-0013 point 3) - the window itself
      // never closes and never fully re-renders.
      row.remove();

      if (this.#titlesById.size === 0) {
        const rowsContainer = this.element.querySelector('[data-role="rows"]');
        if (rowsContainer) {
          rowsContainer.innerHTML = buildRelationshipListRowsHTML([]);
        }
      }
    }
  }

  cachedApplicationClass = RelationshipListApplication;
  return cachedApplicationClass;
}

// ---------------------------------------------------------------------------
// Entry points (ADR-0013 point 1): getHeaderControls* on both sheet families
// ---------------------------------------------------------------------------

/**
 * On a resolution failure this deliberately refuses to open at all, unlike
 * `relationship-authoring-window.ts`'s sibling `openRelationshipAuthoringWindow`,
 * which still opens with `prefillOrigin` simply omitted (reviewer-flagged as a
 * possible inconsistency — resolved here, not left silent). The two windows
 * aren't actually symmetric: the authoring window has a real recovery path
 * (the GM can drop any other document into either drop zone, so an empty
 * Origin is just a starting state, not a dead end), while this window has no
 * such affordance — it's permanently scoped to the single Node whose sheet
 * opened it, with no way to re-target it after the fact. A failed resolution
 * here means there is no Node id to query `getRelationshipsForNode` against
 * at all, so there's nothing a rendered-but-empty window could usefully show
 * or let the GM recover from. Refusing to open (and logging why) is the
 * correct behavior for this window's shape, not an oversight to align with
 * the other one. In practice this is currently unreachable dead code, since
 * both header-control buttons only render on the two supported sheet types.
 */
function openRelationshipListWindow(
  app: FoundrySheetAppLike,
  storage: StorageProvider | undefined,
  log: Logger,
): void {
  if (!storage) {
    log.warn(
      'Storage provider not ready yet - cannot open the Relationship list window (should only happen during startup).',
    );
    return;
  }

  const resolved = resolveDroppedDocumentNode(
    app.document.documentName,
    app.document as FoundryDroppableDocumentLike,
  );
  if (!resolved.ok) {
    log.warn(`Opened Relationship list window from an unsupported document type: ${resolved.error}`);
    return;
  }

  const ApplicationClass = getRelationshipListApplicationClass();
  new ApplicationClass({ storage, log, nodeId: resolved.node.nodeId }).render(true);
}

/**
 * Registers both entry points, once at module init (same call-once
 * contract as `registerRelationshipAuthoringEntryPoints`): a
 * "Connections" header-control button on Actor sheets AND on
 * JournalEntryPage sheets, a third listener alongside the existing
 * "Archivexus Node Type" and "New Relationship…" buttons (ADR-0013 point 1
 * / Disadvantages — coexistence at n=3, extended from
 * `header-controls-coexistence.test.ts`'s own n=2 assertion).
 *
 * The button is **"Connections"**, not "Relationships…", so it reads as the
 * zero-context in-flow view ("what's this sheet connected to") distinct
 * from the world-level **Relationship Console** (VIEW-001i) — ADR-0014
 * Amendment 2 decision 2.
 */
export function registerRelationshipListEntryPoints(
  getStorage: () => StorageProvider | undefined,
  log: Logger,
): void {
  const handler = (app: FoundrySheetAppLike, controls: FoundryHeaderControlsLike): void => {
    controls.push({
      icon: 'fa-solid fa-list',
      label: 'Connections',
      onClick: () => openRelationshipListWindow(app, getStorage(), log),
    });
  };

  Hooks.on('getHeaderControlsActorSheetV2', handler);
  Hooks.on('getHeaderControlsJournalEntryPageSheet', handler);
}
