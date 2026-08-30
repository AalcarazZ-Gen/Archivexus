import { createNode, type CreateNodeInput, type Node } from '../../core/domain/node.js';
import type { Visibility } from '../../core/domain/visibility.js';

/**
 * Foundry's own per-document ownership levels (CONST.DOCUMENT_OWNERSHIP_LEVELS
 * in the Foundry VTT API). Duplicated here as plain numbers rather than
 * importing Foundry's own types/constants: this package has no dependency on
 * Foundry (01_ARCHITECTURE.md's Platform Independent principle — even the
 * Adapter layer shouldn't need a real Foundry install just to unit-test a
 * pure mapping function), and the Foundry Adapter as a whole isn't scaffolded
 * yet. A later ADAPT task that actually talks to a live Foundry instance can
 * depend on Foundry's types directly; this function only needs the four
 * numbers themselves, which are stable, documented Foundry API constants.
 */
const FOUNDRY_OWNERSHIP_NONE = 0;
const FOUNDRY_OWNERSHIP_LIMITED = 1;
const FOUNDRY_OWNERSHIP_OBSERVER = 2;
const FOUNDRY_OWNERSHIP_OWNER = 3;

/**
 * The minimal shape this mapping needs from a Foundry `JournalEntryPage`
 * document — a structural subset, not the real Foundry type (see the note
 * above). Only what 03_DOMAIN_MODEL.md's Node Decisions and 02_LANGUAGE.md's
 * Visibility mapping actually require:
 *
 * - `uuid`: Foundry's own stable document identifier, used directly as the
 *   Node's id (ADR-0001 — Foundry UUIDs are the primary identifier for
 *   Foundry-originated elements; the Core treats `id` as opaque).
 * - `name`: the page's title, used directly as the Node's title.
 * - `ownership.default`: the page's default per-user ownership level, mapped
 *   to Visibility per 02_LANGUAGE.md / ADR-0003. This is deliberately the
 *   *document's* default level, not a specific user's resolved level —
 *   Visibility is a single value per Knowledge Element (see
 *   03_DOMAIN_MODEL.md), not a per-user map, so the default level is the
 *   only one of Foundry's per-user levels that corresponds 1:1 to it.
 *   Foundry also lets a page's ownership be `-1` ("inherit from the parent
 *   JournalEntry"); resolving that inheritance requires reading the parent
 *   document, which needs a live Foundry instance and is out of scope for
 *   this pure mapping function — callers should resolve inheritance before
 *   calling this (or omit `ownership` entirely) and let it fall through to
 *   Node's own default (`hidden`, fail-closed, same as Knowledge Element's).
 * - `flags.archivexus.nodeType`: an explicit, GM-set flag naming which Node
 *   type (Character, Kingdom, ...) this page represents. This adapter does
 *   *not* try to infer a type from the page's title or content — guessing a
 *   semantic type from free text is business logic, and Adapters must
 *   contain none (01_ARCHITECTURE.md's Adapters section: "Adapters should
 *   contain no business logic."). Without this flag, the page becomes a generic `Lore`
 *   Node — exactly the fallback 03_DOMAIN_MODEL.md's Node Decisions call for
 *   ("pages that don't fit an existing type become a generic Lore Node").
 *
 * Deliberately not mapped yet: the page's own content/text. `Block`
 * (src/core/domain/block.ts) is still an explicitly provisional placeholder
 * with no settled shape, so turning page content into Blocks belongs to
 * whatever task actually designs the Block system, not this one.
 */
export interface FoundryJournalEntryPageLike {
  readonly uuid: string;
  readonly name: string;
  readonly ownership?: {
    readonly default?: number;
  };
  readonly flags?: {
    readonly archivexus?: {
      readonly nodeType?: string;
    };
  };
}

/** The Node type a page becomes when no explicit type is assigned. */
export const FALLBACK_NODE_TYPE = 'Lore';

function mapOwnershipToVisibility(defaultOwnership: number | undefined): Visibility | undefined {
  switch (defaultOwnership) {
    case FOUNDRY_OWNERSHIP_NONE:
    case FOUNDRY_OWNERSHIP_LIMITED:
      return 'hidden';
    case FOUNDRY_OWNERSHIP_OBSERVER:
      return 'visible';
    case FOUNDRY_OWNERSHIP_OWNER:
      return 'owned';
    default:
      // Unset, or a value this mapping doesn't recognize (e.g. Foundry's -1
      // "inherit from parent" sentinel) — let Node fall through to its own
      // default rather than guessing. See the ownership.default doc above.
      return undefined;
  }
}

/**
 * Maps a Foundry `JournalEntryPage` to a Node — the vertical slice
 * 03_DOMAIN_MODEL.md's Node Decisions describe ("Is a Foundry Journal a
 * Node? No — not as a single unit... The Foundry Adapter maps each page with
 * distinct semantic content to its own Node"). Pure and synchronous: no
 * Foundry API calls, so it's unit-testable with plain objects.
 */
export function mapJournalEntryPageToNode(page: FoundryJournalEntryPageLike): Node {
  const type = page.flags?.archivexus?.nodeType ?? FALLBACK_NODE_TYPE;
  const visibility = mapOwnershipToVisibility(page.ownership?.default);

  const input: CreateNodeInput = {
    id: page.uuid,
    type,
    title: page.name,
    ...(visibility !== undefined ? { visibility } : {}),
  };

  return createNode(input);
}
