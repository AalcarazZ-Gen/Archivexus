# Session Log

> A running log of work sessions on Archivexus. This is not where domain reasoning lives — that belongs in `decisions/` (ADRs) and `03_DOMAIN_MODEL.md`'s per-concept Decisions sections. This file is a quick record of what a session covered, what actually got formalized into `docs/` or the board, and what's still an informal understanding that hasn't been written down anywhere durable yet. Read this first when picking work back up after a gap — it's the fastest way to avoid re-deriving context that was already captured, or losing context that wasn't.
>
> One entry per session, newest first. Keep entries short (a few lines each) — anything long enough to need its own structure probably belongs in an ADR or a Decision entry instead, with just a pointer left here.

---

## 2026-08-30 (product-owner: reorganize milestones)

**Discussed:** User noticed the board's milestones were stale — "Foundry Adapter" and other milestones already worked on show nothing assigned, and questioned whether the "Sprint 0" milestone makes sense at all for this project (personal/fun, favors speed over process per `docs/PROJECT.md`'s Type). Checked GitHub: all 3 existing milestones (`Sprint 0` / description "Domain Design", `Core Foundation`, `Foundry Adapter`) had zero issues assigned despite 13 of 14 issues being closed — created early, never actually used to track work as it happened.

**Formalized:** Renamed `Sprint 0` → `Domain Design` (dropped the sprint framing entirely — this project doesn't run sprints; kept the substance, which was already accurate) and gave all three existing milestones real descriptions. Assigned all 14 issues to their matching milestone: Domain Design gets ARCH-001/DOM-001/DOM-002/DOC-001/DOC-002 (5/5 closed, 100%); Core Foundation gets CORE-001/CORE-002 (2/2 closed, 100%); Foundry Adapter gets ADAPT-001 through ADAPT-005 plus the #25 bug fix (4/6 closed, 66% — ADAPT-003 and ADAPT-005 still open). Closed the two now-100%-complete milestones (Domain Design, Core Foundation) so the open-milestones view only shows active work. Created a new milestone, `Persistence & Views`, for STORE-001 (#32) and the Relationship/View work it unblocks — didn't fit any existing milestone. Board itself (`Archivexus Roadmap` project) was already accurate (Status column matches open/closed state for all 14 items) — no changes needed there.

**Still informal / not yet formalized:** Nothing code-related; this was pure GitHub housekeeping. `docs/PROJECT.md` doesn't reference milestones by name, so no doc changes needed either.

---

## 2026-08-30 (verify against real data, scope STORE-001 to close the day)

**Discussed:** User: now that everything's merged and Foundry data is transforming into Archivexus, how can we visualize that it's actually working correctly? Clarified scope: build a quick real-data snapshot now to close out today, and leave everything scoped and ready to start the persistence + View work next session.

**Formalized:** Ran the actual compiled `mapActorToNode`/`mapJournalEntryPageToNode` (not synthetic fixtures) against the full real dataset pulled live from Foundry — all 41 real Actors and all 61 real Journal Pages from "Academia El Último Norte". Result: 102 computed Nodes, 0 title collisions today, versus 21 of the 61 real pages (6 distinct raw-name collision groups: "Retrato" ×5, "Lore" ×6, "Descripción" ×4, "Biografía" ×2, "Notas personales" ×2, "Kael Verik" ×2) that would have collided pre-#25 — real-world confirmation the fix works at full scale, not just on the 5-record case that originally surfaced it. Delivered as a one-off HTML snapshot report (not a persisted artifact — framed by the user as "para finalizar por hoy"; a real View supersedes it). Opened STORE-001 (issue #32) to scope the Storage Provider decision next session — mirrors ADAPT-005's decision-first pattern, references `01_ARCHITECTURE.md`'s Storage candidates and the standalone-frontend constraint, explicitly excludes implementation from its acceptance criteria. `docs/PROJECT.md`'s Stage and Current priorities updated to reflect both.

**Still informal / not yet formalized:** STORE-001 itself — no ADR yet, no Storage Provider code, no View. That's explicitly next session's work, not today's.

---

## 2026-08-30 (product-owner: add Vehicle node type, reviewer sync fixes)

**Discussed:** User asked how much it's worth keeping `NodeType` open given Foundry's own Actor types also include `vehicle`. Answer: keeping it open is the right call, and `vehicle` reinforces it — same shape as `group`/`Organization` earlier today, another real Foundry type that didn't fit any of the 10 existing Node types. Added `Vehicle` to `KNOWN_NODE_TYPES` (documentation/suggestion only, no validation logic). Reviewer then audited `dev` given how much landed via direct rebase/merge today, and found two real gaps: issue #22 (ADAPT-004) never auto-closed despite PR #27 being merged (its commit never used a closing keyword, unlike #25's "Fixes #25") — still sitting in Inbox on the board while the docs say it's done; and the Vehicle addition itself had zero record in `CHANGELOG.md`/`SESSION_LOG.md`, breaking Rule 8.

**Formalized:** `CHANGELOG.md` gained the missing `Added` entry for Vehicle. This entry backfills the missing `SESSION_LOG.md` record for the same change. Issue #22 needs to be closed manually and its board card moved to Done to match `docs/PROJECT.md`'s already-accurate "done" claim — a GitHub-side fix, not a code/docs one.

**Still informal / not yet formalized:** Same open items as the ADAPT-004/#25 entry below (Scenes, ADAPT-003, the GM-tagging UI). Worth remembering going forward: a merge/commit that should close an issue needs the actual closing keyword ("Fixes #N"/"Closes #N") in its message, not just a reference — #25's fix got this right, ADAPT-004's didn't.

---

## 2026-08-30 (real campaign restored: ADAPT-004 implemented, #25 fixed)

**Discussed:** User restored their real campaign into the test world ("Academia El Último Norte", dnd5e, Foundry v14.367 — 41 Actors, 22 Scenes, 61 journal pages) and asked product-owner, qa-tester and ux-ui-designer to test what they needed to continue. QA pulled the real data live via Claude in Chrome: confirmed Foundry's own `actor.type` splits Actors four ways (character/npc/encounter/group) with 0/41 flagged yet, and — running real page data through `mapJournalEntryPageToNode` — found and reproduced a real bug (issue #25): 5 distinct real NPCs' "Retrato" pages collapsed to one shared Node title. Product-owner scoped ADAPT-004 against the real actor-type mix (comment on #22) and sequenced #25. ux-ui-designer proposed a GM-tagging flow for `flags.archivexus.nodeType`, informed by the same real numbers (comment on #20). User then asked to resolve ADAPT-004 and #25 before finishing for the day.

**Formalized:** ADAPT-004 implemented (`src/adapters/foundry/actor-to-node.ts`, `mapActorToNode`) — same pattern as ADAPT-001, flat "Character" fallback with no branching on Foundry's own `actor.type`, per the product-owner decision on #22. Tested against 14 synthetic cases plus 4 real Actors (one per real `actor.type`). Issue #25 fixed: `FoundryJournalEntryPageLike` gained an optional `parent.name`, and `mapJournalEntryPageToNode` now qualifies the title as `"{parent.name} — {name}"` only when that disambiguates anything, falling back to the bare page name otherwise (fully backward compatible). Re-ran the actual 5 real "Retrato" uuids from #25 through the fixed function — now 5 distinct titles, confirmed. Both verified the same way as every prior task: `tsc --noEmit` and `eslint` clean, plus a throwaway `node:assert` script per change (19/19 and 6/6 assertions respectively) since `vitest` still can't run in this session. Three separate feature branches (`feat/adapt-004-actor-to-node`, `fix/adapt-001-title-collision`, plus this docs-sync commit) — kept independent since they touch disjoint files, single-topic per branch.

**Still informal / not yet formalized:** Actor items/embedded documents, Scenes, and the GM-tagging UI itself are all still open (ADAPT-005, ADAPT-003).

---

## 2026-08-30 (PO: fix stale Stage claim, reviewer round 6)

**Discussed:** Reviewer audited `chore/scope-adapt-004-005` (git status clean, eslint clean repo-wide, ADAPT-004/005 issue text and the live-fixtures test cross-checked against docs — all consistent) and found one real contradiction: `docs/PROJECT.md`'s Stage section still said ADAPT-002 was "not yet built or released," directly contradicted a few lines below by Current priorities item 4, which correctly says it's built, released, installed, and confirmed live at `localhost:30000`. User: product-owner fixes it.

**Formalized:** `docs/PROJECT.md`'s Stage paragraph updated to match Current priorities item 4 — states ADAPT-002 is built, released and manually installed, confirmed loading in a live Foundry v14 GM session, while keeping the ADR-0006 context for why building itself stays a manual, locally-run step.

**Still informal / not yet formalized:** Same as the ADAPT-004/005 entry below — no code yet for either ticket, ADAPT-003 not started, QA fixtures still live in the "Dev test" world.

---

## 2026-08-30 (PO: scope ADAPT-004/005 for real-campaign import)

**Discussed:** With QA's live Foundry fixtures validating ADAPT-001 against real data, user asked product-owner to scope the next step toward importing their actual campaign (which has actors and scenes, not just journal entries) while they went to review QA's work themselves.

**Formalized:** Two new backlog items, both opened as GitHub issues (auto-added to the board's Inbox): ADAPT-004 (#22) — map Foundry `Actor` to Node, a direct extension of ADAPT-001's already-proven pattern (no ownership-inheritance sentinel to worry about, unlike pages, since Actors aren't nested under a parent document); ADAPT-005 (#23) — explicitly *not* an implementation ticket yet, since whether a Foundry `Scene` should be a Node, something else, or out of scope entirely is an open domain question. Scoped to require a `03_DOMAIN_MODEL.md` Decision entry first, same shape as the existing "Is a Foundry Journal a Node?" Decision, once there's real Scene data to look at. `docs/PROJECT.md`'s Current priorities reordered: ADAPT-004 and ADAPT-005 now come before ADAPT-003 (UI extension research), matching the user's stated priority to get real campaign data flowing before anything else.

**Still informal / not yet formalized:** Neither ADAPT-004 nor ADAPT-005 has any code yet. ADAPT-003 still not started. Whether `flags.archivexus.nodeType`'s fallback for an untyped Actor should be `Character` (proposed in ADAPT-004's issue, not yet confirmed) is worth checking once real actor data is available.

---

## 2026-08-30 (reviewer round 5: ADAPT-002)

**Discussed:** Reviewer audited ADAPT-002 for the first time by actually running `eslint`, not just `tsc --noEmit` (the verification method used for every prior task). Found `module-entry.ts` fails `npm run lint`: `no-undef` on both `Hooks` and `console`, since ESLint's `no-undef` rule doesn't read `foundry-globals.d.ts`'s ambient `declare const` — it needs the same names in its own `globals` config. Also flagged, lower priority: no test exercises `module-entry.ts`'s logging, unlike every other file this session added. User: software-developer fixes the lint issue by adding an explicit allow-list of Foundry's reserved globals to ESLint, and replace the raw `console.log` with a structured logger — which happens to also address the test-coverage gap, since a logger's formatting is unit-testable in a way a bare `console.log` call isn't.

**Formalized:** `eslint.config.js` gained a `FOUNDRY_ADAPTER_GLOBALS` list (currently `Hooks`) plus `console`, scoped to `src/adapters/foundry/**/*.ts` and commented to be kept in sync with `foundry-globals.d.ts` as more Foundry globals get touched. `src/adapters/foundry/logger.ts` added: `createLogger(moduleId)` → `{ info, warn, error }`, each console call prefixed with the module id (the convention most Foundry modules follow) — centralizes the package's only `console` usage to this one file. `module-entry.ts` now calls `log.info('Initializing')` instead of a raw `console.log`. `logger.test.ts` added (4 cases: prefix on each level, prefix reused across calls from one logger instance) — verified the same way as every prior task, `tsc --noEmit` clean plus a throwaway `node:assert` script mirroring the Vitest suite (5/5 assertions passed), since `vitest` still can't run in this session. `npx eslint .` now clean repo-wide — first time this session an ADAPT-002-scoped review actually ran the linter instead of only `tsc`.

**Still informal / not yet formalized:** Everything from the ADAPT-002 entry above still applies (no release built/published, `localhost:30000` untouched, ADAPT-003 not started). Worth noting for next time: `tsc --noEmit` alone isn't sufficient verification once ambient globals are involved — add an `eslint` pass to the standard verification routine going forward, not just for Foundry-adapter files.

---

## 2026-08-30 (ADAPT-002: Foundry module scaffold)

**Discussed:** User confirmed ADAPT-001 merged to `dev` both locally and remotely, and, asked what's next, laid out four priorities: (1) get a real, installable Foundry module scaffolded ASAP — explicitly "a realistic installation and not a local one"; (2) validate against real Foundry data, with the user offering agents read access to their actual running Foundry world at `localhost:30000` (the live game, not the setup/configuration panel) once something is installed — but stating installation itself is always done by them manually; (3) fold Foundry UI extension/customization into the Adapter's scope, to be validated against `https://foundryvtt.com/api/`; (4) hold Relationship until real example data exists. Architect scoped priority 1 as ADR-0006: a Foundry-only build target (`vite.foundry.config.ts`), manifest-based distribution (`module.json`, matching Foundry's real "install by manifest URL" flow rather than a folder copy), and a hard rule — already true of this session's tools, now made explicit and permanent — that installing into a live Foundry world is a manual, human-only action.

**Formalized:** `docs/decisions/ADR-0006-foundry-module-distribution.md` accepted. ADAPT-002 implemented: `module.json` at repo root (compatibility checked against Foundry's current stable release, v14), `src/adapters/foundry/module-entry.ts` (registers on Foundry's `init` hook, no document reads/writes yet), `src/adapters/foundry/foundry-globals.d.ts` (minimal ambient `Hooks`/`console` declarations — same no-real-Foundry-types tradeoff as ADAPT-001), `vite.foundry.config.ts`, and a `build:foundry-module` npm script. Verified with `tsc --noEmit` only — confirmed neither this session's cloud container (no network to publish a release) nor the bridged local shell can run `vite build` here (the bridge's Linux VM hit `Cannot find module '@rollup/rollup-linux-arm64-gnu'` against the Mac's `node_modules` — a native-binary platform mismatch, not a missing package), so the actual bundle/zip/release still needs the user to run `npm run build:foundry-module` and publish it locally, same as merges/pushes already are. ADAPT-003 (Foundry UI extension research against `foundryvtt.com/api`) opened and deliberately left in the backlog, sequenced after ADAPT-002. Relationship confirmed deferred per the user's own priority order.

**Still informal / not yet formalized:** No GitHub Release exists yet, so `module.json`'s `download` URL is unverified until the user cuts one. `localhost:30000` access not yet exercised from this session. UI-extension research (ADAPT-003) not started. A minimal GM-facing UI for setting `flags.archivexus.nodeType` (currently console/manual-flag-only) is still an acknowledged gap, not yet its own ticket.

---

## 2026-08-30 (PO check-in: ADAPT-001 merged, planning next)

**Discussed:** User confirmed ADAPT-001 merged and pushed to `origin/dev` (verified: local `dev` matches `origin/dev` exactly). Board updated: ADAPT-001 (#10) moved to Done, issue auto-closed.

**Formalized:** `docs/PROJECT.md`'s Stage and Current priorities updated to reflect ADAPT-001 merged.

**Still informal / not yet formalized:** Storage engine(s)/sync model. Next steps (Relationship, a real Foundry module scaffold, and a validation strategy for the Adapter against real Foundry data) discussed with the user but not yet turned into tickets. Superseded by the ADAPT-002 entry above — ADR-0006 accepted and the scaffold implemented same session.

---

## 2026-08-30 (reviewer round 4: ADAPT-001)

**Discussed:** Reviewer audited ADAPT-001 and found two issues: `02_LANGUAGE.md`/`03_DOMAIN_MODEL.md`'s Node sections described the Foundry Adapter as typing a page "by what it actually describes" — reads as automatic content inference, contradicting the actual GM-flag-only implementation (correctly avoiding business logic in the Adapter, but the domain docs never caught up); and a wrong citation ("CONTRIBUTING_GUIDE.md Rule 3" instead of `01_ARCHITECTURE.md`'s Adapters section) carried into the code comments, `CHANGELOG.md` and this file — same recurring citation-bug pattern as before, apparently inherited from the GitHub issue's own Acceptance Criteria text. User: software-developer fixes both.

**Formalized:** `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md`'s Node sections reworded to describe the real mechanism (explicit GM-set flag, not content inference). The wrong `CONTRIBUTING_GUIDE.md` Rule 3 citation corrected to `01_ARCHITECTURE.md`'s Adapters section in `journal-entry-page-to-node.ts`, `CHANGELOG.md` and this file. Re-verified with `tsc --noEmit` (clean, comment-only code change).

**Still informal / not yet formalized:** Same as prior entries. Note for later: the GitHub issue #10's own Acceptance Criteria text still carries the wrong Rule 3 citation — outside what this session can edit via the filesystem, worth a manual fix on the issue itself.

---

## 2026-08-30 (ADAPT-001)

**Discussed:** Product Owner confirmed board/repo state was clean (CORE-002 merged and pushed, board and `docs/PROJECT.md` in sync) before handing off to software-developer for ADAPT-001. No Foundry types dependency exists yet (`package.json` has none, and npm registry is still blocked in this session besides), so the adapter was scoped as a pure mapping function against a minimal structural type rather than a real Foundry API dependency.

**Formalized:** ADAPT-001 implemented: `src/adapters/foundry/journal-entry-page-to-node.ts` — `mapJournalEntryPageToNode` maps a Foundry `JournalEntryPage` to a Node. id from `uuid` (ADR-0001), title from `name`, type from an explicit `flags.archivexus.nodeType` GM flag (falling back to `Lore`) rather than any content-based inference (Adapters carry no business logic, per `01_ARCHITECTURE.md`'s Adapters section), visibility from `ownership.default` per 02_LANGUAGE.md/ADR-0003's mapping. Two explicit scope decisions, documented in code comments: Foundry's `-1` ownership-inheritance sentinel isn't resolved here (needs a live Foundry instance, out of scope for a pure function) and falls through to Node's own `hidden` default; page content/text isn't mapped to Blocks yet, since `Block`'s shape is still an explicit placeholder. Same verification approach as CORE-001/CORE-002: `tsc --noEmit` clean on the production sources, throwaway `node:assert` script mirroring the Vitest suite (14/14 passed).

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
