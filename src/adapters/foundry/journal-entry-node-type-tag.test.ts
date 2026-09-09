import { describe, expect, it } from 'vitest';
import { entryIdFromContextTarget } from './journal-entry-node-type-tag.js';

describe('entryIdFromContextTarget', () => {
  it('reads data-entry-id (or data-document-id) off the target', () => {
    expect(entryIdFromContextTarget({ dataset: { entryId: 'abc' } })).toBe('abc');
    expect(entryIdFromContextTarget({ dataset: { documentId: 'def' } })).toBe('def');
    expect(
      entryIdFromContextTarget({
        getAttribute: (n: string) => (n === 'data-entry-id' ? 'xyz' : null),
      }),
    ).toBe('xyz');
  });

  it('walks up with closest() when the callback target is an inner element', () => {
    const li = { dataset: { entryId: 'entry-id' } };
    const inner = {
      dataset: {},
      closest: (sel: string) => (sel.includes('data-entry-id') ? li : null),
    };
    expect(entryIdFromContextTarget(inner)).toBe('entry-id');
  });

  it('unwraps a jQuery-style array target', () => {
    expect(entryIdFromContextTarget([{ dataset: { entryId: 'wrapped' } }])).toBe('wrapped');
  });

  it('returns undefined for a null target or one with no entry id anywhere', () => {
    expect(entryIdFromContextTarget(null)).toBeUndefined();
    expect(entryIdFromContextTarget({ dataset: {}, closest: () => null })).toBeUndefined();
  });
});
