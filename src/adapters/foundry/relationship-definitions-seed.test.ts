import { describe, expect, it } from 'vitest';
import { isRelationshipDefinition } from '../../core/domain/relationship-definition.js';
import { SEEDED_RELATIONSHIP_DEFINITIONS } from './relationship-definitions-seed.js';

describe('SEEDED_RELATIONSHIP_DEFINITIONS', () => {
  it('is a non-empty list of valid RelationshipDefinitions', () => {
    expect(SEEDED_RELATIONSHIP_DEFINITIONS.length).toBeGreaterThan(0);
    for (const definition of SEEDED_RELATIONSHIP_DEFINITIONS) {
      expect(isRelationshipDefinition(definition)).toBe(true);
    }
  });

  it('has no duplicate ids', () => {
    const ids = SEEDED_RELATIONSHIP_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes resides-in as an asymmetric, type-restricted, origin-constrained Definition', () => {
    const residesIn = SEEDED_RELATIONSHIP_DEFINITIONS.find((d) => d.id === 'resides-in');
    expect(residesIn).toBeDefined();
    expect(residesIn?.name).toBe('resides-in');
    expect(residesIn?.inverse).toBe('resident-of');
    expect(residesIn?.symmetry).toBe(false);
    expect(residesIn?.cardinality).toBe('one-to-many');
    expect(residesIn?.traversalCategory).toBe('location');
    expect(residesIn?.validation?.allowedTargetTypes).toContain('City');
  });

  it('includes ally-of as a symmetric Definition (inverse equals name)', () => {
    const allyOf = SEEDED_RELATIONSHIP_DEFINITIONS.find((d) => d.id === 'ally-of');
    expect(allyOf).toBeDefined();
    expect(allyOf?.symmetry).toBe(true);
    expect(allyOf?.inverse).toBe(allyOf?.name);
    expect(allyOf?.validation).toBeUndefined();
  });

  it('includes member-of as an asymmetric, type-restricted Definition', () => {
    const memberOf = SEEDED_RELATIONSHIP_DEFINITIONS.find((d) => d.id === 'member-of');
    expect(memberOf).toBeDefined();
    expect(memberOf?.symmetry).toBe(false);
    expect(memberOf?.inverse).not.toBe(memberOf?.name);
    expect(memberOf?.validation?.allowedTargetTypes).toEqual(['Organization']);
  });
});
