# ADR-0002

## Title

Treat Nodes and Relationships as first-class Knowledge Elements.

---

## Status

Accepted

---

## Context

Traditional graph implementations usually consider nodes as first-class entities while relationships are treated as lightweight edges.

Archivexus requires relationships to support:

- Visibility
- Metadata
- History
- Custom properties

Therefore relationships cannot be represented as simple graph edges.

---

## Decision

Both Nodes and Relationships are Knowledge Elements.

They share common capabilities and lifecycle.

---

## Consequences

### Advantages

- Relationships can evolve independently.
- Relationships can be revealed independently.
- Rich relationship metadata.
- Future extensibility.

### Disadvantages

- Slightly more complex implementation.

---

## Alternatives Considered

- Lightweight graph edges.
- Embedded relationships inside nodes.