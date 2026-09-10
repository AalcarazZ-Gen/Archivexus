import { KNOWN_NODE_TYPES } from '../../core/domain/node.js';
import type { FoundryJournalEntryPageLike } from './journal-entry-page-to-node.js';

/**
 * GM-tagging UI for JournalEntryPage sheets (ADR-0011 point 1) — extends
 * ADR-0009's existing `getHeaderControls*` + `DialogV2` tagging control
 * (`actor-node-type-tag.ts`, the direct precedent this file mirrors) with a
 * second, mutually-exclusive field: attach this page to an existing Node
 * instead of giving it its own type.
 *
 * **Mechanism, following `actor-node-type-tag.ts` exactly**: a
 * `getHeaderControlsJournalEntryPageSheet` button ("Archivexus Node Type",
 * same icon/label convention) opens a `DialogV2.prompt` whose content is
 * `buildNodeTypeDialogContent`'s existing type-text-input-plus-datalist
 * (ADR-0011 point 1) plus a `<document-tags single>` element (`type`
 * omitted, same widget ADR-0010 already validated) labeled "Or attach to
 * an existing Node."
 *
 * **Judgment call, flagged explicitly (per ADR-0011 point 1's own text,
 * "the two fields are mutually exclusive at read time"):** rather than
 * building an interactive radio-toggle that disables one field or the
 * other via inline DOM event wiring (more untested live-DOM surface, on
 * top of the `<document-tags>` gaps ADR-0010/ADAPT-007 already carry
 * unverified), this implements the ADR's own described mechanic literally
 * — both fields stay visible and enabled, and precedence is resolved once,
 * at Save time: if the attach field resolves to a non-empty uuid, that
 * wins (attach mode, `nodeType` is left untouched per ADR-0011 point 2);
 * otherwise the type field's value is used (standalone mode, unchanged
 * from today) and any stale `attachedToNodeId` is explicitly unset so the
 * precedence rule can't leave a page stuck attached. A short static hint
 * next to the attach field ("overrides the type above") communicates this
 * without needing any interactive JS. Simpler and lower-risk than a real
 * toggle, and exactly what ADR-0011 already decided — not a new mechanic
 * invented here.
 *
 * **Hook-name research (not live-verified — same discipline as every
 * prior ticket in this lineage, ADR-0009's Addendum/Amendment and
 * ADR-0010's own Disadvantages both name this exact gap for JournalEntryPage
 * sheets):** confirmed against Foundry v14's official API docs
 * (`https://foundryvtt.com/api/`, v14.365) that the real class hierarchy is
 * `ApplicationV2 → DocumentSheetV2 → JournalEntryPageSheet →
 * JournalEntryPageHandlebarsSheet → JournalEntryPageTextSheet →
 * {JournalEntryPageProseMirrorSheet, JournalEntryPageCodeMirrorSheet}`, and
 * that `getHeaderControls*`'s own doc comment states "Each Application
 * class in the inheritance chain will also fire this hook" — so
 * `getHeaderControlsJournalEntryPageSheet` (hooking the shared ancestor,
 * same reasoning as `getHeaderControlsActorSheetV2`) should fire for every
 * concrete page-sheet subclass. This is the same hook
 * `relationship-authoring-window.ts` already registers a *different*
 * handler on (ADAPT-007) — `Hooks.on` supports multiple listeners per hook
 * name, and Foundry passes the same `controls` array to each in turn, so
 * both buttons coexist in the header dropdown; this file's registration
 * does not replace or need to know about that one. Still not exercised
 * against an actual live render in this environment (no real Foundry
 * client available here) — Alberto should confirm both buttons actually
 * appear together before trusting this in a live session.
 */

const FLAG_SCOPE = 'archivexus';
const NODE_TYPE_FLAG_KEY = 'nodeType';
const ATTACHED_TO_NODE_ID_FLAG_KEY = 'attachedToNodeId';
const TYPE_INPUT_NAME = 'nodeType';
const ATTACH_INPUT_NAME = 'attachedToNodeId';

/** Minimal structural subset of `foundry.applications.api.DialogV2` this needs. */
export interface FoundryDialogV2Like {
  prompt(config: {
    window: { title: string };
    content: string;
    ok: {
      label: string;
      callback: (
        event: unknown,
        button: { form: { elements: Record<string, { value: string }> } },
      ) => JournalEntryPageNodeTagDialogResult;
    };
  }): Promise<JournalEntryPageNodeTagDialogResult | null>;
}

/** The two mutually-exclusive fields' raw submitted values. */
export interface JournalEntryPageNodeTagDialogResult {
  readonly nodeType: string;
  readonly attachedToNodeId: string;
}

/** Minimal shape of the `controls` array `getHeaderControls*` hooks receive. */
export interface FoundryHeaderControlsLike {
  push(entry: { icon: string; label: string; onClick: () => void }): void;
}

/**
 * The JournalEntryPage document as this control needs it:
 * `FoundryJournalEntryPageLike`'s existing flags/uuid shape plus
 * `setFlag`/`unsetFlag` — a separate interface (not added to
 * `FoundryJournalEntryPageLike` itself), same tradeoff
 * `actor-node-type-tag.ts`'s `FoundryActorDocumentLike` makes.
 */
export interface FoundryJournalEntryPageDocumentLike extends FoundryJournalEntryPageLike {
  readonly flags?: {
    readonly archivexus?: {
      readonly nodeType?: string;
      readonly attachedToNodeId?: string;
    };
  };
  setFlag(scope: string, key: string, value: string): Promise<unknown>;
  unsetFlag(scope: string, key: string): Promise<unknown>;
}

/** Minimal shape of the `app` parameter `getHeaderControlsJournalEntryPageSheet` hooks receive. */
export interface FoundryJournalEntryPageSheetAppLike {
  readonly document: FoundryJournalEntryPageDocumentLike;
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
 * Builds the dialog body's markup. Pure and unit-testable (no DOM): the
 * same labeled text-input-plus-datalist `buildNodeTypeDialogContent`
 * (`actor-node-type-tag.ts`) already uses, plus a second field — a
 * `<document-tags single>` element (`type` omitted, ADR-0010 point 2's
 * reasoning: a Node may be backed by either an Actor or a
 * JournalEntryPage) pre-filled from `currentAttachedToNodeId` when set.
 *
 * `elementIdSuffix` must be unique per invocation (e.g. the page's uuid),
 * same collision-avoidance reasoning as `buildNodeTypeDialogContent`.
 */
export function buildJournalEntryPageNodeTagDialogContent(
  elementIdSuffix: string,
  currentType: string,
  currentAttachedToNodeId: string,
  suggestions: readonly string[] = KNOWN_NODE_TYPES,
): string {
  const idSuffix = escapeHtmlAttribute(elementIdSuffix);
  const datalistId = `archivexus-node-type-suggestions-${idSuffix}`;
  const options = suggestions
    .map((type) => `<option value="${escapeHtmlAttribute(type)}"></option>`)
    .join('');
  const attachValueAttr =
    currentAttachedToNodeId.length > 0
      ? ` value="${escapeHtmlAttribute(currentAttachedToNodeId)}"`
      : '';

  return (
    `<div class="archivexus" style="display:flex;flex-direction:column;gap:0.75em;">` +
    `<div style="display:flex;flex-direction:column;gap:0.5em;">` +
    `<label for="${datalistId}-input">Node Type</label>` +
    `<input type="text" id="${datalistId}-input" name="${TYPE_INPUT_NAME}" list="${datalistId}" value="${escapeHtmlAttribute(currentType)}" placeholder="e.g. Character" />` +
    `<datalist id="${datalistId}">${options}</datalist>` +
    `</div>` +
    `<div style="display:flex;flex-direction:column;gap:0.5em;">` +
    `<label for="archivexus-attach-${idSuffix}">Or attach to an existing Node (overrides the type above)</label>` +
    `<document-tags single name="${ATTACH_INPUT_NAME}" id="archivexus-attach-${idSuffix}"${attachValueAttr}></document-tags>` +
    `</div>` +
    `</div>`
  );
}

async function openJournalEntryPageNodeTagDialog(
  dialogV2: FoundryDialogV2Like,
  app: FoundryJournalEntryPageSheetAppLike,
): Promise<void> {
  const currentType = app.document.flags?.archivexus?.nodeType ?? '';
  const currentAttachedToNodeId = app.document.flags?.archivexus?.attachedToNodeId ?? '';
  const content = buildJournalEntryPageNodeTagDialogContent(
    app.document.uuid,
    currentType,
    currentAttachedToNodeId,
  );
  const result = await dialogV2.prompt({
    window: { title: 'Archivexus Node Type' },
    content,
    ok: {
      label: 'Save',
      callback: (_event, button) => ({
        nodeType: button.form.elements[TYPE_INPUT_NAME]?.value ?? '',
        attachedToNodeId: button.form.elements[ATTACH_INPUT_NAME]?.value ?? '',
      }),
    },
  });
  if (result === null || result === undefined) {
    // Dialog was dismissed/cancelled — leave both flags untouched.
    return;
  }

  const attachedToNodeId = result.attachedToNodeId.trim();
  if (attachedToNodeId.length > 0) {
    // Attach mode wins (ADR-0011 point 1's read-time precedence) — the
    // `nodeType` flag is deliberately left untouched (ADR-0011 point 2), it
    // simply stops being read for this page once `attachedToNodeId` is set.
    await app.document.setFlag(FLAG_SCOPE, ATTACHED_TO_NODE_ID_FLAG_KEY, attachedToNodeId);
    return;
  }

  // Standalone mode — same behavior as actor-node-type-tag.ts today, plus
  // explicitly unsetting any stale attachedToNodeId (ADR-0011 point 2) so a
  // page can't stay stuck attached after the GM chose to detach it.
  await app.document.setFlag(FLAG_SCOPE, NODE_TYPE_FLAG_KEY, result.nodeType);
  await app.document.unsetFlag(FLAG_SCOPE, ATTACHED_TO_NODE_ID_FLAG_KEY);
}

function handleGetHeaderControls(
  app: FoundryJournalEntryPageSheetAppLike,
  controls: FoundryHeaderControlsLike,
  dialogV2: FoundryDialogV2Like,
): void {
  controls.push({
    icon: 'fa-solid fa-tag',
    label: 'Archivexus Node Type',
    onClick: () => {
      void openJournalEntryPageNodeTagDialog(dialogV2, app);
    },
  });
}

/**
 * Registers the `getHeaderControlsJournalEntryPageSheet` listener. Call
 * once, at module init — same call-once contract as
 * `registerActorNodeTypeTag`/`registerRelationshipAuthoringEntryPoints`.
 * Coexists with `relationship-authoring-window.ts`'s own listener on the
 * same hook name ("New Relationship…") — both fire and both push their own
 * entry into the shared `controls` array; this registration neither knows
 * about nor conflicts with that one.
 */
export function registerJournalEntryPageNodeTag(): void {
  const dialogV2 = foundry.applications.api.DialogV2 as unknown as FoundryDialogV2Like;
  Hooks.on(
    'getHeaderControlsJournalEntryPageSheet',
    (app: FoundryJournalEntryPageSheetAppLike, controls: FoundryHeaderControlsLike) => {
      handleGetHeaderControls(app, controls, dialogV2);
    },
  );
}
