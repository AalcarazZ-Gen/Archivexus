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

### Changed

- `.claude/agents/software-developer.md` (and its canonical copy in `agents-core`): added a `## Git workflow` section — feature branches off trunk, rebase (not merge) to stay current, squash before merging back — per user feedback after CORE-001.
- Reconciled `01_ARCHITECTURE.md`, `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md` for consistency (single source of truth for Storage, Visibility vocabulary, Relationship-endpoint rules).
- Clarified when a decision needs a full ADR vs. a lightweight entry in `03_DOMAIN_MODEL.md` (`docs/CONTRIBUTING_GUIDE.md`, `CONTRIBUTING.md`).
- Updated `README.md`'s documentation table and Planned Architecture diagram to match the actual `docs/` contents.
- Resolved all of `03_DOMAIN_MODEL.md`'s Outstanding Questions: Foundry Journal → Node mapping (with a generic `Lore` type), Blocks made explicitly optional, Knowledge Element capabilities exposed directly rather than through composable behaviors, and View promoted to a first-class Knowledge Element (see ADR-0005).
- Reconciled View's format/audience vocabulary between `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md` — audience is now expressed via Visibility instead of a separate "GM/Player/Public View" vocabulary.
- `README.md`'s Current Status now reflects that implementation has started, instead of still saying pre-implementation. Its Repository Structure no longer shows a separate top-level `tests/` folder — tests are colocated as `*.test.ts` next to what they test, now also stated in `CONTRIBUTING.md`'s Coding Standards.

### Fixed

- `package.json` declared `"license": "MIT"`; the repo's actual `LICENSE` is Mozilla Public License 2.0 — corrected to `"MPL-2.0"`.
- Stale `0000-template.md` references corrected to `ADR-0000-template.md` (the file's actual name) in `architect.md`, `software-developer.md` and `SESSION_LOG.md` — same in `agents-core`'s canonical `architect.md`/`software-developer.md`. Same recurring wrong-citation pattern flagged in the 2026-08-27 session; reviewer caught these via a repo-wide grep.

### Removed