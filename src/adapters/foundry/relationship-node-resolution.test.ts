import { describe, expect, it } from 'vitest';
import { ACTOR_FALLBACK_NODE_TYPE } from './actor-to-node.js';
import { FALLBACK_NODE_TYPE } from './journal-entry-page-to-node.js';
import { resolveDroppedDocumentNode } from './relationship-node-resolution.js';

describe('resolveDroppedDocumentNode', () => {
  it('resolves an Actor via mapActorToNode, using its explicit flag type', () => {
    const result = resolveDroppedDocumentNode('Actor', {
      uuid: 'Actor.kharra',
      name: 'Kharra',
      flags: { archivexus: { nodeType: 'Character' } },
    });
    expect(result).toEqual({
      ok: true,
      node: {
        nodeId: 'Actor.kharra',
        nodeType: 'Character',
        title: 'Kharra',
        documentKind: 'Actor',
      },
    });
  });

  it('falls back to ACTOR_FALLBACK_NODE_TYPE for an Actor with no flag set', () => {
    const result = resolveDroppedDocumentNode('Actor', { uuid: 'Actor.1', name: 'Guard' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.node.nodeType).toBe(ACTOR_FALLBACK_NODE_TYPE);
  });

  it('resolves a JournalEntryPage via mapJournalEntryPageToNode', () => {
    const result = resolveDroppedDocumentNode('JournalEntryPage', {
      uuid: 'JournalEntry.j1.JournalEntryPage.p1',
      name: 'Puerto Umbral',
      flags: { archivexus: { nodeType: 'City' } },
    });
    expect(result).toEqual({
      ok: true,
      node: {
        nodeId: 'JournalEntry.j1.JournalEntryPage.p1',
        nodeType: 'City',
        title: 'Puerto Umbral',
        documentKind: 'JournalEntryPage',
      },
    });
  });

  it('falls back to FALLBACK_NODE_TYPE for a page with no flag set', () => {
    const result = resolveDroppedDocumentNode('JournalEntryPage', {
      uuid: 'JournalEntry.j1.JournalEntryPage.p2',
      name: 'Some Lore',
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.node.nodeType).toBe(FALLBACK_NODE_TYPE);
  });

  it('rejects an unsupported document type with a clear inline error, per ADR-0010 point 2', () => {
    const result = resolveDroppedDocumentNode('Scene', { uuid: 'Scene.1', name: 'The Docks' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("Scenes and Items aren't Nodes yet");
    expect(!result.ok && result.error).toContain('Scene');
  });

  it('rejects an Item the same way', () => {
    const result = resolveDroppedDocumentNode('Item', { uuid: 'Item.1', name: 'Sword' });
    expect(result.ok).toBe(false);
  });

  it('resolves a tagged Folder to a Folder-Node (ADAPT-016)', () => {
    const result = resolveDroppedDocumentNode('Folder', {
      uuid: 'Folder.rc',
      name: 'Red Cuervo de Hierro',
      flags: { archivexus: { nodeType: 'Organization' } },
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.node).toMatchObject({
      nodeId: 'Folder.rc',
      nodeType: 'Organization',
      title: 'Red Cuervo de Hierro',
      documentKind: 'Folder',
    });
  });

  it('rejects an untagged Folder with a "tag it first" error', () => {
    const result = resolveDroppedDocumentNode('Folder', { uuid: 'Folder.npc', name: 'NPC' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('Archivexus Node Type');
  });
});
