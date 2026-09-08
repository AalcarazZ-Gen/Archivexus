import { describe, expect, it } from 'vitest';
import { InvalidKnowledgeElementError } from './knowledge-element.js';
import {
  createView,
  GRAPH_VIEW_PRESETS,
  InvalidViewError,
  isGraphViewSpec,
  isView,
  VIEW_FORMATS,
} from './view.js';

const directSpec = { preset: 'direct-only' as const, rootNodeId: 'Node.city' };

const baseInput = {
  id: 'View.1',
  title: 'Puerto Umbral — direct connections',
  spec: directSpec,
};

describe('createView', () => {
  it('creates a valid View with the given id, title, spec, and the default graph format', () => {
    const view = createView(baseInput);
    expect(view.id).toBe('View.1');
    expect(view.kind).toBe('view');
    expect(view.format).toBe('graph');
    expect(view.spec).toEqual(directSpec);
    expect(view.title).toBe('Puerto Umbral — direct connections');
  });

  it('composes every Common Characteristic from KnowledgeElement (visibility default, empty collections)', () => {
    const view = createView(baseInput);
    expect(view.visibility).toBe('hidden');
    expect(view.metadata).toEqual({});
    expect(view.history).toEqual([]);
    expect(view.blocks).toEqual([]);
    expect(view.tags).toEqual([]);
    expect(view.references).toEqual([]);
  });

  it('accepts an explicit format of "graph" and rejects any other format', () => {
    expect(createView({ ...baseInput, format: 'graph' }).format).toBe('graph');
    expect(() =>
      // @ts-expect-error 'timeline' is not a ViewFormat yet
      createView({ ...baseInput, format: 'timeline' }),
    ).toThrow(InvalidViewError);
  });

  it('bubbles KnowledgeElement Domain Invariant errors (empty id/title) unchanged', () => {
    expect(() => createView({ ...baseInput, id: '' })).toThrow(InvalidKnowledgeElementError);
    expect(() => createView({ ...baseInput, title: '   ' })).toThrow(InvalidKnowledgeElementError);
  });

  it('freezes the returned View and its spec', () => {
    const view = createView({
      ...baseInput,
      spec: { preset: 'curated-by-me', rootNodeId: 'Node.city', relationshipIds: ['Rel.1'] },
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.spec)).toBe(true);
    expect(() => {
      // @ts-expect-error spec is readonly and frozen
      view.spec.rootNodeId = 'Node.other';
    }).toThrow(TypeError);
  });

  describe('spec validation', () => {
    it('rejects an unknown preset', () => {
      expect(() =>
        // @ts-expect-error 'expand-all' is not a preset
        createView({ ...baseInput, spec: { preset: 'expand-all', rootNodeId: 'Node.city' } }),
      ).toThrow(InvalidViewError);
    });

    it('rejects an empty rootNodeId', () => {
      expect(() =>
        createView({ ...baseInput, spec: { preset: 'direct-only', rootNodeId: '  ' } }),
      ).toThrow(InvalidViewError);
    });

    it('trims rootNodeId', () => {
      const view = createView({
        ...baseInput,
        spec: { preset: 'direct-only', rootNodeId: '  Node.city  ' },
      });
      expect(view.spec.rootNodeId).toBe('Node.city');
    });

    it('rejects a derived preset carrying curated-only fields (relationshipIds / layout)', () => {
      expect(() =>
        createView({
          ...baseInput,
          // @ts-expect-error direct-only has no relationshipIds in the type
          spec: { preset: 'direct-only', rootNodeId: 'Node.city', relationshipIds: ['Rel.1'] },
        }),
      ).toThrow(InvalidViewError);
    });

    it('requires relationshipIds for a curated-by-me spec', () => {
      expect(() =>
        createView({
          ...baseInput,
          // @ts-expect-error curated-by-me requires relationshipIds
          spec: { preset: 'curated-by-me', rootNodeId: 'Node.city' },
        }),
      ).toThrow(InvalidViewError);
    });

    it('keeps an empty curated relationshipIds list (a valid "pruned everything" state)', () => {
      const view = createView({
        ...baseInput,
        spec: { preset: 'curated-by-me', rootNodeId: 'Node.city', relationshipIds: [] },
      });
      expect(view.spec).toEqual({
        preset: 'curated-by-me',
        rootNodeId: 'Node.city',
        relationshipIds: [],
      });
    });

    it('trims and de-duplicates curated relationshipIds, preserving first-seen order', () => {
      const view = createView({
        ...baseInput,
        spec: {
          preset: 'curated-by-me',
          rootNodeId: 'Node.city',
          relationshipIds: ['Rel.2', ' Rel.1 ', 'Rel.2'],
        },
      });
      expect(view.spec).toMatchObject({ relationshipIds: ['Rel.2', 'Rel.1'] });
    });

    it('rejects a non-string / empty entry in relationshipIds', () => {
      expect(() =>
        createView({
          ...baseInput,
          spec: {
            preset: 'curated-by-me',
            rootNodeId: 'Node.city',
            relationshipIds: ['Rel.1', ''],
          },
        }),
      ).toThrow(InvalidViewError);
    });

    it('accepts an optional layout of finite { x, y } pairs and freezes each position', () => {
      const view = createView({
        ...baseInput,
        spec: {
          preset: 'curated-by-me',
          rootNodeId: 'Node.city',
          relationshipIds: ['Rel.1'],
          layout: { 'Node.a': { x: 0, y: 0 }, 'Node.b': { x: -12.5, y: 40 } },
        },
      });
      expect(view.spec).toMatchObject({
        layout: { 'Node.a': { x: 0, y: 0 }, 'Node.b': { x: -12.5, y: 40 } },
      });
      expect(Object.isFrozen((view.spec as { layout: Record<string, unknown> }).layout)).toBe(true);
    });

    it('rejects a layout position that is not a finite { x, y } pair', () => {
      for (const bad of [
        { x: 1 },
        { x: 'a', y: 2 },
        { x: NaN, y: 0 },
        { x: Infinity, y: 0 },
        null,
      ]) {
        expect(() =>
          createView({
            ...baseInput,
            spec: {
              preset: 'curated-by-me',
              rootNodeId: 'Node.city',
              relationshipIds: ['Rel.1'],
              // @ts-expect-error deliberately malformed layout value
              layout: { 'Node.a': bad },
            },
          }),
        ).toThrow(InvalidViewError);
      }
    });

    it('rejects a layout that is not an object', () => {
      expect(() =>
        createView({
          ...baseInput,
          spec: {
            preset: 'curated-by-me',
            rootNodeId: 'Node.city',
            relationshipIds: ['Rel.1'],
            // @ts-expect-error layout must be a record
            layout: [{ x: 1, y: 2 }],
          },
        }),
      ).toThrow(InvalidViewError);
    });
  });
});

describe('isView', () => {
  it('returns true for a value produced by createView', () => {
    expect(isView(createView(baseInput))).toBe(true);
    expect(
      isView(
        createView({
          ...baseInput,
          spec: { preset: 'curated-by-me', rootNodeId: 'Node.city', relationshipIds: ['Rel.1'] },
        }),
      ),
    ).toBe(true);
  });

  it('returns false for non-Views and KnowledgeElement-shaped values without a valid format/spec', () => {
    expect(isView(null)).toBe(false);
    expect(isView({ id: 'x', kind: 'view' })).toBe(false);
    expect(isView({ ...createView(baseInput), kind: 'node' })).toBe(false);
    expect(isView({ ...createView(baseInput), format: 'timeline' })).toBe(false);
    expect(isView({ ...createView(baseInput), spec: { preset: 'direct-only' } })).toBe(false);
  });
});

describe('isGraphViewSpec', () => {
  it('accepts each valid preset shape', () => {
    expect(isGraphViewSpec({ preset: 'direct-only', rootNodeId: 'n' })).toBe(true);
    expect(isGraphViewSpec({ preset: 'everything-connected', rootNodeId: 'n' })).toBe(true);
    expect(
      isGraphViewSpec({ preset: 'curated-by-me', rootNodeId: 'n', relationshipIds: ['r'] }),
    ).toBe(true);
  });

  it('rejects a derived spec carrying curated-only fields, and a curated spec without relationshipIds', () => {
    expect(
      isGraphViewSpec({ preset: 'direct-only', rootNodeId: 'n', relationshipIds: ['r'] }),
    ).toBe(false);
    expect(isGraphViewSpec({ preset: 'curated-by-me', rootNodeId: 'n' })).toBe(false);
  });
});

describe('exported constants', () => {
  it('VIEW_FORMATS is exactly ["graph"] for now', () => {
    expect([...VIEW_FORMATS]).toEqual(['graph']);
  });

  it('GRAPH_VIEW_PRESETS matches CORE-005’s three traversal presets', () => {
    expect([...GRAPH_VIEW_PRESETS]).toEqual([
      'direct-only',
      'everything-connected',
      'curated-by-me',
    ]);
  });
});
