import { describe, expect, it } from 'vitest';
import { createRelationship, type Relationship } from '../../core/domain/relationship.js';
import { createRelationshipDefinition } from '../../core/domain/relationship-definition.js';
import {
  buildCardinalityWarningMessage,
  findCardinalityConflict,
} from './relationship-cardinality.js';

function makeRelationship(overrides: Partial<Relationship> = {}): Relationship {
  return createRelationship({
    id: overrides.id ?? 'rel-1',
    origin: overrides.origin ?? 'Actor.kharra',
    target: overrides.target ?? 'Page.villa-alta',
    definitionId: overrides.definitionId ?? 'resides-in',
    title: 'Kharra resides-in Villa Alta',
  });
}

const oneToOne = createRelationshipDefinition({
  id: 'married-to',
  name: 'married-to',
  inverse: 'married-to',
  cardinality: 'one-to-one',
  symmetry: true,
  traversalCategory: 'kinship',
});

const oneToMany = createRelationshipDefinition({
  id: 'resides-in',
  name: 'resides-in',
  inverse: 'resident-of',
  cardinality: 'one-to-many',
  symmetry: false,
  traversalCategory: 'location',
});

const manyToOne = createRelationshipDefinition({
  id: 'leads',
  name: 'leads',
  inverse: 'led-by',
  cardinality: 'many-to-one',
  symmetry: false,
  traversalCategory: 'governance',
});

const manyToMany = createRelationshipDefinition({
  id: 'ally-of',
  name: 'ally-of',
  inverse: 'ally-of',
  cardinality: 'many-to-many',
  symmetry: true,
  traversalCategory: 'affiliation',
});

describe('findCardinalityConflict', () => {
  it('finds no conflict when neither endpoint has an existing Relationship under this Definition', () => {
    expect(findCardinalityConflict(oneToMany, 'Actor.a', 'Page.b', [], [])).toBeUndefined();
  });

  it('one-to-many: conflicts only when the ORIGIN already has one as origin', () => {
    const existing = makeRelationship({
      definitionId: 'resides-in',
      origin: 'Actor.a',
      target: 'Page.other',
    });
    const conflict = findCardinalityConflict(oneToMany, 'Actor.a', 'Page.b', [existing], []);
    expect(conflict).toEqual({ side: 'origin', conflictingRelationship: existing });
  });

  it('one-to-many: does NOT conflict when the TARGET already has an unrelated relationship as target', () => {
    const existing = makeRelationship({
      definitionId: 'resides-in',
      origin: 'Actor.other',
      target: 'Page.b',
    });
    const conflict = findCardinalityConflict(oneToMany, 'Actor.a', 'Page.b', [], [existing]);
    expect(conflict).toBeUndefined();
  });

  it('many-to-one: conflicts only when the TARGET already has one as target', () => {
    const existing = makeRelationship({
      definitionId: 'leads',
      origin: 'Actor.other',
      target: 'Page.b',
    });
    const conflict = findCardinalityConflict(manyToOne, 'Actor.a', 'Page.b', [], [existing]);
    expect(conflict).toEqual({ side: 'target', conflictingRelationship: existing });
  });

  it('many-to-one: does NOT conflict on the origin side', () => {
    const existing = makeRelationship({
      definitionId: 'leads',
      origin: 'Actor.a',
      target: 'Page.other',
    });
    const conflict = findCardinalityConflict(manyToOne, 'Actor.a', 'Page.b', [existing], []);
    expect(conflict).toBeUndefined();
  });

  it('one-to-one: conflicts on either side', () => {
    const existingAsOrigin = makeRelationship({
      definitionId: 'married-to',
      origin: 'Actor.a',
      target: 'Actor.other',
    });
    expect(findCardinalityConflict(oneToOne, 'Actor.a', 'Actor.b', [existingAsOrigin], [])).toEqual(
      { side: 'origin', conflictingRelationship: existingAsOrigin },
    );

    const existingAsTarget = makeRelationship({
      definitionId: 'married-to',
      origin: 'Actor.other',
      target: 'Actor.b',
    });
    expect(findCardinalityConflict(oneToOne, 'Actor.a', 'Actor.b', [], [existingAsTarget])).toEqual(
      { side: 'target', conflictingRelationship: existingAsTarget },
    );
  });

  it('many-to-many: never conflicts', () => {
    const existingOrigin = makeRelationship({ definitionId: 'ally-of', origin: 'Actor.a' });
    const existingTarget = makeRelationship({ definitionId: 'ally-of', target: 'Actor.b' });
    expect(
      findCardinalityConflict(manyToMany, 'Actor.a', 'Actor.b', [existingOrigin], [existingTarget]),
    ).toBeUndefined();
  });

  it('ignores a Relationship under a different Definition, even on a constrained side', () => {
    const existing = makeRelationship({
      definitionId: 'some-other-definition',
      origin: 'Actor.a',
    });
    expect(findCardinalityConflict(oneToMany, 'Actor.a', 'Page.b', [existing], [])).toBeUndefined();
  });
});

describe('buildCardinalityWarningMessage', () => {
  const resolveTitle = (nodeId: string): string =>
    ({ 'Actor.a': 'Kharra', 'Page.other': 'Villa Alta', 'Actor.other': 'Someone Else' })[nodeId] ??
    nodeId;

  it("phrases an origin-side conflict from the origin's own perspective, matching ADR-0010 point 6", () => {
    const conflicting = makeRelationship({
      definitionId: 'resides-in',
      origin: 'Actor.a',
      target: 'Page.other',
    });
    const message = buildCardinalityWarningMessage(
      oneToMany,
      { side: 'origin', conflictingRelationship: conflicting },
      resolveTitle,
    );
    expect(message).toBe(
      'Kharra already has a resides-in relationship to Villa Alta. Saving this will add a second one.',
    );
  });

  it("phrases a target-side conflict from the target's own perspective, using the Definition's inverse label", () => {
    const conflicting = makeRelationship({
      definitionId: 'leads',
      origin: 'Actor.other',
      target: 'Actor.a',
    });
    const message = buildCardinalityWarningMessage(
      manyToOne,
      { side: 'target', conflictingRelationship: conflicting },
      resolveTitle,
    );
    expect(message).toBe(
      'Kharra already has a led-by relationship to Someone Else. Saving this will add a second one.',
    );
  });
});
