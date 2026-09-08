import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRelationshipDefinition,
  type RelationshipDefinition,
} from '../../core/domain/relationship-definition.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { createLogger } from './logger.js';
import {
  buildDefinitionEditorContentHTML,
  buildDefinitionFormHTML,
  buildDefinitionListHTML,
  emptyDefinitionFormValues,
  ensureDefinitionEditorStyles,
  formValuesFromDefinition,
  getRelationshipDefinitionEditorClass,
  openRelationshipDefinitionEditor,
  parseDefinitionForm,
  slugifyDefinitionId,
  sortDefinitions,
  validateDefinitionForm,
} from './relationship-definition-editor-window.js';

const log = createLogger('archivexus-test');

function def(overrides: Partial<Parameters<typeof createRelationshipDefinition>[0]> = {}): RelationshipDefinition {
  return createRelationshipDefinition({
    id: 'resides-in',
    name: 'resides-in',
    inverse: 'residence-of',
    cardinality: 'many-to-one',
    symmetry: false,
    traversalCategory: 'location',
    ...overrides,
  });
}

describe('emptyDefinitionFormValues', () => {
  it('is a blank form with a usable cardinality default and no category', () => {
    const values = emptyDefinitionFormValues();
    expect(values.name).toBe('');
    expect(values.symmetry).toBe(false);
    expect(values.cardinality).toBe('many-to-many');
    expect(values.traversalCategory).toBe('');
  });
});

describe('formValuesFromDefinition', () => {
  it('maps every field back to strings, joining the allow-lists', () => {
    const values = formValuesFromDefinition(
      def({
        validation: { allowedOriginTypes: ['Character', 'Organization'], allowedTargetTypes: ['City'] },
      }),
    );
    expect(values).toEqual({
      name: 'resides-in',
      inverse: 'residence-of',
      cardinality: 'many-to-one',
      symmetry: false,
      traversalCategory: 'location',
      allowedOriginTypes: 'Character, Organization',
      allowedTargetTypes: 'City',
    });
  });

  it('leaves the allow-lists empty when the definition has no validation', () => {
    const values = formValuesFromDefinition(def());
    expect(values.allowedOriginTypes).toBe('');
    expect(values.allowedTargetTypes).toBe('');
  });
});

describe('parseDefinitionForm', () => {
  const base = {
    ...emptyDefinitionFormValues(),
    name: 'rival-of',
    inverse: 'rival-of',
    cardinality: 'many-to-many',
    traversalCategory: 'conflict',
  };

  it('omits version when adding, bumps it by one when editing', () => {
    expect(parseDefinitionForm(base, 'rival-of').version).toBeUndefined();
    expect(parseDefinitionForm(base, 'rival-of', 3).version).toBe(4);
  });

  it('forces a symmetric type\'s inverse to equal its name', () => {
    const input = parseDefinitionForm(
      { ...base, symmetry: true, inverse: 'something-else' },
      'rival-of',
    );
    expect(input.inverse).toBe('rival-of');
  });

  it('parses the comma-separated allow-lists, dropping blanks', () => {
    const input = parseDefinitionForm(
      { ...base, allowedOriginTypes: ' Character , , Organization ', allowedTargetTypes: '' },
      'x',
    );
    expect(input.validation).toEqual({ allowedOriginTypes: ['Character', 'Organization'] });
  });

  it('omits validation entirely when both allow-lists are blank', () => {
    expect(parseDefinitionForm(base, 'x').validation).toBeUndefined();
  });
});

describe('validateDefinitionForm', () => {
  it('returns the frozen definition for valid input', () => {
    const result = validateDefinitionForm(
      parseDefinitionForm(
        { ...emptyDefinitionFormValues(), name: 'knows', inverse: 'known-by', traversalCategory: 'narrative' },
        'knows',
      ),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition.name).toBe('knows');
  });

  it('returns an inline message for an invalid definition instead of throwing', () => {
    const result = validateDefinitionForm(
      parseDefinitionForm({ ...emptyDefinitionFormValues(), name: '', traversalCategory: 'narrative' }, 'x'),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/name/i);
  });

  it('surfaces the symmetric + asymmetric-cardinality conflict', () => {
    const result = validateDefinitionForm(
      parseDefinitionForm(
        {
          ...emptyDefinitionFormValues(),
          name: 'ally-of',
          symmetry: true,
          cardinality: 'one-to-many',
          traversalCategory: 'affiliation',
        },
        'ally-of',
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/asymmetric cardinality/i);
  });
});

describe('slugifyDefinitionId', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyDefinitionId('Rival Of', [])).toBe('rival-of');
    expect(slugifyDefinitionId('  Employed by! ', [])).toBe('employed-by');
  });

  it('suffixes on collision', () => {
    expect(slugifyDefinitionId('rival of', ['rival-of'])).toBe('rival-of-2');
    expect(slugifyDefinitionId('rival of', ['rival-of', 'rival-of-2'])).toBe('rival-of-3');
  });

  it('falls back for a name with no usable characters', () => {
    expect(slugifyDefinitionId('!!!', [])).toBe('relationship-type');
  });
});

describe('sortDefinitions', () => {
  it('orders by traversal-category taxonomy, then alphabetically by name', () => {
    const ordered = sortDefinitions([
      def({ id: 'z', name: 'zzz', traversalCategory: 'narrative' }),
      def({ id: 'a', name: 'aaa', traversalCategory: 'narrative' }),
      def({ id: 'loc', name: 'mmm', traversalCategory: 'location' }),
    ]).map((d) => d.id);
    expect(ordered).toEqual(['loc', 'a', 'z']);
  });
});

describe('buildDefinitionListHTML', () => {
  it('shows an empty state with no definitions', () => {
    expect(buildDefinitionListHTML([], undefined)).toContain('data-role="def-empty"');
  });

  it('renders one row per definition with edit/delete actions carrying the id', () => {
    const html = buildDefinitionListHTML([def({ id: 'resides-in' })], undefined);
    expect(html).toContain('data-definition-id="resides-in"');
    expect(html).toContain('data-action="edit"');
    expect(html).toContain('data-action="delete"');
  });

  it('marks a symmetric type with ↔ and the row being edited as active', () => {
    const html = buildDefinitionListHTML(
      [def({ id: 'ally-of', name: 'ally-of', inverse: 'ally-of', cardinality: 'many-to-many', symmetry: true, traversalCategory: 'affiliation' })],
      'ally-of',
    );
    expect(html).toContain('↔');
    expect(html).toContain('archivexus-def-row--active');
  });
});

describe('buildDefinitionFormHTML', () => {
  it('has an add heading and no cancel button in add mode', () => {
    const html = buildDefinitionFormHTML(emptyDefinitionFormValues(), 'add');
    expect(html).toContain('New relationship type');
    expect(html).not.toContain('data-action="cancelEdit"');
  });

  it('has an edit heading, a cancel button, and prefilled values in edit mode', () => {
    const html = buildDefinitionFormHTML(formValuesFromDefinition(def({ symmetry: false })), 'edit');
    expect(html).toContain('Edit relationship type');
    expect(html).toContain('data-action="cancelEdit"');
    expect(html).toContain('value="resides-in"');
  });

  it('renders the error line hidden without a message, visible with one', () => {
    expect(buildDefinitionFormHTML(emptyDefinitionFormValues(), 'add')).toContain(
      'data-role="form-error" hidden',
    );
    const withError = buildDefinitionFormHTML(emptyDefinitionFormValues(), 'add', 'Bad thing');
    expect(withError).toContain('>Bad thing</p>');
    expect(withError).not.toContain('data-role="form-error" hidden');
  });

  it('reflects the symmetry checkbox state', () => {
    expect(buildDefinitionFormHTML({ ...emptyDefinitionFormValues(), symmetry: true }, 'add')).toContain(
      'name="symmetry" checked',
    );
  });
});

describe('buildDefinitionEditorContentHTML', () => {
  it('has the list, the form, a count, and a "+ New" action', () => {
    const html = buildDefinitionEditorContentHTML([def()], undefined, emptyDefinitionFormValues(), 'add');
    expect(html).toContain('data-role="list"');
    expect(html).toContain('data-role="form"');
    expect(html).toContain('data-action="add"');
    expect(html).toContain('archivexus-def-count">1<');
  });
});

describe('ensureDefinitionEditorStyles', () => {
  it('is a no-op without a document', () => {
    expect(() => ensureDefinitionEditorStyles()).not.toThrow();
  });

  it('injects a single <style> once', () => {
    const appended: { id: string; textContent: string }[] = [];
    const byId = new Map<string, unknown>();
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => byId.get(id) ?? null,
      createElement: () => ({ id: '', textContent: '' }),
      head: {
        appendChild: (node: { id: string; textContent: string }) => {
          appended.push(node);
          byId.set(node.id, node);
        },
      },
    };
    ensureDefinitionEditorStyles();
    ensureDefinitionEditorStyles();
    expect(appended).toHaveLength(1);
    expect(appended[0]?.id).toBe('archivexus-def-editor-styles');
    delete (globalThis as { document?: unknown }).document;
  });
});

describe('openRelationshipDefinitionEditor', () => {
  class FakeApplicationV2 {
    static instances: FakeApplicationV2[] = [];
    element = { querySelector: () => null };
    rendered = 0;
    constructor(public options: unknown) {
      FakeApplicationV2.instances.push(this);
    }
    render(): void {
      this.rendered += 1;
    }
    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    FakeApplicationV2.instances = [];
    (globalThis as { foundry?: unknown }).foundry = {
      applications: { api: { ApplicationV2: FakeApplicationV2, DialogV2: {} } },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  const fakeStorage = (): StorageProvider =>
    ({ listRelationshipDefinitions: async () => [] }) as unknown as StorageProvider;

  it('warns and does not open when storage is not ready', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    openRelationshipDefinitionEditor(() => undefined, log);
    expect(warn).toHaveBeenCalled();
    expect(FakeApplicationV2.instances).toHaveLength(0);
  });

  it('opens once and re-renders the same instance on a second call (singleton)', () => {
    const storage = fakeStorage();
    openRelationshipDefinitionEditor(() => storage, log);
    openRelationshipDefinitionEditor(() => storage, log);
    expect(FakeApplicationV2.instances).toHaveLength(1);
    expect(FakeApplicationV2.instances[0]?.rendered).toBe(2);
  });
});

describe('getRelationshipDefinitionEditorClass', () => {
  beforeEach(() => {
    (globalThis as { foundry?: unknown }).foundry = {
      applications: { api: { ApplicationV2: class {}, DialogV2: {} } },
    };
  });
  afterEach(() => {
    delete (globalThis as { foundry?: unknown }).foundry;
  });

  it('memoizes the built class', () => {
    expect(getRelationshipDefinitionEditorClass()).toBe(getRelationshipDefinitionEditorClass());
  });
});
