# ADR-0001

## Title

Use Foundry UUIDs as primary identifiers.

---

## Status

Accepted

---

## Context

Initially Archivexus considered generating its own identifiers for every imported Foundry document.

This would require maintaining a mapping layer between internal identifiers and Foundry UUIDs.

---

## Decision

Archivexus will use Foundry UUIDs as the primary identifier for any element that already exists inside Foundry.

Internal identifiers will only be generated for Archivexus-native concepts.

Examples:

- Relationships
- Relationship Definitions
- Views
- Future internal objects

---

## Consequences

### Advantages

- No synchronization layer.
- Direct navigation to Foundry documents.
- Less duplicated data.
- Better interoperability.

### Disadvantages

- Dependency on Foundry UUID stability.

---

## Alternatives Considered

- Internal UUIDs for every object.