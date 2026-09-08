import { describe, expect, it } from 'vitest';
import { createNode, type Node } from '../../core/domain/node.js';
import {
  FAVOURITES_GROUP_TYPE,
  filterNodesByQuery,
  groupNodesByType,
  groupNodesWithFavourites,
  normalizeFavouriteNodeIds,
} from './node-navigator.js';

function node(type: string, title: string): Node {
  return createNode({ id: `${type}:${title}`, type, title });
}

describe('filterNodesByQuery', () => {
  const nodes = [node('City', 'Waterdeep'), node('Character', 'Volothamp'), node('Character', 'Laeral')];

  it('returns every node for an empty or whitespace query', () => {
    expect(filterNodesByQuery(nodes, '')).toBe(nodes);
    expect(filterNodesByQuery(nodes, '   ')).toBe(nodes);
  });

  it('matches a case-insensitive substring of the title', () => {
    expect(filterNodesByQuery(nodes, 'water').map((n) => n.title)).toEqual(['Waterdeep']);
    expect(filterNodesByQuery(nodes, 'LA').map((n) => n.title)).toEqual(['Laeral']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterNodesByQuery(nodes, 'zzz')).toEqual([]);
  });
});

describe('groupNodesByType', () => {
  it('groups by node.type and omits types with no nodes', () => {
    const groups = groupNodesByType([node('City', 'A'), node('City', 'B'), node('Character', 'C')]);
    expect(groups.map((g) => g.type)).toEqual(['City', 'Character']);
    expect(groups[0]?.nodes).toHaveLength(2);
  });

  it('orders groups place-like first, then Character, then Organization, then the rest of the known types alphabetically', () => {
    const groups = groupNodesByType([
      node('Lore', 'l'),
      node('Organization', 'o'),
      node('Character', 'c'),
      node('Kingdom', 'k'),
      node('City', 'ci'),
      node('Event', 'e'),
    ]);
    expect(groups.map((g) => g.type)).toEqual([
      'City',
      'Kingdom',
      'Character',
      'Organization',
      'Event',
      'Lore',
    ]);
  });

  it('sorts GM-invented types after all known ones, alphabetically among themselves', () => {
    const groups = groupNodesByType([
      node('Faction', 'f'),
      node('Character', 'c'),
      node('Artifact', 'a'),
      node('Puzzle', 'p'),
    ]);
    expect(groups.map((g) => g.type)).toEqual(['Character', 'Puzzle', 'Artifact', 'Faction']);
  });

  it('sorts nodes within a group alphabetically by title', () => {
    const groups = groupNodesByType([node('City', 'Zhentil Keep'), node('City', 'Athkatla'), node('City', 'Neverwinter')]);
    expect(groups[0]?.nodes.map((n) => n.title)).toEqual(['Athkatla', 'Neverwinter', 'Zhentil Keep']);
  });

  it('returns no groups for no nodes', () => {
    expect(groupNodesByType([])).toEqual([]);
  });
});

describe('groupNodesWithFavourites', () => {
  const waterdeep = node('City', 'Waterdeep');
  const volo = node('Character', 'Volo');
  const laeral = node('Character', 'Laeral');
  const nodes = [waterdeep, volo, laeral];

  it('is identical to groupNodesByType when there are no favourites', () => {
    expect(groupNodesWithFavourites(nodes, new Set())).toEqual(groupNodesByType(nodes));
  });

  it('prepends a title-sorted favourites group, keeping the favourites in their own type groups too', () => {
    const groups = groupNodesWithFavourites(nodes, new Set([volo.id, waterdeep.id]));
    expect(groups[0]?.type).toBe(FAVOURITES_GROUP_TYPE);
    expect(groups[0]?.nodes.map((n) => n.title)).toEqual(['Volo', 'Waterdeep']);
    // still present under City / Character
    expect(groups.slice(1).flatMap((g) => g.nodes)).toHaveLength(3);
  });

  it('omits the favourites group when no favourite id matches a node', () => {
    expect(groupNodesWithFavourites(nodes, new Set(['Actor.gone'])).map((g) => g.type)).not.toContain(
      FAVOURITES_GROUP_TYPE,
    );
  });
});

describe('normalizeFavouriteNodeIds', () => {
  it('keeps only non-empty strings from an array, and returns [] for anything else', () => {
    expect(normalizeFavouriteNodeIds(['a', '', 3, null, 'b'])).toEqual(['a', 'b']);
    expect(normalizeFavouriteNodeIds(undefined)).toEqual([]);
    expect(normalizeFavouriteNodeIds('a,b')).toEqual([]);
  });
});
