import { buildNodeTypeDialogContent } from './actor-node-type-tag.js';
import type { Logger } from './logger.js';

/**
 * ADAPT-021 / ADR-0011 Amendment 2 — the GM-facing way to make a whole
 * `JournalEntry` a Node: an "Archivexus Node Type" entry in the journal
 * directory's right-click context menu (`getJournalEntryContextOptions`).
 * The **same discoverable surface** ADR-0015 gave folders
 * (`folder-node-type-tag.ts`), deliberately *not* a buried sheet ⋯-menu
 * action — Alberto's live feedback on the per-page control was that he
 * couldn't find it.
 *
 * Sets `flags.archivexus.nodeType` on the entry; the `updateJournalEntry`
 * Hook then re-syncs (`journal-entry-sync.ts` upserts the `JournalEntry.<id>`
 * Node with its pages as Blocks, ADAPT-017's engine derives the containment
 * edges). Clearing the field untags the entry — its pages return to
 * individual mapping.
 *
 * **Not live-verified** (no real Foundry client here): the hook name
 * `getJournalEntryContextOptions` is the documented v14 parallel to
 * `getFolderContextOptions` (which *was* verified live on v14.367 for the
 * folder control), and the context-menu target for a directory entry
 * carries `data-entry-id` (v14 `DocumentDirectory` binds the entry context
 * menu to `[data-entry-id]`). `entryIdFromContextTarget` also walks up with
 * `closest()` and falls back to `data-document-id`, the same defensive
 * shape `folderIdFromContextTarget` needed once v14's actual DOM was seen.
 * Alberto should confirm the menu entry appears before trusting it live.
 *
 * What's pure and unit-tested: `entryIdFromContextTarget`. The dialog body
 * is `buildNodeTypeDialogContent` verbatim (already covered by
 * `actor-node-type-tag`'s tests) — an entry needs no "containment root"
 * checkbox (it participates in folder-containment exactly like a tagged
 * Actor, which has no such control either).
 */

const FLAG_SCOPE = 'archivexus';
const NODE_TYPE_FLAG_KEY = 'nodeType';
const DIALOG_INPUT_NAME = 'nodeType';

interface ContextTargetLike {
  dataset?: { entryId?: string; documentId?: string };
  getAttribute?(name: string): string | null;
  closest?(selector: string): ContextTargetLike | null;
}

/** Exported for tests — pulls the JournalEntry id out of a context-menu callback target. */
export function entryIdFromContextTarget(target: unknown): string | undefined {
  const el = (Array.isArray(target) ? target[0] : target) as ContextTargetLike | undefined;
  if (!el) return undefined;
  const own =
    el.dataset?.entryId ??
    el.dataset?.documentId ??
    el.getAttribute?.('data-entry-id') ??
    el.getAttribute?.('data-document-id') ??
    undefined;
  if (own) return own;
  const ancestor = el.closest?.('[data-entry-id], [data-document-id]');
  return (
    ancestor?.dataset?.entryId ??
    ancestor?.dataset?.documentId ??
    ancestor?.getAttribute?.('data-entry-id') ??
    ancestor?.getAttribute?.('data-document-id') ??
    undefined
  );
}

interface FoundryJournalEntryDocumentLike {
  readonly uuid: string;
  readonly name: string;
  readonly flags?: { readonly archivexus?: { readonly nodeType?: string } };
  setFlag(scope: string, key: string, value: string): Promise<unknown>;
  unsetFlag(scope: string, key: string): Promise<unknown>;
}

interface FoundryDialogV2Like {
  prompt(config: {
    window: { title: string };
    content: string;
    ok: {
      label: string;
      callback: (
        event: unknown,
        button: { form: { elements: Record<string, { value?: string }> } },
      ) => string;
    };
  }): Promise<string | null>;
}

/** Minimal shape of the mutable menu-item array `getJournalEntryContextOptions` hands out. */
export interface FoundryEntryContextOptionsLike {
  push(entry: { name: string; icon: string; callback: (target: unknown) => void }): void;
}

async function openJournalEntryNodeTypeDialog(
  dialogV2: FoundryDialogV2Like,
  entry: FoundryJournalEntryDocumentLike,
  log: Logger,
): Promise<void> {
  const currentType = entry.flags?.archivexus?.nodeType ?? '';
  const content = buildNodeTypeDialogContent(`entry-${entry.uuid}`, currentType);

  const result = await dialogV2.prompt({
    window: { title: 'Archivexus Node Type' },
    content,
    ok: {
      label: 'Save',
      callback: (_event, button) => button.form.elements[DIALOG_INPUT_NAME]?.value ?? '',
    },
  });
  if (result === null || result === undefined) {
    return;
  }

  try {
    const nodeType = result.trim();
    if (nodeType.length === 0) {
      await entry.unsetFlag(FLAG_SCOPE, NODE_TYPE_FLAG_KEY);
      return;
    }
    await entry.setFlag(FLAG_SCOPE, NODE_TYPE_FLAG_KEY, nodeType);
  } catch (error) {
    log.error(
      `Failed to tag journal entry "${entry.name}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Registers the journal-directory context-menu entry, once at module init.
 * `getEntry` resolves an entry id to the live `JournalEntry` document
 * (`game.journal.get`) — loosely typed (`unknown`) since `game.journal` is
 * deliberately untyped in `foundry-globals.d.ts`.
 */
export function registerJournalEntryNodeTypeTag(
  getEntry: (id: string) => unknown,
  log: Logger,
): void {
  const dialogV2 = foundry.applications.api.DialogV2 as unknown as FoundryDialogV2Like;
  Hooks.on(
    'getJournalEntryContextOptions',
    (_app: unknown, options: FoundryEntryContextOptionsLike) => {
      options.push({
        name: 'Archivexus Node Type',
        icon: '<i class="fa-solid fa-tag"></i>',
        callback: (target: unknown) => {
          const id = entryIdFromContextTarget(target);
          const entry = id
            ? (getEntry(id) as FoundryJournalEntryDocumentLike | undefined)
            : undefined;
          if (entry) void openJournalEntryNodeTypeDialog(dialogV2, entry, log);
        },
      });
    },
  );
}
