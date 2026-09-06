import { describe, expect, it } from 'vitest';
import { createRelationshipDefinition } from '../../core/domain/relationship-definition.js';
import {
  buildDefinitionOptions,
  buildDefinitionSelectOptionsHTML,
  DEFINITION_SELECT_PLACEHOLDER,
} from './relationship-definition-options.js';

const unrestricted = createRelationshipDefinition({
  id: 'ally-of',
  name: 'ally-of',
  inverse: 'ally-of',
  cardinality: 'many-to-many',
  symmetry: true,
  traversalCategory: 'affiliation',
});

const restricted = createRelationshipDefinition({
  id: 'resides-in',
  name: 'resides-in',
  inverse: 'resident-of',
  cardinality: 'one-to-many',
  symmetry: false,
  traversalCategory: 'location',
  validation: { allowedOriginTypes: ['Character'], allowedTargetTypes: ['City', 'Kingdom'] },
});

describe('buildDefinitionOptions', () => {
  it('returns an empty list before both endpoint types are known', () => {
    expect(buildDefinitionOptions([restricted], undefined, 'City')).toEqual([]);
    expect(buildDefinitionOptions([restricted], 'Character', undefined)).toEqual([]);
    expect(buildDefinitionOptions([restricted], undefined, undefined)).toEqual([]);
  });

  it('marks a Definition with no validation as always eligible', () => {
    const [option] = buildDefinitionOptions([unrestricted], 'Character', 'Kingdom');
    expect(option).toEqual({ definition: unrestricted, disabled: false, label: 'ally-of' });
  });

  it('marks a Definition eligible when both resolved types satisfy its validation', () => {
    const [option] = buildDefinitionOptions([restricted], 'Character', 'City');
    expect(option?.disabled).toBe(false);
    expect(option?.label).toBe('resides-in');
  });

  it('disables with an origin-type reason when the origin type is disallowed', () => {
    const [option] = buildDefinitionOptions([restricted], 'Creature', 'City');
    expect(option?.disabled).toBe(true);
    expect(option?.label).toBe('resides-in — requires origin type: Character');
  });

  it('disables with a target-type reason when the target type is disallowed', () => {
    const [option] = buildDefinitionOptions([restricted], 'Character', 'Item');
    expect(option?.disabled).toBe(true);
    expect(option?.label).toBe('resides-in — requires target type: City, Kingdom');
  });

  it('combines both reasons when both endpoint types are disallowed', () => {
    const [option] = buildDefinitionOptions([restricted], 'Creature', 'Item');
    expect(option?.disabled).toBe(true);
    expect(option?.label).toBe(
      'resides-in — requires origin type: Character; requires target type: City, Kingdom',
    );
  });
});

describe('buildDefinitionSelectOptionsHTML', () => {
  it('renders only the pre-drop placeholder when no options are given', () => {
    const html = buildDefinitionSelectOptionsHTML([], undefined);
    expect(html).toBe(
      `<option value="" selected disabled>${DEFINITION_SELECT_PLACEHOLDER}</option>`,
    );
  });

  it('renders a disabled option with its reason in the label', () => {
    const [option] = buildDefinitionOptions([restricted], 'Creature', 'City');
    const html = buildDefinitionSelectOptionsHTML(option ? [option] : [], undefined);
    expect(html).toContain('<option value="resides-in" disabled>');
    expect(html).toContain('requires origin type: Character');
  });

  it('renders an eligible option without a disabled attribute and marks it selected when chosen', () => {
    const [option] = buildDefinitionOptions([restricted], 'Character', 'City');
    const html = buildDefinitionSelectOptionsHTML(option ? [option] : [], 'resides-in');
    expect(html).toContain('<option value="resides-in" selected>resides-in</option>');
  });

  it('HTML-escapes the label', () => {
    const dangerous = createRelationshipDefinition({
      id: 'weird<id>',
      name: 'weird"name<script>',
      inverse: 'inverse',
      cardinality: 'many-to-many',
      symmetry: false,
      traversalCategory: 'narrative',
    });
    const html = buildDefinitionSelectOptionsHTML(
      buildDefinitionOptions([dangerous], 'Character', 'City'),
      undefined,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
