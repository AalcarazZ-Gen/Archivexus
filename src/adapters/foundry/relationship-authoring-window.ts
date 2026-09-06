import { createRelationship } from '../../core/domain/relationship.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';
import {
  buildDefinitionOptions,
  buildDefinitionSelectOptionsHTML,
} from './relationship-definition-options.js';
import { SEEDED_RELATIONSHIP_DEFINITIONS } from './relationship-definitions-seed.js';
import {
  resolveDroppedDocumentNode,
  type ResolvedDroppedNode,
} from './relationship-node-resolution.js';
import {
  buildCardinalityWarningMessage,
  findCardinalityConflict,
} from './relationship-cardinality.js';
import {
  buildRelationshipSummary,
  buildRelationshipTitle,
  resolveEndpointLabels,
} from './relationship-symmetry.js';

/**
 * The Relationship-authoring `ApplicationV2` window (ADAPT-007, implementing
 * `docs/decisions/ADR-0010-relationship-authoring-ui.md`) — a dedicated
 * window (not a `DialogV2.prompt`, ADR-0009's mechanism for the
 * single-field/single-document ADAPT-003 case) with two native
 * `<document-tags single>` drop zones, a reactively-filtered Relationship
 * Definition `<select>`, a live (warn, never block) cardinality check, and
 * a Save action that persists a real `Relationship` via `StorageProvider`.
 *
 * **What's pure and unit-tested vs. what's Foundry glue trusted only via
 * research (no live Foundry client in this environment — flagged the same
 * way ADR-0009/ADR-0010 themselves flag their own unverified pieces):**
 * - `buildRelationshipAuthoringContentHTML` (this file) is pure/tested,
 *   same "content-builder function" split as `actor-node-type-tag.ts`'s
 *   `buildNodeTypeDialogContent`.
 * - Node-type resolution, Definition filtering, the cardinality check and
 *   the symmetric/asymmetric display text all live in their own pure,
 *   fully unit-tested modules (`relationship-node-resolution.ts`,
 *   `relationship-definition-options.ts`, `relationship-cardinality.ts`,
 *   `relationship-symmetry.ts`) that this class only calls.
 * - `RelationshipAuthoringApplication` itself — the actual `ApplicationV2`
 *   subclass, its DOM event wiring, and `registerRelationshipAuthoring
 *   EntryPoints`'s two `getHeaderControls*` registrations — is Foundry
 *   glue with no real DOM/Foundry runtime available to exercise it against
 *   in this environment. Needs live verification before Alberto trusts it,
 *   same discipline as every prior ADR-0009 pass:
 *   1. Whether `<document-tags>` actually dispatches a `change` event when
 *      its value is set via drag/paste (documented as `formAssociated`
 *      with `_setValue`, but the public API reference doesn't spell out
 *      the event name — inferred from Foundry's own `submitOnChange`/
 *      standard form-element convention, not confirmed against a render).
 *   2. Whether a `value="<uuid>"` HTML attribute actually pre-fills
 *      `<document-tags single>` on initial render (used here for the
 *      pre-filled Origin) the same way it does for plain `<input>`s.
 *   3. `getHeaderControlsJournalEntryPageSheet` as the second entry point's
 *      hook name — researched against Foundry v14's public API docs
 *      (`JournalEntryPageTextSheet → JournalEntryPageHandlebarsSheet →
 *      JournalEntryPageSheet → DocumentSheetV2 → ApplicationV2`, so
 *      `getHeaderControlsJournalEntryPageSheet` should fire the same way
 *      `getHeaderControlsActorSheetV2` was confirmed to for `Character
 *      ActorSheet` in ADR-0009's Amendment), but NOT verified against a
 *      real render — ADR-0010's own Disadvantages section names this
 *      exact gap and leaves it for the implementing ticket.
 *   4. The `actions` map / `data-action` wiring for the Save button (a
 *      different mechanism from `getHeaderControls*`'s direct `onClick`,
 *      which ADR-0009's Amendment did verify live) — standard, documented
 *      `ApplicationV2` behavior, not verified live here.
 */

// ---------------------------------------------------------------------------
// Pure content builder
// ---------------------------------------------------------------------------

/** Escapes text for safe embedding inside an HTML attribute value. */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds the window's initial markup. Pure and unit-testable (no DOM) —
 * the live class only ever mutates specific descendants of this afterward
 * (definition options, labels, summary/warning text, the Save button's
 * label/disabled state); it never regenerates this whole string again,
 * since doing so would wipe out the two `<document-tags>` elements' own
 * internal, browser-held drag/paste state.
 *
 * `type` is deliberately omitted from both `<document-tags>` elements
 * (ADR-0010 point 2) — a Node can be backed by either an Actor or a
 * JournalEntryPage, so restricting the widget to one Foundry document type
 * would make it unable to accept the other.
 */
export function buildRelationshipAuthoringContentHTML(
  originLabel: string,
  targetLabel: string,
  prefillOriginUuid?: string,
): string {
  const originValueAttr =
    prefillOriginUuid !== undefined ? ` value="${escapeHtmlAttribute(prefillOriginUuid)}"` : '';

  return (
    `<form class="archivexus-relationship-authoring" autocomplete="off">` +
    `<div class="form-group">` +
    `<label for="archivexus-relationship-origin" data-role="origin-label">${originLabel}</label>` +
    `<document-tags single name="origin" id="archivexus-relationship-origin"${originValueAttr}></document-tags>` +
    `<p class="notification error" data-role="origin-error" hidden></p>` +
    `</div>` +
    `<div class="form-group">` +
    `<label for="archivexus-relationship-target" data-role="target-label">${targetLabel}</label>` +
    `<document-tags single name="target" id="archivexus-relationship-target"></document-tags>` +
    `<p class="notification error" data-role="target-error" hidden></p>` +
    `</div>` +
    `<div class="form-group">` +
    `<label for="archivexus-relationship-definition">Relationship</label>` +
    `<select name="definitionId" id="archivexus-relationship-definition" disabled>` +
    `<option value="" selected disabled>Drop both entities first</option>` +
    `</select>` +
    `</div>` +
    `<p class="notification info" data-role="summary" hidden></p>` +
    `<p class="notification warning" data-role="warning" hidden></p>` +
    `<footer class="form-footer">` +
    `<button type="button" data-action="save" disabled>Save</button>` +
    `</footer>` +
    `</form>`
  );
}

// ---------------------------------------------------------------------------
// Foundry glue — minimal structural types, no real DOM/Foundry-types dependency
// ---------------------------------------------------------------------------

/**
 * Minimal structural subset of a real DOM element this class needs —
 * deliberately loose (a single shape covering every element kind touched:
 * `<document-tags>`, `<select>`, `<p>`, `<button>`), same no-real-types
 * tradeoff as the rest of this package. `tsconfig.json` omits the DOM lib
 * entirely (Core stays platform-agnostic), so there is no `HTMLElement` to
 * borrow from even loosely.
 */
export interface MinimalDomElementLike {
  readonly value: string;
  textContent: string | null;
  innerHTML: string;
  disabled: boolean;
  hidden: boolean;
  addEventListener(type: string, listener: () => void): void;
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

type RelationshipAuthoringApplicationConstructor = new (
  options: RelationshipAuthoringApplicationOptions,
) => FoundryApplicationV2InstanceLike;

/** The Foundry Document shape this window resolves a drop against — a superset of the two mapping functions' own `*Like` inputs. */
export interface FoundryDroppableDocumentLike {
  readonly uuid: string;
  readonly name: string;
  readonly documentName: string;
  readonly flags?: { readonly archivexus?: { readonly nodeType?: string } };
  readonly parent?: { readonly name?: string };
  readonly ownership?: { readonly default?: number };
}

export interface RelationshipAuthoringApplicationOptions {
  readonly storage: StorageProvider;
  readonly log: Logger;
  readonly definitions?: readonly RelationshipDefinition[];
  readonly prefillOrigin?: ResolvedDroppedNode;
}

interface EndpointState {
  readonly node: ResolvedDroppedNode | undefined;
  readonly error: string | undefined;
}

const EMPTY_ENDPOINT: EndpointState = { node: undefined, error: undefined };

/**
 * Lazily builds (and memoizes) the actual `ApplicationV2` subclass. Deferred
 * behind a function — rather than a top-level `class ... extends
 * foundry.applications.api.ApplicationV2` at module scope, the more obvious
 * shape — because `foundry` is only a TypeScript ambient declaration
 * (`foundry-globals.d.ts`), not a real runtime binding outside an actual
 * Foundry client: touching it at module-evaluation time would throw
 * `ReferenceError: foundry is not defined` the instant this module is
 * imported anywhere else (this package's own Vitest suite included), the
 * same reason `actor-node-type-tag.ts` only touches
 * `foundry.applications.api.DialogV2` from inside `registerActorNodeTypeTag`
 * rather than at its own module's top level. Memoized rather than
 * rebuilt per call since it only needs computing once real Foundry is
 * actually present.
 */
let cachedApplicationClass: RelationshipAuthoringApplicationConstructor | undefined;

/** Exported only for tests — production code only ever calls this indirectly, via `openRelationshipAuthoringWindow`. */
export function getRelationshipAuthoringApplicationClass(): RelationshipAuthoringApplicationConstructor {
  if (cachedApplicationClass) {
    return cachedApplicationClass;
  }

  const ApplicationV2Base = foundry.applications.api
    .ApplicationV2 as unknown as ApplicationV2Constructor;

  class RelationshipAuthoringApplication extends ApplicationV2Base {
    static DEFAULT_OPTIONS = {
      id: 'archivexus-relationship-authoring',
      tag: 'div',
      window: {
        title: 'New Relationship',
        icon: 'fa-solid fa-diagram-project',
        resizable: true,
      },
      position: { width: 480, height: 'auto' },
      actions: {
        save(this: RelationshipAuthoringApplication): void {
          void this._onSave();
        },
      },
    };

    readonly #storage: StorageProvider;
    readonly #log: Logger;
    readonly #definitions: readonly RelationshipDefinition[];

    #origin: EndpointState;
    #target: EndpointState;
    #selectedDefinitionId: string | undefined;

    constructor(options: RelationshipAuthoringApplicationOptions) {
      super(options as unknown as Record<string, unknown>);
      this.#storage = options.storage;
      this.#log = options.log;
      this.#definitions = options.definitions ?? SEEDED_RELATIONSHIP_DEFINITIONS;
      this.#origin = options.prefillOrigin
        ? { node: options.prefillOrigin, error: undefined }
        : EMPTY_ENDPOINT;
      this.#target = EMPTY_ENDPOINT;
    }

    private get selectedDefinition(): RelationshipDefinition | undefined {
      return this.#definitions.find((definition) => definition.id === this.#selectedDefinitionId);
    }

    // -- ApplicationV2's raw-HTML rendering contract (no HandlebarsApplicationMixin) --

    async _renderHTML(): Promise<string> {
      const { originLabel, targetLabel } = resolveEndpointLabels(this.selectedDefinition);
      return buildRelationshipAuthoringContentHTML(
        originLabel,
        targetLabel,
        this.#origin.node?.nodeId,
      );
    }

    _replaceHTML(result: string, content: MinimalDomElementLike): void {
      content.innerHTML = result;
    }

    _onRender(): void {
      const root = this.element;
      const originEl = root.querySelector('[name="origin"]');
      const targetEl = root.querySelector('[name="target"]');
      const selectEl = root.querySelector('[name="definitionId"]');

      originEl?.addEventListener('change', () => {
        void this.#handleEndpointChanged('origin', originEl);
      });
      targetEl?.addEventListener('change', () => {
        void this.#handleEndpointChanged('target', targetEl);
      });
      selectEl?.addEventListener('change', () => {
        this.#selectedDefinitionId = selectEl.value.length > 0 ? selectEl.value : undefined;
        void this.#refreshDerivedUI();
      });

      void this.#refreshDerivedUI();
    }

    // -- Endpoint resolution --

    async #handleEndpointChanged(
      side: 'origin' | 'target',
      element: MinimalDomElementLike | null,
    ): Promise<void> {
      const uuid = element?.value ?? '';
      if (uuid.length === 0) {
        this.#setEndpoint(side, EMPTY_ENDPOINT);
        await this.#refreshDerivedUI();
        return;
      }

      let document_: unknown;
      try {
        document_ = await foundry.utils.fromUuid(uuid);
      } catch (error) {
        this.#log.error(
          `Failed to resolve dropped document "${uuid}": ${error instanceof Error ? error.message : String(error)}`,
        );
        document_ = null;
      }

      if (document_ === null || document_ === undefined) {
        this.#setEndpoint(side, { node: undefined, error: 'Could not resolve that document.' });
        await this.#refreshDerivedUI();
        return;
      }

      const doc = document_ as FoundryDroppableDocumentLike;
      const resolved = resolveDroppedDocumentNode(doc.documentName, doc);
      if (!resolved.ok) {
        this.#setEndpoint(side, { node: undefined, error: resolved.error });
        await this.#refreshDerivedUI();
        return;
      }

      this.#setEndpoint(side, { node: resolved.node, error: undefined });
      await this.#refreshDerivedUI();
    }

    #setEndpoint(side: 'origin' | 'target', state: EndpointState): void {
      if (side === 'origin') {
        this.#origin = state;
      } else {
        this.#target = state;
      }
    }

    // -- Derived UI (Definition filtering, symmetric labels, cardinality warning, Save state) --

    async #refreshDerivedUI(): Promise<void> {
      const root = this.element;
      this.#renderEndpointError(root, 'origin', this.#origin.error);
      this.#renderEndpointError(root, 'target', this.#target.error);

      const { originLabel, targetLabel } = resolveEndpointLabels(this.selectedDefinition);
      this.#setText(root, '[data-role="origin-label"]', originLabel);
      this.#setText(root, '[data-role="target-label"]', targetLabel);

      const originType = this.#origin.node?.nodeType;
      const targetType = this.#target.node?.nodeType;
      const options = buildDefinitionOptions(this.#definitions, originType, targetType);
      const selectEl = root.querySelector('[name="definitionId"]');
      if (selectEl) {
        const stillEligible = options.some(
          (option) => option.definition.id === this.#selectedDefinitionId && !option.disabled,
        );
        if (!stillEligible) {
          this.#selectedDefinitionId = undefined;
        }
        selectEl.disabled = options.length === 0;
        selectEl.innerHTML = buildDefinitionSelectOptionsHTML(options, this.#selectedDefinitionId);
      }

      const saveButton = root.querySelector('[data-action="save"]');
      const bothEndpointsResolved =
        this.#origin.node !== undefined && this.#target.node !== undefined;
      const sameNode =
        bothEndpointsResolved && this.#origin.node?.nodeId === this.#target.node?.nodeId;
      const definition = this.selectedDefinition;

      if (sameNode) {
        this.#setHiddenText(root, '[data-role="summary"]', undefined);
        this.#setHiddenText(
          root,
          '[data-role="warning"]',
          'Origin and Target must be two different Nodes.',
        );
        if (saveButton) {
          saveButton.disabled = true;
          saveButton.textContent = 'Save';
        }
        return;
      }

      if (!bothEndpointsResolved || !definition || !this.#origin.node || !this.#target.node) {
        this.#setHiddenText(root, '[data-role="summary"]', undefined);
        this.#setHiddenText(root, '[data-role="warning"]', undefined);
        if (saveButton) {
          saveButton.disabled = true;
          saveButton.textContent = 'Save';
        }
        return;
      }

      const originNode = this.#origin.node;
      const targetNode = this.#target.node;
      this.#setHiddenText(
        root,
        '[data-role="summary"]',
        buildRelationshipSummary(definition, originNode.title, targetNode.title),
      );

      const warning = await this.#checkCardinality(definition, originNode, targetNode);
      this.#setHiddenText(root, '[data-role="warning"]', warning);

      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = warning ? 'Save anyway' : 'Save';
      }
    }

    async #checkCardinality(
      definition: RelationshipDefinition,
      origin: ResolvedDroppedNode,
      target: ResolvedDroppedNode,
    ): Promise<string | undefined> {
      try {
        const [relationshipsForOrigin, relationshipsForTarget] = await Promise.all([
          this.#storage.getRelationshipsForNode(origin.nodeId),
          this.#storage.getRelationshipsForNode(target.nodeId),
        ]);
        const conflict = findCardinalityConflict(
          definition,
          origin.nodeId,
          target.nodeId,
          relationshipsForOrigin,
          relationshipsForTarget,
        );
        if (!conflict) {
          return undefined;
        }

        const knownTitles = new Map<string, string>([
          [origin.nodeId, origin.title],
          [target.nodeId, target.title],
        ]);
        const resolveTitle = (nodeId: string): string => {
          const known = knownTitles.get(nodeId);
          if (known !== undefined) {
            return known;
          }
          // A third Node this window hasn't resolved a document for - fall
          // back to the raw id rather than an extra async storage.getNode
          // round-trip per warning render; acceptable for a non-blocking
          // advisory message (ADR-0010 point 6).
          return nodeId;
        };
        return buildCardinalityWarningMessage(definition, conflict, resolveTitle);
      } catch (error) {
        this.#log.error(
          `Cardinality check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        return undefined;
      }
    }

    // -- Save --

    async _onSave(): Promise<void> {
      const definition = this.selectedDefinition;
      const origin = this.#origin.node;
      const target = this.#target.node;
      if (!definition || !origin || !target || origin.nodeId === target.nodeId) {
        return;
      }

      try {
        const relationship = createRelationship({
          id: foundry.utils.randomID(),
          origin: origin.nodeId,
          target: target.nodeId,
          definitionId: definition.id,
          title: buildRelationshipTitle(definition, origin.title, target.title),
        });
        await this.#storage.saveRelationship(relationship);
        await this.close();
      } catch (error) {
        this.#log.error(
          `Failed to save Relationship: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // -- Small DOM helpers --

    #renderEndpointError(
      root: MinimalDomElementLike,
      side: 'origin' | 'target',
      message: string | undefined,
    ): void {
      this.#setHiddenText(root, `[data-role="${side}-error"]`, message);
    }

    #setText(root: MinimalDomElementLike, selector: string, text: string): void {
      const el = root.querySelector(selector);
      if (el) {
        el.textContent = text;
      }
    }

    #setHiddenText(root: MinimalDomElementLike, selector: string, text: string | undefined): void {
      const el = root.querySelector(selector);
      if (!el) {
        return;
      }
      el.textContent = text ?? '';
      el.hidden = text === undefined;
    }
  }

  cachedApplicationClass = RelationshipAuthoringApplication;
  return cachedApplicationClass;
}

// ---------------------------------------------------------------------------
// Entry points (ADR-0010 point 1): getHeaderControls* on both sheet families
// ---------------------------------------------------------------------------

/** Minimal shape of the `controls` array `getHeaderControls*` hooks receive (mirrors `actor-node-type-tag.ts`). */
export interface FoundryHeaderControlsLike {
  push(entry: { icon: string; label: string; onClick: () => void }): void;
}

export interface FoundrySheetAppLike {
  readonly document: FoundryDroppableDocumentLike;
}

function openRelationshipAuthoringWindow(
  app: FoundrySheetAppLike,
  storage: StorageProvider | undefined,
  log: Logger,
): void {
  if (!storage) {
    log.warn(
      'Storage provider not ready yet - cannot open the Relationship-authoring window (should only happen during startup).',
    );
    return;
  }

  const resolved = resolveDroppedDocumentNode(app.document.documentName, app.document);
  if (!resolved.ok) {
    log.warn(
      `Opened Relationship-authoring window from an unsupported document type: ${resolved.error}`,
    );
  }

  const ApplicationClass = getRelationshipAuthoringApplicationClass();
  new ApplicationClass({
    storage,
    log,
    ...(resolved.ok ? { prefillOrigin: resolved.node } : {}),
  }).render(true);
}

/**
 * Registers both entry points, once at module init (same call-once
 * contract as `registerActorNodeTypeTag`): a "New Relationship…"
 * header-control button on Actor sheets AND on JournalEntryPage sheets.
 * `getStorage` is a closure rather than a plain `StorageProvider` because,
 * same as `module-entry.ts`'s existing `withStorage` pattern, these hooks
 * are registered at `init` before the real SQLite-backed provider exists
 * (created at `ready`) — resolved lazily at click time instead.
 *
 * `getHeaderControlsJournalEntryPageSheet` — the second hook name — is
 * researched, not live-verified; see this file's top-level doc comment,
 * point 3.
 */
export function registerRelationshipAuthoringEntryPoints(
  getStorage: () => StorageProvider | undefined,
  log: Logger,
): void {
  const handler = (app: FoundrySheetAppLike, controls: FoundryHeaderControlsLike): void => {
    controls.push({
      icon: 'fa-solid fa-diagram-project',
      label: 'New Relationship…',
      onClick: () => openRelationshipAuthoringWindow(app, getStorage(), log),
    });
  };

  Hooks.on('getHeaderControlsActorSheetV2', handler);
  Hooks.on('getHeaderControlsJournalEntryPageSheet', handler);
}
