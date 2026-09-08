import { KNOWN_NODE_TYPES, type Node } from '../../core/domain/node.js';

/**
 * Pure list-shaping for the Codex sidebar navigator (VIEW-001c, ADR-0014
 * Amendment A2): given the campaign's Nodes and a search string, produce
 * the type-grouped, ordered list the navigator renders. No storage, no
 * DOM, no Foundry — the tab class fetches `storage.listNodes()`, applies
 * `filterNodesForViewer` (ADR-0003), and hands the result here.
 *
 * Grouping is by `node.type`. Group order (A2): place-like types first
 * (`City`, `Kingdom` — the only place-like entries in `KNOWN_NODE_TYPES`),
 * then `Character`, then `Organization`, then the rest of
 * `KNOWN_NODE_TYPES` alphabetically, then any type the GM has invented
 * that isn't in that list (`NodeType` is an open string —
 * `01_ARCHITECTURE.md`'s Extensible principle), alphabetically. Within a
 * group: alphabetical by title.
 *
 * Degree-ordering was considered and rejected (A2): meaningless at 0
 * authored Relationships, and a weak proxy for "what I want to start
 * from" even later.
 */

const PLACE_LIKE_TYPES: readonly string[] = ['City', 'Kingdom'];
const PROMOTED_TYPES: readonly string[] = [...PLACE_LIKE_TYPES, 'Character', 'Organization'];

/** The rest of `KNOWN_NODE_TYPES`, alphabetical, after the promoted ones. */
const KNOWN_TAIL: readonly string[] = [...KNOWN_NODE_TYPES]
  .filter((type) => !PROMOTED_TYPES.includes(type))
  .sort((a, b) => a.localeCompare(b));

/** The full known-type order: promoted, then the alphabetical tail. */
const KNOWN_ORDER: readonly string[] = [...PROMOTED_TYPES, ...KNOWN_TAIL];

export interface NavigatorGroup {
  readonly type: string;
  readonly nodes: readonly Node[];
}

/**
 * The pinned favourites group's synthetic `type` key (VIEW-001d). Not a
 * real `NodeType` — a Node it contains still also appears under its own
 * type group. Chosen so it can't collide with a GM-invented type.
 */
export const FAVOURITES_GROUP_TYPE = '★ Favourites';

/**
 * `groupNodesByType`, with a pinned `★ Favourites` group prepended when any
 * of `favouriteIds` is present among `nodes` (sorted by title). The
 * favourite Nodes are NOT removed from their own type groups — the pin is
 * an additional shortcut, not a move.
 */
export function groupNodesWithFavourites(
  nodes: readonly Node[],
  favouriteIds: ReadonlySet<string>,
): readonly NavigatorGroup[] {
  const typeGroups = groupNodesByType(nodes);
  if (favouriteIds.size === 0) {
    return typeGroups;
  }
  const favourites = nodes
    .filter((node) => favouriteIds.has(node.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  return favourites.length > 0
    ? [{ type: FAVOURITES_GROUP_TYPE, nodes: favourites }, ...typeGroups]
    : typeGroups;
}

/** Pure: a value is a valid persisted favourites list iff it's an array of non-empty strings. */
export function normalizeFavouriteNodeIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

/** Case-insensitive substring match on the title. An empty/whitespace query matches everything. */
export function filterNodesByQuery(nodes: readonly Node[], query: string): readonly Node[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return nodes;
  }
  return nodes.filter((node) => node.title.toLowerCase().includes(needle));
}

function typeRank(type: string): number {
  const known = KNOWN_ORDER.indexOf(type);
  // Known types keep their fixed order; unknown (GM-invented) types sort
  // after all known ones, then alphabetically among themselves (handled by
  // the tiebreak in `groupNodesByType`).
  return known === -1 ? KNOWN_ORDER.length : known;
}

/**
 * Groups `nodes` by `type` into ordered `NavigatorGroup`s. Empty groups
 * are omitted (only types actually present appear). Nodes within a group
 * are sorted alphabetically by title; groups with equal rank (all the
 * GM-invented ones) are ordered alphabetically by type.
 */
export function groupNodesByType(nodes: readonly Node[]): readonly NavigatorGroup[] {
  const byType = new Map<string, Node[]>();
  for (const node of nodes) {
    const bucket = byType.get(node.type);
    if (bucket) {
      bucket.push(node);
    } else {
      byType.set(node.type, [node]);
    }
  }

  return [...byType.entries()]
    .map(([type, groupNodes]) => ({
      type,
      nodes: [...groupNodes].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => {
      const rankDelta = typeRank(a.type) - typeRank(b.type);
      return rankDelta !== 0 ? rankDelta : a.type.localeCompare(b.type);
    });
}
