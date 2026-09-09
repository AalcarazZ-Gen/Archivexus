import { describe, expect, it } from 'vitest';
import {
  isTaggedJournalEntry,
  journalEntryPageBlocks,
  mapJournalEntryToNode,
  type FoundryJournalEntryLike,
} from './journal-entry-to-node.js';

const violet: FoundryJournalEntryLike = {
  uuid: 'JournalEntry.violet',
  name: 'Violet Meyer',
  ownership: { default: 2 },
  flags: { archivexus: { nodeType: 'Character' } },
  pages: {
    contents: [
      { uuid: 'JournalEntry.violet.JournalEntryPage.retrato', name: 'Retrato' },
      { uuid: 'JournalEntry.violet.JournalEntryPage.bio', name: 'Biografía' },
    ],
  },
};

describe('isTaggedJournalEntry', () => {
  it('is true only when a non-empty nodeType flag is set on the entry', () => {
    expect(isTaggedJournalEntry(violet)).toBe(true);
    expect(
      isTaggedJournalEntry({ uuid: 'JournalEntry.x', name: 'x', pages: { contents: [] } }),
    ).toBe(false);
    expect(
      isTaggedJournalEntry({
        uuid: 'JournalEntry.x',
        name: 'x',
        flags: { archivexus: { nodeType: '   ' } },
        pages: { contents: [] },
      }),
    ).toBe(false);
  });
});

describe('journalEntryPageBlocks', () => {
  it('produces one JournalEntryPage Block per page, in page order', () => {
    expect(journalEntryPageBlocks(violet)).toEqual([
      {
        type: 'JournalEntryPage',
        uuid: 'JournalEntry.violet.JournalEntryPage.retrato',
        title: 'Violet Meyer — Retrato',
      },
      {
        type: 'JournalEntryPage',
        uuid: 'JournalEntry.violet.JournalEntryPage.bio',
        title: 'Violet Meyer — Biografía',
      },
    ]);
  });

  it('is an empty array for an entry with no pages', () => {
    expect(
      journalEntryPageBlocks({ uuid: 'JournalEntry.e', name: 'Empty', pages: { contents: [] } }),
    ).toEqual([]);
  });
});

describe('mapJournalEntryToNode', () => {
  it('maps id/title/type and carries the pages as Blocks', () => {
    const node = mapJournalEntryToNode(violet);
    expect(node.id).toBe('JournalEntry.violet');
    expect(node.title).toBe('Violet Meyer');
    expect(node.type).toBe('Character');
    expect(node.blocks).toHaveLength(2);
    expect(node.blocks[0]?.uuid).toBe('JournalEntry.violet.JournalEntryPage.retrato');
  });

  it('derives visibility from entry.ownership.default (ADR-0003) — unlike a Folder', () => {
    expect(mapJournalEntryToNode({ ...violet, ownership: { default: 0 } }).visibility).toBe(
      'hidden',
    );
    expect(mapJournalEntryToNode({ ...violet, ownership: { default: 2 } }).visibility).toBe(
      'visible',
    );
    expect(mapJournalEntryToNode({ ...violet, ownership: { default: 3 } }).visibility).toBe(
      'owned',
    );
  });

  it('honours an explicit flags.archivexus.visibility override, ignoring a bad one', () => {
    expect(
      mapJournalEntryToNode({
        ...violet,
        ownership: { default: 0 },
        flags: { archivexus: { nodeType: 'Character', visibility: 'visible' } },
      }).visibility,
    ).toBe('visible');
    expect(
      mapJournalEntryToNode({
        ...violet,
        ownership: { default: 2 },
        flags: { archivexus: { nodeType: 'Character', visibility: 'bogus' } },
      }).visibility,
    ).toBe('visible');
  });

  it('trims the type flag', () => {
    expect(
      mapJournalEntryToNode({ ...violet, flags: { archivexus: { nodeType: '  Organization  ' } } })
        .type,
    ).toBe('Organization');
  });
});
