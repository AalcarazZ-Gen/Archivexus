import { describe, expect, it } from 'vitest';
import type { FoundryFolderLike } from './folder-to-node.js';
import {
  buildFolderNodeTypeDialogContent,
  parseFolderNodeTypeDialogResult,
  resolveNearestTaggedAncestor,
} from './folder-node-type-tag.js';

function folder(uuid: string, name: string, nodeType?: string): FoundryFolderLike {
  return nodeType === undefined
    ? { uuid, name }
    : { uuid, name, flags: { archivexus: { nodeType } } };
}

describe('resolveNearestTaggedAncestor', () => {
  it('returns the closest ancestor that carries a nodeType flag', () => {
    const ancestors: FoundryFolderLike[] = [
      folder('Folder.lobos', 'Lobos Grises'), // untagged — skipped
      folder('Folder.horda', 'Horda del Estandarte', 'Organization'),
      folder('Folder.npc', 'NPC', 'Organization'),
    ];
    expect(resolveNearestTaggedAncestor(ancestors)?.uuid).toBe('Folder.horda');
  });

  it('returns undefined when no ancestor is tagged', () => {
    expect(resolveNearestTaggedAncestor([folder('Folder.npc', 'NPC')])).toBeUndefined();
    expect(resolveNearestTaggedAncestor([])).toBeUndefined();
  });
});

describe('buildFolderNodeTypeDialogContent', () => {
  it('is just the node-type input when there is no tagged ancestor', () => {
    const html = buildFolderNodeTypeDialogContent('rc', 'Organization', undefined, false);
    expect(html).toContain('name="nodeType"');
    expect(html).not.toContain('Links to:');
    expect(html).not.toContain('name="containmentRoot"');
  });

  it('adds the "Links to" line and the top-level checkbox when a tagged ancestor exists', () => {
    const html = buildFolderNodeTypeDialogContent('rc', '', 'Horda del Estandarte', true);
    expect(html).toContain('Links to: <strong>Horda del Estandarte</strong>');
    expect(html).toContain('name="containmentRoot" checked');
  });

  it('escapes the ancestor title', () => {
    const html = buildFolderNodeTypeDialogContent('rc', '', '<b>"x"</b>', false);
    expect(html).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(html).not.toContain('<b>"x"</b>');
    expect(html).toContain('name="containmentRoot" />');
  });
});

describe('parseFolderNodeTypeDialogResult', () => {
  it('reads the trimmed type and the checkbox', () => {
    expect(
      parseFolderNodeTypeDialogResult({
        nodeType: { value: '  Organization ' },
        containmentRoot: { checked: true },
      }),
    ).toEqual({ nodeType: 'Organization', containmentRoot: true });
  });

  it('defaults a missing type to empty and a missing checkbox to false', () => {
    expect(parseFolderNodeTypeDialogResult({})).toEqual({ nodeType: '', containmentRoot: false });
  });
});
