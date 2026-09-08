import {
  createRelationshipDefinition,
  type RelationshipDefinition,
} from './relationship-definition.js';

/**
 * The starter Relationship Definition vocabulary a fresh Archivexus store is
 * bootstrapped with (the Adapter seeds these on first run, only into an
 * empty definitions store — see `module-entry.ts`). This replaces the
 * temporary `src/adapters/foundry/relationship-definitions-seed.ts` hack
 * ADAPT-007 carried: Definitions are now real, editable `StorageProvider`
 * state, and this list is just the *default* content, not a hardcoded
 * runtime dependency.
 *
 * It lives in Core, not the Foundry Adapter, because relationship
 * vocabulary is domain content, not a platform concern — a future Obsidian
 * or web adapter would seed the same set. The vocabulary is drawn from
 * `docs/02_LANGUAGE.md`'s "Relationship Definition" entry and
 * `docs/decisions/ADR-0007-relationship-view-traversal.md`'s
 * `traversalCategory` taxonomy (its "Example use" column), covering all 8
 * categories so a GM authoring a Relationship is never blocked by the
 * default set "not covering" a common case.
 *
 * **Open, flagged for review (Alberto):** the exact list, the labels, and
 * every `cardinality` / `validation` choice are judgment calls — none is
 * settled by an ADR or `03_DOMAIN_MODEL.md`. They're a reasonable starting
 * point to be adjusted in place, not a contract. Two documented open
 * questions this file does NOT resolve: a Foundry UI for a GM to
 * author/edit Definitions (data-layer CRUD exists; no screen yet), and
 * Definition *version* migration (`03_DOMAIN_MODEL.md`'s Definitions Open
 * Questions) — a store that already has definitions is never re-seeded, so
 * a later release adding defaults won't reach an existing world.
 *
 * Invariants `createRelationshipDefinition` enforces and this list honours:
 * a symmetric Definition uses one label for both directions (`inverse ===
 * name`) and a non-asymmetric cardinality; a non-symmetric one uses a
 * distinct `inverse`.
 */
export const DEFAULT_RELATIONSHIP_DEFINITIONS: readonly RelationshipDefinition[] = [
  // --- location -----------------------------------------------------------
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
    id: 'located-in',
    name: 'located-in',
    inverse: 'contains',
    cardinality: 'one-to-many',
    symmetry: false,
    traversalCategory: 'location',
  }),
  // --- affiliation -------------------------------------------------------
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
  createRelationshipDefinition({
    id: 'ally-of',
    name: 'ally-of',
    inverse: 'ally-of',
    cardinality: 'many-to-many',
    symmetry: true,
    traversalCategory: 'affiliation',
  }),
  createRelationshipDefinition({
    id: 'rival-of',
    name: 'rival-of',
    inverse: 'rival-of',
    cardinality: 'many-to-many',
    symmetry: true,
    traversalCategory: 'affiliation',
  }),
  // --- kinship ---------------------------------------------------------
  createRelationshipDefinition({
    id: 'parent-of',
    name: 'parent-of',
    inverse: 'child-of',
    cardinality: 'one-to-many',
    symmetry: false,
    traversalCategory: 'kinship',
  }),
  createRelationshipDefinition({
    id: 'sibling-of',
    name: 'sibling-of',
    inverse: 'sibling-of',
    cardinality: 'many-to-many',
    symmetry: true,
    traversalCategory: 'kinship',
  }),
  createRelationshipDefinition({
    id: 'spouse-of',
    name: 'spouse-of',
    inverse: 'spouse-of',
    cardinality: 'one-to-one',
    symmetry: true,
    traversalCategory: 'kinship',
  }),
  // --- conflict -------------------------------------------------------
  createRelationshipDefinition({
    id: 'enemy-of',
    name: 'enemy-of',
    inverse: 'enemy-of',
    cardinality: 'many-to-many',
    symmetry: true,
    traversalCategory: 'conflict',
  }),
  createRelationshipDefinition({
    id: 'at-war-with',
    name: 'at-war-with',
    inverse: 'at-war-with',
    cardinality: 'many-to-many',
    symmetry: true,
    traversalCategory: 'conflict',
  }),
  // --- governance ----------------------------------------------------
  createRelationshipDefinition({
    id: 'rules',
    name: 'rules',
    inverse: 'ruled-by',
    cardinality: 'one-to-many',
    symmetry: false,
    traversalCategory: 'governance',
  }),
  createRelationshipDefinition({
    id: 'serves',
    name: 'serves',
    inverse: 'served-by',
    cardinality: 'many-to-one',
    symmetry: false,
    traversalCategory: 'governance',
  }),
  // --- participation ------------------------------------------------
  createRelationshipDefinition({
    id: 'participated-in',
    name: 'participated-in',
    inverse: 'had-participant',
    cardinality: 'many-to-many',
    symmetry: false,
    traversalCategory: 'participation',
    validation: { allowedTargetTypes: ['Event', 'Quest'] },
  }),
  createRelationshipDefinition({
    id: 'founded',
    name: 'founded',
    inverse: 'founded-by',
    cardinality: 'many-to-many',
    symmetry: false,
    traversalCategory: 'participation',
  }),
  // --- ownership -----------------------------------------------------
  createRelationshipDefinition({
    id: 'owns',
    name: 'owns',
    inverse: 'owned-by',
    cardinality: 'one-to-many',
    symmetry: false,
    traversalCategory: 'ownership',
  }),
  // --- narrative ----------------------------------------------------
  createRelationshipDefinition({
    id: 'knows',
    name: 'knows',
    inverse: 'known-by',
    cardinality: 'many-to-many',
    symmetry: false,
    traversalCategory: 'narrative',
  }),
  createRelationshipDefinition({
    id: 'related-to',
    name: 'related-to',
    inverse: 'related-to',
    cardinality: 'many-to-many',
    symmetry: true,
    traversalCategory: 'narrative',
  }),
];
