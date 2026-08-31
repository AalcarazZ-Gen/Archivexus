import { KNOWN_NODE_TYPES } from '../../core/domain/node.js';
import type { FoundryActorLike } from './actor-to-node.js';

/**
 * GM-tagging UI for `flags.archivexus.nodeType` (ADAPT-003, ADR-0009) — the
 * only way to set an Actor's Node type today is the Foundry console
 * (`actor.setFlag('archivexus', 'nodeType', '...')`); this replaces that
 * with a real control on the Actor sheet.
 *
 * Opt-in header-control button + dialog, NOT a persistent bar on every
 * sheet (ADR-0009's Amendment, 2026-08-31): a permanent always-visible
 * control was the original design, but nothing in Core reads `Node.type`
 * yet (no View, no filter, no query — confirmed by grep before making
 * this call), and the common case (a Player Character) already gets the
 * correct type for free from `ACTOR_FALLBACK_NODE_TYPE` with zero GM
 * action. A bar with no visible payoff, shown on every single Actor sheet
 * including ones that need no attention, is worse UX than a button the GM
 * clicks only when they actually want to reclassify something (typically
 * an NPC/creature that shouldn't default to "Character"). This is exactly
 * the "lighter-weight action" ADR-0009 point 4 named `getHeaderControls*`
 * for and deferred at the time.
 *
 * Mechanism: `getHeaderControlsActorSheetV2` (not a dnd5e-specific class
 * name — stays System-agnostic like the render-hook approach it replaces,
 * matching ADAPT-004's no-branching-on-actor.type rule) pushes a header
 * control button; clicking it opens a `DialogV2.prompt` with the same
 * labeled-input-plus-datalist content, and its `ok` callback writes the
 * flag via `document.setFlag`. Both confirmed live against a real
 * Foundry v14.367 + dnd5e 5.3.3 `CharacterActorSheet` — the earlier
 * uncertainty ADR-0009 flagged (whether `getHeaderControls*` needs an
 * `action`-string bound to the app's own static action map, the way core
 * Foundry's OWN controls work) turned out not to apply: a control object
 * pushed via the hook can carry a direct `onClick` function instead, no
 * class-level registration needed. One real gotcha found live: a plain
 * `app.render(true)` on an already-open sheet does NOT recompute header
 * controls — only a fresh render (closing and reopening, or opening for
 * the first time) does, since Foundry appears to collect them once, not
 * on every render.
 *
 * `NodeType` is an open string (ADAPT-005's Decision, `node.ts`), not a
 * closed enum — `KNOWN_NODE_TYPES` are `<datalist>` suggestions, not a
 * restriction; the GM can type anything.
 */

const NODE_TYPE_FLAG_SCOPE = 'archivexus';
const NODE_TYPE_FLAG_KEY = 'nodeType';
const DIALOG_INPUT_NAME = 'nodeType';

/**
 * Minimal structural subset of `foundry.applications.api.DialogV2` this
 * needs — no DOM/Foundry-types dependency, matching the rest of this
 * package's ambient-declaration tradeoff (`foundry-globals.d.ts`).
 */
export interface FoundryDialogV2Like {
  prompt(config: {
    window: { title: string };
    content: string;
    ok: {
      label: string;
      callback: (
        event: unknown,
        button: { form: { elements: Record<string, { value: string }> } },
      ) => string;
    };
  }): Promise<string | null>;
}

/** Minimal shape of the `controls` array `getHeaderControls*` hooks receive. */
export interface FoundryHeaderControlsLike {
  push(entry: { icon: string; label: string; onClick: () => void }): void;
}

/**
 * The Actor document as this control needs it: `FoundryActorLike`'s
 * existing flags/uuid shape plus `setFlag` — a separate interface (not
 * added to `FoundryActorLike` itself) so `actor-to-node.ts`'s existing
 * pure-mapping tests, which construct plain data objects with no methods,
 * stay unaffected.
 */
export interface FoundryActorDocumentLike extends FoundryActorLike {
  setFlag(scope: string, key: string, value: string): Promise<unknown>;
}

/** Minimal shape of the `app` parameter `getHeaderControlsActorSheetV2` hooks receive. */
export interface FoundryActorSheetAppLike {
  readonly document: FoundryActorDocumentLike;
}

/** Escapes text for safe embedding inside an HTML attribute value. */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds the dialog body's markup. Pure and unit-testable (no DOM): a
 * labeled text input pre-filled with the current value, with
 * `KNOWN_NODE_TYPES` offered via a `<datalist>` as suggestions only.
 *
 * `elementIdSuffix` must be unique per invocation (e.g. the Actor's uuid)
 * so the input/datalist ids never collide if a GM somehow has two of
 * these dialogs open at once.
 */
export function buildNodeTypeDialogContent(
  elementIdSuffix: string,
  currentValue: string,
  suggestions: readonly string[] = KNOWN_NODE_TYPES,
): string {
  const datalistId = `archivexus-node-type-suggestions-${escapeHtmlAttribute(elementIdSuffix)}`;
  const options = suggestions
    .map((type) => `<option value="${escapeHtmlAttribute(type)}"></option>`)
    .join('');
  return (
    `<div style="display:flex;flex-direction:column;gap:0.5em;">` +
    `<label for="${datalistId}-input">Node Type</label>` +
    `<input type="text" id="${datalistId}-input" name="${DIALOG_INPUT_NAME}" list="${datalistId}" value="${escapeHtmlAttribute(currentValue)}" placeholder="e.g. Character" />` +
    `<datalist id="${datalistId}">${options}</datalist>` +
    `</div>`
  );
}

async function openNodeTypeDialog(
  dialogV2: FoundryDialogV2Like,
  app: FoundryActorSheetAppLike,
): Promise<void> {
  const currentValue = app.document.flags?.archivexus?.nodeType ?? '';
  const content = buildNodeTypeDialogContent(app.document.uuid, currentValue);
  const result = await dialogV2.prompt({
    window: { title: 'Archivexus Node Type' },
    content,
    ok: {
      label: 'Save',
      callback: (_event, button) => button.form.elements[DIALOG_INPUT_NAME]?.value ?? '',
    },
  });
  if (result === null || result === undefined) {
    // Dialog was dismissed/cancelled — leave the flag untouched.
    return;
  }
  await app.document.setFlag(NODE_TYPE_FLAG_SCOPE, NODE_TYPE_FLAG_KEY, result);
}

function handleGetHeaderControls(
  app: FoundryActorSheetAppLike,
  controls: FoundryHeaderControlsLike,
  dialogV2: FoundryDialogV2Like,
): void {
  controls.push({
    icon: 'fa-solid fa-tag',
    label: 'Archivexus Node Type',
    onClick: () => {
      void openNodeTypeDialog(dialogV2, app);
    },
  });
}

/**
 * Registers the `getHeaderControlsActorSheetV2` listener. Call once, at
 * module init — the listener itself then fires on every future header
 * build, so this must not be called per-render. `DialogV2` is resolved
 * once here rather than per-click: it's a stable class reference, not
 * per-render state.
 */
export function registerActorNodeTypeTag(): void {
  const dialogV2 = foundry.applications.api.DialogV2 as unknown as FoundryDialogV2Like;
  Hooks.on(
    'getHeaderControlsActorSheetV2',
    (app: FoundryActorSheetAppLike, controls: FoundryHeaderControlsLike) => {
      handleGetHeaderControls(app, controls, dialogV2);
    },
  );
}
