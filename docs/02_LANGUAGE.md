# 02_LANGUAGE

This document defines the official terminology used throughout Archivexus.

These definitions describe the project's ubiquitous language and should remain
independent from any implementation, platform or storage technology.

---

# Knowledge Element

The base abstraction of Archivexus.

Every managed piece of knowledge derives from a Knowledge Element.

Knowledge Elements share a common set of capabilities defined by the domain model.

See `03_DOMAIN_MODEL.md` for details.

---

# Visibility

Visibility determines which audience can perceive a Knowledge Element or a specific View of it. It is one of the Common Characteristics every Knowledge Element has (see `03_DOMAIN_MODEL.md`).

Archivexus defines Visibility as its own concept, independent of any single platform's permission model. Per the Domain Ownership principle in `01_ARCHITECTURE.md`, a platform's native permission system is translated into Visibility by that platform's Adapter, not the other way around.

Levels (see `decisions/ADR-0003-visibility-model.md`):

- `hidden` — visible only to the GM.
- `visible` — visible to players, but not editable by them.
- `owned` — visible and editable by whoever holds ownership (GM or a delegated player).

The Foundry Adapter maps Foundry's per-user ownership levels onto these: `NONE` → `hidden`, `LIMITED` → `hidden` (Foundry's `LIMITED` only exposes a Journal Entry's title and its position on a map, not its actual content, so from Archivexus's content-level point of view it is still effectively hidden), `OBSERVER` → `visible`, `OWNER` → `owned`.

---

# Node

A Node represents an entity with its own identity inside the campaign's
knowledge model.

Nodes exist independently.

Examples include:

- Character
- Creature
- City
- Kingdom
- Organization
- Event
- Quest
- Journal
- Puzzle

---

# Relationship

A Relationship represents knowledge connecting two Nodes.

Relationships are first-class Knowledge Elements.

Relationships may contain their own metadata, visibility, history and custom
properties.

Relationships are directional by default.

---

# Relationship Definition

A Relationship Definition describes the behavior of a relationship type.

Rather than hardcoding relationship semantics, Archivexus models them as
configurable definitions.

Examples include:

- inverse relationship
- cardinality
- symmetry
- validation rules

---

# Block

A Block is a modular unit of content.

Blocks may be attached to Knowledge Elements.

The exact role of Blocks within the domain model is defined separately in
`03_DOMAIN_MODEL.md`.

---

# View

A View is a projection of knowledge.

Views present existing knowledge without owning or duplicating it.

Examples include:

- GM View
- Player View
- Public View
- Timeline
- Graph
- Tree
- Table

---

# Adapter

An Adapter translates an external platform into Archivexus concepts.

Adapters are responsible for integration only.

They should not contain domain logic.

The first Adapter targets Foundry VTT.

Future Adapters may support additional platforms.

---

# Storage Provider

A Storage Provider is responsible for persisting Archivexus data.

The Core remains independent from any storage implementation.

See the Storage section of `01_ARCHITECTURE.md` for the current list of possible implementations — kept there as the single source of truth instead of duplicated here.

---

# Definition

A Definition describes the behavior of configurable domain concepts.

Definitions describe rules.

Knowledge Elements represent instances.

Examples include:

- Relationship Definition
- Block Definition
- View Definition

Future Definition types may be introduced without changing the Core domain.