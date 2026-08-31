# Session Log

> A running log of work sessions on Archivexus. This is not where domain reasoning lives — that belongs in `decisions/` (ADRs) and `03_DOMAIN_MODEL.md`'s per-concept Decisions sections. This file is a quick record of what a session covered, what actually got formalized into `docs/` or the board, and what's still an informal understanding that hasn't been written down anywhere durable yet. Read this first when picking work back up after a gap — it's the fastest way to avoid re-deriving context that was already captured, or losing context that wasn't.
>
> One entry per session, newest first. Keep entries short (a few lines each) — anything long enough to need its own structure probably belongs in an ADR or a Decision entry instead, with just a pointer left here.

---

## 2026-08-31 (ADAPT-003 redesigned: permanent bar -> opt-in header-control button)

**Discussed:** After the previous entry's full live-verified confirmation (bug fixed, save round-trip re-confirmed, no console errors), Alberto did not simply accept the finished feature. He raised two separate challenges in one message: a UX critique ("this isn't in the optimal position") and a more fundamental product question directed at product-owner and ux-ui-designer both — "is this really necessary? What does I as a user/GM get from knowing that Kharra is an archivexus entity type: character?"

Took the second question seriously before answering it: read `ux-ui-designer.md`'s persona, then grepped the whole codebase for actual downstream consumers of `Node.type` rather than assuming the feature was self-evidently useful. Found none — no View, filter, or query reads it anywhere; only `node.ts` validates it and the two Foundry Adapter mapping files touch it. Also noted `ACTOR_FALLBACK_NODE_TYPE` already gives the common case (a Player Character) the correct type with zero GM action. Presented this finding plainly rather than defending the just-shipped work.

**Formalized:** Given the choice between removing the feature outright, keeping the permanent bar (just repositioned), or converting it to an opt-in header-control button, Alberto chose the button — hidden by default, surfaced only when a GM actively wants to reclassify something. Verified the new mechanism live (Foundry v14.367 + dnd5e 5.3.3, via Claude in Chrome) before writing final source, same live-first methodology as every prior ADAPT-003 pass: confirmed `getHeaderControlsActorSheetV2` fires up the full prototype chain (registered all 9 chain-name variants simultaneously, all fired); confirmed a pushed control entry can carry a direct `onClick` function with no `action`-string/static-action-map registration needed (resolving ADR-0009's own previously-flagged uncertainty); found a real, load-bearing gotcha — a plain `app.render(true)` on an already-open sheet does not recompute header controls, only a close+reopen does; confirmed `foundry.applications.api.DialogV2.prompt(config)` works as documented for a labeled-input-plus-datalist dialog.

Rewrote `src/adapters/foundry/actor-node-type-tag.ts`: `buildNodeTypeDialogContent` (pure, unit-tested) replaces `buildNodeTypeTagHTML`; `registerActorNodeTypeTag` now registers `getHeaderControlsActorSheetV2` instead of `renderActorSheetV2`; all permanent-bar DOM-injection code (the `.window-header`/`afterend` insertion point from the prior entry's Correction) is gone. Updated the surrounding files to match: `foundry-globals.d.ts` gained an ambient `foundry` global (`applications.api.DialogV2`), `eslint.config.js`'s `FOUNDRY_ADAPTER_GLOBALS` gained `foundry: 'readonly'`, `index.ts`'s exports updated to the new symbol names, and `actor-node-type-tag.test.ts` fully rewritten (dialog-content tests plus `Hooks.on`/`DialogV2.prompt` mock-based tests for the register function, including the resolve-with-string-saves / resolve-with-null-leaves-untouched cases). `tsc --noEmit`, `eslint`, and `prettier` all clean; `vitest` still can't run in this sandbox, so verified with the same throwaway `node:assert`-script approach as every prior pass (compiles the real source with `tsc`, exercises equivalent assertions — all passed). `ADR-0009` gained an Amendment recording the challenge, the finding, and the live-verification notes. `docs/PROJECT.md` item 8 and `CHANGELOG.md` updated.

**Still informal / not yet formalized:** JournalEntry/Scene tagging UI remains separate, not-yet-scoped follow-up work.

**Confirmed after rebuild:** Alberto rebuilt and reloaded ("done, foundry reload"). Confirmed the new bundle loaded (module init log's source line at `archivexus.js:57`, matching the larger DialogV2-based build). Opened Kharra's real sheet fresh (a first open counts as the "fresh render" the register function needs) via `game.actors.getName('Kharra').sheet.render(true)` — the sheet itself renders clean with no leftover permanent-bar UI at all. Opened the header-controls "⋮" menu: "Archivexus Node Type" appears with its tag icon, right where `getHeaderControlsActorSheetV2` should have placed it. Clicked it: the `DialogV2` dialog opened titled "Archivexus Node Type", input empty (matching Kharra's actual unset flag), and the `<datalist>` carried all 11 `KNOWN_NODE_TYPES` suggestions (verified via DOM query, not just visually). Typed "Character", clicked Save, and confirmed off the live Actor document that `flags.archivexus.nodeType` was set to `"Character"` — dialog closed cleanly, no console errors. Cleared the test flag and closed the sheet afterward, restoring Kharra to a clean state. ADAPT-003 is done, redesign included, fully live-verified.

---

## 2026-08-31 (ADAPT-003 live-verified: overlap bug found and fixed)

**Discussed:** Alberto built the module and reloaded Foundry ("foundry corriendo"). Checked the console for the module's init log, then opened Kharra's real sheet again via Claude in Chrome to see the actual result.

**Formalized:** The control rendered, but overlapping Foundry's own floating title bar — the pin/menu/close icons shared the same row as "Archivexus Node Type". Measured the real layout (`getBoundingClientRect`, computed styles) rather than guessing: `.window-content` starts at essentially the same `top` as `.window-header` and renders underneath it (a floating/glass title-bar effect, `.window-header` at `z-index: 1`); dnd5e's own in-sheet header avoids this with its own baked-in top margin, which a foreign injected element doesn't have. Prototyped the fix live via `insertAdjacentHTML` directly in the console before touching source — inserting `afterend` of `.window-header` instead of as `.window-content`'s first child — confirmed clean visually, then confirmed the fix end-to-end: typed "Character" into the (correctly positioned) input, dispatched a real `change` event, and read `game.actors.getName('Kharra').flags.archivexus.nodeType` straight off the live Actor document — `"Character"`, round-tripped through Foundry's native `submitOnChange` with no extra glue. Cleared the test flag and removed the ad-hoc DOM afterward. Ported the fix to `actor-node-type-tag.ts` and its tests (`.window-header`/`afterend` instead of `.window-content`/`afterbegin`); re-verified with the same `node:assert`-script approach (3 cases covering the changed logic). `ADR-0009` gained a "Correction" section recording the bug and fix. `docs/PROJECT.md` item 8 and `CHANGELOG.md` updated.

**Still informal / not yet formalized:** `getHeaderControls*` remains unimplemented (ADR-0009's other named gap). JournalEntry/Scene tagging UI is separate, not-yet-scoped follow-up work.

**Confirmed after rebuild:** Alberto rebuilt and reloaded ("updated module") — the module init log's source line shifted (`archivexus.js:35` → `:37`), confirming the new bundle actually loaded. Reopened Kharra's sheet: the control now renders cleanly on its own row below the real title bar (measured — `tag.top: 80` vs `header.bottom: 50`, no overlap), and a full save round-trip re-confirmed correct (`flags.archivexus.nodeType` set to `"Character"` then cleared again, straight off the live Actor document). No console errors. ADAPT-003 is done, not just fixed-on-paper.

---

## 2026-08-31 (ADAPT-003 implemented: Actor node-type tagging control)

**Discussed:** With ADR-0009's mechanism decided, Alberto said "next item" — read as continuing the same ticket rather than picking a new one, since the concrete next step (point 2 of the ADR) was already pinned. Before writing any DOM-injection code, checked in explicitly: build blind against documented conventions, or verify against a real render first, since ADR-0009 itself flagged the real template structure as unverified. Alberto chose live verification — Foundry was already running with his real campaign loaded ("Academia El Último Norte"), so used Claude in Chrome to inspect a real Actor (Kharra, a dnd5e Paladin) sheet's actual rendered DOM before writing anything, mirroring the STORE-002 spike's live-iteration pattern.

**Formalized:** Live inspection (via `foundry.applications.instances`, `javascript_tool`) confirmed: `CharacterActorSheet`'s prototype chain includes `ActorSheetV2`, so `renderActorSheetV2` fires (kept the hook System-agnostic rather than hard-coding to dnd5e's own sheet class, matching ADAPT-004's no-branching rule); dnd5e2's own vertical tab bar (details/inventory/features/spells/effects/biography/specialTraits) is dnd5e-owned config, not reachable by a foreign module's hook alone, confirming the injected control should be a persistent block, not a new tab; the sheet's root element is itself the `<form>` with `submitOnChange: true`, so a named input anywhere inside it saves natively with zero extra glue; `.window-content`'s first child (before dnd5e's own in-sheet header) is the safest insertion point — visible on every tab, never touching System-owned markup. Created `feat/adapt-003-actor-node-type-tag` off `dev` before writing any code, per the standing git-workflow rule. Implemented `src/adapters/foundry/actor-node-type-tag.ts`: `buildNodeTypeTagHTML` (pure, HTML-escaped, per-instance-unique datalist ids so two open Actor sheets never collide) and `registerActorNodeTypeTag` (wires the hook once at init). `KNOWN_NODE_TYPES` offered as `<datalist>` suggestions, not a restriction (NodeType stays an open string per ADAPT-005). 12 unit tests (`actor-node-type-tag.test.ts`) — `tsc --noEmit` and `eslint` clean, and since `vitest` still can't run in this sandbox, verified with a throwaway `node:assert` script compiling the real files with `tsc` and exercising the exact same 12 cases (12/12 passed) rather than trusting untested new logic on a first pass. Exported from `index.ts`, wired into `module-entry.ts`'s `init` hook. `ADR-0009` gained an Addendum recording the live-verified facts. `docs/PROJECT.md` item 8 and `CHANGELOG.md` updated.

**Still informal / not yet formalized:** Not built into a release or reloaded in Foundry yet — this sandbox still can't run `vite build` (same native-binary `@rollup/rollup-linux-arm64-gnu` mismatch as ADAPT-002/STORE-002), so Alberto needs to run `npm run build:foundry-module` (or `npm run release:foundry`) and reload before the control is actually visible on a real sheet. `getHeaderControls*` remains entirely unimplemented (ADR-0009's other named gap). JournalEntry/Scene tagging UI is separate, not-yet-scoped follow-up work.

---

## 2026-08-31 (ADAPT-003: decide Foundry UI extension mechanism, ADR-0009)

**Discussed:** With CORE-003 merged to `dev`, Alberto confirmed `dev` was synced locally and picked ADAPT-003 next (his originally-stated preference, held back earlier only because Relationships needed to exist first). Housekeeping first: `feat/core-003-relationship` deleted locally (merged via PR, different SHAs from a squash — confirmed via `dev`'s log rather than assuming), `docs/PROJECT.md` item 9 and the Stage paragraph updated to reflect CORE-003 done.

Researched Foundry v14's actual UI-extension API (issue #20's explicit ask, validated against `https://foundryvtt.com/api/` and the community wiki) since the concrete pain point — `flags.archivexus.nodeType` only settable via the console today — needed a real mechanism decision, not just intent. Couldn't retrieve issue #20's ux-ui-designer GM-tagging-flow comment directly (GitHub's comments load via JS; the REST API call 403'd from this session) — Alberto chose to proceed on the researched API facts plus `SESSION_LOG.md`'s existing one-line paraphrase rather than pausing to paste it in.

**Formalized:** `decisions/ADR-0009-foundry-ui-extension-hooks.md` (Accepted): native `render*`/`getHeaderControls*` Hooks only, no `libWrapper`, no sheet subclassing/replacement — both hook families are documented core API and already cover every UI-extension need identified. First concrete surface decided: a `flags.archivexus.nodeType` tagging control injected into the Actor sheet via `renderActorSheetV2`, using Foundry's native form-submission (`name="flags.archivexus.nodeType"`) to persist it rather than a manual `setFlag` call. Scoped to Actor only, matching every prior Adapter ticket's incremental-per-document-type shape. `docs/PROJECT.md` item 8 and `CHANGELOG.md` updated.

**Still informal / not yet formalized:** No UI code written yet — this was the research/mechanism-decision pass issue #20 explicitly scoped for, matching ADAPT-005's own decide-only precedent. `getHeaderControls*`'s actual wiring (icon/label/action registration) wasn't verified against a real render. JournalEntry/Scene tagging UI, and any header-control actions, are separate, not-yet-scoped follow-up work. The actual injected `<select>`/form section still needs to be built against `ActorSheetV2`'s real template structure — will need a feature branch before any of that code gets written, per the established git-workflow rule.

---

## 2026-08-31 (CORE-003: implement Relationship instance shape)

**Discussed:** With ADAPT-005 decided, Alberto picked Relationship next over ADAPT-003 — reasoning that UI/View work needs real Relationships to exist first. Confirmed scope before writing code (`feat/core-003-relationship`, branched off `dev` before any code per today's git-workflow rule): implement just the Relationship instance shape this pass, matching CORE-001/CORE-002's incremental precedent — Relationship Definition (inverse/cardinality/symmetry/validation/traversalCategory as real, versioned Core state per ADR-0007) is a separate, bigger piece of work, left for its own future ticket.

**Formalized:** `src/core/domain/relationship.ts` (`Relationship extends KnowledgeElement`, `kind: 'relationship'`, `origin`/`target` Node ids, `definitionId` — direction expressed by origin→target ordering, not a separate field) and `relationship.test.ts`, mirroring `node.ts`/`node.test.ts`'s structure and test coverage exactly (Domain Invariants, frozen output, bubbled KnowledgeElement errors, `isRelationship`). Exported from `src/core/domain/index.ts`. `tsc --noEmit` and `eslint`/`prettier` clean from this session; `vitest` can't run from this sandbox (known rollup-optional-deps issue) — Alberto runs the real suite locally. `docs/PROJECT.md` item 9 and `CHANGELOG.md` updated.

**Reviewer pass:** flagged that whether `origin === target` (a self-relationship) should be disallowed was left unaddressed everywhere, including `03_DOMAIN_MODEL.md`'s Relationship `Open Questions` (which still said "None"). Sent to product-owner: no real campaign use case for a Node relating to itself, and it would only add meaningless self-loops to Graph Views (ADR-0007) — decided No. Formalized as a new Decision ("Can a Relationship connect a Node to itself?") and Domain Invariant in `03_DOMAIN_MODEL.md`'s Relationship section, enforced in `createRelationship` (throws `InvalidRelationshipError`), and covered by a new test. `docs/PROJECT.md` and `CHANGELOG.md` updated to match; commit amended (branch not yet pushed).

**Still informal / not yet formalized:** Relationship Definition itself doesn't exist as real Core state — `definitionId` is just a string reference today. Local `npm test`/`eslint` run still needed from Alberto before merge, same as every prior Core ticket.

---

## 2026-08-31 (ADAPT-005 decided: Scene as Block, Block's real shape)

**Discussed:** With STORE-001/002 closed, Alberto picked ADAPT-005 (Scene mapping) over Relationship (still held pending real example data) and ADAPT-003 (backlog). Alberto proposed the core answer himself: a Foundry Scene isn't a standalone concept — it's the tactical/visual representation of a place a Node already represents (his example: the "River Village" Scene is really Agua Clara, a town on the road to the academy), so it should be a Block on that Node, not a Node of its own — directly parallel to the existing "is a JournalEntry a Node? No" Decision. Three follow-up questions resolved it fully: (1) Scenes can and do exist with no Node link yet (still being built, or just a saved map with no plan for it) — those stay unmapped, no placeholder Node ever force-created; (2) no closed list of "place" Node types is wanted or possible (every GM's world differs) — `NodeType` staying an open string already covers this; (3) Block's real shape, generalized past just Scene from Alberto's own Violet Meyer/JournalEntry example: `{ type, uuid, title? }`, uniform (not a discriminated union) because every Block is, by design, always a reference to a real Foundry element — even a GM's own notes go through a Foundry `JournalEntry`, never Archivexus-native freeform content.

**Formalized:** New Decision entries in `03_DOMAIN_MODEL.md` — Knowledge Element ("What does a Block actually contain?") and Node ("Does a Foundry Scene map to its own Node? (ADAPT-005)"). `02_LANGUAGE.md`'s Block entry updated to match. `docs/PROJECT.md` item 7 marked done. `CHANGELOG.md` updated. Handled as a lightweight Decision per `CONTRIBUTING_GUIDE.md` (not an ADR — a smaller domain decision, not one needing its own Context/Consequences).

**Still informal / not yet formalized:** No ticket yet for implementing the Scene→Block mapping itself or updating `Block`'s real TypeScript type in `src/core/domain/block.ts` (still `data: unknown`) — this session was decide-only, matching ADAPT-005's original scoping. Relationship (Core domain) and ADAPT-003 (Foundry UI extension) remain the other two open priorities, still awaiting Alberto's call on which comes next.

---

## 2026-08-31 (STORE-002: opfs-sahpool feasibility spike, ADR-0008 addendum)

**Discussed:** Alberto flagged that today's git workflow had slipped back to committing straight to `dev` (fine for the docs/ADR work per established convention, not fine for real code) — created `feat/opfs-worker-spike` before writing any spike code, correcting course. Wrote a throwaway spike (`opfs-worker-spike.ts`/`.worker.ts`, temporarily wired into `module-entry.ts`'s `ready` hook) to verify ADR-0008 point 8: whether the official `@sqlite.org/sqlite-wasm` package can open a persistent, `opfs-sahpool`-backed SQLite database from inside a real Foundry client. First attempt failed with a silent Worker-level error; live-debugged via Claude in Chrome against Alberto's actual "Academia El Último Norte" Foundry session (Alberto logged in himself each time — credentials are never entered by the assistant, even offered/authorized) by fetching the built bundle and its referenced Worker chunk directly, which found the real cause: Vite's default `base: '/'` baked an absolute root-relative URL into the Worker chunk reference, 404ing against Foundry's actual nested serving path. Fixed with `base: './'` in `vite.foundry.config.ts`; re-verified successful and reproducible across multiple reloads. Also wrote `scripts/release-foundry-module.sh` (bump version, build, zip, tag, `gh release create`) to make testing a feature-branch build easier without merging to `dev` first, since ADR-0006's install flow is manifest-based and pinned to `dev`.

**Formalized:** `vite.foundry.config.ts`'s relative-base fix and `scripts/release-foundry-module.sh` committed to `feat/opfs-worker-spike` (not yet merged/pushed — same GitHub network block from this session's sandbox as every prior session; Alberto pushes from his own terminal). `docs/decisions/ADR-0008-storage-provider.md` gained an Addendum recording the spike's success and the Vite bug found. `docs/PROJECT.md` updated to reflect the previously-open feasibility risk as resolved. The throwaway spike files themselves (`opfs-worker-spike.ts`/`.worker.ts`, the `module-entry.ts` hook, ambient Worker/URL/MessageEvent/self type shims in `foundry-globals.d.ts`, matching `eslint.config.js` globals, and the `@sqlite.org/sqlite-wasm` dependency) were removed once the result was recorded, per their own header comments — confirmed the tree is byte-identical to pre-spike on every file except the two real, permanent changes.

**Still informal / not yet formalized:** No ticket yet for actually implementing the real Storage Provider (the Core-owned SQLite layer, the export mechanism) — STORE-001/STORE-002 were both explicitly decide-and-verify-only. `feat/opfs-worker-spike` still needs a push and, presumably, a merge to `dev` once Alberto reviews it.

---

## 2026-08-31 (STORE-001: Storage Provider decision, ADR-0008)

**Discussed:** Started STORE-001 (issue #32), the next priority per `PROJECT.md`. Consulted architect and DBA independently first: both converged unprompted on SQLite as the lead storage candidate (JSON as legitimate fallback), ruling out Foundry Flags/IndexedDB/PostgreSQL for concrete reasons, and both independently surfaced the same real blocker — the Foundry Adapter is client-side-only with no server component and no filesystem access, so "just use SQLite" doesn't by itself explain how a future standalone frontend would ever reach the data (IndexedDB/OPFS are origin-scoped, same problem either way). Asked the user directly: how soon does he actually want the standalone frontend, should it be read-only or bidirectional, and does the Adapter have (or need) any server-side hook. Answers: near-term priority, motivated by wanting to hand the campaign's knowledge graph to an external AI agent for planning; read-only for now (a future "world builder" mode is explicitly separate, later scope); and — the key reframe — real filesystem access only needs to happen at an explicit, user-triggered export action, not continuously. That single clarification dissolved the reachability blocker: client-side code can already hand the user a downloaded file with no server needed.

A second round had architect and DBA discuss directly with each other (via SendMessage, continuing their own agent sessions) to close the remaining questions: the export artifact should be a generated JSON snapshot (not a raw `.sqlite` copy) since the two real consumers are an AI agent and a possible server-less Web UI, neither needing a SQL engine to read a few hundred/thousand rows once; the snapshot-shaping logic belongs in Core (`toPortableSnapshot`), not the Adapter, since it's a domain-shape decision, not a platform one; and the standalone side needs no database engine of its own — load the JSON, build an in-memory index. DBA also researched concrete WASM-SQLite mechanics (official `@sqlite.org/sqlite-wasm`, `opfs-sahpool` VFS — no COOP/COEP headers required, unlike OPFS's concurrent VFS), naming one real unverified risk: whether dedicated-Worker creation and `opfs-sahpool` actually work cleanly inside Foundry's live client sandbox (CSP, module bundling) — flagged as a required spike, not resolved from outside a real Foundry session. A separate product-owner consult ruled the export should be full and unredacted (the only consumer today is the GM himself; Visibility gates what a player sees, not the GM's own access), with a visibility-filtered "player-safe export" named as a future, separately-triggered feature rather than built speculatively now.

**Formalized:** `decisions/ADR-0008-storage-provider.md` (Accepted, after the user's final review) — full reasoning and the Decision/Consequences/Alternatives breakdown above. `01_ARCHITECTURE.md`'s Storage section rewritten to state the actual decision instead of listing undecided candidates. `docs/PROJECT.md`'s Stage paragraph and Current priorities item 10 updated to mark STORE-001 done and to carry forward the Worker/OPFS spike as the first step of the follow-up implementation work. `CHANGELOG.md` updated.

**Still informal / not yet formalized:** The Worker/OPFS-in-real-Foundry feasibility spike itself hasn't been run — first concrete task before any Storage Provider implementation ticket starts. No ticket yet exists for that spike or for implementing the Storage Provider / export mechanism themselves (both explicitly out of scope for STORE-001, per the ticket and the ADR).

---

## 2026-08-30 (product-owner brainstorm: Relationship/View traversal, ADR-0007)

**Discussed:** Alberto raised what he called the load-bearing open question of the whole project: when a Graph View shows a Node and the GM clicks it (e.g. a City), what determines which connected Relationships/Nodes get pulled in — residents? political factions? criminal or religious organizations? He suspected this needed GM configuration at View-creation time, but worried a non-technical GM couldn't handle a query/traversal system, and asked for input from all the roles.

**Formalized:** Consulted architect, product-owner, dba and ux-ui-designer independently (each given the same domain context and question, no visibility into each other's answers) — they converged unprompted on the same shape: a small closed `traversalCategory` on Relationship Definition (not per-Relationship-instance), a declarative spec on the View resolved by a new Core Query API (engine-agnostic, one execution path for every View format), and 3 fixed MVP presets (Direct only / Everything connected / Curated by me) instead of open per-category config, with an explicit signal for when real config earns its place. A second round resolved cross-role follow-ups: dangling references (a Relationship survives its Node being deleted — no cascade, no delete-blocking, consistent with "History is Part of the World"), a DBA caution for STORE-001 (don't declare a relational FK with RESTRICT/CASCADE on Relationship.origin/target, it would silently reintroduce the rejected cascade/blocking behavior), and three UX refinements ("Direct only" ships pre-selected, the flood safety-valve applies to "Everything connected" by default, "Curated by me" starts from "Direct only" and the GM prunes rather than building from a blank canvas). Alberto then worked through a concrete worked example (a City with 6 direct neighbors vs. what depth 2 additionally pulls in) to understand what "depth" actually means, clarified that "Everything connected" should extend in-depth along each neighbor's own chains rather than laterally at the root, and confirmed depth = 2 on that basis. Landed as `decisions/ADR-0007-relationship-view-traversal.md` (Accepted), with `03_DOMAIN_MODEL.md`'s Relationship and View Decisions sections, its Outstanding Questions, and `02_LANGUAGE.md`'s Relationship Definition examples updated to match.

**Still informal / not yet formalized:** Content-prominence ordering within a large same-category cluster (e.g. which of 40 residents shows first) — filed as View's own Open Question, explicitly deferred to whoever implements the View/UI layer, not blocking ADR-0007. Relationship and View implementation itself hasn't started; this session was groundwork for it, not the implementation.

---

## 2026-08-30 (software-developer: repo cleanup — inline docs + untrack .claude/agents)

**Discussed:** User asked for two cleanup items before starting today's tickets, both scoped to software-developer: (1) several `src/` files had gone over 50% (up to 85%) comment lines — JSDoc essays restating domain rationale that already lives in `03_DOMAIN_MODEL.md`/ADRs — and well-structured code shouldn't need that much explanation; (2) `.claude/agents/*.md` should stop being tracked in git, since an external contributor has no obligation to use this project's specific agent personas.

**Formalized:** Untracked the 7 `.claude/agents/*.md` files (`git rm --cached` + added `.claude/agents/` to `.gitignore`) — files stay on disk for local use, only future commits stop including them; past history (including the original "feat: Added new agents" commit) still has them, since rewriting a shared trunk branch's history wasn't worth the risk for this. Synthesized the 12 worst-offending files across `src/core/domain/` and `src/adapters/foundry/` to a sample-first, then full pass (user approved the `knowledge-element.ts` sample before the rest): kept the single non-obvious "why" plus a pointer to the doc/ADR with the full rationale, cut restatement and inline test-data specifics. Verified no logic changed by diffing each file's comment/blank-stripped content against `HEAD` (byte-identical) and a clean `tsc --noEmit`.

**Follow-up (same session, reviewer audit):** User asked reviewer to check the two cleanup commits for anything needing a fix. One real finding: `docs/CONTRIBUTING_GUIDE.md` Rule 11 pointed at `.claude/agents/`'s `## Git workflow` sections for branch-naming/force-push detail — a stale cross-reference now that `.claude/agents/` is untracked and won't exist for a fresh external clone. Fixed by inlining that detail into Rule 11 itself; `.claude/agents/` files now explicitly mirror the rule rather than being its source. `docs/decisions/README.md`'s similar-looking line about agents treating ADRs as binding was left as-is — it describes agent behavior when the files are present, not a promise made to human contributors, so it isn't stale the same way.

**Still informal / not yet formalized:** Could not run the real Vitest suite or `eslint` — this session's sandbox has no npm registry access (proxy returns 403), the same limitation the 2026-08-29 session hit. An `npm install` attempted mid-session to chase an unrelated `@rollup/rollup-linux-arm64-gnu` error left `node_modules` incomplete (missing `vitest`/`eslint`/`prettier` binaries) — needs a plain `npm install` from a shell with real network access before `npm test`/`npm run lint` will work again locally.

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

**Formalized:** Two new backlog items, both opened as GitHub issues (auto-added to the board's Inbox): ADAPT-004 (#22) — map Foundry `Actor` to Node, a direct extension of ADAPT-001's already-proven pattern (no ownership-inheritance sentinel to worry about, unlike pages, since Actors aren't nested under a parent document); ADAPT-005 (#23) — explicitly _not_ an implementation ticket yet, since whether a Foundry `Scene` should be a Node, something else, or out of scope entirely is an open domain question. Scoped to require a `03_DOMAIN_MODEL.md` Decision entry first, same shape as the existing "Is a Foundry Journal a Node?" Decision, once there's real Scene data to look at. `docs/PROJECT.md`'s Current priorities reordered: ADAPT-004 and ADAPT-005 now come before ADAPT-003 (UI extension research), matching the user's stated priority to get real campaign data flowing before anything else.

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
