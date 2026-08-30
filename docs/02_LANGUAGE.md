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
- Quest
- Item
- Vehicle
- Event
- Lore
- Puzzle

> **Note on Foundry Journals:** a Foundry `JournalEntry` is not itself an Archivexus domain concept — it's a Foundry-native container of pages. The Foundry Adapter maps each `JournalEntryPage` to a Node, typed via an explicit GM-set flag naming what it represents (e.g. a page about a kingdom gets flagged as `Kingdom`) rather than inferred from the page's content — Adapters carry no business logic (see `01_ARCHITECTURE.md`'s Adapters section). Pages without an explicit type become a `Lore` Node. See `03_DOMAIN_MODEL.md`'s Node Decisions.

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
- traversal category (which View traversal groups this relationship type belongs to — see `03_DOMAIN_MODEL.md`'s Relationship Decisions and `decisions/ADR-0007-relationship-view-traversal.md`)

---

# Block

A Block is a modular unit of content.

Blocks may be attached to Knowledge Elements.

The exact role of Blocks within the domain model is defined separately in
`03_DOMAIN_MODEL.md`.

---

# View

A View is a Knowledge Element: a first-class, persisted projection of existing knowledge for a specific format and audience. It presents existing knowledge without owning or duplicating it.

A View is not a Node and not a Relationship — it is a third kind of Knowledge Element (see `03_DOMAIN_MODEL.md`'s Domain Hierarchy and ADR-0005).

Format and audience are independent properties of a View:

- Format — what shape it renders as: Timeline, Graph, Tree, Table, Map.
- Audience — expressed through the View's own Visibility (`hidden`, `visible`, `owned`), the same Visibility every Knowledge Element has. A separate "GM View / Player View / Public View" vocabulary isn't needed.

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