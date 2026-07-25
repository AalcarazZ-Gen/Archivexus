# Archivexus Language

This document defines the official terminology used throughout Archivexus.

These definitions are architectural concepts and should remain independent from Foundry VTT or any future integrations.

---

# Knowledge Element

The base abstraction of Archivexus.

Every piece of managed knowledge derives from a Knowledge Element.

Examples include:

- Nodes
- Relationships
- Relationship Definitions
- Views
- (Future concepts)

Knowledge Elements share common capabilities such as identity, visibility, history and metadata.

---

# Node

A Node represents any entity with its own identity inside the campaign's knowledge model.

Examples:

- Character
- Creature
- City
- Kingdom
- Event
- Organization
- Quest
- Journal
- Puzzle

Nodes exist independently.

---

# Relationship

A Relationship represents knowledge connecting two Nodes.

Relationships are first-class elements.

They may contain their own metadata, visibility rules, history and custom properties.

Examples:

- Parent Of
- Friend Of
- Member Of
- Works For
- Located In

---

# Relationship Definition

Defines the behavior of a relationship type.

Examples:

- inverse relationship
- cardinality
- symmetry
- validation rules

---

# View

A View represents a projection of knowledge.

Examples:

- GM View
- Player View
- Public View
- Timeline
- Graph

Views never own data.

They only represent it.

---

# Adapter

Responsible for translating external systems into Archivexus concepts.

The first adapter will target Foundry VTT.

Future adapters may support other platforms.

---

# Storage Provider

Responsible for persisting Archivexus data.

Examples:

- Foundry Flags
- SQLite
- PostgreSQL

The Core should remain storage agnostic.