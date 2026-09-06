import { describe, expect, it } from 'vitest';
import {
  createRelationshipDefinition,
  InvalidRelationshipDefinitionError,
  isRelationshipDefinition,
  RELATIONSHIP_CARDINALITIES,
  RELATIONSHIP_TRAVERSAL_CATEGORIES,
  resolveRelationshipDefinition,
  type RelationshipDefinition,
} from './relationship-definition.js';

const baseInput = {
  id: 'def-resides-in',
  name: 'resides-in',
  inverse: 'resident-of',
  cardinality: 'many-to-one' as const,
  symmetry: false,
  traversalCategory: 'location' as const,
};

const symmetricInput = {
  id: 'def-ally-of',
  name: 'ally-of',
  inverse: 'ally-of',
  cardinality: 'many-to-many' as const,
  symmetry: true,
  traversalCategory: 'affiliation' as const,
};

describe('createRelationshipDefinition', () => {
  it('creates a valid RelationshipDefinition with the given fields', () => {
    const definition = createRelationshipDefinition(baseInput);
    expect(definition.id).toBe('def-resides-in');
    expect(definition.name).toBe('resides-in');
    expect(definition.inverse).toBe('resident-of');
    expect(definition.cardinality).toBe('many-to-one');
    expect(definition.symmetry).toBe(false);
    expect(definition.traversalCategory).toBe('location');
  });

  it('defaults version to 1 when not given', () => {
    const definition = createRelationshipDefinition(baseInput);
    expect(definition.version).toBe(1);
  });

  it('accepts an explicit version', () => {
    const definition = createRelationshipDefinition({ ...baseInput, version: 3 });
    expect(definition.version).toBe(3);
  });

  it('rejects a non-integer or sub-1 version', () => {
    expect(() => createRelationshipDefinition({ ...baseInput, version: 0 })).toThrow(
      InvalidRelationshipDefinitionError,
    );
    expect(() => createRelationshipDefinition({ ...baseInput, version: 1.5 })).toThrow(
      InvalidRelationshipDefinitionError,
    );
    expect(() => createRelationshipDefinition({ ...baseInput, version: -1 })).toThrow(
      InvalidRelationshipDefinitionError,
    );
  });

  it('rejects an empty id', () => {
    expect(() => createRelationshipDefinition({ ...baseInput, id: '' })).toThrow(
      InvalidRelationshipDefinitionError,
    );
    expect(() => createRelationshipDefinition({ ...baseInput, id: '   ' })).toThrow(
      InvalidRelationshipDefinitionError,
    );
  });

  it('rejects an empty name', () => {
    expect(() => createRelationshipDefinition({ ...baseInput, name: '' })).toThrow(
      InvalidRelationshipDefinitionError,
    );
  });

  it('rejects an empty inverse', () => {
    expect(() => createRelationshipDefinition({ ...baseInput, inverse: '' })).toThrow(
      InvalidRelationshipDefinitionError,
    );
  });

  it('rejects an invalid cardinality', () => {
    expect(() =>
      createRelationshipDefinition({
        ...baseInput,
        // @ts-expect-error deliberately invalid for the runtime check
        cardinality: 'one-to-infinity',
      }),
    ).toThrow(InvalidRelationshipDefinitionError);
  });

  it('rejects a non-boolean symmetry', () => {
    expect(() =>
      createRelationshipDefinition({
        ...baseInput,
        // @ts-expect-error deliberately invalid for the runtime check
        symmetry: 'yes',
      }),
    ).toThrow(InvalidRelationshipDefinitionError);
  });

  it('rejects an invalid traversalCategory', () => {
    expect(() =>
      createRelationshipDefinition({
        ...baseInput,
        // @ts-expect-error deliberately invalid for the runtime check
        traversalCategory: 'weather',
      }),
    ).toThrow(InvalidRelationshipDefinitionError);
  });

  it('accepts every documented traversalCategory (ADR-0007 starter taxonomy)', () => {
    for (const traversalCategory of RELATIONSHIP_TRAVERSAL_CATEGORIES) {
      expect(() => createRelationshipDefinition({ ...baseInput, traversalCategory })).not.toThrow();
    }
  });

  it('accepts every documented cardinality', () => {
    for (const cardinality of RELATIONSHIP_CARDINALITIES) {
      const symmetric = cardinality === 'one-to-one' || cardinality === 'many-to-many';
      expect(() =>
        createRelationshipDefinition(
          symmetric ? { ...symmetricInput, cardinality } : { ...baseInput, cardinality },
        ),
      ).not.toThrow();
    }
  });

  // Judgment-call cross-field invariant (see relationship-definition.ts's
  // comment above createRelationshipDefinition): a symmetric Definition
  // describes the same fact in both directions, so it must use one label,
  // not two.
  it('requires a symmetric Definition to use the same label for both directions', () => {
    expect(() => createRelationshipDefinition({ ...symmetricInput, inverse: 'enemy-of' })).toThrow(
      InvalidRelationshipDefinitionError,
    );
  });

  it('accepts a symmetric Definition whose inverse equals its name', () => {
    expect(() => createRelationshipDefinition(symmetricInput)).not.toThrow();
  });

  // Judgment-call cross-field invariant: a non-symmetric Definition claiming
  // the same label for both directions can't actually express asymmetry.
  it('rejects a non-symmetric Definition whose inverse equals its name', () => {
    expect(() =>
      createRelationshipDefinition({ ...baseInput, symmetry: false, inverse: baseInput.name }),
    ).toThrow(InvalidRelationshipDefinitionError);
  });

  // Judgment-call cross-field invariant: an asymmetric cardinality
  // distinguishes an origin-side count from a target-side count, which only
  // makes sense when origin/target aren't interchangeable (i.e. non-symmetric).
  it('rejects a symmetric Definition with an asymmetric cardinality', () => {
    expect(() =>
      createRelationshipDefinition({ ...symmetricInput, cardinality: 'one-to-many' }),
    ).toThrow(InvalidRelationshipDefinitionError);
    expect(() =>
      createRelationshipDefinition({ ...symmetricInput, cardinality: 'many-to-one' }),
    ).toThrow(InvalidRelationshipDefinitionError);
  });

  it('accepts a symmetric Definition with a symmetric cardinality (one-to-one or many-to-many)', () => {
    expect(() =>
      createRelationshipDefinition({ ...symmetricInput, cardinality: 'one-to-one' }),
    ).not.toThrow();
    expect(() =>
      createRelationshipDefinition({ ...symmetricInput, cardinality: 'many-to-many' }),
    ).not.toThrow();
  });

  it('accepts no validation rules at all (Optional Structure — no restriction)', () => {
    const definition = createRelationshipDefinition(baseInput);
    expect(definition.validation).toBeUndefined();
  });

  it('accepts and normalizes validation allow-lists, trimmed', () => {
    const definition = createRelationshipDefinition({
      ...baseInput,
      validation: {
        allowedOriginTypes: ['Character', ' Organization '],
        allowedTargetTypes: ['City'],
      },
    });
    expect(definition.validation).toEqual({
      allowedOriginTypes: ['Character', 'Organization'],
      allowedTargetTypes: ['City'],
    });
  });

  it('rejects an empty validation allow-list', () => {
    expect(() =>
      createRelationshipDefinition({
        ...baseInput,
        validation: { allowedOriginTypes: [] },
      }),
    ).toThrow(InvalidRelationshipDefinitionError);
  });

  it('rejects a validation allow-list containing an empty entry', () => {
    expect(() =>
      createRelationshipDefinition({
        ...baseInput,
        validation: { allowedOriginTypes: ['Character', '   '] },
      }),
    ).toThrow(InvalidRelationshipDefinitionError);
  });

  it('freezes the returned RelationshipDefinition (and its validation object) so fields cannot be reassigned', () => {
    const definition = createRelationshipDefinition({
      ...baseInput,
      validation: { allowedOriginTypes: ['Character'] },
    });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.validation)).toBe(true);
    expect(() => {
      // @ts-expect-error name is readonly and the object is frozen
      definition.name = 'something-else';
    }).toThrow(TypeError);
    expect(definition.name).toBe('resides-in');
  });

  // Domain Invariant (03_DOMAIN_MODEL.md's Definitions section): "Definitions
  // never represent campaign knowledge" / "Definitions describe behavior,
  // never instances" — confirmed structurally: no title/visibility/history/
  // blocks/tags/references fields, unlike Node/Relationship.
  it('has exactly its own fields, no KnowledgeElement fields', () => {
    const definition = createRelationshipDefinition(baseInput);
    expect(Object.keys(definition).sort()).toEqual(
      ['cardinality', 'id', 'inverse', 'name', 'symmetry', 'traversalCategory', 'version'].sort(),
    );
    expect('title' in definition).toBe(false);
    expect('visibility' in definition).toBe(false);
  });
});

describe('isRelationshipDefinition', () => {
  it('returns true for a value produced by createRelationshipDefinition', () => {
    expect(isRelationshipDefinition(createRelationshipDefinition(baseInput))).toBe(true);
  });

  it('returns false for null, a bare partial shape, and a value with a bad enum field', () => {
    expect(isRelationshipDefinition(null)).toBe(false);
    expect(isRelationshipDefinition({ id: 'x', name: 'y' })).toBe(false);
    expect(
      isRelationshipDefinition({ ...createRelationshipDefinition(baseInput), cardinality: 'bad' }),
    ).toBe(false);
  });
});

describe('resolveRelationshipDefinition', () => {
  const locatedIn = createRelationshipDefinition(baseInput);
  const allyOf = createRelationshipDefinition(symmetricInput);
  const definitions: readonly RelationshipDefinition[] = [locatedIn, allyOf];

  it('returns the matching definition by id', () => {
    expect(resolveRelationshipDefinition(definitions, 'def-ally-of')).toBe(allyOf);
  });

  it('returns undefined when no definition matches (e.g. a dangling Relationship.definitionId)', () => {
    expect(resolveRelationshipDefinition(definitions, 'def-does-not-exist')).toBeUndefined();
  });

  it('returns undefined for an empty definitions collection', () => {
    expect(resolveRelationshipDefinition([], 'def-ally-of')).toBeUndefined();
  });
});
