import { describe, expect, it } from 'vitest';
import { createRelationshipDefinition } from '../../core/domain/relationship-definition.js';
import {
  buildRelationshipSummary,
  buildRelationshipTitle,
  resolveEndpointLabels,
} from './relationship-symmetry.js';

const asymmetric = createRelationshipDefinition({
  id: 'resides-in',
  name: 'resides-in',
  inverse: 'resident-of',
  cardinality: 'one-to-many',
  symmetry: false,
  traversalCategory: 'location',
});

const symmetric = createRelationshipDefinition({
  id: 'ally-of',
  name: 'ally-of',
  inverse: 'ally-of',
  cardinality: 'many-to-many',
  symmetry: true,
  traversalCategory: 'affiliation',
});

describe('resolveEndpointLabels', () => {
  it('defaults to Origin/Target before a Definition is selected', () => {
    expect(resolveEndpointLabels(undefined)).toEqual({
      originLabel: 'Origin',
      targetLabel: 'Target',
    });
  });

  it('keeps Origin/Target for an asymmetric Definition', () => {
    expect(resolveEndpointLabels(asymmetric)).toEqual({
      originLabel: 'Origin',
      targetLabel: 'Target',
    });
  });

  it('uses neutral, order-independent labels for a symmetric Definition', () => {
    expect(resolveEndpointLabels(symmetric)).toEqual({
      originLabel: 'First entity',
      targetLabel: 'Second entity',
    });
  });
});

describe('buildRelationshipSummary', () => {
  it('shows both directional labels for an asymmetric Definition, matching ADR-0010 point 5', () => {
    expect(buildRelationshipSummary(asymmetric, 'Kharra', 'Puerto Umbral')).toBe(
      'Kharra resides-in Puerto Umbral — Puerto Umbral is resident-of Kharra',
    );
  });

  it('shows one order-independent sentence for a symmetric Definition, matching ADR-0010 point 5', () => {
    expect(buildRelationshipSummary(symmetric, 'Kharra', 'the Miller family')).toBe(
      'Kharra is ally-of the Miller family',
    );
  });
});

describe('buildRelationshipTitle', () => {
  it('uses the plain forward phrase for an asymmetric Definition', () => {
    expect(buildRelationshipTitle(asymmetric, 'Kharra', 'Puerto Umbral')).toBe(
      'Kharra resides-in Puerto Umbral',
    );
  });

  it('uses the "is" phrasing for a symmetric Definition', () => {
    expect(buildRelationshipTitle(symmetric, 'Kharra', 'the Miller family')).toBe(
      'Kharra is ally-of the Miller family',
    );
  });
});
