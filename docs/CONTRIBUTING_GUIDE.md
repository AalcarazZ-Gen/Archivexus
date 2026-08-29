# Project Rules

These rules exist to preserve the architectural integrity of Archivexus.

---

## Rule 1

Architecture before implementation.

---

## Rule 2

Every significant architectural decision must have an ADR.

A smaller domain decision may instead live as a short Decision entry inside `03_DOMAIN_MODEL.md` — reserve a full ADR for decisions that need their own context and consequences to be understood (see `docs/decisions/README.md`).

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

---

## Rule 11

Work happens on a feature branch, never directly on the trunk branch. Rebase against trunk to stay current instead of merging it in. Squash before merging back, so the trunk only records intent-sized changes.

Full detail (branch naming, when force-pushing is fine, how this scales with project type) lives in the `## Git workflow` section of the `software-developer` and `dba` agent definitions in `.claude/agents/` — this rule is what makes it binding, not just a per-agent habit.