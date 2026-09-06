import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { mapActorToNode, type FoundryActorLike } from './actor-to-node.js';
import {
  mapJournalEntryPageToNode,
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
 * the corresponding Node until that policy is actually decided.
 */

export async function syncActor(actor: FoundryActorLike, storage: StorageProvider): Promise<void> {
  await storage.saveNode(mapActorToNode(actor));
}

export async function syncJournalEntryPage(
  page: FoundryJournalEntryPageLike,
  storage: StorageProvider,
): Promise<void> {
  await storage.saveNode(mapJournalEntryPageToNode(page));
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
