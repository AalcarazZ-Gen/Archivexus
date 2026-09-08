import { describe, expect, it } from 'vitest';
import { createNode, type Node } from '../../core/domain/node.js';
import { filterNodesByQuery, groupNodesByType } from './node-navigator.js';

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
