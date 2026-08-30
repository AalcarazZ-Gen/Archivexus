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

A Foundry `JournalEntry` is a Foundry-native container of `JournalEntryPage` documents; the container itself is a storage detail, not an Archivexus domain concept (see `01_ARCHITECTURE.md`'s "Knowledge over Documents" principle). The Foundry Adapter maps each page with distinct semantic content to its own Node, using that page's own Foundry UUID per ADR-0001. The Node's type comes from an explicit GM-set flag naming what the page represents, not from inferring it out of the page's content — Adapters carry no business logic (`01_ARCHITECTURE.md`'s Adapters section). Pages without an explicit type become a generic `Lore` Node.

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

Yes. Cascading the delete would silently destroy a historical fact just because one endpoint was removed, contradicting "History is Part of the World"; blocking the delete instead adds resolution friction the project doesn't need. A Relationship whose origin or target no longer resolves to an existing Node is simply excluded wherever current Nodes are expected (e.g. View traversal) — no special-case logic needed. This doesn't resolve the broader question of Node deletion policy (hard delete vs. archival), which stays open for whoever designs delete workflows. See ADR-0007.

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

---

## Open Questions

How should Definition version migration be handled?

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

---

## Open Questions

Which attribute (if any) orders results within a large same-category cluster (e.g. which of 40 residents shows first, before a "+36 more")? Not resolved by ADR-0007 — deferred to whoever implements the View/UI layer.

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