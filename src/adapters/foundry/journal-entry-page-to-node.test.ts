import { describe, expect, it } from 'vitest';
import {
  FALLBACK_NODE_TYPE,
  mapJournalEntryPageToNode,
  type FoundryJournalEntryPageLike,
} from './journal-entry-page-to-node.js';
import { InvalidKnowledgeElementError } from '../../core/domain/knowledge-element.js';

const basePage: FoundryJournalEntryPageLike = {
  uuid: 'JournalEntry.abc123.JournalEntryPage.def456',
  name: 'The Sunken Crown',
};

describe('mapJournalEntryPageToNode', () => {
  it('uses the page uuid as the Node id, unchanged (ADR-0001)', () => {
    const node = mapJournalEntryPageToNode(basePage);
    expect(node.id).toBe('JournalEntry.abc123.JournalEntryPage.def456');
  });

  it('uses the page name as the Node title', () => {
    const node = mapJournalEntryPageToNode(basePage);
    expect(node.title).toBe('The Sunken Crown');
  });

  it('falls back to the Lore type when no archivexus.nodeType flag is set', () => {
    const node = mapJournalEntryPageToNode(basePage);
    expect(node.type).toBe('Lore');
    expect(node.type).toBe(FALLBACK_NODE_TYPE);
  });

  it('uses the explicit archivexus.nodeType flag when present, without validating it against KNOWN_NODE_TYPES', () => {
    const node = mapJournalEntryPageToNode({
      ...basePage,
      flags: { archivexus: { nodeType: 'Kingdom' } },
    });
    expect(node.type).toBe('Kingdom');
  });

  it('does not infer a type from the page name - an unflagged page about a kingdom still becomes Lore', () => {
    const node = mapJournalEntryPageToNode({ ...basePage, name: 'The Kingdom of Waterdeep' });
    expect(node.type).toBe(FALLBACK_NODE_TYPE);
  });

  // 02_LANGUAGE.md / ADR-0003's Foundry ownership -> Visibility mapping.
  it.each([
    [0, 'hidden'], // NONE
    [1, 'hidden'], // LIMITED (content-wise still hidden, per ADR-0003)
    [2, 'visible'], // OBSERVER
    [3, 'owned'], // OWNER
  ] as const)('maps Foundry ownership.default %i to Visibility %s', (ownership: number, visibility: string) => {
    const node = mapJournalEntryPageToNode({ ...basePage, ownership: { default: ownership } });
    expect(node.visibility).toBe(visibility);
  });

  it('defaults to hidden when ownership is absent, matching KnowledgeElement\'s own default', () => {
    const node = mapJournalEntryPageToNode(basePage);
    expect(node.visibility).toBe('hidden');
  });

  it('defaults to hidden for an unrecognized ownership.default (e.g. Foundry\'s -1 "inherit" sentinel)', () => {
    const node = mapJournalEntryPageToNode({ ...basePage, ownership: { default: -1 } });
    expect(node.visibility).toBe('hidden');
  });

  it('produces a Node that is otherwise a normal, valid Node (frozen, correct kind)', () => {
    const node = mapJournalEntryPageToNode(basePage);
    expect(node.kind).toBe('node');
    expect(Object.isFrozen(node)).toBe(true);
  });

  it('bubbles InvalidKnowledgeElementError for a page with an empty name (empty Node title)', () => {
    expect(() => mapJournalEntryPageToNode({ ...basePage, name: '' })).toThrow(InvalidKnowledgeElementError);
  });

  it('bubbles InvalidKnowledgeElementError for a page with an empty uuid (empty Node id)', () => {
    expect(() => mapJournalEntryPageToNode({ ...basePage, uuid: '' })).toThrow(InvalidKnowledgeElementError);
  });
});
