import { createNode, type CreateNodeInput, type Node } from '../../core/domain/node.js';
import type { Visibility } from '../../core/domain/visibility.js';

/**
 * Foundry's own per-document ownership levels (CONST.DOCUMENT_OWNERSHIP_LEVELS
 * in the Foundry VTT API). Duplicated here rather than shared with
 * journal-entry-page-to-node.ts's identical constants/mapping — a deliberate
 * choice, not an oversight: this project is a personal/fun project
 * (docs/PROJECT.md's Type) that explicitly favors speed and simplicity over
 * process, ADAPT-001 already established the self-contained-per-mapping
 * pattern, and this is only the second instance of the duplication. Worth
 * extracting into a shared helper once a third Foundry document mapping
 * (e.g. ADAPT-005's Scene, if it needs the same ownership mapping) makes it
 * a real "rule of three," not before.
 */
const FOUNDRY_OWNERSHIP_NONE = 0;
const FOUNDRY_OWNERSHIP_LIMITED = 1;
const FOUNDRY_OWNERSHIP_OBSERVER = 2;
const FOUNDRY_OWNERSHIP_OWNER = 3;

/**
 * The minimal shape this mapping needs from a Foundry `Actor` document — a
 * structural subset, not the real Foundry type (same tradeoff as
 * `FoundryJournalEntryPageLike`: no `@league-of-foundry-developers/foundry-vtt-types`
 * dependency, per 01_ARCHITECTURE.md's Platform Independent principle).
 *
 * - `uuid`: Foundry's own stable document identifier, used directly as the
 *   Node's id (ADR-0001).
 * - `name`: the Actor's name, used directly as the Node's title. Unlike
 *   `JournalEntryPage` (see #25), an Actor's `name` isn't a page name nested
 *   under a parent container that could repeat it across many Actors —
 *   confirmed against the real "Academia El Último Norte" campaign, all 41
 *   real Actor names are distinct — so no title-qualification is needed
 *   here the way it is for pages.
 * - `ownership.default`: the Actor's default per-user ownership level,
 *   mapped to Visibility per 02_LANGUAGE.md/ADR-0003 — identical mapping to
 *   ADAPT-001's. Unlike `JournalEntryPage`, an Actor's ownership isn't
 *   nested under a parent document, so there's no `-1` "inherit from
 *   parent" sentinel to worry about here.
 * - `flags.archivexus.nodeType`: an explicit, GM-set flag naming which Node
 *   type this Actor represents — same no-content-inference rule as
 *   ADAPT-001 (01_ARCHITECTURE.md's Adapters section: "Adapters should
 *   contain no business logic"). Without this flag, the Actor becomes a
 *   generic `Character` Node (`ACTOR_FALLBACK_NODE_TYPE`) regardless of
 *   Foundry's own `actor.type` (character/npc/encounter/group in the dnd5e
 *   system that produced the real campaign data this was validated
 *   against) — a deliberate product-owner call (see issue #22's comments):
 *   branching on Foundry's own type field would be exactly the kind of
 *   inference the Adapter is supposed to stay out of, even though the
 *   signal comes from a structured field rather than free text. `npc`
 *   actors in the real data mix named individual NPCs with generic monster
 *   stat blocks — Foundry's own type can't disambiguate that either.
 *   `Organization` is already in `KNOWN_NODE_TYPES` (node.ts) for the GM to
 *   apply to `group`-type Actors once tagged.
 */
export interface FoundryActorLike {
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

/** The Node type an Actor becomes when no explicit type is assigned. */
export const ACTOR_FALLBACK_NODE_TYPE = 'Character';

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
      // Unset, or a value this mapping doesn't recognize — let Node fall
      // through to its own default rather than guessing.
      return undefined;
  }
}

/**
 * Maps a Foundry `Actor` to a Node — ADAPT-004, the second Foundry document
 * type extending ADAPT-001's already-proven pattern. Pure and synchronous:
 * no Foundry API calls, so it's unit-testable with plain objects.
 */
export function mapActorToNode(actor: FoundryActorLike): Node {
  const type = actor.flags?.archivexus?.nodeType ?? ACTOR_FALLBACK_NODE_TYPE;
  const visibility = mapOwnershipToVisibility(actor.ownership?.default);

  const input: CreateNodeInput = {
    id: actor.uuid,
    type,
    title: actor.name,
    ...(visibility !== undefined ? { visibility } : {}),
  };

  return createNode(input);
}
