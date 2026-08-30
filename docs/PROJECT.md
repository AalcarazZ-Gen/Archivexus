# Project

> The operational snapshot of this project. This is the file agents read first, and the one to update most often — whenever the stage, priorities, or constraints actually change.

## Name

Archivexus

## Type

- [x] Personal / fun project

Confirmed 2026-08-26: built for personal use in tabletop campaigns, no commercial goal for now. Agents should favor speed and simplicity over process here.

## Stage

Implementation started (2026-08-29). Domain model and architecture are settled (see `03_DOMAIN_MODEL.md`'s Decisions and ADRs); the Core is now being built out incrementally. `src/core/domain/` has the `KnowledgeElement` base abstraction (CORE-001) and `Node` (CORE-002), both merged to `dev` with unit tests. `src/adapters/foundry/` has the first Foundry Adapter slice (ADAPT-001, merged to `dev`): `mapJournalEntryPageToNode`, a pure JournalEntryPage-to-Node mapping. A real, installable Foundry module scaffold now exists too (ADAPT-002, per ADR-0006): `module.json`, `src/adapters/foundry/module-entry.ts`, and a dedicated `build:foundry-module` build target — built, released and manually installed by the user; confirmed loading in a live Foundry v14 GM session at `localhost:30000` (building itself is still a manual, locally-run step, since neither of this session's environments can run `vite build` — see ADR-0006's Context). `package.json`/`tsconfig.json`/`vitest.config.ts`/`eslint.config.js` scaffold the TypeScript/Vite/Vitest/ESLint/Prettier stack from `README.md`. Real Foundry data is now flowing through both Adapter slices: all 41 real Actors and all 61 real Journal Pages from the "Academia El Último Norte" campaign map cleanly to Nodes (verified 2026-08-30 — see `SESSION_LOG.md`). What's still missing is somewhere to persist that output and a View to look at it through — `01_ARCHITECTURE.md`'s Storage section lists candidates (Foundry Flags, JSON, IndexedDB, SQLite, PostgreSQL) but has no ADR yet; scoped as STORE-001 (issue #32) to decide next session. Longer-term, once storage is decided, a standalone frontend that renders Archivexus's stored data without any other service running is planned — `01_ARCHITECTURE.md`'s Application layer already has room for it ("Web UI" alongside Foundry), so it doesn't change the Core.

## Target users

Tabletop RPG Game Masters running campaigns in Foundry VTT who want a connected memory of their world (characters, locations, organizations, events, relationships, history) instead of fragmented, hard-to-navigate documents.

## Tech stack

Planned, per `README.md`: TypeScript (core language), Foundry VTT API (primary platform integration), Vite (dev tooling), Vitest (unit testing), ESLint, Prettier. Architecture is intentionally platform-agnostic at the Core (see `01_ARCHITECTURE.md`); Foundry is the first Adapter, not a Core dependency.

## Constraints

Installing, updating, enabling or disabling a module inside a live Foundry world is always a manual action performed by the user (GM) — never by an agent or this session's automation (ADR-0006). Otherwise none formally documented yet; worth capturing here once more appear (time budget, whether this ships as a paid Foundry module, compatibility requirements with specific Foundry versions, etc.).

## Current priorities (next 2-4 weeks)

_Previous priorities #1 and #2 (closing the docs consistency review findings, resolving `03_DOMAIN_MODEL.md`'s Outstanding Questions) are done as of 2026-08-27 — see the per-concept Decisions sections in `03_DOMAIN_MODEL.md` and ADR-0005._

1. ~~Implement the Knowledge Element base abstraction~~ — done, merged to `dev` (CORE-001, board card moved to Done, issue #8 auto-closed).
2. ~~Implement Node~~ — done and merged to `dev` (`src/core/domain/node.ts`, CORE-002). Reviewed (docs-consistency findings fixed across three rounds) and merged; board card moved to Done, issue #9 auto-closed.
3. ~~Implement the Foundry Adapter's `JournalEntryPage` → Node mapping~~ — done and merged to `dev` (`src/adapters/foundry/journal-entry-page-to-node.ts`, ADAPT-001, board card moved to Done, issue #10 auto-closed). Validated against live Foundry data (5 real pages created in the user's "Dev test" world, `journal-entry-page-to-node.live-fixtures.test.ts`) — confirmed Foundry's real `-1` ownership-inheritance sentinel matches what the code assumed. Still doesn't map page content to Blocks (`Block`'s shape is still a placeholder) or resolve that inheritance sentinel against the parent `JournalEntry` — both flagged as open follow-ups, not yet their own tickets.
4. ~~Foundry module scaffold~~ — done, merged to `dev` (`module.json`, `module-entry.ts`, `build:foundry-module`, ADAPT-002, board card moved to Done, issue #19 auto-closed). Built, released and manually installed by the user; confirmed loading in a live Foundry v14 GM session at `localhost:30000`.
5. ~~Foundry Adapter — map `Actor` to Node~~ — done, `src/adapters/foundry/actor-to-node.ts` (ADAPT-004, issue #22). `mapActorToNode`, same pattern as ADAPT-001: id from uuid, title from name, type from an explicit `flags.archivexus.nodeType` flag falling back to `Character`, visibility from `ownership.default`. Deliberately does not branch on Foundry's own `actor.type` (character/npc/encounter/group, confirmed from the real "Academia El Último Norte" campaign's 41 Actors) — product-owner call on issue #22, consistent with ADAPT-001's no-content-inference rule. Validated against 4 real Actors, one per real `actor.type`.
6. ~~Fix Node title collisions on generic Foundry page names~~ — done (#25). Real campaign data showed 5 distinct NPCs' "Retrato" (Portrait) pages collapsing to the same Node title. `mapJournalEntryPageToNode` now qualifies the title with the parent JournalEntry's name when it disambiguates anything (`FoundryJournalEntryPageLike.parent.name`), falling back to the bare page name otherwise — fully backward compatible.
7. Decide how Foundry `Scene`s map into Archivexus (ADAPT-005, issue #23) — genuinely undecided (Node? something else?), needs a `03_DOMAIN_MODEL.md` Decision entry before it's implementable. 22 real Scenes now available to look at instead of guessing.
8. Foundry UI extension/customization (ADAPT-003, issue #20) — researching how to incrementally extend, edit or replace Foundry's default UI per element, validated against `https://foundryvtt.com/api/`. A GM-tagging-flow proposal from ux-ui-designer is already waiting on the issue as design input. Backlog.
9. Relationship (Core domain, per ADR-0005) — explicitly held by the user until real example data exists from the Foundry integration work above; then View, lower priority still since it depends on having enough Nodes/Relationships worth projecting.
10. **Decide Archivexus's Storage Provider** (STORE-001, issue #32) — the next concrete step, scoped and ready to start. Storage is architecturally undecided: `01_ARCHITECTURE.md`'s Storage section lists candidates (Foundry Flags, JSON, IndexedDB, SQLite, PostgreSQL) but has no ADR. Needs a new ADR weighing the standalone-frontend constraint explicitly, then `01_ARCHITECTURE.md`'s Storage section updated to match. Implementing the Storage Provider itself and the View/UI that reads from it are explicitly out of scope for this ticket — separate follow-up work once the ADR lands.

## Sensitive areas — don't touch or decide without asking first

- The Core's platform independence (`01_ARCHITECTURE.md`'s "Domain Ownership" section): don't let Foundry-specific concepts leak into the Core without an explicit ADR.
- Anything that would require an internal-ID migration for elements already keyed by Foundry UUID (see `ADR-0001-use-foundry-UUID.md`).

## Related

- Vision: `00_VISION.md`
- Architecture: `01_ARCHITECTURE.md`
- Ubiquitous language: `02_LANGUAGE.md`
- Domain model: `03_DOMAIN_MODEL.md`
- Decisions: `decisions/`
- Session log: `SESSION_LOG.md`
