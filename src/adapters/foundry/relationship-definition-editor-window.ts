import {
  createRelationshipDefinition,
  InvalidRelationshipDefinitionError,
  RELATIONSHIP_CARDINALITIES,
  RELATIONSHIP_TRAVERSAL_CATEGORIES,
  type CreateRelationshipDefinitionInput,
  type RelationshipCardinality,
  type RelationshipDefinition,
  type RelationshipTraversalCategory,
} from '../../core/domain/relationship-definition.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';
import { ensureArchivexusStyles } from './archivexus-styles.js';

/**
 * ADAPT-014 — the Relationship *Definition* editor `ApplicationV2`. Alberto's
 * stated authoring need is "adding new relation types" (Definitions), not
 * editing Relationship instances. Since the CORE-004 persistence fast-follow,
 * Definitions are real editable `StorageProvider` state (migration 3), but
 * the only way to touch them was the `game.modules.get('archivexus').api`
 * console escape hatch. This is the screen.
 *
 * Same shape family as `relationship-list-window.ts` / `relationship-authoring-window.ts`:
 * a deferred-factory-class (`foundry` is only an ambient type outside a live
 * client), raw `_renderHTML` (string) / `_replaceHTML` contract (no
 * Handlebars mixin), and pure content builders that carry all the logic.
 * Launched from a visible entry point — a "Relationship types" button on the
 * Codex sidebar toolbar (VIEW-001c).
 *
 * **Pure and unit-tested:** every `build*HTML` builder, `parseDefinitionForm`,
 * `validateDefinitionForm`, `formValuesFromDefinition`, `slugifyDefinitionId`,
 * `sortDefinitions`. **Foundry glue, flagged for live verification:** the
 * `ApplicationV2` subclass itself, its `actions` wiring, `DialogV2.confirm`
 * for delete (same shape `relationship-list-window.ts` researched), and the
 * `[name=…]` form-value reads.
 *
 * **Deliberately out of scope** (per issue #66): Definition *version
 * migration* (`03_DOMAIN_MODEL.md`'s standing Open Question — editing bumps
 * `version` in place, historical rows aren't kept), and bulk import/export.
 */

// ---------------------------------------------------------------------------
// Pure helpers — form values <-> domain
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** The raw string/boolean shape read straight off the form's `[name=…]` controls. */
export interface DefinitionFormValues {
  readonly name: string;
  readonly inverse: string;
  readonly cardinality: string;
  readonly symmetry: boolean;
  readonly traversalCategory: string;
  /** Comma-separated Node types, or empty for "no restriction". */
  readonly allowedOriginTypes: string;
  readonly allowedTargetTypes: string;
}

export function emptyDefinitionFormValues(): DefinitionFormValues {
  return {
    name: '',
    inverse: '',
    cardinality: 'many-to-many',
    symmetry: false,
    traversalCategory: '',
    allowedOriginTypes: '',
    allowedTargetTypes: '',
  };
}

export function formValuesFromDefinition(definition: RelationshipDefinition): DefinitionFormValues {
  return {
    name: definition.name,
    inverse: definition.inverse,
    cardinality: definition.cardinality,
    symmetry: definition.symmetry,
    traversalCategory: definition.traversalCategory,
    allowedOriginTypes: (definition.validation?.allowedOriginTypes ?? []).join(', '),
    allowedTargetTypes: (definition.validation?.allowedTargetTypes ?? []).join(', '),
  };
}

function parseTypeList(raw: string): readonly string[] | undefined {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

/**
 * Maps form values to a `CreateRelationshipDefinitionInput`. `id` is fixed by
 * the caller (the existing id when editing, a fresh slug when adding);
 * `existingVersion` is passed only when editing, and bumps the stored
 * `version` by one in place (issue #66: no historical rows). A symmetric
 * type's `inverse` is forced to equal `name` here so the GM never has to
 * keep the two fields in sync by hand — `createRelationshipDefinition`
 * requires them equal for `symmetry: true`.
 */
export function parseDefinitionForm(
  values: DefinitionFormValues,
  id: string,
  existingVersion?: number,
): CreateRelationshipDefinitionInput {
  const name = values.name.trim();
  const inverse = values.symmetry ? name : values.inverse.trim();
  const allowedOriginTypes = parseTypeList(values.allowedOriginTypes);
  const allowedTargetTypes = parseTypeList(values.allowedTargetTypes);
  const validation =
    allowedOriginTypes || allowedTargetTypes
      ? {
          ...(allowedOriginTypes ? { allowedOriginTypes } : {}),
          ...(allowedTargetTypes ? { allowedTargetTypes } : {}),
        }
      : undefined;

  return {
    id,
    name,
    inverse,
    ...(existingVersion !== undefined ? { version: existingVersion + 1 } : {}),
    cardinality: values.cardinality as RelationshipCardinality,
    symmetry: values.symmetry,
    traversalCategory: values.traversalCategory as RelationshipTraversalCategory,
    ...(validation ? { validation } : {}),
  };
}

export type ValidateDefinitionResult =
  | { readonly ok: true; readonly definition: RelationshipDefinition }
  | { readonly ok: false; readonly message: string };

/** Runs the Core factory, turning its `InvalidRelationshipDefinitionError` into an inline message. */
export function validateDefinitionForm(
  input: CreateRelationshipDefinitionInput,
): ValidateDefinitionResult {
  try {
    return { ok: true, definition: createRelationshipDefinition(input) };
  } catch (error) {
    if (error instanceof InvalidRelationshipDefinitionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/** A URL-ish id from the type name, kept unique against `existingIds` by numeric suffix. */
export function slugifyDefinitionId(name: string, existingIds: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'relationship-type';
  if (!existingIds.includes(base)) {
    return base;
  }
  let suffix = 2;
  while (existingIds.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

const CATEGORY_ORDER = new Map(
  RELATIONSHIP_TRAVERSAL_CATEGORIES.map((category, index) => [category, index]),
);

/** Groups by `traversalCategory` (taxonomy order), then alphabetical by `name`. */
export function sortDefinitions(
  definitions: readonly RelationshipDefinition[],
): readonly RelationshipDefinition[] {
  return [...definitions].sort((a, b) => {
    const categoryDelta =
      (CATEGORY_ORDER.get(a.traversalCategory) ?? Number.MAX_SAFE_INTEGER) -
      (CATEGORY_ORDER.get(b.traversalCategory) ?? Number.MAX_SAFE_INTEGER);
    return categoryDelta !== 0 ? categoryDelta : a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Pure markup builders
// ---------------------------------------------------------------------------

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function buildDefinitionListHTML(
  definitions: readonly RelationshipDefinition[],
  editingId: string | undefined,
): string {
  if (definitions.length === 0) {
    return '<p class="archivexus-def-empty" data-role="def-empty">No relationship types yet.</p>';
  }
  const items = definitions
    .map((definition) => {
      const active = definition.id === editingId ? ' archivexus-def-row--active' : '';
      const direction = definition.symmetry
        ? `<span class="archivexus-def-row-sym" title="symmetric">↔ ${escapeHtml(definition.name)}</span>`
        : `${escapeHtml(definition.name)} <span class="archivexus-def-row-arrow">→</span> ${escapeHtml(definition.inverse)}`;
      return (
        `<li class="archivexus-def-row${active}" data-definition-id="${escapeHtml(definition.id)}">` +
        `<div class="archivexus-def-row-main">${direction}</div>` +
        `<div class="archivexus-def-row-meta">${titleCase(definition.traversalCategory)} · ${escapeHtml(definition.cardinality)}</div>` +
        `<div class="archivexus-def-row-actions">` +
        `<button type="button" data-action="edit" data-definition-id="${escapeHtml(definition.id)}">Edit</button>` +
        `<button type="button" data-action="delete" data-definition-id="${escapeHtml(definition.id)}">Delete</button>` +
        `</div>` +
        `</li>`
      );
    })
    .join('');
  return `<ul class="archivexus-def-rows">${items}</ul>`;
}

function optionsHTML(values: readonly string[], selected: string, placeholder?: string): string {
  const head = placeholder
    ? `<option value="" ${selected.length === 0 ? 'selected ' : ''}disabled>${escapeHtml(placeholder)}</option>`
    : '';
  return (
    head +
    values
      .map(
        (value) =>
          `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(titleCase(value))}</option>`,
      )
      .join('')
  );
}

export function buildDefinitionFormHTML(
  values: DefinitionFormValues,
  mode: 'add' | 'edit',
  errorMessage?: string,
): string {
  const heading = mode === 'add' ? 'New relationship type' : 'Edit relationship type';
  const cancel =
    mode === 'edit' ? `<button type="button" data-action="cancelEdit">Cancel</button>` : '';
  return (
    `<form class="archivexus-def-form" autocomplete="off">` +
    `<h3 class="archivexus-def-form-heading" data-role="form-heading">${heading}</h3>` +
    `<div class="form-group">` +
    `<label for="archivexus-def-name">Name (forward label)</label>` +
    `<input type="text" id="archivexus-def-name" name="name" value="${escapeHtml(values.name)}" placeholder="e.g. rival-of" />` +
    `</div>` +
    `<div class="form-group">` +
    `<label for="archivexus-def-inverse">Inverse (reverse label)</label>` +
    `<input type="text" id="archivexus-def-inverse" name="inverse" value="${escapeHtml(values.inverse)}" placeholder="e.g. rival-of (or the reverse phrasing)" />` +
    `<p class="hint">Ignored for symmetric types — both directions use the name.</p>` +
    `</div>` +
    `<div class="form-group">` +
    `<label class="checkbox"><input type="checkbox" name="symmetry"${values.symmetry ? ' checked' : ''} /> Symmetric (both directions describe the same fact, e.g. "ally-of")</label>` +
    `</div>` +
    `<div class="form-group">` +
    `<label for="archivexus-def-cardinality">Cardinality</label>` +
    `<select id="archivexus-def-cardinality" name="cardinality">${optionsHTML([...RELATIONSHIP_CARDINALITIES], values.cardinality)}</select>` +
    `</div>` +
    `<div class="form-group">` +
    `<label for="archivexus-def-category">Traversal category</label>` +
    `<select id="archivexus-def-category" name="traversalCategory">${optionsHTML([...RELATIONSHIP_TRAVERSAL_CATEGORIES], values.traversalCategory, 'Select a category…')}</select>` +
    `</div>` +
    `<div class="form-group">` +
    `<label for="archivexus-def-origin-types">Restrict origin to types</label>` +
    `<input type="text" id="archivexus-def-origin-types" name="allowedOriginTypes" value="${escapeHtml(values.allowedOriginTypes)}" placeholder="Any — or e.g. Character, Organization" />` +
    `</div>` +
    `<div class="form-group">` +
    `<label for="archivexus-def-target-types">Restrict target to types</label>` +
    `<input type="text" id="archivexus-def-target-types" name="allowedTargetTypes" value="${escapeHtml(values.allowedTargetTypes)}" placeholder="Any — or e.g. City, Kingdom" />` +
    `</div>` +
    `<p class="notification error" data-role="form-error"${errorMessage ? '' : ' hidden'}>${escapeHtml(errorMessage ?? '')}</p>` +
    `<footer class="form-footer">` +
    `<button type="button" data-action="save">Save</button>` +
    cancel +
    `</footer>` +
    `</form>`
  );
}

export function buildDefinitionEditorContentHTML(
  definitions: readonly RelationshipDefinition[],
  editingId: string | undefined,
  formValues: DefinitionFormValues,
  mode: 'add' | 'edit',
  errorMessage?: string,
): string {
  return (
    `<div class="archivexus archivexus-def-editor">` +
    `<div class="archivexus-def-editor-list" data-role="list">` +
    `<div class="archivexus-def-editor-list-header">` +
    `<h3>Relationship types <span class="archivexus-def-count">${definitions.length}</span></h3>` +
    `<button type="button" data-action="add" title="Start a new relationship type">+ New</button>` +
    `</div>` +
    buildDefinitionListHTML(definitions, editingId) +
    `</div>` +
    `<div class="archivexus-def-editor-form" data-role="form">` +
    buildDefinitionFormHTML(formValues, mode, errorMessage) +
    `</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// Foundry glue — minimal structural types, deferred class
// ---------------------------------------------------------------------------

interface MinimalDomElementLike {
  innerHTML: string;
  hidden: boolean;
  textContent: string | null;
  readonly value: string;
  readonly checked: boolean;
  getAttribute(name: string): string | null;
  querySelector(selector: string): MinimalDomElementLike | null;
}

interface EditorInstanceLike {
  readonly element: MinimalDomElementLike;
  render(force?: boolean): unknown;
  close(options?: unknown): Promise<unknown>;
}

type ApplicationV2Constructor = new (options?: Record<string, unknown>) => EditorInstanceLike;
type EditorConstructor = new (options: EditorApplicationOptions) => EditorInstanceLike;

export interface EditorApplicationOptions {
  readonly storage: StorageProvider;
  readonly log: Logger;
}

interface FoundryDialogV2Like {
  confirm(config: {
    window?: { title?: string };
    content?: string;
    modal?: boolean;
  }): Promise<boolean | null | undefined>;
}

let cachedClass: EditorConstructor | undefined;
let openInstance: EditorInstanceLike | undefined;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Exported only for tests — production reaches it via `openRelationshipDefinitionEditor`. */
export function getRelationshipDefinitionEditorClass(): EditorConstructor {
  if (cachedClass) {
    return cachedClass;
  }

  const ApplicationV2Base = foundry.applications.api
    .ApplicationV2 as unknown as ApplicationV2Constructor;

  class RelationshipDefinitionEditorApplication extends ApplicationV2Base {
    static DEFAULT_OPTIONS = {
      id: 'archivexus-relationship-definition-editor',
      tag: 'div',
      window: { title: 'Relationship Types', icon: 'fa-solid fa-sitemap', resizable: true },
      position: { width: 640, height: 'auto' },
      actions: {
        add(this: RelationshipDefinitionEditorApplication): void {
          this._enterAddMode();
        },
        edit(
          this: RelationshipDefinitionEditorApplication,
          _event: unknown,
          target: MinimalDomElementLike,
        ): void {
          const id = target.getAttribute('data-definition-id');
          if (id) this._enterEditMode(id);
        },
        delete(
          this: RelationshipDefinitionEditorApplication,
          _event: unknown,
          target: MinimalDomElementLike,
        ): void {
          const id = target.getAttribute('data-definition-id');
          if (id) void this._onDelete(id);
        },
        save(this: RelationshipDefinitionEditorApplication): void {
          void this._onSave();
        },
        cancelEdit(this: RelationshipDefinitionEditorApplication): void {
          this._enterAddMode();
        },
      },
    };

    readonly #storage: StorageProvider;
    readonly #log: Logger;

    #definitions: readonly RelationshipDefinition[] = [];
    #mode: 'add' | 'edit' = 'add';
    #editingId: string | undefined;
    #formValues: DefinitionFormValues = emptyDefinitionFormValues();
    #formError: string | undefined;

    constructor(options: EditorApplicationOptions) {
      super(options as unknown as Record<string, unknown>);
      this.#storage = options.storage;
      this.#log = options.log;
    }

    async _renderHTML(): Promise<string> {
      try {
        this.#definitions = sortDefinitions(await this.#storage.listRelationshipDefinitions());
      } catch (error) {
        this.#log.error(`Definition editor: failed to load definitions: ${errorMessage(error)}`);
        this.#definitions = [];
      }
      return buildDefinitionEditorContentHTML(
        this.#definitions,
        this.#editingId,
        this.#formValues,
        this.#mode,
        this.#formError,
      );
    }

    _replaceHTML(result: string, content: MinimalDomElementLike): void {
      ensureArchivexusStyles();
      content.innerHTML = result;
    }

    _onClose(): void {
      if (openInstance === (this as unknown as EditorInstanceLike)) {
        openInstance = undefined;
      }
    }

    _enterAddMode(): void {
      this.#mode = 'add';
      this.#editingId = undefined;
      this.#formValues = emptyDefinitionFormValues();
      this.#formError = undefined;
      this.render(true);
    }

    _enterEditMode(id: string): void {
      const definition = this.#definitions.find((candidate) => candidate.id === id);
      if (!definition) return;
      this.#mode = 'edit';
      this.#editingId = id;
      this.#formValues = formValuesFromDefinition(definition);
      this.#formError = undefined;
      this.render(true);
    }

    async _onDelete(id: string): Promise<void> {
      const definition = this.#definitions.find((candidate) => candidate.id === id);
      const dialogV2 = foundry.applications.api.DialogV2 as unknown as FoundryDialogV2Like;
      const confirmed = await dialogV2.confirm({
        window: { title: 'Delete relationship type' },
        content:
          `<p>Delete "<strong>${escapeHtml(definition?.name ?? id)}</strong>"? Existing relationships ` +
          `that use it stay, but show as uncategorized until re-pointed. This cannot be undone.</p>`,
      });
      if (confirmed !== true) return;

      try {
        await this.#storage.deleteRelationshipDefinition(id);
      } catch (error) {
        this.#log.error(`Failed to delete definition "${id}": ${errorMessage(error)}`);
        return;
      }
      if (this.#editingId === id) {
        this.#mode = 'add';
        this.#editingId = undefined;
        this.#formValues = emptyDefinitionFormValues();
      }
      this.#formError = undefined;
      this.render(true);
    }

    #readFormValues(): DefinitionFormValues {
      const root = this.element;
      const get = (name: string): string => root.querySelector(`[name="${name}"]`)?.value ?? '';
      const checked = (name: string): boolean =>
        root.querySelector(`[name="${name}"]`)?.checked ?? false;
      return {
        name: get('name'),
        inverse: get('inverse'),
        cardinality: get('cardinality'),
        symmetry: checked('symmetry'),
        traversalCategory: get('traversalCategory'),
        allowedOriginTypes: get('allowedOriginTypes'),
        allowedTargetTypes: get('allowedTargetTypes'),
      };
    }

    async _onSave(): Promise<void> {
      const values = this.#readFormValues();
      this.#formValues = values;

      const existing =
        this.#mode === 'edit' && this.#editingId
          ? this.#definitions.find((candidate) => candidate.id === this.#editingId)
          : undefined;
      const id = existing
        ? existing.id
        : slugifyDefinitionId(
            values.name,
            this.#definitions.map((definition) => definition.id),
          );

      const result = validateDefinitionForm(parseDefinitionForm(values, id, existing?.version));
      if (!result.ok) {
        this.#formError = result.message;
        this.#showFormError(result.message);
        return;
      }

      try {
        await this.#storage.saveRelationshipDefinition(result.definition);
      } catch (error) {
        this.#log.error(`Failed to save definition "${id}": ${errorMessage(error)}`);
        this.#showFormError('Could not save — see the console for details.');
        return;
      }

      this.#mode = 'add';
      this.#editingId = undefined;
      this.#formValues = emptyDefinitionFormValues();
      this.#formError = undefined;
      this.render(true);
    }

    /** Surfaces a validation/save failure without a full re-render, so typed input is kept. */
    #showFormError(message: string): void {
      const el = this.element.querySelector('[data-role="form-error"]');
      if (el) {
        el.textContent = message;
        el.hidden = false;
      }
    }
  }

  cachedClass = RelationshipDefinitionEditorApplication as unknown as EditorConstructor;
  return cachedClass;
}

/**
 * Opens the singleton editor, or focuses/re-renders the one already open.
 * No-ops with a warning if storage isn't ready yet (startup only).
 */
export function openRelationshipDefinitionEditor(
  getStorage: () => StorageProvider | undefined,
  log: Logger,
): void {
  const storage = getStorage();
  if (!storage) {
    log.warn('Storage provider not ready yet - cannot open the Relationship Types editor.');
    return;
  }
  const EditorClass = getRelationshipDefinitionEditorClass();
  if (openInstance) {
    openInstance.render(true);
    return;
  }
  openInstance = new EditorClass({ storage, log });
  openInstance.render(true);
}
