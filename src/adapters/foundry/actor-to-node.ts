import { createNode, type CreateNodeInput, type Node } from '../../core/domain/node.js';
import { mapFoundryOwnershipToVisibility } from './foundry-ownership.js';

/**
 * Minimal structural subset of Foundry's `Actor` this mapping needs (same
 * no-Foundry-dependency tradeoff as `FoundryJournalEntryPageLike`):
 * - `uuid` → Node id; `name` → title directly (unlike pages, Actor names
 *   don't repeat under a shared parent, so no qualification is needed).
 * - `ownership.default` → Visibility, same mapping as ADAPT-001; Actors
 *   have no parent document, so no `-1` "inherit" sentinel to worry about.
 * - `flags.archivexus.nodeType` → explicit Node type; no inference from
 *   Foundry's own `actor.type` (character/npc/encounter/group) — still
 *   content-based guessing the Adapter must avoid (#22). Missing flag →
 *   generic `Character` fallback.
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

/** Maps a Foundry `Actor` to a Node (ADAPT-004). Pure and synchronous — no Foundry API calls. */
export function mapActorToNode(actor: FoundryActorLike): Node {
  const type = actor.flags?.archivexus?.nodeType ?? ACTOR_FALLBACK_NODE_TYPE;
  const visibility = mapFoundryOwnershipToVisibility(actor.ownership?.default);

  const input: CreateNodeInput = {
    id: actor.uuid,
    type,
    title: actor.name,
    ...(visibility !== undefined ? { visibility } : {}),
  };

  return createNode(input);
}
