import { KNOWN_NODE_TYPES } from '../../core/domain/node.js';
import type { FoundryActorLike } from './actor-to-node.js';

/**
 * GM-tagging UI for `flags.archivexus.nodeType` (ADAPT-003, ADR-0009) — the
 * only way to set an Actor's Node type today is the Foundry console
 * (`actor.setFlag('archivexus', 'nodeType', '...')`); this replaces that
 * with a small control injected into the Actor sheet itself.
 *
 * Per ADR-0009 point 2: uses `renderActorSheetV2` (not a dnd5e-specific
 * class like `CharacterActorSheet` — this Adapter stays agnostic across
 * whatever Actor sheet class a given System registers, matching ADAPT-004's
 * no-branching-on-actor.type rule) and Foundry's own native form
 * submission (`name="flags.archivexus.nodeType"`, `submitOnChange: true`
 * confirmed against a real dnd5e2 sheet) rather than a manual `setFlag`
 * call.
 *
 * Injection point: the first child of `.window-content`, before the
 * System's own in-sheet header — confirmed against a real Foundry v14.367
 * + dnd5e 5.3.3 `CharacterActorSheet` (`ActorSheetV2` is present in its
 * prototype chain, so the hook fires). Deliberately not one of dnd5e's own
 * vertical tabs (details/inventory/features/spells/effects/biography/
 * specialTraits) — those are dnd5e's own fixed `TABS` config, not
 * something a foreign module can cleanly add to via a `render*` hook
 * alone (would need to patch dnd5e internals, which ADR-0009 explicitly
 * rejected). A persistent block above the System's own header is visible
 * regardless of which tab is active, and never touches System-owned
 * markup — matches ADR-0009's "own self-contained block, not threaded
 * into the System's own field layout" principle literally.
 *
 * `NodeType` is an open string (ADAPT-005's Decision, `node.ts`), not a
 * closed enum — `KNOWN_NODE_TYPES` are `<datalist>` suggestions, not a
 * restriction; the GM can type anything.
 */

const NODE_TYPE_FLAG_NAME = 'flags.archivexus.nodeType';
const CONTAINER_CLASS = 'archivexus-node-type-tag';

/**
 * Minimal structural subset of an `ApplicationV2` render hook's
 * `htmlElement` parameter this needs (same no-Foundry-dependency tradeoff
 * as `FoundryActorLike`/`FoundryJournalEntryPageLike`) — no DOM lib
 * dependency, since `tsconfig.json` deliberately omits it (Core stays
 * platform-agnostic; see `foundry-globals.d.ts`).
 */
export interface FoundryHTMLElementLike {
  querySelector(selector: string): FoundryHTMLElementLike | null;
  insertAdjacentHTML(
    position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend',
    html: string,
  ): void;
}

/** Minimal shape of the `app` parameter `renderActorSheetV2` hooks receive. */
export interface FoundryActorSheetAppLike {
  readonly document: FoundryActorLike;
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
 * Builds the injected control's markup. Pure and unit-testable (no DOM):
 * a labeled text input bound to `flags.archivexus.nodeType`, with
 * `KNOWN_NODE_TYPES` offered via a `<datalist>` as suggestions only.
 *
 * `elementIdSuffix` must be unique per rendered sheet instance (e.g. the
 * Actor's id) — without it, two Actor sheets open at once would both
 * render `id="archivexus-node-type-suggestions"`, and a `list` attribute
 * match against a duplicate id is undefined/ambiguous across documents.
 */
export function buildNodeTypeTagHTML(
  elementIdSuffix: string,
  currentValue: string,
  suggestions: readonly string[] = KNOWN_NODE_TYPES,
): string {
  const datalistId = `archivexus-node-type-suggestions-${escapeHtmlAttribute(elementIdSuffix)}`;
  const options = suggestions
    .map((type) => `<option value="${escapeHtmlAttribute(type)}"></option>`)
    .join('');
  return (
    `<div class="${CONTAINER_CLASS}" style="display:flex;align-items:center;gap:0.5em;padding:0.25em 0.5em;font-size:var(--font-size-12,12px);border-bottom:1px solid var(--color-border-light-tertiary,#ccc);">` +
    `<label for="${datalistId}-input">Archivexus Node Type</label>` +
    `<input type="text" id="${datalistId}-input" name="${NODE_TYPE_FLAG_NAME}" list="${datalistId}" value="${escapeHtmlAttribute(currentValue)}" placeholder="e.g. Character" style="flex:1;" />` +
    `<datalist id="${datalistId}">${options}</datalist>` +
    `</div>`
  );
}

function handleRenderActorSheet(
  app: FoundryActorSheetAppLike,
  htmlElement: FoundryHTMLElementLike,
): void {
  const container = htmlElement.querySelector('.window-content');
  if (!container) {
    return;
  }
  // Idempotency guard: some render cycles (e.g. a partial re-render after
  // form submission) can fire this hook again on the same element without
  // a fresh `.window-content` — never inject a second copy.
  if (container.querySelector(`.${CONTAINER_CLASS}`)) {
    return;
  }
  const currentValue = app.document.flags?.archivexus?.nodeType ?? '';
  container.insertAdjacentHTML('afterbegin', buildNodeTypeTagHTML(app.document.uuid, currentValue));
}

/**
 * Registers the `renderActorSheetV2` listener. Call once, at module init
 * — the listener itself then fires on every future render, so this must
 * not be called per-render.
 */
export function registerActorNodeTypeTag(): void {
  Hooks.on('renderActorSheetV2', handleRenderActorSheet);
}
