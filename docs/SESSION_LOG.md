# Session Log

> A running log of work sessions on Archivexus. This is not where domain reasoning lives — that belongs in `decisions/` (ADRs) and `03_DOMAIN_MODEL.md`'s per-concept Decisions sections. This file is a quick record of what a session covered, what actually got formalized into `docs/` or the board, and what's still an informal understanding that hasn't been written down anywhere durable yet. Read this first when picking work back up after a gap — it's the fastest way to avoid re-deriving context that was already captured, or losing context that wasn't.
>
> One entry per session, newest first. Keep entries short (a few lines each) — anything long enough to need its own structure probably belongs in an ADR or a Decision entry instead, with just a pointer left here.

---

## 2026-08-30 (ADAPT-001)

**Discussed:** Product Owner confirmed board/repo state was clean (CORE-002 merged and pushed, board and `docs/PROJECT.md` in sync) before handing off to software-developer for ADAPT-001. No Foundry types dependency exists yet (`package.json` has none, and npm registry is still blocked in this session besides), so the adapter was scoped as a pure mapping function against a minimal structural type rather than a real Foundry API dependency.

**Formalized:** ADAPT-001 implemented: `src/adapters/foundry/journal-entry-page-to-node.ts` — `mapJournalEntryPageToNode` maps a Foundry `JournalEntryPage` to a Node. id from `uuid` (ADR-0001), title from `name`, type from an explicit `flags.archivexus.nodeType` GM flag (falling back to `Lore`) rather than any content-based inference (Adapters carry no business logic, CONTRIBUTING_GUIDE.md Rule 3), visibility from `ownership.default` per 02_LANGUAGE.md/ADR-0003's mapping. Two explicit scope decisions, documented in code comments: Foundry's `-1` ownership-inheritance sentinel isn't resolved here (needs a live Foundry instance, out of scope for a pure function) and falls through to Node's own `hidden` default; page content/text isn't mapped to Blocks yet, since `Block`'s shape is still an explicit placeholder. Same verification approach as CORE-001/CORE-002: `tsc --noEmit` clean on the production sources, throwaway `node:assert` script mirroring the Vitest suite (14/14 passed).

**Still informal / not yet formalized:** Storage engine(s)/sync model. Board still shows ADAPT-001 as "Ready for Implementation" — move it once reviewed/merged. Block's shape and a live-Foundry integration (reading real documents, resolving ownership inheritance) are still open, not yet their own tickets.

---

## 2026-08-30 (PO check-in: CORE-002 done, next task)

**Discussed:** User asked to move on to the next task. Found CORE-002 already rebased onto `dev` and pushed to `origin/dev` (the user handled it independently, same as CORE-001) — confirmed via the repo's own reflog and `origin/dev`'s cached state matching local `dev` exactly.

**Formalized:** Board updated: CORE-002 (#9) moved to Done (auto-closed the issue); ADAPT-001 (#10) moved from Inbox to "Ready for Implementation" as the next task — its issue is already fully specified (decision made, related docs linked, acceptance criteria listed). `docs/PROJECT.md`'s Stage and Current priorities updated to match.

**Still informal / not yet formalized:** Storage engine(s)/sync model, same as prior entries. ADAPT-001 not started yet.

---

## 2026-08-30 (reviewer round 3)

**Discussed:** Reviewer audited the branch after CORE-002's backtick fix and found two new issues: `02_LANGUAGE.md`'s Node examples list missing `Item` (present in `03_DOMAIN_MODEL.md` and `KNOWN_NODE_TYPES`), and `README.md`/`CONTRIBUTING.md` still claiming the project is pre-implementation — the same recurring stale-cross-reference pattern as the `0000-template.md` citations. User: software-developer fixes both.

**Formalized:** `02_LANGUAGE.md`'s Node examples list now matches `03_DOMAIN_MODEL.md`/`node.ts` exactly (added `Item`, reordered to line up). `README.md`'s Contributing section and `CONTRIBUTING.md`'s opening now say implementation is underway instead of "early architecture phase"/pre-implementation, consistent with `README.md`'s own Current Status and `docs/PROJECT.md`'s Stage.

**Still informal / not yet formalized:** Same as prior entries — storage engine(s)/sync model, board's CORE-002 card not moved yet, ADAPT-001 next.

---

## 2026-08-29

**Discussed:** PO check-in — confirmed the 2026-08-27 domain-model diff was already committed/pushed to `dev` (nothing left to review there), then started implementation with CORE-001. User confirmed `npm install && npm test` ran clean on their own machine (the sandbox and the device-bridge Linux VM couldn't reach the npm registry, and separately the bridge VM's arch mismatches the user's real Mac for native deps like `rollup`, so verification there stays moot). Also fed back that the `software-developer` agent should call out a branch + rebase/squash git workflow explicitly.

**Formalized:** Project scaffolding added (`package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`). CORE-001 implemented: `src/core/domain/knowledge-element.ts` (the `KnowledgeElement` base abstraction, a validating `createKnowledgeElement` factory, `isKnowledgeElement` type guard) plus its supporting value types in `visibility.ts`, `tag.ts`, `history.ts`, `block.ts`, `reference.ts`, and unit tests in `knowledge-element.test.ts` covering the Domain Invariants from `03_DOMAIN_MODEL.md`. Default `Visibility` when none is given was set to `hidden` (fail-closed) — not specified by the domain model, flagged as an assumption rather than turned into a Decision entry unilaterally. Node dependencies could not be installed in this session (npm registry blocked by this environment's egress allowlist on both the local device shell and the cloud sandbox) — verified instead with the sandbox's global `tsc --noEmit` (clean) and a throwaway `node:assert` script exercising the same cases as the Vitest suite (13/13 passed); confirmed for real afterwards when the user ran `npm install && npm test` themselves — passed. `.claude/agents/software-developer.md` (and its `agents-core` canonical copy) got a new `## Git workflow` section: feature branches off trunk, rebase to stay current, squash before merging back.

**Still informal / not yet formalized:** Storage engine(s) and local/remote sync model, same as prior entries. CORE-002 (Node) and ADAPT-001 (Foundry `JournalEntryPage` → Node mapping) are next per `PROJECT.md`'s priorities; neither started. User enabled Claude in Chrome and the built-in browser for GitHub access this session — the board's CORE-001 card still isn't moved off "Ready for Implementation" to reflect that the code is written; do that before or while starting CORE-002.

---

## 2026-08-29 (reviewer round)

**Discussed:** User asked reviewer to audit the CORE-001 diff before merging. Reviewer read all of `docs/` and `.claude/agents/` and raised 5 findings plus a process note on the branch mixing two topics (CORE-001 + the software-developer git-workflow change). User: software-developer fixes findings 1-3, product-owner decides on 4 (dba + CONTRIBUTING_GUIDE), finding 5 gets reviewed/fixed, and this one time the mixed-topic branch is allowed — future PRs should stay single-topic (already stated in root `CONTRIBUTING.md`, now actually enforced going forward).

**Formalized:** `package.json`'s `license` corrected `MIT` → `MPL-2.0` (matches actual `LICENSE`). `README.md`'s Current Status now says implementation has started instead of pre-implementation; its Repository Structure no longer shows a separate `tests/` folder (tests are colocated as `*.test.ts`), also now stated in `CONTRIBUTING.md`'s Coding Standards. Stale `0000-template.md` citations fixed to `ADR-0000-template.md` in `architect.md`, `software-developer.md`, this file, and the `agents-core` canonical `architect.md`/`software-developer.md` — same recurring citation-bug pattern as 2026-08-27, this time caught by a repo-wide grep instead of one instance at a time. Product Owner call: yes, `dba.md` needed the same `## Git workflow` section as `software-developer.md` (same Bash/Write/Edit footprint, same need) — added to both the Archivexus copy and the `agents-core` canonical one, with an extra DBA-specific line about not squashing across already-applied migrations. The git workflow itself is now also `docs/CONTRIBUTING_GUIDE.md` Rule 11 — a binding project rule, not just something the two agent files happen to say, per Rule 4 (avoid duplicate sources of truth): Rule 11 is the short binding statement, the agent files carry the operational detail.

**Still informal / not yet formalized:** Same as the previous entry — storage engine(s)/sync model, CORE-002/ADAPT-001 not started, board's CORE-001 card not moved.

---

## 2026-08-29 (git workflow follow-up)

**Discussed:** User asked why `architect.md` would need the `## Git workflow` section given it doesn't touch code. Checked the actual tool grants instead of pattern-matching on `Write`: `architect.md` has `Write` but no `Bash`, so it has no way to execute `git` commands itself — the earlier note was wrong, retracted. Checking tools properly surfaced a real gap instead: `qa-tester.md` has both `Bash` and `Write`, and its own Deliverable mode already says it writes automated tests when asked — same category as `dba.md`, just missed the first time.

**Formalized:** Added `## Git workflow` to `qa-tester.md` (Archivexus and the `agents-core` canonical copy), identical to `software-developer.md`'s with one QA-specific line: automated tests it commits follow the same branch/rebase/squash flow as any other code change.

**Still informal / not yet formalized:** Same as prior entries. The tool-grant check (does this role have `Bash`?) is now the actual test for whether a role needs this section — worth applying it again if a new role gets added later instead of re-deriving it from scratch.

---

## 2026-08-29 (reviewer round 2)

**Discussed:** Reviewer caught that `docs/CONTRIBUTING_GUIDE.md` Rule 11 still only named `software-developer` and `dba` after `qa-tester.md` got the same `## Git workflow` section — the same stale-cross-reference class as the `0000-template.md` citations, this time self-inflicted from the previous round.

**Formalized:** Rule 11 now lists all three (`software-developer`, `dba`, `qa-tester`) and states the actual criterion — any role whose tools include `Bash` — plus why `architect.md` deliberately doesn't have the section (`Write` without `Bash`). Framing it as a criterion instead of a hardcoded list should keep this from going stale again the next time a role's tools change.

**Still informal / not yet formalized:** Same as prior entries.

---

## 2026-08-29 (CORE-002)

**Discussed:** PO updated the board — CORE-001 (#8) moved to Done, which auto-closed the issue; confirmed `dev` already has everything merged and pushed to `origin/dev` (the user had merged it independently of this session). `agents-core`'s PR is still unmerged, flagged but not blocking. Picked CORE-002 (Node, #9) as the next task per the board and `PROJECT.md`.

**Formalized:** CORE-002 implemented: `src/core/domain/node.ts` — `Node` composed on top of `createKnowledgeElement` (not subclassed) with one added field, `type`. `NodeType` is a plain string rather than a closed union of `KNOWN_NODE_TYPES`, per `01_ARCHITECTURE.md`'s Extensible principle and because the domain model introduces its type examples as "Examples include", not an exhaustive list. Domain Invariants enforced: no nesting (no parent/children field), no type change (readonly + frozen, no update function), id independent of type. Unit tests in `node.test.ts` cover all of the above plus composition with `KnowledgeElement`'s own defaults and invariants. `src/core/domain/index.ts` updated with the new exports. Same verification approach as CORE-001 (npm registry still blocked in this session): `tsc --noEmit` clean, throwaway `node:assert` script mirroring the Vitest suite (10/10 passed).

**Still informal / not yet formalized:** Storage engine(s)/sync model. ADAPT-001 (Foundry Adapter) is next and now unblocked; board's CORE-002 card not moved yet — do that once this is reviewed/merged.

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

**Still informal / not yet formalized:** Which storage engine(s) Archivexus will actually use, and the local/remote sync model — that's exactly what the new architect/DBA roles exist to work through once implementation reaches the storage stage (see `PROJECT.md`'s current priorities). No ADR yet for storage/sync — write one once a direction is chosen, following `decisions/ADR-0000-template.md`.

---

## 2026-08-27

**Discussed:** Product-owner review of the repo against the GitHub Projects board; a voice brainstorm resolving `03_DOMAIN_MODEL.md`'s 5 Outstanding Questions (Foundry Journal → Node mapping via a generic `Lore` type; Blocks optional, not mandatory; Knowledge Elements expose capabilities directly rather than through composable mixins/traits; View promoted to a first-class Knowledge Element); a reviewer → software-developer fix loop before merging `feat/open-questions`, which surfaced a recurring wrong-citation bug pattern across rounds.

**Formalized:** ADR-0005 (View as Knowledge Element). New Decisions entries in `03_DOMAIN_MODEL.md` for Knowledge Element, Node, and View, plus a Node `## Open Questions` section added for structural consistency with the other concept sections. `02_LANGUAGE.md`, `01_ARCHITECTURE.md`, `PROJECT.md`, and `CHANGELOG.md` reconciled to match. `.claude/agents/reviewer.md` and `.claude/agents/software-developer.md` updated with "check the whole diff for the same pattern before calling a fix done" guidance, and the same fix ported to the `agents-core` base repo. Board updated: CORE-001, CORE-002, ADAPT-001, DOC-002 created; prior priorities closed. Branch `feat/open-questions` reviewed and approved for merge.

**Still informal / not yet formalized:** Plan to start implementation ("código") this Friday — mentioned in conversation only, not yet reflected as a dated `PROJECT.md` priority or a board ticket. Worth turning into an explicit ticket once it's closer.
