import { describe, expect, it } from 'vitest';
import { ACTOR_FALLBACK_NODE_TYPE, mapActorToNode } from './actor-to-node.js';

/**
 * Regression fixtures pulled live from the restored real campaign,
 * "Academia El Último Norte" (dnd5e, Foundry v14.367) — via `game.actors`
 * through Claude in Chrome's access to the user's live GM session,
 * 2026-08-30 — same QA methodology as ADAPT-001's live-fixtures test.
 *
 * One real Actor per Foundry `actor.type` the real world actually contains
 * (character/npc/encounter/group — see issue #22's comment thread): none
 * carry an `archivexus` flag yet, so all four currently land on
 * `ACTOR_FALLBACK_NODE_TYPE` regardless of their very different in-fiction
 * shape (a player character, a named NPC, a prebuilt combat encounter, a
 * narrative faction) — confirming product-owner's #22 decision to keep the
 * fallback flat rather than branch on Foundry's own type field.
 */
describe('mapActorToNode — live Foundry v14 fixtures (QA/ADAPT-004)', () => {
  it('maps a real player-character Actor (Foundry type "character")', () => {
    const node = mapActorToNode({ uuid: 'Actor.Ph85QZWfYn0VmqR7', name: 'Kael Verik', ownership: { default: 0 } });
    expect(node.id).toBe('Actor.Ph85QZWfYn0VmqR7');
    expect(node.title).toBe('Kael Verik');
    expect(node.type).toBe(ACTOR_FALLBACK_NODE_TYPE);
    expect(node.visibility).toBe('hidden');
  });

  it('maps a real named-NPC Actor (Foundry type "npc")', () => {
    const node = mapActorToNode({ uuid: 'Actor.0zK6CxUgcTT7BQnx', name: 'Cassandra Vell', ownership: { default: 0 } });
    expect(node.title).toBe('Cassandra Vell');
    expect(node.type).toBe(ACTOR_FALLBACK_NODE_TYPE);
  });

  it('maps a real prebuilt-encounter Actor (Foundry type "encounter") to the same fallback, unflagged', () => {
    // Not really a single in-world entity (a combat-prep bundle), but the
    // adapter doesn't branch on actor.type - see actor-to-node.ts's doc
    // comment and #22's product-owner decision. The GM retags this away
    // from Character if/when they want it in the graph at all.
    const node = mapActorToNode({ uuid: 'Actor.YitSTpIPECZRFCJG', name: 'Bandits - Easy', ownership: { default: 0 } });
    expect(node.title).toBe('Bandits - Easy');
    expect(node.type).toBe(ACTOR_FALLBACK_NODE_TYPE);
  });

  it('maps a real narrative-faction Actor (Foundry type "group") - GM should retag as Organization', () => {
    const node = mapActorToNode({ uuid: 'Actor.MHVx7Z2YxLMbhl5t', name: 'Los 5 Jinetes', ownership: { default: 0 } });
    expect(node.title).toBe('Los 5 Jinetes');
    expect(node.type).toBe(ACTOR_FALLBACK_NODE_TYPE); // KNOWN_NODE_TYPES has 'Organization' for once tagged
  });
});
