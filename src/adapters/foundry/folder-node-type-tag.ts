import { buildNodeTypeDialogContent } from './actor-node-type-tag.js';
import { isTaggedFolder, type FoundryFolderLike } from './folder-to-node.js';
import type { Logger } from './logger.js';

/**
 * ADAPT-016 / ADR-0015 — the GM-facing way to make a Folder a Node: an
 * "Archivexus Node Type" entry in a Folder's directory context menu
 * (`getFolderContextOptions`). Sets `flags.archivexus.nodeType` (and, if the
 * GM opts out of auto-parenting, `flags.archivexus.containmentRoot`) — the
 * `updateFolder` Hook then re-syncs (`folder-sync.ts` for the Node,
 * ADAPT-017's engine for the derived containment).
 *
 * **Verified live on v14.367 (2026-09-08):** `getFolderContextOptions` fires
 * (the "Archivexus Node Type" entry appears in a folder's directory context
 * menu), the callback receives a plain `HTMLElement`, and — the one gotcha —
 * v14 binds the folder context menu to `.folder .folder-header`, so the
 * callback target is the `<header class="folder-header">`; `data-folder-id`
 * lives on its enclosing `<li class="directory-item folder">`, so
 * `folderIdFromContextTarget` walks up with `closest()`. Tagging
 * (`setFlag` → `updateFolder` → `folder-sync.ts`) creates the `Folder.<id>`
 * Node; clearing the flag deletes it; a tagged folder resolves as an
 * endpoint in the authoring window, an untagged one gives a clear error.
 *
 * What's pure and unit-tested: `resolveNearestTaggedAncestor`,
 * `buildFolderNodeTypeDialogContent`, `parseFolderNodeTypeDialogResult`.
 */

const FLAG_SCOPE = 'archivexus';
const NODE_TYPE_FLAG_KEY = 'nodeType';
const CONTAINMENT_ROOT_FLAG_KEY = 'containmentRoot';
const ROOT_INPUT_NAME = 'containmentRoot';

/** The tagged Folder nearest to (and above) `folder`, walking its ancestors nearest-first. */
export function resolveNearestTaggedAncestor(
  ancestors: readonly FoundryFolderLike[],
): FoundryFolderLike | undefined {
  return ancestors.find((ancestor) => isTaggedFolder(ancestor));
}

/**
 * The dialog body: the shared Node-type input + datalist (reused from
 * `actor-node-type-tag.ts`), plus — when a tagged ancestor exists — an
 * informational "Links to: X" line and a "this is a top-level concept"
 * checkbox that suppresses the auto containment edge.
 */
export function buildFolderNodeTypeDialogContent(
  idSuffix: string,
  currentType: string,
  nearestTaggedAncestorTitle: string | undefined,
  isRoot: boolean,
): string {
  const base = buildNodeTypeDialogContent(`folder-${idSuffix}`, currentType);
  if (nearestTaggedAncestorTitle === undefined) {
    return base;
  }
  const escaped = nearestTaggedAncestorTitle
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return (
    base +
    `<p class="notification info" style="margin-top:0.5em;">Links to: <strong>${escaped}</strong> (its contained things relate to it automatically).</p>` +
    `<label class="checkbox" style="display:flex;gap:0.4em;align-items:center;margin-top:0.25em;">` +
    `<input type="checkbox" name="${ROOT_INPUT_NAME}"${isRoot ? ' checked' : ''} /> This is a top-level concept — don't link it to “${escaped}”.` +
    `</label>`
  );
}

export interface FolderNodeTypeDialogResult {
  readonly nodeType: string;
  readonly containmentRoot: boolean;
}

/** Pure: pulls the two values out of the dialog form's elements. */
export function parseFolderNodeTypeDialogResult(elements: {
  [name: string]: { value?: string; checked?: boolean } | undefined;
}): FolderNodeTypeDialogResult {
  return {
    nodeType: (elements[NODE_TYPE_FLAG_KEY]?.value ?? '').trim(),
    containmentRoot: elements[ROOT_INPUT_NAME]?.checked === true,
  };
}

// ---------------------------------------------------------------------------
// Registration (Foundry glue)
// ---------------------------------------------------------------------------

interface FoundryFolderDocumentLike extends FoundryFolderLike {
  readonly ancestors?: readonly FoundryFolderLike[];
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
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
        button: { form: { elements: Record<string, { value?: string; checked?: boolean }> } },
      ) => FolderNodeTypeDialogResult;
    };
  }): Promise<FolderNodeTypeDialogResult | null>;
}

/** Minimal shape of the mutable menu-item array `getFolderContextOptions` hands out. */
export interface FoundryFolderContextOptionsLike {
  push(entry: {
    name: string;
    icon: string;
    callback: (target: unknown) => void;
  }): void;
}

interface ContextTargetLike {
  dataset?: { folderId?: string };
  getAttribute?(name: string): string | null;
  closest?(selector: string): ContextTargetLike | null;
}

/** Exported for tests — pulls the folder id out of a context-menu callback target. */
export function folderIdFromContextTarget(target: unknown): string | undefined {
  // v14's folder context menu binds to `.folder .folder-header` (confirmed
  // live), so the callback target is the `<header class="folder-header">` —
  // `data-folder-id` lives on its enclosing `<li class="directory-item
  // folder">`, so walk up with `closest()`. The `Array.isArray` unwrap
  // covers an older jQuery-wrapped target defensively.
  const el = (Array.isArray(target) ? target[0] : target) as ContextTargetLike | undefined;
  if (!el) return undefined;
  const own = el.dataset?.folderId ?? el.getAttribute?.('data-folder-id') ?? undefined;
  if (own) return own;
  const ancestor = el.closest?.('[data-folder-id]');
  return ancestor?.dataset?.folderId ?? ancestor?.getAttribute?.('data-folder-id') ?? undefined;
}

async function openFolderNodeTypeDialog(
  dialogV2: FoundryDialogV2Like,
  folder: FoundryFolderDocumentLike,
  log: Logger,
): Promise<void> {
  const currentType = folder.flags?.archivexus?.nodeType ?? '';
  const isRoot = folder.flags?.archivexus?.containmentRoot === true;
  const nearest = resolveNearestTaggedAncestor(folder.ancestors ?? []);
  const content = buildFolderNodeTypeDialogContent(
    folder.uuid,
    currentType,
    nearest?.name,
    isRoot,
  );

  const result = await dialogV2.prompt({
    window: { title: 'Archivexus Node Type' },
    content,
    ok: {
      label: 'Save',
      callback: (_event, button) => parseFolderNodeTypeDialogResult(button.form.elements),
    },
  });
  if (result === null || result === undefined) {
    return;
  }

  try {
    if (result.nodeType.length === 0) {
      // Cleared → untag the folder (folder-sync's updateFolder handler deletes the Node).
      await folder.unsetFlag(FLAG_SCOPE, NODE_TYPE_FLAG_KEY);
      await folder.unsetFlag(FLAG_SCOPE, CONTAINMENT_ROOT_FLAG_KEY);
      return;
    }
    await folder.setFlag(FLAG_SCOPE, NODE_TYPE_FLAG_KEY, result.nodeType);
    if (result.containmentRoot) {
      await folder.setFlag(FLAG_SCOPE, CONTAINMENT_ROOT_FLAG_KEY, true);
    } else {
      await folder.unsetFlag(FLAG_SCOPE, CONTAINMENT_ROOT_FLAG_KEY);
    }
  } catch (error) {
    log.error(
      `Failed to tag folder "${folder.name}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Registers the folder context-menu entry, once at module init. `getFolder`
 * resolves a folder id to the live Folder document (`game.folders.get`) —
 * loosely typed (`unknown`) since `game.folders` is deliberately untyped in
 * `foundry-globals.d.ts`; the shape this needs (`FoundryFolderDocumentLike`)
 * is asserted here.
 */
export function registerFolderNodeTypeTag(
  getFolder: (id: string) => unknown,
  log: Logger,
): void {
  const dialogV2 = foundry.applications.api.DialogV2 as unknown as FoundryDialogV2Like;
  Hooks.on(
    'getFolderContextOptions',
    (_app: unknown, options: FoundryFolderContextOptionsLike) => {
      options.push({
        name: 'Archivexus Node Type',
        icon: '<i class="fa-solid fa-tag"></i>',
        callback: (target: unknown) => {
          const id = folderIdFromContextTarget(target);
          const folder = id
            ? (getFolder(id) as FoundryFolderDocumentLike | undefined)
            : undefined;
          if (folder) void openFolderNodeTypeDialog(dialogV2, folder, log);
        },
      });
    },
  );
}
