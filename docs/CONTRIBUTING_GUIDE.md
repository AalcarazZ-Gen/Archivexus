# Project Rules

These rules exist to preserve the architectural integrity of Archivexus.

---

## Rule 1

Architecture before implementation.

---

## Rule 2

Every significant architectural decision must have an ADR.

---

## Rule 3

Foundry is an adapter.

Archivexus Core must remain platform agnostic whenever possible.

---

## Rule 4

Avoid duplicate sources of truth.

Knowledge should exist only once.

---

## Rule 5

Prefer composition over inheritance.

---

## Rule 6

Every feature should answer the guiding question:

"Does this help preserve the memory of the world?"

If not, reconsider its place inside Archivexus.

---

## Rule 7

Optimize for extensibility before optimization.

---

## Rule 8

Documentation is part of the implementation.

Code without documentation is considered incomplete.

---

## Rule 9

When in doubt, favor simplicity.

---

## Rule 10

The Core should never depend directly on Foundry-specific concepts unless absolutely necessary.