import {
  createRelationshipDefinition,
  type RelationshipDefinition,
} from '../../core/domain/relationship-definition.js';

/**
 * TEMPORARY PLACEHOLDER (ADAPT-007, product-owner call 2026-09-06 — see
 * `docs/decisions/ADR-0010-relationship-authoring-ui.md`'s Disadvantages,
 * "RelationshipDefinition has no storage persistence yet"): CORE-004
 * implemented `RelationshipDefinition` as real Core state but deliberately
 * deferred persisting it (`resolveRelationshipDefinition` is a pure
 * in-memory lookup, not a registry). Until that fast-follow ships, the
 * Relationship-authoring window (`relationship-authoring-window.ts`) has no
 * live registry to read Definitions from, so it reads this hardcoded list
 * instead.
 *
 * **Replace this with a real Storage-backed registry once
 * `RelationshipDefinition` persistence exists** — this file (and every
 * import of `SEEDED_RELATIONSHIP_DEFINITIONS`) should disappear in that
 * pass, not grow more entries.
 *
 * Vocabulary drawn from `docs/02_LANGUAGE.md`'s "Relationship Definition"
 * entry and the concrete examples already used elsewhere in the docs — not
 * invented here:
 * - `resides-in` / `resident-of` — the exact pair `03_DOMAIN_MODEL.md`'s
 *   Definitions Decisions section uses as its own worked example of
 *   `inverse`, and `ADR-0007`'s `location` category's example use.
 * - `ally-of` — `03_DOMAIN_MODEL.md`'s own worked example of a symmetric
 *   Definition (`inverse` must equal `name`).
 * - `member-of` — `ADR-0007`'s `affiliation` category's example use.
 *
 * Judgment calls made to give each entry a complete, valid shape (none of
 * this is settled by any ADR/doc — flagged here, not invented silently):
 * - `resides-in`'s `cardinality` is `one-to-many`: read as "the origin side
 *   is limited to one relationship of this Definition, the target side is
 *   not" (a Character/Creature/Organization resides in one place under a
 *   given `resides-in` fact at a time; a City/Kingdom can have any number
 *   of residents). This exact reading is what makes ADR-0010 point 6's own
 *   worked example ("Kharra already has a resides-in relationship to Villa
 *   Alta") a same-origin conflict, not a same-target one.
 * - `ally-of`'s and `member-of`'s cardinality (`many-to-many`) has no
 *   textual precedent to draw from at all — a plain judgment call that
 *   neither direction is meaningfully limited to one (many characters can
 *   ally with many others; an Organization can have many members and a
 *   Character can belong to many Organizations).
 * - `member-of`'s `inverse` (`has-member`) isn't a documented label
 *   anywhere — `ADR-0007` only names the forward label. Necessary because
 *   `RelationshipDefinition` requires a distinct inverse for a non-symmetric
 *   Definition; this is the natural reverse phrasing of the same documented
 *   term, not a new relationship *type*.
 * - `validation.allowedOriginTypes`/`allowedTargetTypes` pick from
 *   `KNOWN_NODE_TYPES` (`node.ts`) matching each category's documented
 *   "Example use" column in ADR-0007's table as closely as possible.
 */
export const SEEDED_RELATIONSHIP_DEFINITIONS: readonly RelationshipDefinition[] = [
  createRelationshipDefinition({
    id: 'resides-in',
    name: 'resides-in',
    inverse: 'resident-of',
    cardinality: 'one-to-many',
    symmetry: false,
    traversalCategory: 'location',
    validation: {
      allowedOriginTypes: ['Character', 'Creature', 'Organization'],
      allowedTargetTypes: ['City', 'Kingdom'],
    },
  }),
  createRelationshipDefinition({
    id: 'ally-of',
    name: 'ally-of',
    inverse: 'ally-of',
    cardinality: 'many-to-many',
    symmetry: true,
    traversalCategory: 'affiliation',
  }),
  createRelationshipDefinition({
    id: 'member-of',
    name: 'member-of',
    inverse: 'has-member',
    cardinality: 'many-to-many',
    symmetry: false,
    traversalCategory: 'affiliation',
    validation: {
      allowedOriginTypes: ['Character', 'Creature', 'Organization'],
      allowedTargetTypes: ['Organization'],
    },
  }),
];
