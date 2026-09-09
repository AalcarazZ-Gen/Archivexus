import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNode, type Node } from '../../core/domain/node.js';
import { createRelationship, type Relationship } from '../../core/domain/relationship.js';
import { DEFAULT_RELATIONSHIP_DEFINITIONS } from '../../core/domain/relationship-definitions-default.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { createLogger } from './logger.js';
import {
  buildContextMenuHTML,
  buildGraphPopoutContentHTML,
  buildInspectorEmptyHTML,
  buildInspectorHTML,
  gatherNodeConnections,
  openGraphPopout,
} from './graph-popout-window.js';

const log = createLogger('archivexus-test');

/** A stateful in-memory `StorageProvider` fake — `resolveTraversal` reads its own writes. */
function fakeStorage(
  nodes: readonly Node[],
  relationships: readonly Relationship[],
): StorageProvider {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const relMap = new Map(relationships.map((r) => [r.id, r]));
  return {
    init: async () => undefined,
    saveNode: async () => undefined,
    getNode: async (id: string) => nodeMap.get(id),
    deleteNode: async () => undefined,
    listNodes: async () => [...nodeMap.values()],
    saveRelationship: async () => undefined,
    getRelationship: async (id: string) => relMap.get(id),
    deleteRelationship: async () => undefined,
    listRelationships: async () => [...relMap.values()],
    getRelationshipsForNode: async (nodeId: string) =>
      [...relMap.values()].filter((r) => r.origin === nodeId || r.target === nodeId),
    saveRelationshipDefinition: async () => undefined,
    getRelationshipDefinition: async (id: string) =>
      DEFAULT_RELATIONSHIP_DEFINITIONS.find((d) => d.id === id),
    deleteRelationshipDefinition: async () => undefined,
    listRelationshipDefinitions: async () => DEFAULT_RELATIONSHIP_DEFINITIONS,
    saveView: async () => undefined,
    getView: async () => undefined,
    deleteView: async () => undefined,
    listViews: async () => [],
    close: async () => undefined,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { game?: unknown }).game;
  delete (globalThis as { foundry?: unknown }).foundry;
});

describe('buildGraphPopoutContentHTML', () => {
  it('renders the toolbar, canvas mount, inspector dock and status line', () => {
    const html = buildGraphPopoutContentHTML({ isGM: true });
    expect(html).toContain('data-role="canvas"');
    expect(html).toContain('data-role="inspector"');
    expect(html).toContain('data-role="status"');
    expect(html).toContain('data-action="wholeGraph"');
    expect(html).toContain('data-preset="direct-only"');
    expect(html).toContain('data-preset="everything-connected"');
    expect(html).toContain('data-action="changeLayout"');
  });

  it('shows the "Preview as player" control only for a GM', () => {
    expect(buildGraphPopoutContentHTML({ isGM: true })).toContain('data-action="togglePreview"');
    expect(buildGraphPopoutContentHTML({ isGM: false })).not.toContain(
      'data-action="togglePreview"',
    );
  });
});

describe('buildInspectorHTML', () => {
  const node = createNode({
    id: 'Actor.kael',
    type: 'Character',
    title: 'Kael Verik',
    blocks: [
      { type: 'JournalEntryPage', uuid: 'JournalEntry.a.JournalEntryPage.bio', title: 'Biography' },
    ],
  });

  it('shows the node title/type, an Attached section with clickable blocks, and a Connections section', () => {
    const html = buildInspectorHTML(node, [
      {
        category: 'affiliation',
        label: 'Affiliation',
        rows: [
          {
            relationshipId: 'r1',
            connectedNode: createNode({
              id: 'Actor.guild',
              type: 'Organization',
              title: 'The Guild',
            }),
            label: 'member-of',
            hasBackingActor: true,
            blocks: [],
          },
        ],
      },
    ]);
    expect(html).toContain('Kael Verik');
    expect(html).toContain('Character');
    expect(html).toContain('Attached (1)');
    expect(html).toContain('data-action="openBlock"');
    expect(html).toContain('data-uuid="JournalEntry.a.JournalEntryPage.bio"');
    expect(html).toContain('Biography');
    expect(html).toContain('Connections (1)');
    expect(html).toContain('Affiliation');
    expect(html).toContain('data-node-id="Actor.guild"');
    expect(html).toContain('member-of');
  });

  it('renders "Nothing attached." and "No connections yet." for an empty node', () => {
    const bare = createNode({ id: 'Actor.x', type: 'Lore', title: 'Bare' });
    const html = buildInspectorHTML(bare, []);
    expect(html).toContain('Attached (0)');
    expect(html).toContain('Nothing attached.');
    expect(html).toContain('No connections yet.');
  });

  it('shows the no-Actor badge for a JournalEntryPage-backed connection', () => {
    const html = buildInspectorHTML(createNode({ id: 'Actor.x', type: 'Lore', title: 'X' }), [
      {
        category: 'affiliation',
        label: 'Affiliation',
        rows: [
          {
            relationshipId: 'r1',
            connectedNode: createNode({
              id: 'JournalEntry.p.JournalEntryPage.q',
              type: 'Lore',
              title: 'A page',
            }),
            label: 'related-to',
            hasBackingActor: false,
            blocks: [],
          },
        ],
      },
    ]);
    expect(html).toContain('ax-gp-no-actor');
  });

  it('escapes HTML in titles', () => {
    const evil = createNode({ id: 'Actor.e', type: 'Lore', title: '<script>x</script>' });
    expect(buildInspectorHTML(evil, [])).not.toContain('<script>x</script>');
  });
});

describe('buildInspectorEmptyHTML', () => {
  it('prompts the viewer to select a node', () => {
    expect(buildInspectorEmptyHTML()).toContain('Select a node');
  });
});

describe('buildContextMenuHTML', () => {
  it('offers open-sheet, re-root, and everything-connected, each carrying the node id', () => {
    const html = buildContextMenuHTML('Actor.kael');
    expect(html).toContain('data-action="menuOpenSheet"');
    expect(html).toContain('data-action="menuReRoot"');
    expect(html).toContain('data-action="menuEverything"');
    expect((html.match(/data-node-id="Actor.kael"/g) ?? []).length).toBe(3);
  });
});

describe('gatherNodeConnections', () => {
  it('resolves a Direct-only traversal into grouped connections ordered by degree', async () => {
    const root = createNode({ id: 'Actor.root', type: 'Character', title: 'Root' });
    const hub = createNode({ id: 'Actor.hub', type: 'Organization', title: 'Hub' });
    const leaf = createNode({ id: 'Actor.leaf', type: 'Character', title: 'Leaf' });
    const extra = createNode({ id: 'Actor.extra', type: 'Character', title: 'Extra' });
    const rels = [
      createRelationship({
        id: 'r1',
        origin: 'Actor.root',
        target: 'Actor.hub',
        definitionId: 'member-of',
        title: 't',
      }),
      createRelationship({
        id: 'r2',
        origin: 'Actor.root',
        target: 'Actor.leaf',
        definitionId: 'member-of',
        title: 't',
      }),
      // gives Hub a second edge → higher degree than Leaf
      createRelationship({
        id: 'r3',
        origin: 'Actor.hub',
        target: 'Actor.extra',
        definitionId: 'member-of',
        title: 't',
      }),
    ];
    const storage = fakeStorage([root, hub, leaf, extra], rels);

    const groups = await gatherNodeConnections(storage, 'Actor.root');
    expect(groups.map((g) => g.category)).toEqual(['affiliation']);
    expect(groups[0]?.rows.map((r) => r.connectedNode.title)).toEqual(['Hub', 'Leaf']);
  });

  it('returns [] when the root has no connections', async () => {
    const root = createNode({ id: 'Actor.root', type: 'Character', title: 'Root' });
    expect(await gatherNodeConnections(fakeStorage([root], []), 'Actor.root')).toEqual([]);
  });
});

describe('openGraphPopout (singleton)', () => {
  function installFakeFoundry(): { constructed: number; rendered: number } {
    const counters = { constructed: 0, rendered: 0 };
    class FakeApplicationV2 {
      element = {
        innerHTML: '',
        querySelector: () => null,
        querySelectorAll: () => [] as unknown[],
      };
      constructor() {
        counters.constructed += 1;
      }
      render(): void {
        counters.rendered += 1;
      }
      async close(): Promise<void> {}
      setRoot(): void {}
    }
    (globalThis as { foundry?: unknown }).foundry = {
      applications: { api: { ApplicationV2: FakeApplicationV2 } },
    };
    (globalThis as { game?: unknown }).game = { user: { isGM: true } };
    return counters;
  }

  it('constructs the window once and re-renders (not re-constructs) on a second call', () => {
    const counters = installFakeFoundry();
    const getStorage = (): undefined => undefined;

    openGraphPopout(getStorage, log);
    openGraphPopout(getStorage, log, { rootNodeId: 'Actor.kael' });

    expect(counters.constructed).toBe(1);
    expect(counters.rendered).toBe(2);
  });
});
