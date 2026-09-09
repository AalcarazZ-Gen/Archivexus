import { createNode, type CreateNodeInput, type Node } from '../../core/domain/node.js';
import { mapFoundryOwnershipToVisibility } from './foundry-ownership.js';

/**
 * Minimal structural subset of Foundry's `JournalEntryPage` this mapping
 * needs (docs/03_DOMAIN_MODEL.md's Node Decisions, 02_LANGUAGE.md's
 * Visibility mapping, ADR-0001):
 * - `uuid` → Node id.
 * - `name` + `parent.name` → title, qualified as "{parent} — {name}" when
 *   they differ, to avoid collisions between same-named pages across
 *   different journals (#25).
 * - `ownership.default` → Visibility (ADR-0003) — the document's default
 *   level only; per-user levels and Foundry's `-1` "inherit" sentinel are
 *   a caller/live-instance concern, out of scope for this pure function.
 * - `flags.archivexus.nodeType` → explicit, GM-set Node type. No inference
 *   from title/content — Adapters carry no business logic
 *   (01_ARCHITECTURE.md). Missing flag → generic `Lore` fallback.
 * - `flags.archivexus.attachedToNodeId` → ADR-0011's attachment flag,
 *   read (not resolved) by `resolvePageAttachment` below. Does not affect
 *   this function — `mapJournalEntryPageToNode` always computes what the
 *   page's *own* standalone Node would look like; deciding whether that's
 *   actually what gets persisted is `storage-sync.ts`'s orchestration job
 *   (ADR-0011 point 3).
 *
 * Page content/text isn't mapped yet — Block's shape is still undesigned.
 */
export interface FoundryJournalEntryPageLike {
  readonly uuid: string;
  readonly name: string;
  readonly parent?: {
    readonly name?: string;
    /**
     * The parent `JournalEntry`'s containing Folder (ADAPT-017 reads this
     * to place a standalone page-Node in the folder tree — a page has no
     * folder of its own, its entry does). `null` when the entry is at the
     * directory root.
     */
    readonly folder?: { readonly uuid?: string } | null;
    /**
     * The parent `JournalEntry`'s own flags. When the entry itself is
     * tagged (`flags.archivexus.nodeType`), ADR-0011 Amendment 2 says the
     * entry is the Node and this page is one of its Blocks, not a Node of
     * its own — `isInsideTaggedJournalEntry` reads this.
     */
    readonly flags?: {
      readonly archivexus?: {
        readonly nodeType?: string;
      };
    };
  };
  readonly ownership?: {
    readonly default?: number;
  };
  readonly flags?: {
    readonly archivexus?: {
      readonly nodeType?: string;
      readonly attachedToNodeId?: string;
    };
  };
}

/** The Node type a page becomes when no explicit type is assigned. */
export const FALLBACK_NODE_TYPE = 'Lore';

/** Qualifies the title with the parent journal's name only when it disambiguates anything (#25). */
export function resolveJournalEntryPageTitle(page: FoundryJournalEntryPageLike): string {
  const parentName = page.parent?.name;
  if (parentName && parentName !== page.name) {
    return `${parentName} — ${page.name}`;
  }
  return page.name;
}

/** Maps a Foundry `JournalEntryPage` to a Node. Pure and synchronous — no Foundry API calls. */
export function mapJournalEntryPageToNode(page: FoundryJournalEntryPageLike): Node {
  const type = page.flags?.archivexus?.nodeType ?? FALLBACK_NODE_TYPE;
  const visibility = mapFoundryOwnershipToVisibility(page.ownership?.default);

  const input: CreateNodeInput = {
    id: page.uuid,
    type,
    title: resolveJournalEntryPageTitle(page),
    ...(visibility !== undefined ? { visibility } : {}),
  };

  return createNode(input);
}

/**
 * `true` iff this page's parent `JournalEntry` is itself tagged as a Node
 * (ADR-0011 Amendment 2). When so, the page is one of the entry-Node's
 * engine-owned Blocks — `journal-entry-sync.ts` maintains it — and must not
 * also become a standalone Node. Pure, synchronous, no Foundry API calls.
 */
export function isInsideTaggedJournalEntry(page: FoundryJournalEntryPageLike): boolean {
  const type = page.parent?.flags?.archivexus?.nodeType;
  return typeof type === 'string' && type.trim().length > 0;
}

/** What `resolvePageAttachment` reports — see its own doc comment. */
export type PageAttachmentResolution =
  { readonly attached: true; readonly targetNodeId: string } | { readonly attached: false };

/**
 * Reads only `flags.archivexus.attachedToNodeId` (ADR-0011 point 3) — pure
 * and synchronous, no Foundry API calls, same purity contract as
 * `mapJournalEntryPageToNode`. Whether the referenced Node actually exists
 * is a storage-layer concern this function has no way to answer (it only
 * has the page in hand, not a `StorageProvider`) — `storage-sync.ts`'s
 * orchestration resolves that and decides what to persist.
 */
export function resolvePageAttachment(page: FoundryJournalEntryPageLike): PageAttachmentResolution {
  const targetNodeId = page.flags?.archivexus?.attachedToNodeId?.trim();
  if (targetNodeId === undefined || targetNodeId.length === 0) {
    return { attached: false };
  }
  // ADR-0015: a Folder-Node's `blocks` array is engine-owned (the ADAPT-018
  // Scene→Block derivation reconciles it wholesale), so a page can't attach
  // to one — treat a `Folder.` target as no attachment (standalone).
  if (targetNodeId.startsWith('Folder.')) {
    return { attached: false };
  }
  return { attached: true, targetNodeId };
}
