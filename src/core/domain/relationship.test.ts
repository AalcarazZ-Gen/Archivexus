import { describe, expect, it } from 'vitest';
import { InvalidKnowledgeElementError } from './knowledge-element.js';
import { createRelationship, InvalidRelationshipError, isRelationship } from './relationship.js';

const baseInput = {
  id: 'rel-1',
  origin: 'node-waterdeep',
  target: 'node-guard',
  definitionId: 'def-located-in',
  title: 'The Guard is located in Waterdeep',
};

describe('createRelationship', () => {
  it('creates a valid Relationship with the given id, origin, target, definitionId and title', () => {
    const relationship = createRelationship(baseInput);
    expect(relationship.id).toBe('rel-1');
    expect(relationship.kind).toBe('relationship');
    expect(relationship.origin).toBe('node-waterdeep');
    expect(relationship.target).toBe('node-guard');
    expect(relationship.definitionId).toBe('def-located-in');
    expect(relationship.title).toBe('The Guard is located in Waterdeep');
  });

  it('composes every Common Characteristic from KnowledgeElement (visibility default, empty collections)', () => {
    const relationship = createRelationship(baseInput);
    expect(relationship.visibility).toBe('hidden');
    expect(relationship.metadata).toEqual({});
    expect(relationship.history).toEqual([]);
    expect(relationship.blocks).toEqual([]);
    expect(relationship.tags).toEqual([]);
    expect(relationship.references).toEqual([]);
  });

  it('rejects an empty origin', () => {
    expect(() => createRelationship({ ...baseInput, origin: '' })).toThrow(
      InvalidRelationshipError,
    );
    expect(() => createRelationship({ ...baseInput, origin: '   ' })).toThrow(
      InvalidRelationshipError,
    );
  });

  it('rejects an empty target', () => {
    expect(() => createRelationship({ ...baseInput, target: '' })).toThrow(
      InvalidRelationshipError,
    );
    expect(() => createRelationship({ ...baseInput, target: '   ' })).toThrow(
      InvalidRelationshipError,
    );
  });

  it('rejects an empty definitionId', () => {
    expect(() => createRelationship({ ...baseInput, definitionId: '' })).toThrow(
      InvalidRelationshipError,
    );
    expect(() => createRelationship({ ...baseInput, definitionId: '   ' })).toThrow(
      InvalidRelationshipError,
    );
  });

  // Domain Invariants: "Every Relationship has exactly one origin Node" /
  // "...exactly one target Node" / "...exactly one Relationship Definition" -
  // there is exactly one field for each, and CreateRelationshipInput's shape
  // doesn't allow supplying more than one of any.
  it('has exactly one origin, target and definitionId field, plus KnowledgeElement fields', () => {
    const relationship = createRelationship(baseInput);
    expect(Object.keys(relationship).sort()).toEqual(
      [
        'blocks',
        'definitionId',
        'history',
        'id',
        'kind',
        'metadata',
        'origin',
        'references',
        'tags',
        'target',
        'title',
        'visibility',
      ].sort(),
    );
  });

  // Domain Invariant: "Every Relationship is directional." - direction is
  // expressed by origin -> target ordering, not a separate field; swapping
  // them produces a different, distinct Relationship.
  it('treats origin and target as ordered/directional, not a separate direction field', () => {
    const forward = createRelationship(baseInput);
    const reversed = createRelationship({
      ...baseInput,
      origin: baseInput.target,
      target: baseInput.origin,
    });
    expect('direction' in forward).toBe(false);
    expect(forward.origin).toBe(reversed.target);
    expect(forward.target).toBe(reversed.origin);
  });

  // Domain Invariant: "A Relationship cannot exist without both Nodes." -
  // covered by the empty-origin/empty-target rejection tests above; this
  // test confirms the happy path needs both present together.
  it('requires both origin and target to be present to construct at all', () => {
    expect(() => createRelationship(baseInput)).not.toThrow();
  });

  it('freezes the returned Relationship so its endpoints cannot be reassigned', () => {
    const relationship = createRelationship(baseInput);
    expect(Object.isFrozen(relationship)).toBe(true);
    expect(() => {
      // @ts-expect-error origin is readonly and the object is frozen
      relationship.origin = 'node-somewhere-else';
    }).toThrow(TypeError);
    expect(relationship.origin).toBe('node-waterdeep');
  });

  it('bubbles KnowledgeElement Domain Invariant errors (empty id/title) unchanged', () => {
    expect(() => createRelationship({ ...baseInput, id: '' })).toThrow(
      InvalidKnowledgeElementError,
    );
    expect(() => createRelationship({ ...baseInput, title: '' })).toThrow(
      InvalidKnowledgeElementError,
    );
  });
});

describe('isRelationship', () => {
  it('returns true for a value produced by createRelationship', () => {
    expect(isRelationship(createRelationship(baseInput))).toBe(true);
  });

  it('returns false for a bare KnowledgeElement-shaped value without origin/target/definitionId, and for non-Relationships', () => {
    expect(isRelationship(null)).toBe(false);
    expect(isRelationship({ id: 'x', kind: 'relationship' })).toBe(false);
    expect(isRelationship({ ...createRelationship(baseInput), kind: 'node' })).toBe(false);
  });
});
