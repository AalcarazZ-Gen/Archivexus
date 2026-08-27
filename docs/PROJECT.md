# Project

> The operational snapshot of this project. This is the file agents read first, and the one to update most often — whenever the stage, priorities, or constraints actually change.

## Name

Archivexus

## Type

- [x] Personal / fun project

Confirmed 2026-08-26: built for personal use in tabletop campaigns, no commercial goal for now. Agents should favor speed and simplicity over process here.

## Stage

Early architecture phase — pre-implementation. Per the root `README.md`: "The project is focused on defining its core architecture and domain model before implementation begins." No `src/` or `tests/` exist yet; only `docs/` and project scaffolding.

## Target users

Tabletop RPG Game Masters running campaigns in Foundry VTT who want a connected memory of their world (characters, locations, organizations, events, relationships, history) instead of fragmented, hard-to-navigate documents.

## Tech stack

Planned, per `README.md`: TypeScript (core language), Foundry VTT API (primary platform integration), Vite (dev tooling), Vitest (unit testing), ESLint, Prettier. Architecture is intentionally platform-agnostic at the Core (see `01_ARCHITECTURE.md`); Foundry is the first Adapter, not a Core dependency.

## Constraints

None formally documented yet. Worth capturing here once real constraints appear (time budget, whether this ships as a paid Foundry module, compatibility requirements with specific Foundry versions, etc.).

## Current priorities (next 2-4 weeks)

1. Close the remaining findings from the docs consistency review (PR #6): the ADR-0004 status vs. its own listed open questions, the Journal Node-vs-open-question contradiction between `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md`, and the stale `CHANGELOG.md`.
2. Resolve enough of `03_DOMAIN_MODEL.md`'s Outstanding Questions to unblock a first implementation slice — at minimum, which concepts count as Nodes (the Journal question) and whether Blocks are mandatory or optional on every Knowledge Element.
3. Start implementation of the Core domain model (Knowledge Element base abstraction + Node) per `01_ARCHITECTURE.md`, scoped to the smallest vertical slice the Foundry Adapter needs first.

## Sensitive areas — don't touch or decide without asking first

- The Core's platform independence (`01_ARCHITECTURE.md`'s "Domain Ownership" section): don't let Foundry-specific concepts leak into the Core without an explicit ADR.
- Anything that would require an internal-ID migration for elements already keyed by Foundry UUID (see `ADR-0001-use-foundry-UUID.md`).

## Related

- Vision: `00_VISION.md`
- Architecture: `01_ARCHITECTURE.md`
- Ubiquitous language: `02_LANGUAGE.md`
- Domain model: `03_DOMAIN_MODEL.md`
- Decisions: `decisions/`
