import { describe, expect, it } from 'vitest';
import { isTaggedFolder, mapFolderToNode, type FoundryFolderLike } from './folder-to-node.js';

const tagged: FoundryFolderLike = {
  uuid: 'Folder.rc',
  name: 'Red Cuervo de Hierro',
  flags: { archivexus: { nodeType: 'Organization' } },
};

describe('isTaggedFolder', () => {
  it('is true only when a non-empty nodeType flag is set', () => {
    expect(isTaggedFolder(tagged)).toBe(true);
    expect(isTaggedFolder({ uuid: 'Folder.npc', name: 'NPC' })).toBe(false);
    expect(isTaggedFolder({ uuid: 'Folder.x', name: 'x', flags: { archivexus: { nodeType: '  ' } } })).toBe(false);
  });
});

describe('mapFolderToNode', () => {
  it('maps id/title/type; visibility defaults to hidden (a Folder has no ownership)', () => {
    const node = mapFolderToNode(tagged);
    expect(node.id).toBe('Folder.rc');
    expect(node.title).toBe('Red Cuervo de Hierro');
    expect(node.type).toBe('Organization');
    expect(node.visibility).toBe('hidden');
  });

  it('honours an explicit flags.archivexus.visibility override, and ignores a bad one', () => {
    expect(
      mapFolderToNode({ ...tagged, flags: { archivexus: { nodeType: 'City', visibility: 'visible' } } })
        .visibility,
    ).toBe('visible');
    expect(
      mapFolderToNode({ ...tagged, flags: { archivexus: { nodeType: 'City', visibility: 'bogus' } } })
        .visibility,
    ).toBe('hidden');
  });

  it('trims the type flag', () => {
    expect(
      mapFolderToNode({ ...tagged, flags: { archivexus: { nodeType: '  Kingdom  ' } } }).type,
    ).toBe('Kingdom');
  });
});
