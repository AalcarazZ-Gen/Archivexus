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
2. ~~First concrete surface: a `flags.archivexus.nodeType` tagging control on the Actor sheet, via a `renderActorSheetV2` handler that injects a small labeled `<select>`...~~ **Superseded — see the Amendment below.** As originally decided here, this would have used `render*`-based DOM injection (a persistent, always-visible bar); as actually shipped, it uses `getHeaderControls*` instead (an opt-in header-control button + `DialogV2` dialog, no persistent injection at all). Left unedited below as the historical record of what was first decided; do not implement against this paragraph — implement against the Amendment.
3. **All of this lives in `src/adapters/foundry/`**, same boundary as every other Foundry-specific file — no Foundry `Hooks`/`ApplicationV2` concept, DOM manipulation, or sheet-rendering code ever reaches `src/core/`. The Core stays exactly as unaware of Foundry's UI as it already is of Foundry's document model; this ADR changes nothing about that boundary, it only says how the Adapter side of it behaves.
4. **`getHeaderControls*` is confirmed as the mechanism for later, lighter-weight actions** (e.g. a future "show this Node's Relationships" button) once there's a concrete use case for one — not implemented as part of this ADR, since issue #20 was research-scoped and the GM-tagging flow is the only use case concrete enough to build against right now. **Update (see Amendment below): that concrete use case arrived the same day** — the GM-tagging flow itself moved onto `getHeaderControls*`, so this is now implemented, not merely confirmed as a future mechanism.

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

---

## Addendum (2026-08-31): implementation, verified against a real render

Live-inspected `CharacterActorSheet` (dnd5e 5.3.3, Foundry v14.367) via `foundry.applications.instances` and its rendered DOM in Alberto's real campaign world, before writing any injection code, using Claude in Chrome. Confirmed:

- `ActorSheetV2` is present in `CharacterActorSheet`'s prototype chain (`CharacterActorSheet → BaseActorSheet → PrimarySheet5e → ... → ActorSheetV2 → DocumentSheetV2 → ApplicationV2`), so `renderActorSheetV2` fires as expected — hooking there (rather than the dnd5e-specific `CharacterActorSheet` class name) keeps this Adapter code System-agnostic, consistent with ADAPT-004's no-branching-on-actor.type rule.
- dnd5e2 sheets render their own fixed vertical tab bar (`details`/`inventory`/`features`/`spells`/`effects`/`biography`/`specialTraits`, from dnd5e's own `TABS` config) — confirming the point made in Decision item 2 in advance: adding a new tab to that bar isn't reachable through a `render*`/`getHeaderControls*` hook alone, so the injected control is a persistent block instead, not a tab.
- The sheet's root element is itself the `<form>` (not a descendant of one) with `submitOnChange: true` confirmed via `app.options.form`, so any named input placed anywhere inside it is picked up by Foundry's native submission with no extra glue.
- Insertion point settled on the real DOM: `.window-content`'s first child, before dnd5e's own in-sheet `header.sheet-header` — visible regardless of active tab, and never nested inside System-owned markup.

`src/adapters/foundry/actor-node-type-tag.ts` implements exactly this: `buildNodeTypeTagHTML` (pure, unit-tested) builds the control, `registerActorNodeTypeTag` wires it to `renderActorSheetV2` once at module init. Nothing in the Decision above changes as a result — this only resolves the "wasn't verified against a real render" gap the first Disadvantage bullet named for `render*`-based injection (the `getHeaderControls*` gap remains open, unrelated to this pass).

### Correction (2026-08-31): real overlap bug found via live testing, fixed

Building on the Addendum above: after Alberto built and reloaded the module, live-testing the actual injected control on Kharra's real sheet (again via Claude in Chrome) found a genuine bug the static verification pass missed. `.window-content`'s first child was the wrong insertion point after all — measuring the real rendered layout showed `.window-content` starts at essentially the same `top` coordinate as `.window-header` and renders underneath it (`.window-header` sits at `z-index: 1`, a floating/glass title-bar effect over the top of the content area). The control rendered visually overlapping the title bar's own pin/menu/close icons. dnd5e's own in-sheet header avoids this because it carries its own top margin in its template; a foreign injected element has no such protection.

Fixed by inserting immediately after `.window-header` itself (as its next sibling, `afterend`) rather than as `.window-content`'s first child — confirmed live afterward: renders cleanly on its own row below the floating title bar, and a value typed into it round-trips through Foundry's native `submitOnChange` handling to `actor.flags.archivexus.nodeType` (verified directly against the real Actor document, then cleared). `src/adapters/foundry/actor-node-type-tag.ts` and its tests updated to match; the Decision above is otherwise unchanged — this only corrects the DOM insertion point, not the mechanism.

### Amendment (2026-08-31): permanent bar replaced with an opt-in header-control button

After the overlap fix above was live-verified end-to-end (round-trip save confirmed twice), Alberto reviewed the working feature and raised two separate challenges rather than accepting it as-is: a UX critique (the injected bar's position "isn't in the optimal position") and a more fundamental product question — "is this really necessary? What do I as a user/GM get from knowing that Kharra is an archivexus entity type: character?"

Investigating that second question honestly (not defending the shipped design) meant grepping the codebase for actual downstream consumers of `Node.type`: there are none. No View, filter, or query reads it anywhere — only `node.ts` validates it and the two Foundry Adapter mapping files (`actor-to-node.ts`, `actor-node-type-tag.ts`) touch it at all. Worse, the common case (a Player Character) already gets the _correct_ type for free from `ACTOR_FALLBACK_NODE_TYPE` with zero GM action. That means the permanent bar — while technically correct and, as of the Correction above, bug-free — had **zero current visible payoff** for the case it appeared on every single time: a persistent, always-visible control that does nothing useful for the common path is worse UX than no control at all, regardless of its position.

Presented both findings to Alberto directly; he chose to redesign rather than either keep the permanent bar or drop the feature entirely: **convert it to an opt-in header-control button** (`getHeaderControlsActorSheetV2`, Decision point 4's originally-deferred "lighter-weight action" mechanism) that opens a `DialogV2.prompt` dialog only when a GM actively wants to reclassify something — typically an NPC/creature that shouldn't default to `"Character"`. This is exactly the case `getHeaderControls*` was named for and deferred at the time this ADR was first written.

Verified live (Foundry v14.367 + dnd5e 5.3.3, via Claude in Chrome) before writing final source, same methodology as the Addendum/Correction above:

- `getHeaderControlsActorSheetV2` fires up the same prototype chain as `render*` hooks do — confirmed empirically by registering all 9 chain-name variants simultaneously and observing all of them fire.
- A pushed control entry can carry a direct `onClick: () => void` function — this resolves the uncertainty the original Disadvantages section flagged ("how `action` callbacks are registered on an `ApplicationV2` instance"): no class-level `static DEFAULT_OPTIONS.actions` binding is needed, unlike core Foundry's own controls.
- **Real gotcha, load-bearing**: a plain `app.render(true)` on an already-open sheet does **not** recompute header controls — only a fresh render (closing and reopening, or the first open) does. Foundry appears to collect header controls once per open, not on every render. Documented in the source file's JSDoc so it isn't rediscovered later.
- `foundry.applications.api.DialogV2.prompt(config)` works as documented: a `content` HTML string, an `ok.callback` that reads the submitted form's field value and becomes the prompt's resolved value; cancelling is treated as resolving `null`/`undefined` (the documented DialogV2 convention).

`src/adapters/foundry/actor-node-type-tag.ts` was rewritten around this: `buildNodeTypeDialogContent` (pure, unit-tested) replaces `buildNodeTypeTagHTML`; `registerActorNodeTypeTag` now registers a `getHeaderControlsActorSheetV2` listener instead of `renderActorSheetV2`, and the permanent-bar injection code (the `.window-header`/`.window-content` insertion point from the Correction above) is removed entirely — there is no more persistent DOM injection for this feature. The Decision section above is intentionally left as originally written (including point 2's now-superseded "injects a small labeled `<select>`" wording) since Decision point 4 already named `getHeaderControls*` as the mechanism for exactly this kind of lighter-weight action; this Amendment records which concrete surface ended up using it and why the first concrete surface (point 2) moved to it instead of `render*`.
