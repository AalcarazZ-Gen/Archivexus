# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

https://keepachangelog.com/

This project follows Semantic Versioning.

https://semver.org/

---

## [Unreleased]

### Added

- Initial project vision.
- Initial architecture documentation.
- Language specification.
- Architecture Decision Records (ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005).
- Operational project snapshot (`docs/PROJECT.md`).
- ADR workflow documentation (`docs/decisions/README.md`, `docs/decisions/ADR-0000-template.md`).
- Claude Code subagents for product ownership, UX/UI design, development, QA, and documentation review (`.claude/agents/`).
- Claude Code subagents for cross-cutting system architecture (`architect.md`) and database administration (`dba.md`), and `reviewer.md` updated to route findings to them.
- Project scaffolding: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json` (TypeScript, Vite, Vitest, ESLint, Prettier per `docs/PROJECT.md`'s planned stack).
- Core domain: `KnowledgeElement` base abstraction (`src/core/domain/`) — the shared shape every Node, Relationship and View will compose with, plus its supporting value types (`Visibility`, `Tag`, `HistoryEntry`, `Block`, `KnowledgeElementReference`), a validating `createKnowledgeElement` factory enforcing the Domain Invariants from `03_DOMAIN_MODEL.md`, and unit tests (CORE-001).
- `docs/CONTRIBUTING_GUIDE.md` Rule 11: the feature-branch + rebase + squash git workflow is now a binding project rule, not just something one agent happens to mention. Updated to also list `qa-tester` once it got the same section, and to state the actual criterion (any role with `Bash`) instead of a hardcoded role list that needs manual upkeep each time.
- `.claude/agents/dba.md` (and its `agents-core` canonical copy): added the same `## Git workflow` section as `software-developer.md`, plus a DBA-specific note on not squashing across already-applied migrations — product-owner call, since DBA has the same Bash/Write/Edit footprint as software-developer and was missing it.
- `.claude/agents/qa-tester.md` (and its `agents-core` canonical copy): added the same `## Git workflow` section — qa-tester has `Bash` + `Write` (writes automated tests per its own Deliverable mode) and was missing it too. `architect.md` was considered and correctly excluded: it has `Write` but no `Bash`, so it has no way to execute the workflow itself.
- Core domain: `Node` (`src/core/domain/node.ts`) — the first concrete Knowledge Element type, composed on top of `createKnowledgeElement` with one added field (`type`). `NodeType` is a plain string, not a closed enum, per `01_ARCHITECTURE.md`'s Extensible principle; `KNOWN_NODE_TYPES` lists `03_DOMAIN_MODEL.md`'s examples as a reference only. Enforces Node's Domain Invariants (no nesting, no type change, id independent of type) and unit tests covering them (CORE-002).
- Foundry Adapter: `mapJournalEntryPageToNode` (`src/adapters/foundry/journal-entry-page-to-node.ts`) — maps a Foundry `JournalEntryPage` to a Node (ADAPT-001). Uses the page's `uuid` as the Node id (ADR-0001) and `name` as its title. Node type comes from an explicit `flags.archivexus.nodeType` the GM sets, falling back to the generic `Lore` type when absent — deliberately no content/title-based inference, since guessing a semantic type from free text would be business logic an Adapter must not contain (`01_ARCHITECTURE.md`'s Adapters section). Visibility comes from the page's `ownership.default` per 02_LANGUAGE.md/ADR-0003's mapping (NONE/LIMITED → hidden, OBSERVER → visible, OWNER → owned); an unset or unrecognized value (including Foundry's `-1` "inherit from parent" sentinel) falls through to Node's own default (hidden) rather than being resolved here — resolving inheritance against the parent `JournalEntry` needs a live Foundry instance and is out of scope for this pure mapping function. Page content/text is deliberately not mapped to Blocks yet — `Block` is still an explicitly provisional placeholder with no settled shape. Pure and Foundry-runtime-free (a minimal structural `FoundryJournalEntryPageLike` type stands in for the real Foundry type, so this is unit-testable without a Foundry install or a types dependency), with unit tests covering id/title/type/visibility mapping and the fallback cases.
- `docs/decisions/ADR-0006-foundry-module-distribution.md`: the Foundry Adapter's build/bundle is split from the rest of the codebase (a dedicated `vite.foundry.config.ts` target), distribution is manifest-based (Foundry fetches `module.json` and a release archive itself — the real install flow, not a local folder copy), and installing a module into a live Foundry world is always a manual, human (GM) action — never performed by an agent.
- Foundry module scaffold (ADAPT-002): `module.json` (manifest pointing at `dist/foundry/archivexus.js`, `manifest`/`download` URLs per ADR-0006), `src/adapters/foundry/module-entry.ts` (the Foundry-loadable entry point, registers on Foundry's `init` hook — doesn't read/write any Foundry documents yet), `src/adapters/foundry/foundry-globals.d.ts` (minimal ambient `Hooks`/`console` declarations, same no-real-Foundry-types-dependency tradeoff as `journal-entry-page-to-node.ts`), and a `build:foundry-module` npm script. Building the actual bundle still needs to be run locally (this session's environments can't run `vite build` — see ADR-0006's Context).
- `src/adapters/foundry/logger.ts`: a tiny structured logger (`createLogger(moduleId)` → `info`/`warn`/`error`, each prefixed with the module id) replacing `module-entry.ts`'s raw `console.log` — centralizes the package's only `console` usage to one file and makes it mockable, with `logger.test.ts` covering the prefixing behavior.

### Changed

- `.claude/agents/software-developer.md` (and its canonical copy in `agents-core`): added a `## Git workflow` section — feature branches off trunk, rebase (not merge) to stay current, squash before merging back — per user feedback after CORE-001.
- Reconciled `01_ARCHITECTURE.md`, `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md` for consistency (single source of truth for Storage, Visibility vocabulary, Relationship-endpoint rules).
- Clarified when a decision needs a full ADR vs. a lightweight entry in `03_DOMAIN_MODEL.md` (`docs/CONTRIBUTING_GUIDE.md`, `CONTRIBUTING.md`).
- Updated `README.md`'s documentation table and Planned Architecture diagram to match the actual `docs/` contents.
- Resolved all of `03_DOMAIN_MODEL.md`'s Outstanding Questions: Foundry Journal → Node mapping (with a generic `Lore` type), Blocks made explicitly optional, Knowledge Element capabilities exposed directly rather than through composable behaviors, and View promoted to a first-class Knowledge Element (see ADR-0005).
- Reconciled View's format/audience vocabulary between `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md` — audience is now expressed via Visibility instead of a separate "GM/Player/Public View" vocabulary.
- `README.md`'s Current Status now reflects that implementation has started, instead of still saying pre-implementation. Its Repository Structure no longer shows a separate top-level `tests/` folder — tests are colocated as `*.test.ts` next to what they test, now also stated in `CONTRIBUTING.md`'s Coding Standards.
- `docs/PROJECT.md`: Stage and Current priorities updated now that CORE-002 (`Node`) is merged to `dev` (board card moved to Done, issue #9 auto-closed); ADAPT-001 (Foundry Adapter) moved to "Ready for Implementation" on the board as the next task.
- `docs/PROJECT.md`: Current priorities updated to reflect ADAPT-002 merged and verified live, and two new backlog items scoped: ADAPT-004 (map Foundry `Actor` to Node, issue #22) and ADAPT-005 (decide how Foundry `Scene`s map into Archivexus — an open domain question, not yet an implementation ticket, issue #23), both ahead of ADAPT-003 in sequence per the user's priority to import their real campaign next.

### Fixed

- `package.json` declared `"license": "MIT"`; the repo's actual `LICENSE` is Mozilla Public License 2.0 — corrected to `"MPL-2.0"`.
- Stale `0000-template.md` references corrected to `ADR-0000-template.md` (the file's actual name) in `architect.md`, `software-developer.md` and `SESSION_LOG.md` — same in `agents-core`'s canonical `architect.md`/`software-developer.md`. Same recurring wrong-citation pattern flagged in the 2026-08-27 session; reviewer caught these via a repo-wide grep.
- `docs/02_LANGUAGE.md`'s Node examples list was missing `Item` (present in `03_DOMAIN_MODEL.md`'s Node section and `KNOWN_NODE_TYPES` in `src/core/domain/node.ts`, both of which cite `03_DOMAIN_MODEL.md`) — added, and reordered to match the other two lists exactly.
- `README.md`'s Contributing section and `CONTRIBUTING.md`'s opening still claimed the project was in an "early architecture phase"/pre-implementation, contradicting `README.md`'s own already-fixed Current Status section and `docs/PROJECT.md`'s Stage — same recurring stale-claim pattern as the `0000-template.md` citations; caught by reviewer, both updated to reflect that implementation is underway.
- `02_LANGUAGE.md`'s and `03_DOMAIN_MODEL.md`'s Node sections described the Foundry Adapter as typing a page "by what it actually describes" — read as automatic content-based inference, contradicting ADAPT-001's actual implementation (an explicit GM-set flag, never inferred, per `01_ARCHITECTURE.md`'s "Adapters should contain no business logic"). Both reworded to describe the real GM-flag mechanism.
- Wrong citation, same recurring pattern: `journal-entry-page-to-node.ts`'s comments, `CHANGELOG.md`, and `docs/SESSION_LOG.md` attributed "Adapters must contain no business logic" to `CONTRIBUTING_GUIDE.md` Rule 3 (which is actually about Core platform-agnosticism, not Adapters). The line is in `01_ARCHITECTURE.md`'s Adapters section — corrected in all three places.
- `docs/PROJECT.md`: Stage and Current priorities updated now that ADAPT-001 is merged to `dev` (board card moved to Done, issue #10 auto-closed).
- `module-entry.ts` failed `npm run lint`: `no-undef` flagged `Hooks` and `console` because ESLint's `no-undef` rule doesn't read the ambient declarations in `foundry-globals.d.ts`, only its own `globals` config (reviewer caught this by actually running `eslint`, not just `tsc`). Fixed by adding `eslint.config.js`'s `FOUNDRY_ADAPTER_GLOBALS` list (currently just `Hooks`) plus `console`, scoped to `src/adapters/foundry/**/*.ts` and explicitly documented to be kept in sync with `foundry-globals.d.ts`.

### Removed