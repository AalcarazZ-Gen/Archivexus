import { describe, expect, it } from 'vitest';
import {
  CONTAINMENT_DEFINITION_GENERIC,
  CONTAINMENT_DEFINITION_LOCATION,
  CONTAINMENT_DEFINITION_MEMBER,
  containmentDefinitionFor,
  deriveContainment,
  type ContainmentEntity,
  type TaggedFolder,
} from './folder-containment.js';

describe('containmentDefinitionFor', () => {
  it('maps by node type, and an override always wins', () => {
    expect(containmentDefinitionFor('Organization')).toBe(CONTAINMENT_DEFINITION_MEMBER);
    expect(containmentDefinitionFor('City')).toBe(CONTAINMENT_DEFINITION_LOCATION);
    expect(containmentDefinitionFor('Kingdom')).toBe(CONTAINMENT_DEFINITION_LOCATION);
    expect(containmentDefinitionFor('Pantheon')).toBe(CONTAINMENT_DEFINITION_GENERIC);
    expect(containmentDefinitionFor('Organization', 'serves')).toBe('serves');
    expect(containmentDefinitionFor('Pantheon', '')).toBe(CONTAINMENT_DEFINITION_GENERIC);
  });
});

const org: TaggedFolder = { nodeId: 'Folder.horda', nodeType: 'Organization' };
const legion: TaggedFolder = { nodeId: 'Folder.legion', nodeType: 'Organization' };
const swordMts: TaggedFolder = { nodeId: 'Folder.sword', nodeType: 'Kingdom' };
const academy: TaggedFolder = { nodeId: 'Folder.academy', nodeType: 'City' };

describe('deriveContainment — edges', () => {
  it('links each tagged entity to its nearest tagged folder ancestor', () => {
    const entities: ContainmentEntity[] = [
      // a member actor directly in the Horda folder
      { nodeId: 'Actor.krunk', ancestorFolderNodeIds: ['Folder.horda', 'Folder.npc'] },
      // the Legión Carmesí sub-folder — its parent Horda is tagged
      { nodeId: 'Folder.legion', ancestorFolderNodeIds: ['Folder.horda', 'Folder.npc'] },
    ];
    const { edges } = deriveContainment({ taggedFolders: [org, legion], entities });
    expect(edges).toEqual([
      { origin: 'Actor.krunk', target: 'Folder.horda', definitionId: 'member-of' },
      { origin: 'Folder.legion', target: 'Folder.horda', definitionId: 'member-of' },
    ]);
  });

  it('skips untagged folders in the ancestry chain', () => {
    // Horda (tagged) > Lobos Grises (NOT tagged) > Wolf Alpha (tagged Character folder)
    const entities: ContainmentEntity[] = [
      { nodeId: 'Folder.wolfalpha', ancestorFolderNodeIds: ['Folder.lobos', 'Folder.horda'] },
    ];
    const { edges } = deriveContainment({
      taggedFolders: [org, { nodeId: 'Folder.wolfalpha', nodeType: 'Organization' }],
      entities,
    });
    expect(edges).toEqual([
      { origin: 'Folder.wolfalpha', target: 'Folder.horda', definitionId: 'member-of' },
    ]);
  });

  it('gives no edge when there is no tagged ancestor (top-level) or the entity opted out', () => {
    expect(
      deriveContainment({
        taggedFolders: [org],
        entities: [{ nodeId: 'Folder.horda', ancestorFolderNodeIds: ['Folder.npc'] }],
      }).edges,
    ).toEqual([]);
    expect(
      deriveContainment({
        taggedFolders: [org, legion],
        entities: [
          { nodeId: 'Folder.legion', ancestorFolderNodeIds: ['Folder.horda'], isContainmentRoot: true },
        ],
      }).edges,
    ).toEqual([]);
  });

  it('uses the ancestor folder\'s containment override, and its type default for a place folder', () => {
    const entities: ContainmentEntity[] = [
      { nodeId: 'Folder.academy', ancestorFolderNodeIds: ['Folder.sword'] },
    ];
    expect(deriveContainment({ taggedFolders: [swordMts, academy], entities }).edges).toEqual([
      { origin: 'Folder.academy', target: 'Folder.sword', definitionId: 'located-in' },
    ]);
    const overridden: TaggedFolder = { ...swordMts, containmentRelationshipOverride: 'part-of' };
    expect(deriveContainment({ taggedFolders: [overridden, academy], entities }).edges).toEqual([
      { origin: 'Folder.academy', target: 'Folder.sword', definitionId: 'part-of' },
    ]);
  });

  it('dedupes and never links an entity to itself', () => {
    const { edges } = deriveContainment({
      taggedFolders: [org],
      entities: [
        { nodeId: 'Actor.krunk', ancestorFolderNodeIds: ['Folder.horda'] },
        { nodeId: 'Actor.krunk', ancestorFolderNodeIds: ['Folder.horda'] },
        { nodeId: 'Folder.horda', ancestorFolderNodeIds: ['Folder.horda', 'Folder.npc'] },
      ],
    });
    expect(edges).toEqual([
      { origin: 'Actor.krunk', target: 'Folder.horda', definitionId: 'member-of' },
    ]);
  });
});

describe('deriveContainment — scene blocks', () => {
  it('emits scene blocks only for place-like folders that have scenes', () => {
    const scenes = new Map([
      ['Folder.academy', [{ uuid: 'Scene.cat', title: 'Catacombs' }, { uuid: 'Scene.gen', title: 'General area' }]],
      ['Folder.horda', [{ uuid: 'Scene.x', title: 'irrelevant' }]],
    ]);
    const { sceneBlocks } = deriveContainment({
      taggedFolders: [org, academy],
      entities: [],
      scenesByFolderNodeId: scenes,
    });
    expect(sceneBlocks).toEqual([
      {
        folderNodeId: 'Folder.academy',
        blocks: [
          { type: 'scene', uuid: 'Scene.cat', title: 'Catacombs' },
          { type: 'scene', uuid: 'Scene.gen', title: 'General area' },
        ],
      },
    ]);
  });

  it('emits nothing when no scene map is given', () => {
    expect(deriveContainment({ taggedFolders: [academy], entities: [] }).sceneBlocks).toEqual([]);
  });
});
