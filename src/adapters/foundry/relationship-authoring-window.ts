import { createRelationship } from '../../core/domain/relationship.js';
import type { RelationshipDefinition } from '../../core/domain/relationship-definition.js';
import { DEFAULT_RELATIONSHIP_DEFINITIONS } from '../../core/domain/relationship-definitions-default.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';
import { ensureArchivexusStyles } from './archivexus-styles.js';
import {
  buildDefinitionOptions,
  buildDefinitionSelectOptionsHTML,
  resolveDefinitionOrientation,
} from './relationship-definition-options.js';
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
 * `docs/decisions/ADR-0010-relationship-authoring-ui.md`; **ADR-0010
 * amendment, ADAPT-015 issue #77**) — a dedicated window (not a
 * `DialogV2.prompt`) with two controlled endpoint `<input>`s (each accepts
 * a dropped Actor/JournalEntryPage or a pasted UUID and then shows the
 * Node's title, read-only, with the UUID beneath), a reactively-filtered
 * Relationship Definition `<select>`, a live (warn, never block) cardinality
 * check, and a Save action that persists a real `Relationship`.
 *
 * **ADAPT-015 changed three things** (all from a live bug report):
 * 1. **Direction-agnostic.** A Definition is offered if its `validation`
 *    passes in *either* endpoint orientation; on Save the window swaps
 *    origin/target when only the reversed order validates (so "member-of"
 *    can be authored from the Organization's sheet, not only the member's).
 *    `resolveDefinitionOrientation` (`relationship-definition-options.ts`).
 * 2. **Endpoint fields** replaced the native `<document-tags>` (which showed
 *    the resolved entity as a chip *above* the input) with controlled
 *    `<input>`s — clearer, and it drops the unverified "does `<document-tags>`
 *    fire `change` on drop" assumption ADR-0010 point 3 carried.
 * 3. **Stray drops are swallowed** — every endpoint drop `preventDefault`s
 *    + `stopPropagation`s, and the `<form>` catches any near-miss, so a
 *    stray drag can't escape to a Foundry "Create Actor" dialog.
 *
 * **Pure and unit-tested:** `buildEndpointFieldHTML` /
 * `buildRelationshipAuthoringContentHTML` / `parseDropPayloadUuid` (this
 * file), and the resolution / filtering / cardinality / symmetric-label
 * modules it calls. One class test drives `_resolveEndpoint` × 2 + the
 * select + `_onSave` against a fake DOM to prove the orientation swap.
 * **Still Foundry glue, flagged for live verification:** the real drop-event
 * payload shape, `foundry.utils.fromUuid` resolution, the `actions` /
 * `data-action` wiring, and `getHeaderControlsJournalEntryPageSheet` as the
 * JournalEntryPage-sheet hook name (researched, not yet live-verified).
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

/** What an endpoint field displays once its document resolves (ADAPT-015). */
export interface ResolvedEndpointDisplay {
  readonly title: string;
  readonly uuid: string;
}

/**
 * One endpoint field (ADAPT-015 — replaces the native `<document-tags>`,
 * which rendered the resolved entity as a chip *above* the input, confusing
 * next to a still-empty second field). A controlled plain `<input>`: empty
 * shows the placeholder; once resolved the input holds the Node's **title**
 * (read-only, the UUID in its `title` attribute and a dim line below), with
 * a ✕ clear button. Drops are handled by this module's own listeners
 * (`preventDefault` + `stopPropagation` on every drop), so a near-miss drag
 * can't escape the window (the old `<document-tags>` let it bubble to a
 * "Create Actor" dialog). No `type` restriction — a Node can be Actor- or
 * JournalEntryPage-backed (ADR-0010 point 2).
 */
export function buildEndpointFieldHTML(
  side: 'origin' | 'target',
  label: string,
  resolved?: ResolvedEndpointDisplay,
): string {
  const Side = side === 'origin' ? 'Origin' : 'Target';
  const hasValue = resolved !== undefined;
  const valueAttr = hasValue ? ` value="${escapeHtmlAttribute(resolved.title)}" readonly` : '';
  const titleAttr = hasValue ? ` title="${escapeHtmlAttribute(resolved.uuid)}"` : '';
  const uuidLine = hasValue
    ? `<p class="archivexus-rel-endpoint-uuid" data-role="${side}-uuid">${escapeHtmlAttribute(resolved.uuid)}</p>`
    : `<p class="archivexus-rel-endpoint-uuid" data-role="${side}-uuid" hidden></p>`;
  return (
    `<div class="form-group archivexus-rel-endpoint" data-endpoint="${side}">` +
    `<label for="archivexus-relationship-${side}" data-role="${side}-label">${label}</label>` +
    `<div class="archivexus-rel-endpoint-control" data-role="${side}-drop">` +
    `<input type="text" id="archivexus-relationship-${side}" name="${side}" data-role="${side}-input" autocomplete="off" placeholder="Drop an Actor or Journal page here, or paste its UUID"${valueAttr}${titleAttr} />` +
    `<button type="button" class="archivexus-rel-endpoint-clear" data-action="clear${Side}" title="Clear" aria-label="Clear ${label}"${hasValue ? '' : ' hidden'}>✕</button>` +
    `</div>` +
    uuidLine +
    `<p class="notification error" data-role="${side}-error" hidden></p>` +
    `</div>`
  );
}

/**
 * Builds the window's initial markup. Pure and unit-testable (no DOM) —
 * the live class only ever mutates specific descendants of this afterward
 * (endpoint field state, definition options, labels, summary/warning text,
 * the Save button); it never regenerates the whole string.
 */
export function buildRelationshipAuthoringContentHTML(
  originLabel: string,
  targetLabel: string,
  prefillOrigin?: ResolvedEndpointDisplay,
): string {
  return (
    `<form class="archivexus archivexus-relationship-authoring" autocomplete="off">` +
    buildEndpointFieldHTML('origin', originLabel, prefillOrigin) +
    buildEndpointFieldHTML('target', targetLabel) +
    `<div class="form-group">` +
    `<label for="archivexus-relationship-definition">Relationship</label>` +
    `<select name="definitionId" id="archivexus-relationship-definition" disabled>` +
    `<option value="" selected disabled>Drop both entities first</option>` +
    `</select>` +
    `</div>` +
    `<p class="notification success" data-role="saved-notice" hidden></p>` +
    `<p class="notification info" data-role="summary" hidden></p>` +
    `<p class="notification warning" data-role="warning" hidden></p>` +
    `<footer class="form-footer">` +
    `<button type="button" data-action="saveAndNew" disabled>Save &amp; add another</button>` +
    `<button type="button" data-action="save" disabled>Save</button>` +
    `</footer>` +
    `</form>`
  );
}

/** Extracts a document UUID from a native Foundry drag payload (`{type,uuid}` JSON) or a bare UUID string. */
export function parseDropPayloadUuid(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  try {
    const data = JSON.parse(trimmed) as { uuid?: unknown };
    if (typeof data.uuid === 'string' && data.uuid.length > 0) {
      return data.uuid;
    }
  } catch {
    // not JSON — fall through to the bare-UUID check
  }
  return /^[A-Za-z]+\.[A-Za-z0-9]+/.test(trimmed) ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Foundry glue — minimal structural types, no real DOM/Foundry-types dependency
// ---------------------------------------------------------------------------

/** Minimal subset of a drag/keyboard event the endpoint-field listeners touch (ADAPT-015). */
export interface MinimalUiEventLike {
  preventDefault(): void;
  stopPropagation(): void;
  readonly key?: string;
  readonly dataTransfer?: { getData(type: string): string } | null;
}

/**
 * Minimal structural subset of a real DOM element this class needs —
 * deliberately loose (a single shape covering every element kind touched:
 * `<input>`, `<select>`, `<p>`, `<button>`, the form), same no-real-types
 * tradeoff as the rest of this package. `tsconfig.json` omits the DOM lib
 * entirely (Core stays platform-agnostic), so there is no `HTMLElement` to
 * borrow from even loosely.
 */
export interface MinimalDomElementLike {
  value: string;
  textContent: string | null;
  innerHTML: string;
  disabled: boolean;
  hidden: boolean;
  classList: { add(name: string): void; remove(name: string): void };
  addEventListener(type: string, listener: (event: MinimalUiEventLike) => void): void;
  querySelector(selector: string): MinimalDomElementLike | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
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
        saveAndNew(this: RelationshipAuthoringApplication): void {
          void this._onSave({ keepOpen: true });
        },
        clearOrigin(this: RelationshipAuthoringApplication): void {
          void this._resolveEndpoint('origin', '');
        },
        clearTarget(this: RelationshipAuthoringApplication): void {
          void this._resolveEndpoint('target', '');
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
      this.#definitions = options.definitions ?? DEFAULT_RELATIONSHIP_DEFINITIONS;
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
      const prefillOrigin = this.#origin.node
        ? { title: this.#origin.node.title, uuid: this.#origin.node.nodeId }
        : undefined;
      return buildRelationshipAuthoringContentHTML(originLabel, targetLabel, prefillOrigin);
    }

    _replaceHTML(result: string, content: MinimalDomElementLike): void {
      ensureArchivexusStyles();
      content.innerHTML = result;
    }

    _onRender(): void {
      const root = this.element;

      for (const side of ['origin', 'target'] as const) {
        const drop = root.querySelector(`[data-role="${side}-drop"]`);
        const input = root.querySelector(`[data-role="${side}-input"]`);
        drop?.addEventListener('dragover', (event) => {
          event.preventDefault();
          drop.classList.add('archivexus-rel-drop-active');
        });
        drop?.addEventListener('dragleave', () =>
          drop.classList.remove('archivexus-rel-drop-active'),
        );
        drop?.addEventListener('drop', (event) => {
          event.preventDefault();
          event.stopPropagation();
          drop.classList.remove('archivexus-rel-drop-active');
          const uuid = parseDropPayloadUuid(event.dataTransfer?.getData('text/plain') ?? '');
          if (uuid) void this._resolveEndpoint(side, uuid);
        });
        input?.addEventListener('change', () => void this._resolveEndpoint(side, input.value));
        input?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void this._resolveEndpoint(side, input.value);
          }
        });
      }

      // Swallow any drop that misses an endpoint field so a stray drag can't
      // escape the window to a Foundry "Create Actor" dialog (ADAPT-015).
      root.addEventListener('dragover', (event) => event.preventDefault());
      root.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      const selectEl = root.querySelector('[name="definitionId"]');
      selectEl?.addEventListener('change', () => {
        this.#selectedDefinitionId = selectEl.value.length > 0 ? selectEl.value : undefined;
        void this.#refreshDerivedUI();
      });

      void this.#refreshDerivedUI();
    }

    // -- Endpoint resolution --

    /**
     * Resolves a UUID (from a drop, a paste, or the ✕ clear button passing
     * `''`) to a Node, updates that endpoint's state + field display, and
     * re-derives the rest of the UI. Not `#`-private so `clearOrigin`/
     * `clearTarget` and tests can call it, same convention as `_onSave`.
     */
    async _resolveEndpoint(side: 'origin' | 'target', rawValue: string): Promise<void> {
      const value = rawValue.trim();
      if (value.length > 0) {
        // The GM is picking the next entity — the "Saved: …" notice from a
        // prior "Save & add another" has served its purpose.
        this.#setHiddenText(this.element, '[data-role="saved-notice"]', undefined);
      }
      if (value.length === 0) {
        this.#setEndpoint(side, EMPTY_ENDPOINT);
        this.#renderEndpointField(side);
        await this.#refreshDerivedUI();
        return;
      }

      let document_: unknown;
      try {
        document_ = await foundry.utils.fromUuid(value);
      } catch (error) {
        this.#log.error(
          `Failed to resolve dropped document "${value}": ${error instanceof Error ? error.message : String(error)}`,
        );
        document_ = null;
      }

      if (document_ === null || document_ === undefined) {
        this.#setEndpoint(side, { node: undefined, error: 'Could not resolve that document.' });
        this.#renderEndpointField(side);
        await this.#refreshDerivedUI();
        return;
      }

      const doc = document_ as FoundryDroppableDocumentLike;
      const resolved = resolveDroppedDocumentNode(doc.documentName, doc);
      if (!resolved.ok) {
        this.#setEndpoint(side, { node: undefined, error: resolved.error });
        this.#renderEndpointField(side);
        await this.#refreshDerivedUI();
        return;
      }

      this.#setEndpoint(side, { node: resolved.node, error: undefined });
      this.#renderEndpointField(side);
      await this.#refreshDerivedUI();
    }

    /** Reflects an endpoint's state into its `<input>` / ✕ button / UUID line (ADAPT-015). */
    #renderEndpointField(side: 'origin' | 'target'): void {
      const state = side === 'origin' ? this.#origin : this.#target;
      const root = this.element;
      const input = root.querySelector(`[data-role="${side}-input"]`);
      const clear = root.querySelector(`[data-endpoint="${side}"] .archivexus-rel-endpoint-clear`);
      const uuidLine = root.querySelector(`[data-role="${side}-uuid"]`);
      const node = state.node;
      if (input) {
        if (node) {
          input.value = node.title;
          input.setAttribute('readonly', 'readonly');
          input.setAttribute('title', node.nodeId);
        } else {
          input.value = '';
          input.removeAttribute('readonly');
          input.removeAttribute('title');
        }
      }
      if (clear) clear.hidden = node === undefined;
      if (uuidLine) {
        uuidLine.textContent = node?.nodeId ?? '';
        uuidLine.hidden = node === undefined;
      }
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
        this.#setSaveEnabled(false);
        return;
      }

      if (!bothEndpointsResolved || !definition || !this.#origin.node || !this.#target.node) {
        this.#setHiddenText(root, '[data-role="summary"]', undefined);
        this.#setHiddenText(root, '[data-role="warning"]', undefined);
        this.#setSaveEnabled(false);
        return;
      }

      // ADAPT-015: store/display in whichever orientation the Definition's
      // validation accepts — the GM can drop the two ends either way round.
      const { origin: originNode, target: targetNode } = this.#orientedEndpoints(
        definition,
        this.#origin.node,
        this.#target.node,
      );
      this.#setHiddenText(
        root,
        '[data-role="summary"]',
        buildRelationshipSummary(definition, originNode.title, targetNode.title),
      );

      const warning = await this.#checkCardinality(definition, originNode, targetNode);
      this.#setHiddenText(root, '[data-role="warning"]', warning);

      this.#setSaveEnabled(true, warning ? 'Save anyway' : 'Save');
    }

    /** Enables/disables both Save buttons together; `label` (default "Save") is the primary button's text. */
    #setSaveEnabled(enabled: boolean, label = 'Save'): void {
      const root = this.element;
      const save = root.querySelector('[data-action="save"]');
      if (save) {
        save.disabled = !enabled;
        save.textContent = label;
      }
      const saveAndNew = root.querySelector('[data-action="saveAndNew"]');
      if (saveAndNew) {
        saveAndNew.disabled = !enabled;
        saveAndNew.textContent =
          label === 'Save' ? 'Save & add another' : 'Save anyway & add another';
      }
    }

    /** The (origin, target) pair to store — swapped when only the reversed orientation validates (ADAPT-015). */
    #orientedEndpoints(
      definition: RelationshipDefinition,
      origin: ResolvedDroppedNode,
      target: ResolvedDroppedNode,
    ): { origin: ResolvedDroppedNode; target: ResolvedDroppedNode } {
      const orientation = resolveDefinitionOrientation(
        definition,
        origin.nodeType,
        target.nodeType,
      );
      return orientation === 'reversed' ? { origin: target, target: origin } : { origin, target };
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

    /**
     * `keepOpen` (the "Save & add another" button, ADAPT-015 follow-up):
     * after saving, keep the Origin field pinned and clear only Target + the
     * Definition, so the GM can wire several members to one Organization
     * without reopening the window each time.
     */
    async _onSave(options: { keepOpen?: boolean } = {}): Promise<void> {
      const definition = this.selectedDefinition;
      const droppedOrigin = this.#origin.node;
      const droppedTarget = this.#target.node;
      if (
        !definition ||
        !droppedOrigin ||
        !droppedTarget ||
        droppedOrigin.nodeId === droppedTarget.nodeId
      ) {
        return;
      }

      // ADAPT-015: swap to the orientation the Definition's validation
      // accepts (e.g. authoring "member-of" from the Organization's sheet).
      const { origin, target } = this.#orientedEndpoints(definition, droppedOrigin, droppedTarget);
      const title = buildRelationshipTitle(definition, origin.title, target.title);

      try {
        await this.#storage.saveRelationship(
          createRelationship({
            id: foundry.utils.randomID(),
            origin: origin.nodeId,
            target: target.nodeId,
            definitionId: definition.id,
            title,
          }),
        );
        // Lets any open Relationship Console (VIEW-001i) refresh its list.
        Hooks.callAll('archivexus.relationshipsChanged');
      } catch (error) {
        this.#log.error(
          `Failed to save Relationship: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }

      if (options.keepOpen) {
        this.#selectedDefinitionId = undefined;
        await this._resolveEndpoint('target', ''); // clears Target field + re-derives the UI
        this.#setSavedNotice(`Saved: ${title}. Drop the next entity to add another.`);
        return;
      }
      await this.close();
    }

    #setSavedNotice(message: string): void {
      this.#setHiddenText(this.element, '[data-role="saved-notice"]', message);
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

/**
 * Opens the Relationship-authoring window — the canonical "create a
 * Relationship" surface (ADR-0014 Amendment 2 decision 3: every entry point
 * launches this same window, optionally prefilled). Callers: the per-sheet
 * "New Relationship…" header button (via `openRelationshipAuthoringWindowFromSheet`,
 * which resolves the sheet's document to `prefillOrigin`) and the
 * Relationship Console's `[+ New relationship]` (VIEW-001i, prefilled from
 * its active "involves node X" filter, if any).
 */
export async function openRelationshipAuthoringWindow(
  storage: StorageProvider | undefined,
  log: Logger,
  options: { prefillOrigin?: ResolvedDroppedNode } = {},
): Promise<void> {
  if (!storage) {
    log.warn(
      'Storage provider not ready yet - cannot open the Relationship-authoring window (should only happen during startup).',
    );
    return;
  }

  // Definitions are real, editable `StorageProvider` state now (CORE-004's
  // deferred persistence fast-follow) — bootstrapped from
  // `DEFAULT_RELATIONSHIP_DEFINITIONS` on first run. Fall back to that
  // default list only if the store somehow has none (a failed bootstrap),
  // so the picker is never inexplicably empty.
  let definitions: readonly RelationshipDefinition[] = DEFAULT_RELATIONSHIP_DEFINITIONS;
  try {
    const stored = await storage.listRelationshipDefinitions();
    if (stored.length > 0) {
      definitions = stored;
    }
  } catch (error) {
    log.error(
      `Failed to load Relationship Definitions; falling back to defaults: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const ApplicationClass = getRelationshipAuthoringApplicationClass();
  new ApplicationClass({
    storage,
    log,
    definitions,
    ...(options.prefillOrigin ? { prefillOrigin: options.prefillOrigin } : {}),
  }).render(true);
}

async function openRelationshipAuthoringWindowFromSheet(
  app: FoundrySheetAppLike,
  storage: StorageProvider | undefined,
  log: Logger,
): Promise<void> {
  const resolved = resolveDroppedDocumentNode(app.document.documentName, app.document);
  if (!resolved.ok) {
    log.warn(
      `Opened Relationship-authoring window from an unsupported document type: ${resolved.error}`,
    );
  }
  await openRelationshipAuthoringWindow(storage, log, {
    ...(resolved.ok ? { prefillOrigin: resolved.node } : {}),
  });
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
      onClick: () => void openRelationshipAuthoringWindowFromSheet(app, getStorage(), log),
    });
  };

  Hooks.on('getHeaderControlsActorSheetV2', handler);
  Hooks.on('getHeaderControlsJournalEntryPageSheet', handler);
}
