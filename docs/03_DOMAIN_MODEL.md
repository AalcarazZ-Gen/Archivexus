# 03_DOMAIN_MODEL

This document describes the conceptual domain model of Archivexus.

It intentionally avoids implementation details.

Its purpose is to define the domain objects, their characteristics, invariants and unresolved questions.

---

# Domain Hierarchy

Knowledge Element

├── Node
│      Represents a standalone concept
│
├── Relationship
│      Represents a fact connecting concepts
│
└── View
       Represents a saved projection of knowledge, for a specific format and audience

Definitions exist independently from domain instances.

---

# Knowledge Element

A Knowledge Element is the base abstraction of Archivexus.

Every managed piece of knowledge derives from this concept.

Knowledge Elements define the common language of the Archivexus domain.

---

## Common Characteristics

Every Knowledge Element:

- [x] Has an identity.
- [x] Has a title.
- [x] Has metadata.
- [x] Has visibility.
- [x] Has history.
- [x] Can contain Blocks.
- [x] Can be tagged.
- [x] Can reference other Knowledge Elements.
- [x] Can be referenced.
- [x] Can participate in Views.
- [x] Can be queried.

> **Note on "reference":** this is a lightweight mention or citation (e.g. linking to another Knowledge Element from within a Block, or a lookup via the Query API) — it is distinct from being connected as an origin/target endpoint of a Relationship, which is a stricter, structural connection reserved for Nodes (see Relationship's Decisions below).

---

## Domain Invariants

The following rules should always be true.

- Every Knowledge Element has a unique identifier.
- Every Knowledge Element has a human-readable title.
- Every Knowledge Element belongs to exactly one domain type.
- Every Knowledge Element may exist without additional content.
- Every Knowledge Element may exist without Relationships.

---

## Decisions

### How does Foundry's `LIMITED` permission tier map onto Visibility?

It maps to `hidden`.

`LIMITED` only exposes a Journal Entry's title and its position on a map, not its actual content — so from Archivexus's content-level point of view, nothing meaningful is actually visible. If a GM wants players to read the content, they raise the Foundry ownership level (to `OBSERVER` or above), which maps to `visible`. See `02_LANGUAGE.md`'s Visibility entry and `decisions/ADR-0003-visibility-model.md`.

### Are Blocks mandatory on every Knowledge Element?

No.

Per this section's Domain Invariants, every Knowledge Element may exist without additional content. Blocks are optional — a Knowledge Element is valid and complete with zero Blocks attached.

### What does a Block actually contain?

A Block is a typed reference to a Foundry element, not free-form data: `{ type, uuid, title? }` — `type` names what kind of Foundry document it points to (e.g. `scene`, `JournalEntry`), `uuid` is that document's real Foundry UUID (per `decisions/ADR-0001-use-foundry-UUID.md`), and an optional `title` lets a consumer display it without re-fetching. This replaces `Block.data: unknown`'s placeholder shape (`src/core/domain/block.ts`) with a concrete one — implementing the change is separate, future work, not part of this Decision. **First real concrete producer decided by ADR-0011 (2026-09-06): a `JournalEntryPage` the GM explicitly attaches to another Node becomes a `{ type: 'JournalEntryPage', uuid, title }` Block on that Node — see Node's Decisions below.** The Scene→Block mapping (originally ADAPT-005) is now decided by ADR-0015 (2026-09-08): a Scene inside a GM-tagged location folder auto-becomes a `{ type: 'scene', uuid, title }` Block on that folder's Node — the second concrete producer, still not yet implemented (ADAPT-018).

**Idempotent upsert-by-uuid (DBA resolution, ADR-0011's Amendment, 2026-09-06):** adding/replacing a Block on repeated sync (e.g. `updateJournalEntryPage` firing on every edit) is a Core-owned operation on `Node` (`upsertBlockByUuid`/`removeBlockByUuid`, `src/core/domain/node.ts`), not Foundry-Adapter logic — it's general Node/Block manipulation with no Foundry-specific behavior, and will be reused by ADAPT-005's Scene→Block mapping once that's implemented. This still assumes `Block`'s real `{ type, uuid, title? }` shape actually exists in code, which it doesn't yet — see the Amendment for why that's a named, currently-unscoped prerequisite for implementing ADR-0011, not something ADR-0011 or ADAPT-005 alone already covers.

This is deliberately uniform, not a discriminated union: every Block a GM would want — a Scene, a Journal page the GM writes their own notes into, anything else — is, by design, always a reference to some real Foundry element, never Archivexus-native freeform content (a GM's personal notes still go through a Foundry `JournalEntry`, referenced the same way). Revisit this if that assumption stops holding — e.g. if Archivexus ever wants to own content that has no Foundry-side counterpart at all.

### Is there a reserved shape inside `metadata` for Adapter-set provenance? (ADR-0015, 2026-09-08)

Yes — **`metadata.archivexus`** is a documented, reserved namespace for Foundry-Adapter bookkeeping that isn't a domain concept but must round-trip through storage and the export. Its first use (ADR-0015): a Relationship the folder-containment engine derived (rather than a GM hand-authoring it) carries

```
metadata.archivexus = { derived: true, source: 'folder-containment' | 'group-membership', container: '<ancestor Node id>', derivedAt: '<ISO-8601>' }
```

so the engine's reconciliation can safely delete only its own rows (a hand-authored Relationship has no marker and is structurally unreachable from the delete path), and the portable export is self-describing about which edges are inferred vs. asserted. This needs **no schema or domain-shape change** — `metadata` is already `Record<string, unknown>`, already a JSON `TEXT` column, already carried verbatim in the snapshot. `metadata.archivexus` is not first-class because provenance is a mechanism, not a domain concept anything else needs; promote it only if a second, unrelated deriver ever appears.

### Does the portable export (ADR-0008) include Blocks/History/References, or just titles/tags?

Yes — product-owner decision, 2026-09-06: the export must let an external AI or human agent reconstruct the whole world from it alone, not just titles/tags, so `toPortableSnapshot` (`src/core/storage/to-portable-snapshot.ts`) carries every one of a Knowledge Element's nine fields, unredacted, for both Nodes and Relationships. This was a real gap in the first STORE-003 pass — `PortableNode`/`PortableRelationship` initially dropped `history`/`blocks`/`references` — caught by a reviewer pass — and is really just ADR-0008 point 6 ("the export is a full, unredacted snapshot") made explicit rather than a new rule.

### Do Knowledge Elements expose their capabilities directly, or through composable behaviors (mixins/traits)?

Directly.

The Common Characteristics above (identity, visibility, history, Blocks, tags, references, Views, query) apply uniformly to every Knowledge Element — there's no case where a concept needs only some of them. The variability between a simple Item and a complex City isn't a capability difference; it's a content difference, already handled by Blocks (attachable content) and Relationships (connections to other Nodes, e.g. a City's factions and events as their own related Nodes) without needing the base contract itself to be composable.

---

## Open Questions

None.

---

# Node

A Node represents a standalone concept within the knowledge model.

Nodes represent entities that have their own semantic meaning independently from any Relationship.

Examples include:

- Character
- Creature
- City
- Kingdom
- Organization
- Quest
- Item
- Vehicle
- Event
- Lore
- Puzzle

---

## Additional Characteristics

- [x] Represents a standalone concept.
- [x] Can originate Relationships.
- [x] Can receive Relationships.
- [x] Can participate in multiple Relationship types.

---

## Domain Invariants

- Every Node represents exactly one concept.
- A Node may exist without any Relationship.
- A Node never derives its identity from another Node.

---

## Decisions

### Can Nodes be nested?

No.

Hierarchy should always be represented through Relationships.

### Can a Node change its type?

No.

A new concept should be represented by a new Node.

Relationships and History should preserve the evolution between Nodes.

### Is a Foundry Journal (the whole `JournalEntry`) a Node?

No — not as a single unit.

A Foundry `JournalEntry` is a Foundry-native container of `JournalEntryPage` documents; the container itself is a storage detail, not an Archivexus domain concept (see `01_ARCHITECTURE.md`'s "Knowledge over Documents" principle). The Foundry Adapter maps each page with distinct semantic content to its own Node, using that page's own Foundry UUID per ADR-0001 — **unless the GM has explicitly tagged the page as attached to another Node (`flags.archivexus.attachedToNodeId`), in which case it becomes a Block on that Node instead of a Node of its own; see `decisions/ADR-0011-journal-entry-page-node-attachment.md` for the full mechanism, storage shape and migration behavior. Amended by ADR-0011, 2026-09-06 — everything else in this paragraph (default behavior when no attachment is set) is unchanged.** The Node's type comes from an explicit GM-set flag naming what the page represents, not from inferring it out of the page's content — Adapters carry no business logic (`01_ARCHITECTURE.md`'s Adapters section). Pages without an explicit type become a generic `Lore` Node.

### Is a Foundry `Folder` a Node? (ADR-0015, 2026-09-08)

Only when the GM explicitly tags it.

Alberto's world is already organised in Foundry's folder tree, and that tree already encodes the containment structure Archivexus wants (an organization's folder holds its members; an area's folder holds its sub-areas and locations). A `Folder` is a first-class Foundry world Document with a stable UUID (`Folder.<id>`), so making it a Node fits ADR-0001 as-is — **no amendment to ADR-0001**. The rules (`decisions/ADR-0015-folder-nodes-and-derived-containment.md`):

- A Folder becomes a Node **only** on an explicit GM tag (`flags.archivexus.nodeType`, set via a folder context-menu action) — no inference from folder name or contents, the same no-inference rule as `Actor`/`JournalEntryPage`/`Scene` mapping.
- Its `type` is that flag; its `id` is `folder.uuid`; its `title` is `folder.name`. A Folder has no `ownership`, so its Visibility defaults to `hidden` (fail-closed — a world-structure folder routinely encodes spoilers), raised by an explicit `flags.archivexus.visibility` override.
- It never derives its identity from another Node (it derives from a Folder, which is not a Node), so the "A Node never derives its identity from another Node" invariant holds.
- The containment it introduces is expressed **purely as Relationships** — a tagged Node inside a tagged folder's subtree gets a Relationship to its nearest tagged folder ancestor (`member-of` for an Organization folder, `located-in` for a place-like folder, `part-of` otherwise). This *satisfies* the "Can Nodes be nested? No — hierarchy is always Relationships" Decision above, it does not violate it. Those derived Relationships carry a provenance marker (`metadata.archivexus`, see Knowledge Element's Decisions) and are reconciled automatically; a hand-authored Relationship is never touched by that reconciliation.
- Item folders are out of scope (Items have no Node mapping yet).

### Does a Foundry `Scene` map to its own Node? (ADAPT-005 — closed by ADR-0015, 2026-09-08)

No.

Same reasoning as a `JournalEntry`: a Scene has no semantic meaning of its own — it's the tactical/visual representation of a place (or whatever other Node a GM's world already tracks), not a standalone concept in the sense this section's Domain Invariants require. **How the link is made is settled by `decisions/ADR-0015-folder-nodes-and-derived-containment.md` (which closes the open ADAPT-005 ticket / issue #23):** a Scene that sits inside a GM-tagged location folder auto-becomes a `scene`-type Block on that folder's Node (see Knowledge Element's Decisions for Block's shape) — the folder tag *is* the explicit, never-inferred link. The residual case ADAPT-005 also named — linking one arbitrary Scene to one arbitrary non-location Node (a throne-room Scene as a Block on a King Actor-Node) — is deferred, revive-on-demand.

A Scene not inside any tagged location folder stays unmapped. The Adapter never force-creates a placeholder Node for it: a GM may have Scenes that are still being built, or maps they saved because they liked them with no plan yet for where they fit — those aren't part of the knowledge graph until the GM says they are.

There's no fixed set of "place" Node types this is restricted to. `KNOWN_NODE_TYPES` already has `City` and `Kingdom`, but nothing requires a Scene's target Node to be one of those (a tavern, a single room, a region with no real-world equivalent) — `NodeType` is intentionally an open string, not a closed enum (`01_ARCHITECTURE.md`'s "Extensible" principle), because no fixed list could cover every world a GM invents. The known-types list stays a set of suggestions, never a restriction.

### Can a JournalEntryPage attach itself to another Node instead of becoming its own Node? (ADR-0011)

Yes — see the amended "Is a Foundry Journal a Node?" Decision above and `decisions/ADR-0011-journal-entry-page-node-attachment.md` in full. A GM-set `flags.archivexus.attachedToNodeId` flag names the target Node (Actor-backed or JournalEntryPage-backed, no restriction) the page's content contributes to as a Block, instead of the page becoming its own standalone Node. This is a single per-page authoring-time choice, not a Relationship authored after the fact — settled this way over a `same-entity-as` symmetric `RelationshipDefinition` alternative specifically because Alberto judged the latter's per-fragment authoring burden overwhelming for a case (a Character or City assembled from several pages) that's common, not exceptional, in real campaign data. Retagging an already-synced standalone page as attached deletes its standalone Node; any Relationships already authored against it survive as dangling references (ADR-0007 point 8's existing answer, not a new one) and the GM is warned, non-blockingly, after the fact. No forced migration of the 61 pages already synced via STORE-003's backfill — attachment is opt-in and opportunistic only.

The two mechanics this ADR's Consequences named as open (idempotent Block-upsert-by-uuid, and cleaning up a stale Block reference after a detach/re-attach-elsewhere) are now resolved — DBA pass, ADR-0011's Amendment (2026-09-06): both are orchestration-layer logic plus a small Core `Node` helper, no `StorageProvider` schema or interface change. The detach-cleanup case deliberately keeps the architect's own "full scan over `listNodes()`" suggestion, run unconditionally on every sync (not gated), justified against Alberto's real Node count (~102 today) and the fact that `module-entry.ts`'s Hook wiring is already fire-and-forget, never blocking Foundry's UI.

---

## Open Questions

None.

---

# Relationship

A Relationship represents a fact connecting exactly two Nodes.

Relationships are first-class Knowledge Elements.

Relationships represent facts, not concepts.

---

## Additional Characteristics

- [x] Connects exactly two Nodes.
- [x] Has direction.
- [x] Can own Blocks.
- [x] Can contain history.
- [x] Can contain visibility rules.
- [x] Can store custom property values.

---

## Domain Invariants

- Every Relationship has exactly one origin Node.
- Every Relationship has exactly one target Node.
- Every Relationship has exactly one Relationship Definition.
- Every Relationship is directional.
- A Relationship cannot exist without both Nodes.
- A Relationship's origin and target must be two distinct Nodes (no self-relationships).

---

## Decisions

### Should every Relationship have an inverse?

Yes.

Inverse behavior should be defined by the corresponding Relationship Definition.

### Can Relationships connect more than two Nodes?

No.

Relationships should always connect exactly two Nodes.

Complex structures should be represented as multiple Relationships.

### Can Relationships connect to other Relationships as an endpoint?

No.

Relationships describe facts between Nodes; their origin and target must always be Nodes, not other Relationships. Relationships should not become graph nodes themselves.

This isn't just a structural rule for its own sake — it holds up because the needs that would seem to require it are already covered without it. A Relationship can record its own reasoning and history via its own History and Blocks (e.g. an alliance's History can note "broken after the betrayal of X" without a separate Relationship pointing at it), and cross-referencing another fact elsewhere in the graph is covered by the lightweight reference capability every Knowledge Element has (see the note in the Knowledge Element section above), not by a structural connection. A Relationship may still be lightly mentioned/referenced like any other Knowledge Element — it just can't be an endpoint of another Relationship.

### Does a Relationship Definition carry anything about query/traversal, beyond inverse, cardinality, symmetry and validation?

Yes — a `traversalCategory`, from a small, closed taxonomy (`location`, `affiliation`, `kinship`, `conflict`, `governance`, `participation`, `ownership`, `narrative`). It's a property of the Relationship Definition, not of each Relationship instance, so a taxonomy change stays bounded to a small number of Definitions. This is what lets a View select which connected Relationships to include without referencing concrete relationship types one by one. See `decisions/ADR-0007-relationship-view-traversal.md`.

### Can a Relationship survive the deletion of its origin or target Node?

Yes. Cascading the delete would silently destroy a historical fact just because one endpoint was removed, contradicting "History is Part of the World"; blocking the delete instead adds resolution friction the project doesn't need. A Relationship whose origin or target no longer resolves to an existing Node is simply excluded wherever current Nodes are expected (e.g. View traversal) — no special-case logic needed. This doesn't resolve the broader question of Node deletion policy (hard delete vs. archival), which stays open for whoever designs delete workflows. See ADR-0007. **This same answer is reused, not re-derived, by ADR-0011 for what happens to a Relationship when its endpoint page is retagged and its standalone Node is deleted (2026-09-06).**

### How does a GM delete a Relationship instance?

Via a new per-Node "Relationships…" list window in the Foundry Adapter (a `getHeaderControls*` button, same entry-point family as ADR-0009/ADR-0010), listing every Relationship touching that Node (`StorageProvider.getRelationshipsForNode`, 1-hop, no traversal-depth involved) with a per-row delete action gated by a native confirm dialog — a deliberate, reasoned exception to this project's usual warn-never-block posture, since a delete here is actually irreversible, unlike a cardinality conflict or a retag-orphaned Relationship. Deleting a Relationship never affects the two Nodes it connected (no cascade, no FK — ADR-0007 point 8 restated, not re-derived) and needs no `StorageProvider` change (`deleteRelationship` already existed, fully implemented). See `decisions/ADR-0013-relationship-deletion-ui.md` (2026-09-06).

### Can a Relationship connect a Node to itself (origin equals target)?

No.

No real campaign use case surfaced for a Node relating to itself, and allowing it would only put self-loops into Graph Views (ADR-0007) that add visual noise without carrying any meaning a Relationship is supposed to express. Anything genuinely self-referential about a single Node — an internal contradiction, a private history note — already has a home on that Node directly (its own History and Blocks), not a Relationship pointing back at itself. A straightforward instance-level constraint, not an ADR-level call; reversible later if a real use case ever needs it. Raised during CORE-003 review (2026-08-31).

---

## Open Questions

None.

---

# Definitions

Definitions describe reusable domain rules.

Definitions configure how Knowledge Elements behave.

Definitions are not Knowledge Elements.

Examples include:

- Relationship Definition
- Block Definition
- View Definition

---

## Domain Invariants

- Definitions never represent campaign knowledge.
- Definitions describe behavior, never instances.
- Definitions may evolve over time.

---

## Decisions

### Are Definitions immutable?

No.

Definitions should remain configurable.

Archivexus may provide predefined Definitions as templates, but users should always be able to customize or extend them.

### Can users extend Definitions?

Yes.

Extensibility is a fundamental design goal.

### Should Definitions be versioned?

Yes.

Versioning allows Definitions to evolve while preserving compatibility with existing campaign data.

### What concrete shape do a Relationship Definition's `inverse`, `cardinality` and `validation` take? (CORE-004)

Judgment calls made implementing CORE-004, since neither ADR-0007 nor this document's text settles them (only `traversalCategory`'s taxonomy is ADR-0007's actual decision) — recorded here so they're an explicit, revisitable choice rather than silently invented:

- `inverse` is a plain string label for the reverse direction (e.g. Definition `resides-in` has inverse `resident-of`), not a reference to another Relationship Definition.
- `cardinality` is a small closed enum: `one-to-one`, `one-to-many`, `many-to-one`, `many-to-many` — the same "small, slow-changing vocabulary describing behavior" reasoning ADR-0007 applies to `traversalCategory`.
- `validation` is an optional allow-list of Node types per endpoint (`allowedOriginTypes`/`allowedTargetTypes`); absent means no restriction, per the Optional Structure principle — a Definition is never blocked from existing because this ticket didn't anticipate its use case.

### Are there cross-field invariants between a Relationship Definition's `symmetry`, `inverse` and `cardinality`? (CORE-004)

Yes, two — reversible instance-level constraints, not ADR-level calls, same treatment as Relationship's "no self-relationships" rule:

- A symmetric Definition (forward and inverse describe the same fact, e.g. `ally-of`) must use the same label for both directions — `inverse` must equal `name`. A non-symmetric Definition must use a distinct `inverse` label, or it couldn't actually express asymmetry.
- A symmetric Definition cannot use an asymmetric cardinality (`one-to-many`/`many-to-one`): those shapes distinguish an origin-side count from a target-side count, which only makes sense when origin and target aren't interchangeable.

### Where do Relationship Definitions live, and how does a fresh world get a usable set? (CORE-004's deferred persistence fast-follow, 2026-09-08)

Real `StorageProvider` state, not a hardcoded list. CORE-004 implemented `RelationshipDefinition` as Core domain state but deliberately deferred persisting it (`resolveRelationshipDefinition` stayed a pure in-memory lookup, and the Foundry Adapter carried a temporary `SEEDED_RELATIONSHIP_DEFINITIONS` array). This ticket makes them persisted, editable state:

- `StorageProvider` gains `saveRelationshipDefinition` / `getRelationshipDefinition` / `deleteRelationshipDefinition` / `listRelationshipDefinitions`, backed by SQLite **migration 3**'s `relationship_definitions` table (every field a real column except the optional `validation` allow-list, which is a JSON column; PK is `id` alone, `version` a plain column; no FK from `relationships.definition_id` — same no-cascade reasoning as every other cross-table reference, ADR-0007 point 8: a Relationship with a since-deleted Definition still exists, it just renders uncategorized).
- The default vocabulary — a starter set covering all 8 `traversalCategory` values — lives in **Core** (`src/core/domain/relationship-definitions-default.ts`, `DEFAULT_RELATIONSHIP_DEFINITIONS`), because relationship vocabulary is domain content, not a platform concern. The Foundry Adapter seeds it into an **empty** store on the `ready` hook (`bootstrapRelationshipDefinitions`) — idempotent by "is the store empty", so a GM's customized set is never re-clobbered. The exact default list, its labels and every cardinality/validation choice are flagged judgment calls to be adjusted in place, not a contract.
- A GM authors and edits Definitions through the **Relationship Types editor** (ADAPT-014, issue #66, 2026-09-08) — a small `ApplicationV2` (`relationship-definition-editor-window.ts`) launched from the Codex sidebar toolbar: list / add / edit / delete, with `createRelationshipDefinition`'s cross-field invariants surfaced as an inline validation message rather than a silent failure. Editing bumps `version` in place (no historical rows — that's the migration question, still open). A new type's `id` is a slug of its name; deleting one doesn't cascade (existing Relationships render uncategorized until re-pointed). Superseded the console-only escape hatch on the module `api`.
- **Deliberately still open**: Definition **version migration** (see this section's Open Question) — since an existing store is never re-seeded, a later module release adding defaults won't reach an existing world.

---

## Open Questions

How should Definition version migration be handled? (Unchanged by CORE-004's persistence fast-follow — the `version` field is now persisted, but a store that already has definitions is never re-seeded, so migrating an existing world's definitions when a module release changes the defaults is still unsolved.)

---

# View

A View is a Knowledge Element: a first-class, persisted projection of existing knowledge for a specific format and audience. Views never own or duplicate knowledge (see `01_ARCHITECTURE.md`) — a View's own content is its format, its Visibility scope, and however it selects or arranges the Knowledge Elements it projects; the underlying knowledge itself still lives only in the Nodes and Relationships it references.

View is a third kind of Knowledge Element, alongside Node and Relationship (see Domain Hierarchy above) — it fits neither: it doesn't represent a standalone campaign concept the way a Node does, and it doesn't connect exactly two Nodes the way a Relationship does. As with Relationships and their Relationship Definitions, a **View Definition** (see `Definitions` below) describes a reusable format (e.g. "Timeline"), while a **View** is the saved instance a GM or player actually creates and names — using an Archivexus-internal identifier per ADR-0001, since it's an Archivexus-native concept with no Foundry document of its own. See ADR-0005.

---

## Additional Characteristics

- [x] Has a format (e.g. Timeline, Graph, Tree, Table, Map).
- [x] Has Visibility, like every Knowledge Element — this alone determines its audience (GM-only, specific players, everyone). A separate "GM View / Player View / Public View" vocabulary isn't needed.
- [x] Is generated from one or more Knowledge Elements; stores no knowledge of its own.
- [x] Can be saved and revisited (e.g. a GM's manually arranged Graph layout, or a curated Timeline of two kingdoms' history).

---

## Domain Invariants

- A View never modifies the Knowledge Elements it projects.
- A View's content is always derivable from current Knowledge Elements plus its own Visibility scope.
- Format and audience are independent properties of a View: format is what it renders as, audience is its Visibility.

---

## Decisions

### Is View a Knowledge Element, a Definition-driven object, or a stateless projection with no identity?

A Knowledge Element.

GMs need to save and revisit curated views (e.g. "the major political factions of the kingdom", or "historical events of two kingdoms, arranged chronologically") rather than recompute them from scratch every time. That requires identity, history and Visibility — exactly what Knowledge Element already provides. See ADR-0005.

### Are format and audience independent properties, or fixed named combinations?

Independent. Format (Timeline/Graph/Tree/Table/Map) and audience are orthogonal — audience isn't a separate concept at all, it's just the View's own Visibility.

### Should a saved/customized View be persisted, and if so where?

Yes — as a Knowledge Element instance, with an Archivexus-internal identifier (per ADR-0001, since a View has no corresponding Foundry document).

### How does a View select which connected Relationships/Nodes to include when generated or expanded (e.g. clicking a Node in a Graph View)?

A declarative spec on the View, expressed in Relationship Definition's `traversalCategory` vocabulary plus a depth, resolved by a Core Query API — never a per-View-format traversal implementation, never a general query language. For the MVP, the GM only ever picks among 3 fixed presets ("Direct only" — 1 hop, every category; "Everything connected" — composed traversal to depth 2; "Curated by me" — manual per-Node curation starting from "Direct only"), not open per-category config. Because the spec is declarative and re-evaluated against current Knowledge Elements, this satisfies the "always derivable" Domain Invariant above with no extra effort; a saved expand/collapse arrangement is presentation metadata over that derivable content, not additional knowledge, so it doesn't strain the invariant either. See `decisions/ADR-0007-relationship-view-traversal.md`.

### Before the real graph canvas (VIEW-001) exists, is there an interim way to actually see a Node's connections?

Yes — `decisions/ADR-0012-node-connections-panel.md` (2026-09-06): a narrow, Foundry-Adapter-side "Connections" panel (`getHeaderControls*` entry point, same mechanism as ADR-0009/ADR-0010, plus a dedicated `ApplicationV2` window like ADR-0010's), showing only the "Direct only" preset grouped by `traversalCategory`, with no View persistence of its own — every open recomputes fresh from current storage. This is deliberately a separate, smaller ticket (proposed `ADAPT-011`) than VIEW-001, not a first slice of it: VIEW-001 still owns the real graph/canvas rendering, "Everything connected"'s mandated cluster grouping, "Curated by me," and any persisted View arrangement. ADR-0012 also gives the first concrete answer to this section's content-prominence Open Question below, scoped to this one panel.

### What does the graph View actually render with, where does it live in Foundry's UI, and what does it show with no Node selected? (VIEW-001)

`decisions/ADR-0014-graph-view-sidebar-tab.md` (2026-09-08): a first-level Foundry sidebar tab (not a per-sheet panel, not a floating window) registered via Foundry's own native `CONFIG.ui.sidebar.TABS`, rendering Cytoscape.js. With no Node selected it shows the whole current graph (every Node/Relationship in storage) rather than one of this section's three presets, since all three assume a queried root Node already exists — clicking any Node inside that overview then applies the existing presets, same as ADR-0012's panel does from a sheet. Also gives `View` its first real Core shape (new ticket, CORE-006, decoupled from VIEW-001's own Adapter/UI implementation): composed on `KnowledgeElement` like Node/Relationship, `format: 'graph'` (a plain closed-union of one value for now — same "don't build a registry for a single case" reasoning as `NodeType`'s own plain-string decision), and a declarative `spec` (preset + root Node id, plus a curated Relationship-id list and an optional saved node-position layout for "Curated by me" only) — satisfying the "always derivable" invariant above the same way this section's traversal-selection Decision already does.

**Implemented (CORE-006, 2026-09-08):** `src/core/domain/view.ts` — `View extends KnowledgeElement` with `kind: 'view'`, `format: 'graph'` (`VIEW_FORMATS`, a plain closed-union of one value), and `spec: GraphViewSpec` (the discriminated union above: derived presets carry only preset + `rootNodeId`; `curated-by-me` additionally carries a de-duplicated `relationshipIds` list and an optional `layout` of finite `{x, y}` positions). `createView`/`isView`/`isGraphViewSpec` follow `createNode`/`createRelationship`'s validating-factory style; `GRAPH_VIEW_PRESETS` is kept in sync with CORE-005's `TRAVERSAL_PRESETS` by convention (no `core/domain` → `core/query` dependency). `StorageProvider` gained `saveView`/`getView`/`deleteView`/`listViews`, backed by SQLite migration 2's `views` table (JSON-encoded `spec`, no FK — same no-cascade reasoning as `relationships`).

**Redesigned after a live test (ADR-0014 Amendment, 2026-09-08):** the graph moves out of the sidebar into a standalone popout window; the sidebar tab becomes a node navigator; a Node's *attached content* (its Blocks) surfaces in a new Inspector panel, not on the graph canvas. `GraphViewSpec` is **unchanged** by this — the redesign is entirely Adapter-side (favourites live in Foundry per-user flags, not Core state). Two visibility layers compose: `View.visibility` gates whether a viewer can open a saved View at all; within a View they can open, node-level `hidden`-filtering (ADR-0003) still applies. See the Amendment's A2b/A4/A6.

---

## Open Questions

Which attribute (if any) orders results within a large same-category cluster (e.g. which of 40 residents shows first, before a "+36 more")? Partially resolved for the interim Connections panel by `decisions/ADR-0012-node-connections-panel.md`: degree-descending (the connected Node's own total relationship count elsewhere in the graph), alphabetical tiebreak. Still open for VIEW-001's own fuller case: manual drag-to-reorder plus persisting that arrangement, which needs a real View instance to save into (`decisions/ADR-0014-graph-view-sidebar-tab.md`'s CORE-006/VIEW-001b split names where that lands).

---

# Outstanding Questions

One open item — see View's own Open Questions section: which attribute orders results within a large same-category cluster. Not blocking (traversal itself is fully resolved by ADR-0007); deferred to whoever implements the View/UI layer.

Resolved this round (2026-08-27):

- Which concepts should be represented as Nodes instead of other Knowledge Elements? → See Node's Decisions (Foundry Journal mapping).
- Are Blocks attached to every Knowledge Element? → See Knowledge Element's Decisions (optional).
- Should Knowledge Elements expose capabilities directly or through composable behaviors? → See Knowledge Element's Decisions (directly).
- Is View a first-class domain object, or a pure projection with no identity of its own? → See View's Decisions and ADR-0005 (first-class Knowledge Element).
- How should a Knowledge Element be handled once its linked Foundry document is deleted? → Already resolved by `decisions/ADR-0004-orphaned-elements-relink.md`; this entry was stale and is now removed.

Resolved this round (2026-08-30):

- What mechanism governs which connected Relationships/Nodes a View selects when generated or expanded? → See Relationship's and View's Decisions sections, and `decisions/ADR-0007-relationship-view-traversal.md`.

Resolved this round (2026-09-06):

- Should a JournalEntryPage always become its own Node, with no way to unify several fragments describing one concept? → See Node's Decisions ("Can a JournalEntryPage attach itself to another Node instead of becoming its own Node?") and `decisions/ADR-0011-journal-entry-page-node-attachment.md`.
- Before VIEW-001's full graph canvas exists, is there an interim way to actually see a Node's connections, and does ADR-0011 change what that interim surface needs to handle? → See View's Decisions ("Before the real graph canvas (VIEW-001) exists...") and `decisions/ADR-0012-node-connections-panel.md`. Also gives a first concrete (though scoped) answer to View's own content-prominence-ordering Open Question.
