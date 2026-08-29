import { describe, expect, it } from 'vitest';
import {
  createKnowledgeElement,
  DEFAULT_VISIBILITY,
  InvalidKnowledgeElementError,
  isKnowledgeElement,
} from './knowledge-element.js';

const baseInput = { id: 'node-1', kind: 'node' as const, title: 'Waterdeep' };

describe('createKnowledgeElement', () => {
  it('creates a valid Knowledge Element with the given id, kind and title', () => {
    const element = createKnowledgeElement(baseInput);
    expect(element.id).toBe('node-1');
    expect(element.kind).toBe('node');
    expect(element.title).toBe('Waterdeep');
  });

  it('defaults visibility to hidden (fail-closed) when none is given', () => {
    const element = createKnowledgeElement(baseInput);
    expect(element.visibility).toBe('hidden');
    expect(element.visibility).toBe(DEFAULT_VISIBILITY);
  });

  it('accepts an explicit visibility', () => {
    const element = createKnowledgeElement({ ...baseInput, visibility: 'owned' });
    expect(element.visibility).toBe('owned');
  });

  // Domain Invariant: "Every Knowledge Element may exist without additional content."
  it('may exist without any Blocks', () => {
    const element = createKnowledgeElement(baseInput);
    expect(element.blocks).toEqual([]);
  });

  // Domain Invariant: "Every Knowledge Element may exist without Relationships."
  // (nothing on KnowledgeElement itself points at "its" Relationships, so
  // simply constructing one without mentioning Relationships proves this.)
  it('may exist without any references', () => {
    const element = createKnowledgeElement(baseInput);
    expect(element.references).toEqual([]);
  });

  it('defaults metadata, history and tags to empty when omitted', () => {
    const element = createKnowledgeElement(baseInput);
    expect(element.metadata).toEqual({});
    expect(element.history).toEqual([]);
    expect(element.tags).toEqual([]);
  });

  it('preserves provided metadata, history, blocks, tags and references', () => {
    const timestamp = new Date('2026-01-01T00:00:00.000Z');
    const element = createKnowledgeElement({
      ...baseInput,
      metadata: { source: 'foundry' },
      history: [{ timestamp, description: 'Imported from Foundry' }],
      blocks: [{ id: 'block-1', type: 'description', data: 'A bustling city.' }],
      tags: ['city', 'sword-coast'],
      references: [{ targetId: 'node-2' }],
    });

    expect(element.metadata).toEqual({ source: 'foundry' });
    expect(element.history).toEqual([{ timestamp, description: 'Imported from Foundry' }]);
    expect(element.blocks).toEqual([{ id: 'block-1', type: 'description', data: 'A bustling city.' }]);
    expect(element.tags).toEqual(['city', 'sword-coast']);
    expect(element.references).toEqual([{ targetId: 'node-2' }]);
  });

  // Domain Invariant: "Every Knowledge Element has a unique identifier."
  it('rejects an empty id', () => {
    expect(() => createKnowledgeElement({ ...baseInput, id: '' })).toThrow(
      InvalidKnowledgeElementError,
    );
    expect(() => createKnowledgeElement({ ...baseInput, id: '   ' })).toThrow(
      InvalidKnowledgeElementError,
    );
  });

  // Domain Invariant: "Every Knowledge Element has a human-readable title."
  it('rejects an empty title', () => {
    expect(() => createKnowledgeElement({ ...baseInput, title: '' })).toThrow(
      InvalidKnowledgeElementError,
    );
    expect(() => createKnowledgeElement({ ...baseInput, title: '   ' })).toThrow(
      InvalidKnowledgeElementError,
    );
  });

  // Domain Invariant: "Every Knowledge Element belongs to exactly one domain type."
  it('rejects a kind outside the Domain Hierarchy', () => {
    // @ts-expect-error deliberately passing an invalid kind
    expect(() => createKnowledgeElement({ ...baseInput, kind: 'sprocket' })).toThrow(
      InvalidKnowledgeElementError,
    );
  });

  it('rejects an invalid visibility', () => {
    // @ts-expect-error deliberately passing an invalid visibility
    expect(() => createKnowledgeElement({ ...baseInput, visibility: 'public' })).toThrow(
      InvalidKnowledgeElementError,
    );
  });

  it('returns a value whose top-level fields and collections are frozen', () => {
    const element = createKnowledgeElement(baseInput);
    expect(Object.isFrozen(element)).toBe(true);
    expect(Object.isFrozen(element.metadata)).toBe(true);
    expect(Object.isFrozen(element.history)).toBe(true);
    expect(Object.isFrozen(element.blocks)).toBe(true);
    expect(Object.isFrozen(element.tags)).toBe(true);
    expect(Object.isFrozen(element.references)).toBe(true);
  });

  it('does not let a caller mutate the returned element through the input it passed in', () => {
    const tags = ['city'];
    const element = createKnowledgeElement({ ...baseInput, tags });
    tags.push('mutated-after-the-fact');
    expect(element.tags).toEqual(['city']);
  });
});

describe('isKnowledgeElement', () => {
  it('returns true for a value produced by createKnowledgeElement', () => {
    expect(isKnowledgeElement(createKnowledgeElement(baseInput))).toBe(true);
  });

  it('returns false for non-objects and incomplete shapes', () => {
    expect(isKnowledgeElement(null)).toBe(false);
    expect(isKnowledgeElement(undefined)).toBe(false);
    expect(isKnowledgeElement('node-1')).toBe(false);
    expect(isKnowledgeElement({ id: 'node-1' })).toBe(false);
    expect(isKnowledgeElement({ ...baseInput, kind: 'sprocket' })).toBe(false);
  });
});
