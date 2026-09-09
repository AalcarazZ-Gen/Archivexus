import { removeBlockByUuid } from '../../core/domain/node.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import {
  isTaggedJournalEntry,
  mapJournalEntryToNode,
  type FoundryJournalEntryLike,
} from './journal-entry-to-node.js';
import type { FoundryJournalEntryPageLike } from './journal-entry-page-to-node.js';
import { deleteStandalonePageNodeIfPresent, syncJournalEntryPage } from './storage-sync.js';

/**
 * ADAPT-021 / ADR-0011 Amendment 2 — persists a `JournalEntry`-Node in and
 * out of storage. The direct sibling of `folder-sync.ts`: same "map, then
 * save" shape, same wired delete path (ADR-0015 point 10's scoped
 * exception — a container that stops being tagged genuinely has no meaning
 * as a Node), wired by `module-entry.ts` to `create/update/deleteJournalEntry`
 * without this file knowing about Hooks.
 *
 * Tagged: the entry is one Node (`JournalEntry.<id>`) whose pages are
 * engine-owned `{ type: 'JournalEntryPage', uuid, title }` Blocks
 * (reconciled wholesale by `mapJournalEntryToNode`). Tagging it also
 * removes the pages' now-superseded standalone Nodes (Amendment 2 point
 * A5 → `deleteStandalonePageNodeIfPresent`, warn-never-block).
 *
 * Untagged (never tagged, or the GM just cleared the flag): drop any stale
 * entry-Node, then return every page to its individual mapping via
 * `syncJournalEntryPage`.
 */

export async function syncJournalEntry(
  entry: FoundryJournalEntryLike,
  storage: StorageProvider,
): Promise<void> {
  const pages = (entry.pages?.contents ?? []) as readonly FoundryJournalEntryPageLike[];

  if (!isTaggedJournalEntry(entry)) {
    const existing = await storage.getNode(entry.uuid);
    if (existing) {
      await storage.deleteNode(entry.uuid);
    }
    for (const page of pages) {
      await syncJournalEntryPage(page, storage);
    }
    return;
  }

  const entryNode = mapJournalEntryToNode(entry);

  // The pages' standalone Nodes are superseded by the entry-Node's Blocks.
  for (const page of pages) {
    await deleteStandalonePageNodeIfPresent(page, entry.name, storage);
  }

  await storage.saveNode(entryNode);

  // Detach-cleanup (mirrors `storage-sync.ts`'s own scan): a page that used
  // to be attached elsewhere as a Block shouldn't stay double-represented
  // now that its content belongs to the entry-Node. Drop any stale Block
  // for one of this entry's pages from every Node except the entry-Node.
  const pageUuids = new Set(pages.map((page) => page.uuid));
  const allNodes = await storage.listNodes();
  for (const node of allNodes) {
    if (node.id === entryNode.id) {
      continue;
    }
    if (!node.blocks.some((block) => pageUuids.has(block.uuid))) {
      continue;
    }
    let updated = node;
    for (const uuid of pageUuids) {
      updated = removeBlockByUuid(updated, uuid);
    }
    await storage.saveNode(updated);
  }
}

/** On `deleteJournalEntry`: remove the entry-Node if one exists. */
export async function deleteJournalEntryNode(
  entryUuid: string,
  storage: StorageProvider,
): Promise<void> {
  const existing = await storage.getNode(entryUuid);
  if (existing) {
    await storage.deleteNode(entryUuid);
  }
}

/**
 * Routes a JournalEntryPage change to the right sync: if the page's parent
 * entry is tagged, the whole entry re-syncs (the page is one of its
 * Blocks); otherwise the page syncs on its own. Used by `module-entry.ts`'s
 * `create`/`update` page Hooks — a page added to, removed from, or renamed
 * inside a tagged entry must refresh the entry-Node's Block array, which
 * the page-only sync path can't do.
 *
 * Returns `true` iff it took the whole-entry path — the caller fires
 * `archivexus.relationshipsChanged` only then (the standalone-page path
 * changes no Node set, and journal prose edits fire this Hook often).
 */
export async function syncJournalEntryPageOrParent(
  page: FoundryJournalEntryPageLike,
  storage: StorageProvider,
): Promise<boolean> {
  const parent = page.parent as unknown as FoundryJournalEntryLike | undefined;
  if (parent && isTaggedJournalEntry(parent)) {
    await syncJournalEntry(parent, storage);
    return true;
  }
  await syncJournalEntryPage(page, storage);
  return false;
}

/**
 * Bulk backfill for JournalEntries already tagged in a live world before
 * this ticket's Hooks existed. Only tagged entries need a pass — an
 * untagged entry's pages are already covered by `syncAllActorsAndPages`.
 * `entries` is a plain array flattened from `game.journal` by
 * `module-entry.ts`, so this stays fixture-testable.
 */
export async function syncAllJournalEntries(
  entries: readonly FoundryJournalEntryLike[],
  storage: StorageProvider,
): Promise<void> {
  for (const entry of entries) {
    if (isTaggedJournalEntry(entry)) {
      await syncJournalEntry(entry, storage);
    }
  }
}
