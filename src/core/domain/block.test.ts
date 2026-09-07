import { describe, expect, it } from 'vitest';
import { createBlock, InvalidBlockError, isBlock } from './block.js';

describe('createBlock', () => {
  it('creates a valid Block with type, uuid and title', () => {
    const block = createBlock({
      type: 'JournalEntryPage',
      uuid: 'JournalEntryPage.abc',
      title: 'Biografía',
    });
    expect(block.type).toBe('JournalEntryPage');
    expect(block.uuid).toBe('JournalEntryPage.abc');
    expect(block.title).toBe('Biografía');
  });

  it('omits title entirely when none is given', () => {
    const block = createBlock({ type: 'scene', uuid: 'Scene.1' });
    expect('title' in block).toBe(false);
  });

  it('omits title when given as an empty/whitespace-only string', () => {
    const block = createBlock({ type: 'scene', uuid: 'Scene.1', title: '   ' });
    expect('title' in block).toBe(false);
  });

  it('rejects an empty type', () => {
    expect(() => createBlock({ type: '', uuid: 'Scene.1' })).toThrow(InvalidBlockError);
    expect(() => createBlock({ type: '   ', uuid: 'Scene.1' })).toThrow(InvalidBlockError);
  });

  it('rejects an empty uuid', () => {
    expect(() => createBlock({ type: 'scene', uuid: '' })).toThrow(InvalidBlockError);
    expect(() => createBlock({ type: 'scene', uuid: '   ' })).toThrow(InvalidBlockError);
  });

  it('trims type and uuid', () => {
    const block = createBlock({ type: '  scene  ', uuid: '  Scene.1  ' });
    expect(block.type).toBe('scene');
    expect(block.uuid).toBe('Scene.1');
  });

  it('returns a frozen Block', () => {
    const block = createBlock({ type: 'scene', uuid: 'Scene.1' });
    expect(Object.isFrozen(block)).toBe(true);
  });
});

describe('isBlock', () => {
  it('returns true for a value produced by createBlock', () => {
    expect(isBlock(createBlock({ type: 'scene', uuid: 'Scene.1' }))).toBe(true);
  });

  it('returns true for a plain object with the right shape (no factory required)', () => {
    expect(isBlock({ type: 'scene', uuid: 'Scene.1' })).toBe(true);
    expect(isBlock({ type: 'scene', uuid: 'Scene.1', title: 'A scene' })).toBe(true);
  });

  it('returns false for non-objects and incomplete shapes', () => {
    expect(isBlock(null)).toBe(false);
    expect(isBlock(undefined)).toBe(false);
    expect(isBlock('Scene.1')).toBe(false);
    expect(isBlock({ type: 'scene' })).toBe(false);
    expect(isBlock({ uuid: 'Scene.1' })).toBe(false);
    expect(isBlock({ type: '', uuid: 'Scene.1' })).toBe(false);
    expect(isBlock({ type: 'scene', uuid: 'Scene.1', title: 42 })).toBe(false);
  });

  it('returns false for the old CORE-001 placeholder shape ({ id, type, data })', () => {
    expect(isBlock({ id: 'Block.1', type: 'JournalEntry', data: { uuid: 'JournalEntry.abc' } })).toBe(
      false,
    );
  });
});
