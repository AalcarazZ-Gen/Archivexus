# ADR-0009

## Title

Extend Foundry's default UI using native `render*`/`getHeaderControls*` Hooks, not libWrapper or sheet replacement; first concrete surface is a GM-tagging flow for `flags.archivexus.nodeType`.

---

## Status

Accepted

---

## Context

ADAPT-001/ADAPT-004 map Foundry `JournalEntryPage`s and `Actor`s to Nodes, but the Node `type` they produce depends on an explicit `flags.archivexus.nodeType` flag the GM has to set — today the only way to set it is the Foundry console (`actor.setFlag('archivexus', 'nodeType', '...')`), which is unusable for anyone who isn't comfortable in devtools and doesn't scale past a handful of Actors. This is a real, already-identified gap (`SESSION_LOG.md`, 2026-08-30: "A minimal GM-facing UI for setting `flags.archivexus.nodeType` ... is still an acknowledged gap"), and it's the concrete case this ADR needs to unblock. Beyond it, `01_ARCHITECTURE.md`'s Application layer anticipates Archivexus surfacing inside Foundry's own UI more broadly (viewing a Node's Blocks/Relationships from its source sheet, eventually), so the mechanism decided here isn't just for one flag — it's what every future piece of Foundry-side UI work will build on.

Issue #20 (ADAPT-003) scoped this as research-first: name the actual Foundry v14 hooks/extension points (validated against `https://foundryvtt.com/api/`) before any UI code gets written, and confirm the approach fits `01_ARCHITECTURE.md`'s Adapter boundary ("Adapters translate platform-specific data into Archivexus concepts. Adapters should contain no business logic... Core owns the domain. Adapters own integrations."). That research is what this ADR records.

Foundry v13+ moved sheet applications to `ApplicationV2` (Actor/Item/JournalEntry sheets included). Two extension points are officially documented and exist specifically so third-party modules don't have to subclass or replace core sheets:

- **`render{ApplicationClassName}` hooks** (e.g. `renderActorSheetV2`, `renderJournalEntrySheet`) fire on every render, passing `(app, htmlElement, context, options)`. The documented safe pattern is to find an insertion point in the rendered `htmlElement` via a selector, append a form section whose inputs use Foundry's own `name="flags.archivexus.nodeType"` convention, and let the sheet's native form submission persist it — no direct `Document#update` call needed, no risk of racing the sheet's own save. Hooks fire up the inheritance chain (`renderActorSheetV2` → `renderDocumentSheet` → ... → `renderApplication`), so a handler can target exactly the specificity it needs. ([Foundry Hooks — Community Wiki](https://foundryvtt.wiki/en/development/api/hooks))
- **`getHeaderControls{ApplicationClassName}` hooks** (e.g. `getHeaderControlsActorSheetV2`), signature `(application, controls)`, let a module push a button into the sheet's header-controls dropdown without touching the sheet body at all. ([official API docs](https://foundryvtt.com/api/functions/hookEvents.getHeaderControlsApplicationV2.html))

The wider community's alternative to native hooks is **libWrapper** (a de facto standard library many modules use to safely monkey-patch core methods when no hook covers what's needed). It solves a different problem — patching _behavior_ Foundry doesn't expose a hook for at all — not the one here, since both `render*` and `getHeaderControls*` already cover "add UI to an existing sheet" without patching anything.

---

## Decision

1. **Foundry UI extension uses only native Hooks — `render*` for injected sections, `getHeaderControls*` for header actions.** No `libWrapper` dependency, no subclassing or replacing any core sheet class (`ActorSheetV2`, `JournalEntrySheetV2`, etc.). Both documented hook families already cover every UI-extension need identified so far; adding `libWrapper` would be an extra dependency for capability this project doesn't need yet. If a future need genuinely can't be met by a hook (patching sheet _behavior_, not just adding UI to it), that's a new decision to revisit, not something to pre-emptively add now.
2. **First concrete surface: a `flags.archivexus.nodeType` tagging control on the Actor sheet**, via a `renderActorSheetV2` handler that injects a small labeled `<select>` (or free-text input, TBD at implementation time against the real `ActorSheetV2` template structure) bound with `name="flags.archivexus.nodeType"`, so Foundry's own form handling — not a manual `setFlag` call — persists it. This directly replaces the current console-only workflow (`mapActorToNode`'s `flags.archivexus.nodeType` reader, `actor-to-node.ts`, is unchanged — only how the flag gets set is new). Scoped to Actor first, matching this project's established incremental-per-document-type pattern (ADAPT-001 → ADAPT-004 → ADAPT-005); JournalEntry/Scene tagging UI is the same mechanism applied to a different sheet class, left as separate follow-up work, not bundled into this ticket.
3. **All of this lives in `src/adapters/foundry/`**, same boundary as every other Foundry-specific file — no Foundry `Hooks`/`ApplicationV2` concept, DOM manipulation, or sheet-rendering code ever reaches `src/core/`. The Core stays exactly as unaware of Foundry's UI as it already is of Foundry's document model; this ADR changes nothing about that boundary, it only says how the Adapter side of it behaves.
4. **`getHeaderControls*` is confirmed as the mechanism for later, lighter-weight actions** (e.g. a future "show this Node's Relationships" button) once there's a concrete use case for one — not implemented as part of this ADR, since issue #20 was research-scoped and the GM-tagging flow is the only use case concrete enough to build against right now.

---

## Consequences

### Advantages

- Zero new runtime dependencies — both hook families are core Foundry API, already available the moment the module loads (no `libWrapper` soft/hard dependency to declare in `module.json`, no version-compatibility surface with another module).
- Matches Foundry's own documented, forward-compatible extension pattern — a hook getting removed or renamed is a documented breaking change in Foundry's own changelog, unlike patched-internals breakage from monkey-patching, which is usually silent until something breaks at runtime.
- Directly closes a named, real usability gap (console-only flag setting) with the same mechanism that'll carry every later piece of Foundry UI work — no throwaway spike, unlike STORE-002's Worker/OPFS spike, since this is proven, documented core API rather than an untested runtime combination.

### Disadvantages

- DOM injection into a sheet's rendered HTML is still coupled to that sheet's actual template structure, which Foundry doesn't guarantee as a stable contract the way it guarantees a hook's _existence_ — a Foundry System (e.g. dnd5e) or core update that reshuffles `ActorSheetV2`'s internal markup could break the injected section's selector even though the hook itself still fires correctly. Mitigated by keeping the injected section visually and structurally self-contained (its own labeled block, not threaded into the system's own field layout) rather than trying to blend into it.
- `getHeaderControls*`'s actual usage (icon/label/action wiring, and how `action` callbacks are registered on an `ApplicationV2` instance) wasn't verified against a real render in this pass — deferred to whichever ticket actually implements a header-control button, since issue #20 was scoped to research, not implementation.

---

## Alternatives Considered

- **`libWrapper`-based sheet patching**: rejected for now — solves a problem (patching core _behavior_) this project doesn't have; adds a dependency for capability already covered by documented hooks. Worth reconsidering only if a real need for behavior-patching (not UI-adding) shows up.
- **A fully custom Archivexus sheet/window replacing the default Actor sheet**: rejected — throws away everything the GM already knows about Foundry's own Actor sheet for the sake of one flag, and reintroduces exactly the "extend, don't replace" problem `getHeaderControls*`/`render*` exist to solve. A future dedicated Archivexus window (e.g. a graph View) is a different, legitimate use case, but it's a new `Application`, not a replacement of Foundry's own sheets — out of scope here.
- **Scoping this ticket to all three document types (Actor, JournalEntry, Scene) at once**: rejected in favor of Actor-only first, matching every prior Foundry Adapter ticket's incremental-per-document-type shape (ADAPT-001 for JournalEntryPage, ADAPT-004 for Actor, ADAPT-005 decided Scene stays unmapped-by-default) — no reason for the UI layer to break that established pattern.
