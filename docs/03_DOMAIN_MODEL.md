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
└── Relationship
       Represents a fact connecting concepts

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
- Event
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

A View is a projection of existing knowledge for a specific audience and/or format. Views never own or duplicate knowledge (see `01_ARCHITECTURE.md`).

Whether View is itself a Knowledge Element, a Definition-driven object, or a purely computed projection with no persistent identity is not yet decided — see Open Questions below.

---

## Additional Characteristics (draft)

- [ ] Has a format (e.g. Timeline, Graph, Tree, Table, Map, Journal page).
- [ ] Has a Visibility scope: who it is rendered for (GM, specific players, all players, public).
- [ ] Is generated from one or more Knowledge Elements; stores no knowledge of its own.

---

## Domain Invariants (draft)

- A View never modifies the Knowledge Elements it projects.
- A View's content is always derivable from current Knowledge Elements plus its Visibility scope.

---

## Open Questions

- Is View a Knowledge Element (with identity, history, etc.), a Definition-driven object, or a purely computed projection with no persistent identity of its own?
- Are format (Timeline/Graph/Tree/...) and audience (GM/Player/Public) independent, orthogonal properties of a View, or fixed named combinations? `02_LANGUAGE.md` and `01_ARCHITECTURE.md` currently give two different example lists that mix both without distinguishing them.
- Should a saved/customized View (e.g. a GM's personally arranged Graph layout) be persisted, and if so, where?

---

# Outstanding Questions

The following questions remain intentionally unresolved.

A question should only disappear after the domain has reached consensus or an ADR has been accepted.

- Are Blocks attached to every Knowledge Element?
- Which concepts should be represented as Nodes instead of other Knowledge Elements?
- Should Knowledge Elements expose capabilities directly or through composable behaviors?
- Is View a first-class domain object, or a pure projection with no identity of its own?
- How should a Knowledge Element be handled once its linked Foundry document is deleted (e.g. a rebuilt character sheet)? See `decisions/ADR-0004-orphaned-elements-relink.md`.