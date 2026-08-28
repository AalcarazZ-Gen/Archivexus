# Session Log

> A running log of work sessions on Archivexus. This is not where domain reasoning lives — that belongs in `decisions/` (ADRs) and `03_DOMAIN_MODEL.md`'s per-concept Decisions sections. This file is a quick record of what a session covered, what actually got formalized into `docs/` or the board, and what's still an informal understanding that hasn't been written down anywhere durable yet. Read this first when picking work back up after a gap — it's the fastest way to avoid re-deriving context that was already captured, or losing context that wasn't.
>
> One entry per session, newest first. Keep entries short (a few lines each) — anything long enough to need its own structure probably belongs in an ADR or a Decision entry instead, with just a pointer left here.

---

## 2026-08-28 (reviewer round 2)

**Discussed:** Second reviewer pass on the architect/dba rollout, applying its findings as software-developer.

**Formalized:** `agents-core/agents/product-owner.md`'s "What NOT to do" split into code decisions (Software Developer) vs. cross-cutting architecture decisions (Architect) — was still attributing both to Software Developer. `agents-core/agents/software-developer.md`'s frontmatter `description` (the auto-invocation trigger) narrowed to feature-level technical options, pointing to `architect` for cross-cutting system design instead of leaving it unscoped. Both re-copied here.

**Still informal / not yet formalized:** Same as previous entries — storage engine(s) and local/remote sync model for Archivexus are still undecided.

---

## 2026-08-28 (later)

**Discussed:** Reviewer audit of yesterday's architect/dba rollout, and applying its findings as software-developer.

**Formalized:** `agents-core/agents/software-developer.md` updated — its architecture-options deliverable mode and ADR responsibility now scope to feature-level decisions and explicitly hand off cross-cutting shape to the Architect and schema/storage/migration design to the DBA (its "What NOT to do" list updated to match); re-copied here. `agents-core/README.md` fixed (file counts, invocation examples for architect/dba, brainstorm-mode and reviewer-mode sections now include them). This repo's `CHANGELOG.md` [Unreleased] entry updated to mention the architect/dba/reviewer additions. Root `README.md`'s Repository Structure fixed (`LICENSE.md` → `LICENSE`, matching the actual file).

**Still informal / not yet formalized:** Same as previous entry — storage engine(s) and local/remote sync model for Archivexus are still undecided; that's the architect/DBA work still ahead once implementation reaches the storage stage.

---

## 2026-08-28

**Discussed:** Two new generic roles added to `agents-core` (and copied here): `architect.md` (Tech Lead / Software Architect — owns cross-cutting system shape: local/remote sync model, service boundaries, release/versioning; hands off implementation to software-developer and concrete schema/migration work to the DBA) and `dba.md` (Database Administrator — owns schema, queries, migrations, and sync/consistency mechanics, without letting storage leak back into the Core). Motivated by the upcoming project needing local-network + remote-DB-sync + release-process design discussions, and by not wanting to depend 100% on Foundry Flags for storage here (per `01_ARCHITECTURE.md`'s Storage section — Foundry Flags is one of several replaceable storage candidates, not a given).

**Formalized:** `agents-core/agents/architect.md`, `agents-core/agents/dba.md` created; `agents-core/README.md` and `agents/reviewer.md` updated to reference both new roles (role list, file tree, review-output grouping). `.claude/agents/` in this repo updated with `architect.md`, `dba.md`, and the refreshed `reviewer.md`.

**Still informal / not yet formalized:** Which storage engine(s) Archivexus will actually use, and the local/remote sync model — that's exactly what the new architect/DBA roles exist to work through once implementation reaches the storage stage (see `PROJECT.md`'s current priorities). No ADR yet for storage/sync — write one once a direction is chosen, following `decisions/0000-template.md`.

---

## 2026-08-27

**Discussed:** Product-owner review of the repo against the GitHub Projects board; a voice brainstorm resolving `03_DOMAIN_MODEL.md`'s 5 Outstanding Questions (Foundry Journal → Node mapping via a generic `Lore` type; Blocks optional, not mandatory; Knowledge Elements expose capabilities directly rather than through composable mixins/traits; View promoted to a first-class Knowledge Element); a reviewer → software-developer fix loop before merging `feat/open-questions`, which surfaced a recurring wrong-citation bug pattern across rounds.

**Formalized:** ADR-0005 (View as Knowledge Element). New Decisions entries in `03_DOMAIN_MODEL.md` for Knowledge Element, Node, and View, plus a Node `## Open Questions` section added for structural consistency with the other concept sections. `02_LANGUAGE.md`, `01_ARCHITECTURE.md`, `PROJECT.md`, and `CHANGELOG.md` reconciled to match. `.claude/agents/reviewer.md` and `.claude/agents/software-developer.md` updated with "check the whole diff for the same pattern before calling a fix done" guidance, and the same fix ported to the `agents-core` base repo. Board updated: CORE-001, CORE-002, ADAPT-001, DOC-002 created; prior priorities closed. Branch `feat/open-questions` reviewed and approved for merge.

**Still informal / not yet formalized:** Plan to start implementation ("código") this Friday — mentioned in conversation only, not yet reflected as a dated `PROJECT.md` priority or a board ticket. Worth turning into an explicit ticket once it's closer.
