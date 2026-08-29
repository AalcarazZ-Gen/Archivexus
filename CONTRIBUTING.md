# Contributing to Archivexus

First of all, thank you for your interest in contributing to Archivexus.

The project is currently in its early architecture phase.

At this stage, consistency is more important than speed.

---

# Philosophy

Before writing code, understand the architecture.

Archivexus is designed around concepts rather than implementations.

Please read the documentation inside `/docs` before opening a Pull Request.

Recommended reading order:

1. 00_VISION.md
2. 02_LANGUAGE.md
3. 01_ARCHITECTURE.md
4. 03_DOMAIN_MODEL.md

---

# Development Process

New ideas should follow this workflow:

Idea

↓

Discussion

↓

RFC (if needed)

↓

ADR (if accepted)

↓

Implementation

Not every idea should become code immediately.

---

# Pull Requests

Pull Requests should:

- Be focused on a single topic.
- Include documentation updates when necessary.
- Include tests whenever applicable.
- Follow the existing architecture.

---

# Architecture First

Large architectural changes should be discussed before implementation.

Architecture Decision Records (ADRs) should be added whenever a significant design decision is made.

---

# Coding Standards

- TypeScript
- ESLint
- Prettier
- Vitest — tests are colocated with what they test, as `*.test.ts` next to the source file (not a separate top-level `tests/` folder).

---

Thank you for helping preserve the memory of every world.