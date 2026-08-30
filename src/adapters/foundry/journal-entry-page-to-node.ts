import { createNode, type CreateNodeInput, type Node } from '../../core/domain/node.js';
import type { Visibility } from '../../core/domain/visibility.js';

/**
 * Foundry's CONST.DOCUMENT_OWNERSHIP_LEVELS, duplicated as plain numbers
 * rather than importing Foundry's own types — this package has no
 * dependency on Foundry (01_ARCHITECTURE.md's Platform Independent principle).
 */
const FOUNDRY_OWNERSHIP_NONE = 0;
const FOUNDRY_OWNERSHIP_LIMITED = 1;
const FOUNDRY_OWNERSHIP_OBSERVER = 2;
const FOUNDRY_OWNERSHIP_OWNER = 3;

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
 *
 * Page content/text isn't mapped yet — Block's shape is still undesigned.
 */
export interface FoundryJournalEntryPageLike {
  readonly uuid: string;
  readonly name: string;
  readonly parent?: {
    readonly name?: string;
  };
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
      // Unset or unrecognized (e.g. Foundry's -1 "inherit") — fall through
      // to Node's own default rather than guessing.
      return undefined;
  }
}

/** Qualifies the title with the parent journal's name only when it disambiguates anything (#25). */
function resolveTitle(page: FoundryJournalEntryPageLike): string {
  const parentName = page.parent?.name;
  if (parentName && parentName !== page.name) {
    return `${parentName} — ${page.name}`;
  }
  return page.name;
}

/** Maps a Foundry `JournalEntryPage` to a Node. Pure and synchronous — no Foundry API calls. */
export function mapJournalEntryPageToNode(page: FoundryJournalEntryPageLike): Node {
  const type = page.flags?.archivexus?.nodeType ?? FALLBACK_NODE_TYPE;
  const visibility = mapOwnershipToVisibility(page.ownership?.default);

  const input: CreateNodeInput = {
    id: page.uuid,
    type,
    title: resolveTitle(page),
    ...(visibility !== undefined ? { visibility } : {}),
  };

  return createNode(input);
}
