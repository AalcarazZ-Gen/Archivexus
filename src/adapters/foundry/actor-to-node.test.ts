import { describe, expect, it } from 'vitest';
import {
  ACTOR_FALLBACK_NODE_TYPE,
  mapActorToNode,
  type FoundryActorLike,
} from './actor-to-node.js';
import { InvalidKnowledgeElementError } from '../../core/domain/knowledge-element.js';

const baseActor: FoundryActorLike = {
  uuid: 'Actor.abc123',
  name: 'Kael Verik',
};

describe('mapActorToNode', () => {
  it('uses the actor uuid as the Node id, unchanged (ADR-0001)', () => {
    const node = mapActorToNode(baseActor);
    expect(node.id).toBe('Actor.abc123');
  });

  it('uses the actor name as the Node title', () => {
    const node = mapActorToNode(baseActor);
    expect(node.title).toBe('Kael Verik');
  });

  it('falls back to the Character type when no archivexus.nodeType flag is set', () => {
    const node = mapActorToNode(baseActor);
    expect(node.type).toBe('Character');
    expect(node.type).toBe(ACTOR_FALLBACK_NODE_TYPE);
  });

  it('uses the explicit archivexus.nodeType flag when present, without validating it against KNOWN_NODE_TYPES', () => {
    const node = mapActorToNode({
      ...baseActor,
      flags: { archivexus: { nodeType: 'Organization' } },
    });
    expect(node.type).toBe('Organization');
  });

  it('does not infer a type from the actor name - an unflagged actor still becomes the fallback', () => {
    const node = mapActorToNode({ ...baseActor, name: 'Bandits - Easy' });
    expect(node.type).toBe(ACTOR_FALLBACK_NODE_TYPE);
  });

  // 02_LANGUAGE.md / ADR-0003's Foundry ownership -> Visibility mapping,
  // identical to ADAPT-001's (same Foundry ownership vocabulary).
  it.each([
    [0, 'hidden'], // NONE
    [1, 'hidden'], // LIMITED
    [2, 'visible'], // OBSERVER
    [3, 'owned'], // OWNER
  ] as const)('maps Foundry ownership.default %i to Visibility %s', (ownership: number, visibility: string) => {
    const node = mapActorToNode({ ...baseActor, ownership: { default: ownership } });
    expect(node.visibility).toBe(visibility);
  });

  it('defaults to hidden when ownership is absent, matching KnowledgeElement\'s own default', () => {
    const node = mapActorToNode(baseActor);
    expect(node.visibility).toBe('hidden');
  });

  it('defaults to hidden for an unrecognized ownership.default (an Actor has no inheritance sentinel, but stay defensive)', () => {
    const node = mapActorToNode({ ...baseActor, ownership: { default: -1 } });
    expect(node.visibility).toBe('hidden');
  });

  it('produces a Node that is otherwise a normal, valid Node (frozen, correct kind)', () => {
    const node = mapActorToNode(baseActor);
    expect(node.kind).toBe('node');
    expect(Object.isFrozen(node)).toBe(true);
  });

  it('bubbles InvalidKnowledgeElementError for an actor with an empty name (empty Node title)', () => {
    expect(() => mapActorToNode({ ...baseActor, name: '' })).toThrow(InvalidKnowledgeElementError);
  });

  it('bubbles InvalidKnowledgeElementError for an actor with an empty uuid (empty Node id)', () => {
    expect(() => mapActorToNode({ ...baseActor, uuid: '' })).toThrow(InvalidKnowledgeElementError);
  });
});
