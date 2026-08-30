# ADR-0006

## Title

Distribute the Foundry Adapter as an installable Foundry module, built separately from the rest of the codebase, installed only by manual GM action.

---

## Status

Accepted

---

## Context

Through ADAPT-001, `src/adapters/foundry/` contains a pure `JournalEntryPage` → Node mapping, but there is no way yet to actually run any of this inside a live Foundry world — no `module.json` manifest, no bundle Foundry can load, no build step that produces one. This has become the blocker on real progress: further Foundry Adapter work (reading real documents, mapping ownership inheritance, the UI-extension work described below) all needs an actual installed module to test against, and validating the domain model against real campaign data (rather than only synthetic unit-test fixtures) needs the same thing.

Two constraints shape the decision, both explicit:

- Installation must be "realistic," not a local dev-mode shortcut — i.e. it should go through Foundry's real module-install flow (a manifest URL Foundry fetches itself), not a folder manually copied into Foundry's `Data/modules/`.
- Installing (or updating, enabling, disabling) a module inside a running Foundry world is a manual action the GM performs themselves. No agent or automation in this project installs anything into a live Foundry instance — that world is the actual game being played, not a disposable test environment, and its module list is only ever touched by the person running it.

There's also a longer-term shape question this touches: a future standalone frontend is planned that renders Archivexus's stored data without any other service running (not even Foundry) — `01_ARCHITECTURE.md` already lists a "Web UI" as a peer Application to Foundry, so that goal doesn't require a Core change, but it does mean the Foundry-specific bundle must stay strictly separate from anything that isn't Foundry-specific, now, not as a later cleanup.

---

## Decision

1. **A dedicated build target produces the Foundry-only bundle.** `vite.foundry.config.ts` builds a single ES module (`dist/foundry/archivexus.js`) from `src/adapters/foundry/module-entry.ts` and whatever it imports from `src/core` — nothing from any other future adapter, ever. This is deliberately a separate config from the project's general `vite build`, so a later adapter (Obsidian, the standalone Web UI, ...) can never end up inside a Foundry world's module folder by accident.
2. **Distribution is manifest-based**, matching how Foundry module installs actually work: a `module.json` at the repo root names `dist/foundry/archivexus.js` as its `esmodules` entry, a `manifest` URL pointing at that same file on `dev`, and a `download` URL pointing at a versioned release archive. The GM pastes the manifest URL into Foundry's own "Install Module" dialog; Foundry fetches the manifest and the archive itself. That's what "realistic" means here, as opposed to a human dragging source files into `Data/modules/`.
3. **Installing into a live Foundry world is always a manual, human action.** This project's automation — this session included — never installs, enables, disables, or updates a module inside a running Foundry instance. That boundary is permanent, not a stand-in for automation to be added later.
4. **Building and packaging the release itself is also a manual, human step for now.** Neither this session's cloud container (no network to publish a GitHub Release) nor the bridged local shell (its Linux VM has a native-binary mismatch with the `node_modules` installed on the Mac — confirmed by `vite`/`vitest` failing there with a `@rollup/rollup-linux-arm64-gnu` module-not-found error) can run `vite build` end-to-end today. The GM runs `npm run build:foundry-module` and cuts the GitHub Release locally, same as they already do for merging and pushing branches.

This doesn't change anything about the Core: `01_ARCHITECTURE.md`'s "Core depends on nothing" and "Adapters own integrations" both hold exactly as before. This ADR is only about how the Foundry Adapter's code reaches a Foundry world.

---

## Consequences

### Advantages

- Forces the adapter/build boundary to exist now, while there's only one adapter, instead of retrofitting it once a second one (Obsidian, Web UI) exists and the temptation to share a bundle is stronger.
- Validates against Foundry's real install UX early, rather than discovering install friction only once the module is "done."
- Keeps the manual-install rule structural (a build/packaging boundary this session's tools literally can't cross) rather than a policy that has to be remembered every time.

### Disadvantages

- No fast local dev loop yet — every source change needs a manual local build and a new release to test inside Foundry. Acceptable for a personal project at this stage; worth revisiting (e.g. a `dev`-mode symlink workflow, still human-run) if iteration speed becomes the actual bottleneck once real Foundry testing starts.
- The release process is entirely manual today (no CI, no automated publish) — same tradeoff as this project's git push/merge flow already accepts, for the same reason (no write-capable network path from this session).

---

## Alternatives Considered

- **Local-folder-copy install only** (no manifest, no release): rejected — explicitly not what was asked for ("a realistic installation and not a local one"), and it hides real install-flow bugs until later.
- **One shared bundle for all adapters**: rejected — bloats the Foundry package with code a Foundry world will never use, and risks a future adapter's code (or its dependencies) shipping into a live game unintentionally. Directly the kind of drift `01_ARCHITECTURE.md`'s Adapter boundary exists to prevent.
- **CI-automated build and release on push**: deferred, not rejected — there's no outbound network/write path from this project's current tooling to set that up yet (same constraint documented for git pushes in `docs/SESSION_LOG.md`). Worth reconsidering once that changes.
