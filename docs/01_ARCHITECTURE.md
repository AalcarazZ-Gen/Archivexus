# 01_ARCHITECTURE

> This document describes the high-level architecture of Archivexus.
>
> It intentionally avoids implementation details. Concrete technical decisions
> are documented separately in the Architecture Decision Records (ADRs).

---

# Philosophy

Archivexus is a knowledge engine.

Its purpose is not to store documents, but to represent information as a
connected graph of knowledge that can be explored, queried and visualized.

Every platform integration (Foundry, Obsidian, Web, CLI, etc.) interacts with
the same conceptual model.

---

# Architecture Overview

                +--------------------+
                |    Applications    |
                +--------------------+
                 /        |        \
                /         |         \
        Foundry VTT   Obsidian   Future Clients
                \         |         /
                 \        |        /
                 +----------------+
                 |    Adapters    |
                 +----------------+
                         |
          +-------------------------------+
          |       Archivexus Core         |
          |-------------------------------|
          | Domain Model                  |
          | Graph Engine                  |
          | Business Rules                |
          | Query API                     |
          +-------------------------------+
                         |
                 +----------------+
                 |    Storage     |
                 +----------------+

The Core is platform-agnostic.

No external application should define the domain model.

---

# Core Concepts

## Knowledge Elements

Knowledge Elements are the base abstraction of Archivexus.

Every managed piece of knowledge derives from a Knowledge Element.

Current domain concepts include:

- Nodes
- Relationships
- Views

Future domain concepts should derive from the same abstraction unless there is a compelling architectural reason not to. 

---

## Relationships

Relationships are first-class Knowledge Elements, directional by default. Directionality is a domain concern, not a visualization concern — bidirectional behavior should be expressed through Relationship Definitions.

For full characteristics, invariants and decisions, see `03_DOMAIN_MODEL.md`.

Example:

```
Character
    │
    ├── member_of
    ▼
Organization
```

---

## Blocks

Blocks are modular units of content attached to Knowledge Elements. Knowledge Elements may own zero or more Blocks — Blocks are optional, not mandatory — letting Nodes, Relationships and Views share the same content system.

See `03_DOMAIN_MODEL.md`'s Knowledge Element Decisions.

---

# Definitions

Definitions describe configurable domain concepts.

Rather than hardcoding relationship types, block types or view types, Archivexus allows them to be defined independently from their instances.

Examples include:

- Relationship Definitions
- Block Definitions
- View Definitions

Definitions describe behavior.

Knowledge Elements represent instances of knowledge.

---

## Views

A View is a Knowledge Element — a saved projection of existing knowledge for a specific format and audience (see `03_DOMAIN_MODEL.md` and ADR-0005).

Format examples:

- Timeline
- Graph
- Tree
- Table
- Map

Views never duplicate knowledge.

Views never modify the underlying knowledge.

They only present it differently.

---

# Layered Architecture

```
Applications

↓

Adapters

↓

Core

↓

Storage
```

## Applications

User-facing software.

Examples:

- Foundry VTT
- Obsidian
- Web UI

---

## Adapters

Adapters translate platform-specific data into Archivexus concepts.

Adapters should contain no business logic.

---

## Core

The Core contains:

- domain model
- validation
- graph operations
- business rules
- query engine

Everything else depends on the Core.

The Core depends on nothing.

---

## Storage

Storage is replaceable.

Primary storage engine: **embedded SQLite**, compiled to WASM and running inside the client (`@sqlite.org/sqlite-wasm`, `opfs-sahpool` VFS, with an IndexedDB-backed or `sql.js`-based fallback where OPFS isn't usable) — decided in `decisions/ADR-0008-storage-provider.md`, which also covers standalone/external-consumer reachability: a deliberate, user-triggered export producing a generated JSON snapshot (not a copy of the SQLite file), never a live or continuous sync.

Other engines considered and not chosen: Foundry Flags, plain JSON as the primary store, IndexedDB as the primary store, PostgreSQL — see ADR-0008's Alternatives Considered for why. JSON remains the documented fallback primary store if the WASM/OPFS mechanics prove unworkable inside Foundry's client sandbox (unverified as of ADR-0008 — see its point 8).

This is the canonical description of Archivexus's storage — other documents (`02_LANGUAGE.md`, `README.md`) should point here instead of repeating it.

Changing storage must not affect the Core.

---

# Design Principles

## Platform Independent

The Core should never depend on Foundry or any other platform.

## Knowledge over Documents

Documents are delivery mechanisms.

Knowledge is the domain.

Archivexus models knowledge independently from how that knowledge is stored,
rendered or consumed.

Actors, Journals, Scenes, Maps and future integrations are simply different
ways of exposing the same underlying knowledge.

Knowledge should never be duplicated to satisfy a specific presentation.

Instead, different representations should be generated from the same source of
truth whenever possible.

---

# Domain Ownership

Archivexus defines its own domain language.

External platforms should adapt to Archivexus.

Archivexus should never adapt its domain model to fit a specific platform.

The Core owns the domain.

Adapters own integrations.

---

## Extensible

New element types should not require architectural changes.

---

## Data First

Knowledge belongs to the graph.

Views are generated from knowledge.

---

## Composition over Specialization

Small reusable components are preferred over specialized objects.

---

## Explicit Relationships

Connections between knowledge should always be represented explicitly.

---

# Out of Scope

This document intentionally does not define:

- APIs
- File formats
- Database schemas
- UI components
- Rendering
- Storage implementations

Those topics belong in ADRs or implementation documentation.

---

# Related Documents

- 00_VISION.md
- 02_LANGUAGE.md
- 03_DOMAIN_MODEL.md
- docs/decisions/