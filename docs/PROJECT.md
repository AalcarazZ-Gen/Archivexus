# Project

> The operational snapshot of this project. This is the file agents read first, and the one to update most often — whenever the stage, priorities, or constraints actually change.

## Name

Archivexus

## Type

- [x] Personal / fun project

Confirmed 2026-08-26: built for personal use in tabletop campaigns, no commercial goal for now. Agents should favor speed and simplicity over process here.

## Stage

Implementation started (2026-08-29). Domain model and architecture are settled (see `03_DOMAIN_MODEL.md`'s Decisions and ADRs); the Core is now being built out incrementally. `src/core/domain/` exists with the `KnowledgeElement` base abstraction (CORE-001, done) and its unit tests; `package.json`/`tsconfig.json`/`vitest.config.ts`/`eslint.config.js` scaffold the TypeScript/Vite/Vitest/ESLint/Prettier stack from `README.md`. Node (CORE-002) and the Foundry Adapter (ADAPT-001) are not started yet.

## Target users

Tabletop RPG Game Masters running campaigns in Foundry VTT who want a connected memory of their world (characters, locations, organizations, events, relationships, history) instead of fragmented, hard-to-navigate documents.

## Tech stack

Planned, per `README.md`: TypeScript (core language), Foundry VTT API (primary platform integration), Vite (dev tooling), Vitest (unit testing), ESLint, Prettier. Architecture is intentionally platform-agnostic at the Core (see `01_ARCHITECTURE.md`); Foundry is the first Adapter, not a Core dependency.

## Constraints

None formally documented yet. Worth capturing here once real constraints appear (time budget, whether this ships as a paid Foundry module, compatibility requirements with specific Foundry versions, etc.).

## Current priorities (next 2-4 weeks)

_Previous priorities #1 and #2 (closing the docs consistency review findings, resolving `03_DOMAIN_MODEL.md`'s Outstanding Questions) are done as of 2026-08-27 — see the per-concept Decisions sections in `03_DOMAIN_MODEL.md` and ADR-0005._

1. ~~Implement the Knowledge Element base abstraction~~ — done 2026-08-29 (`src/core/domain/`, CORE-001). `npm install && npm test` confirmed clean. Board still shows CORE-001 as "Ready for Implementation" — move it once reviewed.
2. Implement Node (Board: CORE-002), the smallest vertical slice the Foundry Adapter needs, per `01_ARCHITECTURE.md` and `03_DOMAIN_MODEL.md`'s Node section.
3. Implement the Foundry Adapter's `JournalEntryPage` → Node mapping, including the generic `Lore` Node type for pages that don't fit an existing type (per `03_DOMAIN_MODEL.md`'s Node Decisions). (Board: ADAPT-001.)
4. Once the Core slice is stable, extend to Relationship, then to View as a Knowledge Element (per ADR-0005) — View is lower priority since it depends on having enough Nodes/Relationships worth projecting.

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
