import { createBlock, type Block } from '../../core/domain/block.js';
import { createNode, type CreateNodeInput, type Node } from '../../core/domain/node.js';
import { isVisibility } from '../../core/domain/visibility.js';
import { mapFoundryOwnershipToVisibility } from './foundry-ownership.js';
import {
  resolveJournalEntryPageTitle,
  type FoundryJournalEntryPageLike,
} from './journal-entry-page-to-node.js';

/**
 * ADAPT-021 / ADR-0011 Amendment 2: a whole Foundry `JournalEntry` the GM
 * has tagged (`flags.archivexus.nodeType` **on the entry**) becomes a
 * single Node, `id = entry.uuid` (`JournalEntry.<id>`). Pure and
 * synchronous, a sibling of `mapActorToNode` / `mapFolderToNode` — no
 * Foundry API calls.
 *
 * The parallel with `mapFolderToNode` is deliberate: both are Foundry
 * containers a GM organises their world around, made into a Node on an
 * explicit opt-in tag. The difference:
 * - A `JournalEntry` **has real `ownership`** (unlike a `Folder`), so
 *   ADR-0003's mapping applies directly (`entry.ownership.default` →
 *   Visibility), with `flags.archivexus.visibility` still available as an
 *   override. There's no fail-closed `hidden` default here.
 * - The entry's pages become engine-owned `{ type: 'JournalEntryPage',
 *   uuid, title }` Blocks on the entry-Node (Amendment 2 point A3), the
 *   same wholesale-reconcile ownership model ADR-0015 point 13 uses for a
 *   location folder-Node's `scene` Blocks. While an entry is tagged, its
 *   pages do **not** become standalone Nodes and their own
 *   `attachedToNodeId` / `nodeType` flags are not read.
 *
 * The containment edges the entry-Node participates in (Amendment 2 point
 * A4 — `member-of` its containing folder-Node, etc.) are derived and
 * reconciled by the ADAPT-017 engine, not here.
 */

export interface FoundryJournalEntryLike {
  readonly uuid: string;
  readonly name: string;
  readonly ownership?: {
    readonly default?: number;
  };
  /**
   * The entry's pages, as Foundry exposes them (`entry.pages.contents`).
   * Structural so tests can pass a plain array-backed object; each page is
   * the same `FoundryJournalEntryPageLike` shape `mapJournalEntryPageToNode`
   * consumes, so page-title qualification (#25) stays consistent.
   */
  readonly pages?: {
    readonly contents: readonly FoundryJournalEntryPageLike[];
  };
  readonly flags?: {
    readonly archivexus?: {
      readonly nodeType?: string;
      /** `hidden` | `visible` | `owned` — overrides the ownership-derived visibility. */
      readonly visibility?: string;
    };
  };
}

export const JOURNAL_ENTRY_NODE_TYPE_FLAG_KEY = 'nodeType';

/** `true` iff this JournalEntry has been tagged with an Archivexus Node type (and so is a Node). */
export function isTaggedJournalEntry(entry: FoundryJournalEntryLike): boolean {
  const type = entry.flags?.archivexus?.nodeType;
  return typeof type === 'string' && type.trim().length > 0;
}

/**
 * The `JournalEntryPage` Blocks a tagged entry-Node carries, one per
 * current page, in page order. Titles are qualified `"{entry} — {page}"`
 * (via `resolveJournalEntryPageTitle`, #25) using the entry's own name as
 * the parent context, so the result is the same whether or not the caller
 * wired each page's `.parent` back-reference.
 */
export function journalEntryPageBlocks(entry: FoundryJournalEntryLike): Block[] {
  return (entry.pages?.contents ?? []).map((page) =>
    createBlock({
      type: 'JournalEntryPage',
      uuid: page.uuid,
      title: resolveJournalEntryPageTitle({
        ...page,
        parent: { ...page.parent, name: entry.name },
      }),
    }),
  );
}

/** Maps a **tagged** Foundry `JournalEntry` to a Node. Callers must check `isTaggedJournalEntry` first. */
export function mapJournalEntryToNode(entry: FoundryJournalEntryLike): Node {
  const type = (entry.flags?.archivexus?.nodeType ?? '').trim();
  const overrideVisibility = entry.flags?.archivexus?.visibility;
  const visibility = isVisibility(overrideVisibility)
    ? overrideVisibility
    : mapFoundryOwnershipToVisibility(entry.ownership?.default);

  const input: CreateNodeInput = {
    id: entry.uuid,
    type,
    title: entry.name,
    blocks: journalEntryPageBlocks(entry),
    ...(visibility !== undefined ? { visibility } : {}),
  };

  return createNode(input);
}
