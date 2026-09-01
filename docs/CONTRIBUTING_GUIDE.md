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

Branch naming follows whatever convention the repo already uses (`feat/…`, `fix/…`, `chore/…`, `docs/…`); default to `feat/<short-kebab-description>` / `fix/<short-kebab-description>` if none exists yet. Force-pushing your own feature branch after a rebase/squash is expected and fine; never force-push a shared/trunk branch, or one someone else might also be on, without checking with them first. Calibrate the ceremony to the project type in `docs/PROJECT.md` — a one-line fix on a personal project can still be a short-lived branch and back without fanfare.

Applies to any role whose tools include `Bash`; `architect.md` deliberately has no `## Git workflow` section since it has `Write` but no `Bash`, so it has no way to execute the workflow itself. `.claude/agents/software-developer.md`, `dba.md` and `qa-tester.md` each carry a `## Git workflow` section mirroring this rule for Claude Code sessions — this rule is the source of truth, not those files, since `.claude/agents/` is local-only tooling (untracked in git) that isn't guaranteed to exist for every contributor.

---

## Rule 12

Don't leave scratch, experimental, or throwaway artifacts (temp directories, one-off copies made to test something in isolation) lying around outside version control once a session ends. Delete them, or — if genuinely worth keeping — say so explicitly in `docs/SESSION_LOG.md`'s "Still informal / not yet formalized" section, with what it is and why. A directory nobody can explain from the docs is a bug, not a backup. Applies especially to a task retried under several different working names — consolidate into one attempt or one documented decision instead of leaving each retry its own permanent trace.