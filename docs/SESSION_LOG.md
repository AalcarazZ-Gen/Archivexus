# Session Log

> A running log of work sessions on Archivexus. This is not where domain reasoning lives — that belongs in `decisions/` (ADRs) and `03_DOMAIN_MODEL.md`'s per-concept Decisions sections. This file is a quick record of what a session covered, what actually got formalized into `docs/` or the board, and what's still an informal understanding that hasn't been written down anywhere durable yet. Read this first when picking work back up after a gap — it's the fastest way to avoid re-deriving context that was already captured, or losing context that wasn't.
>
> One entry per session, newest first. Keep entries short (a few lines each) — anything long enough to need its own structure probably belongs in an ADR or a Decision entry instead, with just a pointer left here.

---

## 2026-08-27

**Discussed:** Product-owner review of the repo against the GitHub Projects board; a voice brainstorm resolving `03_DOMAIN_MODEL.md`'s 5 Outstanding Questions (Foundry Journal → Node mapping via a generic `Lore` type; Blocks optional, not mandatory; Knowledge Elements expose capabilities directly rather than through composable mixins/traits; View promoted to a first-class Knowledge Element); a reviewer → software-developer fix loop before merging `feat/open-questions`, which surfaced a recurring wrong-citation bug pattern across rounds.

**Formalized:** ADR-0005 (View as Knowledge Element). New Decisions entries in `03_DOMAIN_MODEL.md` for Knowledge Element, Node, and View, plus a Node `## Open Questions` section added for structural consistency with the other concept sections. `02_LANGUAGE.md`, `01_ARCHITECTURE.md`, `PROJECT.md`, and `CHANGELOG.md` reconciled to match. `.claude/agents/reviewer.md` and `.claude/agents/software-developer.md` updated with "check the whole diff for the same pattern before calling a fix done" guidance, and the same fix ported to the `agents-core` base repo. Board updated: CORE-001, CORE-002, ADAPT-001, DOC-002 created; prior priorities closed. Branch `feat/open-questions` reviewed and approved for merge.

**Still informal / not yet formalized:** Plan to start implementation ("código") this Friday — mentioned in conversation only, not yet reflected as a dated `PROJECT.md` priority or a board ticket. Worth turning into an explicit ticket once it's closer.
