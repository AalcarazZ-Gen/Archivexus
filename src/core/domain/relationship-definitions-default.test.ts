import { describe, expect, it } from 'vitest';
import {
  isRelationshipDefinition,
  RELATIONSHIP_TRAVERSAL_CATEGORIES,
} from './relationship-definition.js';
import { DEFAULT_RELATIONSHIP_DEFINITIONS } from './relationship-definitions-default.js';

describe('DEFAULT_RELATIONSHIP_DEFINITIONS', () => {
  it('is a non-empty list of valid RelationshipDefinitions', () => {
    expect(DEFAULT_RELATIONSHIP_DEFINITIONS.length).toBeGreaterThan(0);
    for (const definition of DEFAULT_RELATIONSHIP_DEFINITIONS) {
      expect(isRelationshipDefinition(definition)).toBe(true);
    }
  });

  it('has unique ids', () => {
    const ids = DEFAULT_RELATIONSHIP_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the containment triad the folder engine relies on (ADR-0015): member-of, located-in, part-of', () => {
    const ids = new Set(DEFAULT_RELATIONSHIP_DEFINITIONS.map((d) => d.id));
    expect(ids.has('member-of')).toBe(true);
    expect(ids.has('located-in')).toBe(true);
    expect(ids.has('part-of')).toBe(true);
  });

  it('covers every traversalCategory so a GM is never blocked by a gap', () => {
    const covered = new Set(DEFAULT_RELATIONSHIP_DEFINITIONS.map((d) => d.traversalCategory));
    for (const category of RELATIONSHIP_TRAVERSAL_CATEGORIES) {
      expect(covered.has(category)).toBe(true);
    }
  });

  it('honours the symmetry/inverse/cardinality cross-field invariants (createRelationshipDefinition enforces these on construction)', () => {
    for (const definition of DEFAULT_RELATIONSHIP_DEFINITIONS) {
      if (definition.symmetry) {
        expect(definition.inverse).toBe(definition.name);
        expect(['one-to-one', 'many-to-many']).toContain(definition.cardinality);
      } else {
        expect(definition.inverse).not.toBe(definition.name);
      }
    }
  });
});
