import { upsertBlockByUuid, removeBlockByUuid } from '../../core/domain/node.js';
import type { Block } from '../../core/domain/block.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { mapActorToNode, type FoundryActorLike } from './actor-to-node.js';
import {
  isInsideTaggedJournalEntry,
  mapJournalEntryPageToNode,
  resolvePageAttachment,
  type FoundryJournalEntryPageLike,
} from './journal-entry-page-to-node.js';

/**
 * Wires the existing, pure Foundry-to-Node mappings (`mapActorToNode`,
 * `mapJournalEntryPageToNode`) into real persistence (STORE-003) — before
 * this, both mappings only ever produced in-memory `Node` objects nobody
 * saved anywhere. Deliberately thin: each function does exactly "map, then
 * `storage.saveNode`" — no batching/business logic of its own, so
 * `module-entry.ts` can wire it directly to Foundry's own document Hooks
 * without this file needing to know about Hooks at all.
 *
 * `saveNode` is an upsert (`SqliteStorageProvider`), so calling this again
 * for an Actor/Page that's already stored (e.g. on `updateActor`) simply
 * overwrites the mapped fields — consistent with there being no Node-level
 * change history populated from Foundry edits yet (out of scope; `history`
 * stays empty unless something else populates it).
 *
 * Deliberately does **not** wire any delete path: `03_DOMAIN_MODEL.md`
 * explicitly leaves Node deletion policy (hard delete vs. archival) open
 * ("this doesn't resolve the broader question of Node deletion policy...
 * left open for whoever designs delete workflows" — ADR-0007 point 8). A
 * GM deleting a Foundry Actor/Page doesn't get auto-mirrored into deleting
 * the corresponding Node until that policy is actually decided. (The one
 * exception, below, is `syncJournalEntryPage`'s own `deleteNode` call when a
 * page is newly attached — that's ADR-0011's explicit state-transition
 * behavior, not a general delete policy.)
 */

export async function syncActor(actor: FoundryActorLike, storage: StorageProvider): Promise<void> {
  await storage.saveNode(mapActorToNode(actor));
}

/**
 * Removes a page's standalone Node if one is stored, warning the GM
 * non-blockingly first (ADR-0011 point 5 / Amendment 2 point A5) when it
 * carried hand-authored Relationships — those survive as dangling
 * references (ADR-0007 point 8), they are not deleted. `containerTitle`
 * names what the page's content now belongs to (the attach target, or the
 * tagged parent entry) for the warning text. Shared by `syncJournalEntryPage`
 * (page moved into a tagged entry) and `journal-entry-sync.ts`'s
 * `syncJournalEntry` (the entry itself just got tagged).
 */
export async function deleteStandalonePageNodeIfPresent(
  page: FoundryJournalEntryPageLike,
  containerTitle: string,
  storage: StorageProvider,
): Promise<void> {
  const standalone = await storage.getNode(page.uuid);
  if (!standalone) {
    return;
  }
  const orphaned = await storage.getRelationshipsForNode(page.uuid);
  if (orphaned.length > 0) {
    ui.notifications.warn(
      `${standalone.title} had ${orphaned.length} Relationship(s); they're preserved but excluded from the graph until re-authored against ${containerTitle} directly.`,
    );
  }
  await storage.deleteNode(page.uuid);
}

/**
 * JournalEntryPage sync, extended by ADR-0011 (+ its DBA Amendment) to
 * resolve `flags.archivexus.attachedToNodeId` instead of always persisting
 * the page as its own standalone Node. `mapJournalEntryPageToNode` itself
 * stays pure and unchanged (ADR-0011 point 3) — all of the orchestration
 * (I/O, precedence, cleanup) lives here, which already does async work.
 *
 * Precedence (ADR-0011 point 3):
 * - `attachedToNodeId` unset → standalone (unchanged from before ADR-0011).
 * - `attachedToNodeId` set and resolves to a real, existing Node → the page
 *   becomes a `{ type: 'JournalEntryPage', uuid, title }` Block on that
 *   Node (idempotent-by-uuid via `upsertBlockByUuid`), and its own
 *   standalone Node (if any, at `page.uuid`) is deleted.
 * - `attachedToNodeId` set but dangling (target doesn't resolve) →
 *   falls back to standalone, never to nothing (ADR-0007 point 8's
 *   dangling-reference philosophy, reused).
 *
 * Unconditional cleanup pass (DBA Amendment, mechanic 2): on every call,
 * regardless of whether attachment changed, scans every stored Node for a
 * stale Block referencing this page's uuid that isn't the current
 * legitimate target, and removes it — a full `listNodes()` scan is
 * deliberately not gated/optimized, per the Amendment's own reasoning
 * (Alberto's real ~102-Node count, and `module-entry.ts`'s Hook wiring
 * already being fire-and-forget).
 *
 * ADR-0011 point 5's non-blocking `ui.notifications.warn`: before deleting
 * a page's own standalone Node in the attach-resolves-to-a-real-target
 * branch, checks `storage.getRelationshipsForNode(page.uuid)` (the same
 * 1-hop primitive ADR-0010's cardinality check already uses) purely to know
 * whether to warn. If any exist, warns the GM by name/count that they're
 * about to become dangling references — preserved, not deleted or
 * corrupted (ADR-0007 point 8), only excluded from traversal until
 * re-authored against the new target. Warn, never block: the delete/attach
 * proceeds regardless of whether any Relationships were found.
 */
export async function syncJournalEntryPage(
  page: FoundryJournalEntryPageLike,
  storage: StorageProvider,
): Promise<void> {
  // ADR-0011 Amendment 2: if the parent JournalEntry is itself tagged, the
  // entry is the Node and this page is one of its engine-owned Blocks
  // (`journal-entry-sync.ts`). Make sure no stale standalone Node for the
  // page lingers, then stop — in particular, skip the Block-cleanup scan
  // below, which would otherwise strip this page's Block off the entry-Node.
  if (isInsideTaggedJournalEntry(page)) {
    await deleteStandalonePageNodeIfPresent(
      page,
      page.parent?.name ?? 'its journal entry',
      storage,
    );
    return;
  }

  const attachment = resolvePageAttachment(page);

  let resolvedTargetId: string | undefined;
  if (attachment.attached) {
    const target = await storage.getNode(attachment.targetNodeId);
    if (target) {
      const title = mapJournalEntryPageToNode(page).title;
      const orphanedRelationships = await storage.getRelationshipsForNode(page.uuid);
      if (orphanedRelationships.length > 0) {
        ui.notifications.warn(
          `${title} had ${orphanedRelationships.length} Relationship(s); they're preserved but excluded from the graph until re-authored against ${target.title} directly.`,
        );
      }

      await storage.deleteNode(page.uuid);
      const block: Block = {
        type: 'JournalEntryPage',
        uuid: page.uuid,
        title,
      };
      await storage.saveNode(upsertBlockByUuid(target, block));
      resolvedTargetId = target.id;
    }
    // else: dangling attach reference - fall through to the standalone path below.
  }

  if (resolvedTargetId === undefined) {
    await storage.saveNode(mapJournalEntryPageToNode(page));
  }

  const allNodes = await storage.listNodes();
  for (const node of allNodes) {
    if (node.id === resolvedTargetId) {
      continue;
    }
    if (node.blocks.some((block) => block.uuid === page.uuid)) {
      await storage.saveNode(removeBlockByUuid(node, page.uuid));
    }
  }
}

/**
 * Bulk backfill for Nodes that already exist in a live Foundry world
 * before this ticket's Hooks existed to catch them going forward (e.g. the
 * real "Academia El Último Norte" campaign's 41 Actors / 61 Pages,
 * per `docs/PROJECT.md`). `actors`/`journalPages` are plain arrays, not a
 * live Foundry `game` reference — `module-entry.ts` is the one place that
 * flattens `game.actors`/`game.journal` into these, so this function stays
 * unit-testable with plain fixtures.
 */
export async function syncAllActorsAndPages(
  source: {
    readonly actors: readonly FoundryActorLike[];
    readonly journalPages: readonly FoundryJournalEntryPageLike[];
  },
  storage: StorageProvider,
): Promise<void> {
  for (const actor of source.actors) {
    await syncActor(actor, storage);
  }
  for (const page of source.journalPages) {
    await syncJournalEntryPage(page, storage);
  }
}
