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

```
                 +----------------+
                 |   User Tools   |
                 +----------------+
                  /      |       \
                 /       |        \
        Foundry VTT   Obsidian    Future Clients
               \          |          /
                \         |         /
                 +----------------+
                 | Archivexus API |
                 +----------------+
                         |
              +----------------------+
              | Knowledge Graph Core |
              +----------------------+
                 |              |
         Knowledge Elements   Relationships
```

The Core is platform-agnostic.

No external application should define the domain model.

---

# Core Concepts

## Knowledge Elements

Knowledge Elements are the fundamental unit of information.

Examples include:

- Character
- NPC
- Location
- Item
- Event
- Session
- Organization
- Quest

Every element has:

- an identifier
- a type
- metadata
- content
- relationships

The Core does not impose a fixed list of element types.

---

## Relationships

Relationships connect Knowledge Elements.

Relationships are first-class objects.

They may contain:

- metadata
- timestamps
- references
- provenance

Examples:

```
Character
    │
    ├── member_of
    ▼
Organization
```

```
Character
    │
    ├── killed
    ▼
Monster
```

---

## Blocks

Knowledge is composed of blocks.

Blocks are reusable units of structured content.

Examples:

- Rich text
- Images
- Tables
- Maps
- Stat blocks
- References

The Core understands blocks conceptually.

Individual platforms decide how blocks are rendered.

---

## Views

Views are projections of the same data.

Examples:

- Journal page
- Timeline
- Graph
- Tree
- Map
- Table

Views never duplicate knowledge.

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

Everything else depends on the Core.

The Core depends on nothing.

---

## Storage

Storage is replaceable.

Possible implementations include:

- JSON
- IndexedDB
- SQLite
- PostgreSQL

Changing storage must not affect the Core.

---

# Design Principles

## Platform Independent

The Core should never depend on Foundry or any other platform.

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
- docs/decisions/