# Project

> The operational snapshot of this project. This is the file agents read first, and the one to update most often — whenever the stage, priorities, or constraints actually change.

## Name

Archivexus

## Type

- [x] Personal / fun project

Confirmed 2026-08-26: built for personal use in tabletop campaigns, no commercial goal for now. Agents should favor speed and simplicity over process here.

## Stage

Implementation started (2026-08-29). Domain model and architecture are settled (see `03_DOMAIN_MODEL.md`'s Decisions and ADRs); the Core is now being built out incrementally. `src/core/domain/` has the `KnowledgeElement` base abstraction (CORE-001) and `Node` (CORE-002), both merged to `dev` with unit tests. `src/adapters/foundry/` has the first Foundry Adapter slice (ADAPT-001, merged to `dev`): `mapJournalEntryPageToNode`, a pure JournalEntryPage-to-Node mapping. A real, installable Foundry module scaffold now exists too (ADAPT-002, per ADR-0006): `module.json`, `src/adapters/foundry/module-entry.ts`, and a dedicated `build:foundry-module` build target — not yet built or released, since building needs a native toolchain neither of this session's environments has (see ADR-0006's Context). `package.json`/`tsconfig.json`/`vitest.config.ts`/`eslint.config.js` scaffold the TypeScript/Vite/Vitest/ESLint/Prettier stack from `README.md`. Longer-term, once real Foundry data is flowing through the Adapter, a standalone frontend that renders Archivexus's stored data without any other service running is planned — `01_ARCHITECTURE.md`'s Application layer already has room for it ("Web UI" alongside Foundry), so it doesn't change the Core.

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
3. ~~Implement the Foundry Adapter's `JournalEntryPage` → Node mapping~~ — done and merged to `dev` (`src/adapters/foundry/journal-entry-page-to-node.ts`, ADAPT-001, board card moved to Done, issue #10 auto-closed). Deliberately doesn't yet map page content to Blocks (`Block`'s shape is still a placeholder) or resolve Foundry's ownership-inheritance sentinel (needs a live Foundry instance) — both flagged as open follow-ups, not yet their own tickets.
4. Foundry module scaffold implemented on a feature branch, not yet merged (ADAPT-002, per ADR-0006): `module.json`, `module-entry.ts`, `build:foundry-module`. Next concrete step is the user building and releasing it locally, installing it manually into their Foundry world, and giving agents read access to that live world (`localhost:30000`) so real-data validation can start — the actual point of ADAPT-001/002.
5. Foundry UI extension/customization (ADAPT-003) — researching how to incrementally extend, edit or replace Foundry's default UI per element, validated against `https://foundryvtt.com/api/`. Backlog, sequenced after ADAPT-002 has something installed to extend against.
6. Relationship (Core domain, per ADR-0005) — explicitly held by the user until real example data exists from the Foundry integration work above; then View, lower priority still since it depends on having enough Nodes/Relationships worth projecting.

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
