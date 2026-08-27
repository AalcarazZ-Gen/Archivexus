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

### Changed

- Reconciled `01_ARCHITECTURE.md`, `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md` for consistency (single source of truth for Storage, Visibility vocabulary, Relationship-endpoint rules).
- Clarified when a decision needs a full ADR vs. a lightweight entry in `03_DOMAIN_MODEL.md` (`docs/CONTRIBUTING_GUIDE.md`, `CONTRIBUTING.md`).
- Updated `README.md`'s documentation table and Planned Architecture diagram to match the actual `docs/` contents.
- Resolved all of `03_DOMAIN_MODEL.md`'s Outstanding Questions: Foundry Journal → Node mapping (with a generic `Lore` type), Blocks made explicitly optional, Knowledge Element capabilities exposed directly rather than through composable behaviors, and View promoted to a first-class Knowledge Element (see ADR-0005).
- Reconciled View's format/audience vocabulary between `02_LANGUAGE.md` and `03_DOMAIN_MODEL.md` — audience is now expressed via Visibility instead of a separate "GM/Player/Public View" vocabulary.

### Fixed

### Removed