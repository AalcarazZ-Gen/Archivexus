import { describe, expect, it } from 'vitest';
import {
  createNode,
  InvalidNodeError,
  isNode,
  KNOWN_NODE_TYPES,
  removeBlockByUuid,
  upsertBlockByUuid,
} from './node.js';
import { InvalidKnowledgeElementError } from './knowledge-element.js';
import type { Block } from './block.js';

const baseInput = { id: 'node-1', type: 'City', title: 'Waterdeep' };

describe('createNode', () => {
  it('creates a valid Node with the given id, type and title', () => {
    const node = createNode(baseInput);
    expect(node.id).toBe('node-1');
    expect(node.kind).toBe('node');
    expect(node.type).toBe('City');
    expect(node.title).toBe('Waterdeep');
  });

  it('composes every Common Characteristic from KnowledgeElement (visibility default, empty collections)', () => {
    const node = createNode(baseInput);
    expect(node.visibility).toBe('hidden');
    expect(node.metadata).toEqual({});
    expect(node.history).toEqual([]);
    expect(node.blocks).toEqual([]);
    expect(node.tags).toEqual([]);
    expect(node.references).toEqual([]);
  });

  it('accepts a type outside KNOWN_NODE_TYPES - the list is a reference, not a closed enum', () => {
    const node = createNode({ ...baseInput, type: 'Deity' });
    expect(node.type).toBe('Deity');
    expect(KNOWN_NODE_TYPES).not.toContain('Deity');
  });

  it('rejects an empty type', () => {
    expect(() => createNode({ ...baseInput, type: '' })).toThrow(InvalidNodeError);
    expect(() => createNode({ ...baseInput, type: '   ' })).toThrow(InvalidNodeError);
  });

  // Domain Invariant: "Every Node represents exactly one concept" - there is
  // exactly one `type` field, and TypeScript's CreateNodeInput shape doesn't
  // allow supplying more than one.
  it('has exactly one type field and no others beyond KnowledgeElement plus type', () => {
    const node = createNode(baseInput);
    expect(Object.keys(node).sort()).toEqual(
      ['blocks', 'history', 'id', 'kind', 'metadata', 'references', 'tags', 'title', 'type', 'visibility'].sort(),
    );
  });

  // Domain Invariant: "A Node may exist without any Relationship" - there is
  // no relationship-related input at all; a bare Node is already complete.
  it('may exist without any Relationship-related data', () => {
    expect(() => createNode(baseInput)).not.toThrow();
  });

  // Domain Invariant: "A Node never derives its identity from another Node"
  // - id is exactly what was passed, independent of type/title/anything else.
  it('uses the given id as-is, independent of type or title', () => {
    const node = createNode({ id: 'independent-id', type: 'Item', title: 'A Sword' });
    expect(node.id).toBe('independent-id');
  });

  // Decision: "Can Nodes be nested? No." - no parent/children field exists.
  it('has no parent/children field (nesting is not representable)', () => {
    const node = createNode(baseInput);
    expect('parent' in node).toBe(false);
    expect('children' in node).toBe(false);
    expect('parentId' in node).toBe(false);
  });

  // Decision: "Can a Node change its type? No."
  it('freezes the returned Node so its type cannot be reassigned', () => {
    const node = createNode(baseInput);
    expect(Object.isFrozen(node)).toBe(true);
    expect(() => {
      // @ts-expect-error type is readonly and the object is frozen
      node.type = 'Kingdom';
    }).toThrow(TypeError);
    expect(node.type).toBe('City');
  });

  it('bubbles KnowledgeElement Domain Invariant errors (empty id/title) unchanged', () => {
    expect(() => createNode({ ...baseInput, id: '' })).toThrow(InvalidKnowledgeElementError);
    expect(() => createNode({ ...baseInput, title: '' })).toThrow(InvalidKnowledgeElementError);
  });
});

describe('upsertBlockByUuid', () => {
  const pageBlock: Block = { type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Biografía' };
  const sceneBlock: Block = { type: 'scene', uuid: 'Scene.1', title: 'Tavern map' };

  it('appends the Block when no existing entry matches its uuid', () => {
    const node = createNode(baseInput);
    const updated = upsertBlockByUuid(node, pageBlock);
    expect(updated.blocks).toEqual([pageBlock]);
  });

  it('replaces the matching entry in place rather than appending a duplicate', () => {
    const node = createNode({ ...baseInput, blocks: [sceneBlock, pageBlock] });
    const replacement: Block = { type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Updated title' };

    const updated = upsertBlockByUuid(node, replacement);

    expect(updated.blocks).toHaveLength(2);
    expect(updated.blocks).toEqual([sceneBlock, replacement]);
  });

  it('does not mutate the original Node', () => {
    const node = createNode({ ...baseInput, blocks: [sceneBlock] });
    upsertBlockByUuid(node, pageBlock);
    expect(node.blocks).toEqual([sceneBlock]);
  });

  it('returns a new, frozen Node', () => {
    const node = createNode(baseInput);
    const updated = upsertBlockByUuid(node, pageBlock);
    expect(updated).not.toBe(node);
    expect(Object.isFrozen(updated)).toBe(true);
    expect(Object.isFrozen(updated.blocks)).toBe(true);
  });
});

describe('removeBlockByUuid', () => {
  const pageBlock: Block = { type: 'JournalEntryPage', uuid: 'JournalEntryPage.bio', title: 'Biografía' };
  const sceneBlock: Block = { type: 'scene', uuid: 'Scene.1', title: 'Tavern map' };

  it('removes the Block matching the given uuid', () => {
    const node = createNode({ ...baseInput, blocks: [sceneBlock, pageBlock] });
    const updated = removeBlockByUuid(node, pageBlock.uuid);
    expect(updated.blocks).toEqual([sceneBlock]);
  });

  it('is a no-op (equivalent result, not the same reference) when no Block matches', () => {
    const node = createNode({ ...baseInput, blocks: [sceneBlock] });
    const updated = removeBlockByUuid(node, 'JournalEntryPage.does-not-exist');
    expect(updated.blocks).toEqual([sceneBlock]);
    expect(updated).not.toBe(node);
  });

  it('does not mutate the original Node', () => {
    const node = createNode({ ...baseInput, blocks: [sceneBlock, pageBlock] });
    removeBlockByUuid(node, pageBlock.uuid);
    expect(node.blocks).toEqual([sceneBlock, pageBlock]);
  });

  it('returns a new, frozen Node', () => {
    const node = createNode({ ...baseInput, blocks: [pageBlock] });
    const updated = removeBlockByUuid(node, pageBlock.uuid);
    expect(Object.isFrozen(updated)).toBe(true);
    expect(Object.isFrozen(updated.blocks)).toBe(true);
  });
});

describe('isNode', () => {
  it('returns true for a value produced by createNode', () => {
    expect(isNode(createNode(baseInput))).toBe(true);
  });

  it('returns false for a bare KnowledgeElement-shaped value without a type, and for non-Nodes', () => {
    expect(isNode(null)).toBe(false);
    expect(isNode({ id: 'x', kind: 'node' })).toBe(false);
    expect(isNode({ ...createNode(baseInput), kind: 'view' })).toBe(false);
  });
});
