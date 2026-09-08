# ADR-0014

## Title

VIEW-001: the Graph View is a first-level Foundry sidebar tab (not a per-sheet panel or a floating window), rendering Cytoscape.js over CORE-005's traversal presets, registered via Foundry's native `CONFIG.ui.sidebar.TABS` — no new UI-extension dependency, one new rendering dependency. `View` also gets its first real Core shape (new ticket, CORE-006), which VIEW-001's persistence half depends on.

---

## Status

Accepted (amended 2026-09-08 — see Amendment below: graph moves to a popout window, sidebar becomes a navigator)

---

## Context

VIEW-001 (issue #44) has sat as an open, decide-only ticket since 2026-09-06 (`PROJECT.md` item 13): "the graph View's rendering/interaction design, including ADR-0007's own named open item on content-prominence ordering and cluster grouping/collapse." `decisions/ADR-0012-node-connections-panel.md` deliberately built only a narrow, per-sheet interim surface and named everything it left out as VIEW-001's job: "the real graph/canvas rendering (nodes-and-edges visual, or any other real View *format*)," "Everything connected"'s mandated collapsed-cluster grouping, "Curated by me," and any persisted View arrangement.

This pass was prompted by Alberto asking, in a separate Claude session, for the graph View specifically framed as **"a section at the same level as Journal, Scenes, Actors"** that shows how his Knowledge Elements connect — i.e. a first-level Foundry sidebar tab, not a button on an already-open sheet. That framing itself is a real input this ADR has to resolve, since nothing decided so far (ADR-0007, ADR-0009, ADR-0012) specifies *where in Foundry's UI* the graph lives — ADR-0012 explicitly stayed on the `getHeaderControls*` entry-point family precisely because its scope was one Node's own connections, reachable from that Node's own sheet; a first-level tab has no "current sheet" to hang off at all.

That session researched two things before this ADR was written, neither of which lives in this repo but both inform the Decision below:

- **Prior art already shipping for Foundry VTT**: [`foundry-graph`](https://github.com/gioppoluca/foundry-graph) (Luca Gioppo) is a manual, drag-and-drop diagram *builder* — the user places and wires nodes by hand across 10+ configurable graph types (political maps, genealogies, timelines); it has no concept of deriving a graph from existing data, so it doesn't compete with or substitute for VIEW-001's actual job (a view *derived* from Nodes/Relationships that already exist). [`foundryvtt-mindmap`](https://github.com/p4535992/foundryvtt-mindmap) (p4535992) is the closer precedent: it adds "a third view to each Journal Entry" using **Cytoscape.js 3.18.1** plus `cytoscape-edgehandles`/`cytoscape-cxtmenu`/layout plugins (`dagre`/`klay`/`fcose`/`cola`/`cise`), and depends on `libWrapper`. `journal-links` auto-embeds text-detected backlinks into existing sheets — a different problem (Archivexus's Relationships are already explicit, not text-inferred) that doesn't apply here.
- **The Obsidian Canvas format** (`jsoncanvas.org/spec/1.0/`): a small, already-standardized JSON shape for a node-and-edge canvas (`{id, x, y, width, height, color}` nodes; `{id, fromNode, toNode, fromSide?, toSide?, fromEnd?, toEnd?, label?, color?}` edges, direction defaulting to `fromEnd: "none"`/`toEnd: "arrow"`). Not adopted wholesale (Archivexus's Nodes/Relationships already have their own real shape — see Decision point 6), but its node/edge/saved-position shape is a useful, externally-validated reference point for what a persisted graph layout needs to carry, rather than inventing that shape from nothing.

Three real architectural constraints from this repo's own accepted decisions bound what's actually available to decide here:

1. **ADR-0009's posture**: extend Foundry's UI with native, documented hooks/APIs only; reject a third-party dependency (`libWrapper`, or an equivalent sidebar-registration helper library) for a problem Foundry's own documented API already covers. ADR-0009 was scoped to `render*`/`getHeaderControls*` (sheet extension), but the reasoning — "adding \[a dependency\] would be an extra dependency for capability this project doesn't need yet" when a native, forward-compatible mechanism already exists — is exactly the test a sidebar-tab mechanism needs to pass too, not a rule confined to sheets.
2. **CORE-005 already exists and is exactly the right shape to consume**: `src/core/query/traversal.ts`'s `resolveTraversal`/`TRAVERSAL_PRESETS` resolves all 3 of ADR-0007's presets ("Direct only," "Everything connected" to depth 2, "Curated by me") against a **queried root Node**. Every one of ADR-0007's presets assumes a starting Node already exists — none of them describe what a graph shows with *no* Node selected at all, which a first-level sidebar tab (unlike a per-sheet button) can be opened into.
3. **`View` has never been implemented as Core state.** `03_DOMAIN_MODEL.md`'s View section has said since ADR-0005 (2026-08-27) that View is a Knowledge Element with identity, and ADR-0007 point 7 (2026-09-06) confirmed a saved arrangement is compatible with the "always derivable" invariant as presentation metadata — but there is no `src/core/domain/view.ts`, and `StorageProvider` has no View CRUD. Every prior View-adjacent ticket (ADR-0012) was scoped specifically to avoid needing one ("no View persistence of its own — every open recomputes fresh from current storage"). VIEW-001 is the first ticket that actually needs a real, saved View to exist, for "Curated by me" and any saved graph layout to mean anything.

---

## Decision

**1. Format: Graph, and only Graph, for VIEW-001.** `02_LANGUAGE.md`/`01_ARCHITECTURE.md` list Timeline/Graph/Tree/Table/Map as View format *examples*, not a commitment to build all five — Graph is the one format Alberto has ever actually asked for (both in the ADAPT-006-era framing PROJECT.md item 13 quotes, and in the session that prompted this ADR). Building a generic multi-format View-rendering abstraction before a second format has a real, named use case would be exactly the kind of premature generalization this project has consistently rejected elsewhere (ADR-0007's rejection of a generic query language is the closest precedent: "over-engineering... before there are three real use cases to generalize from").

**2. Entry point: a genuine first-level Foundry sidebar tab, registered via the native `CONFIG.ui.sidebar.TABS` registry at `init` — not a `getHeaderControls*` button, not a floating `Application` launched from one, and not a third-party sidebar-registration library.**

This directly answers Alberto's own framing ("the same level as Journal, Scenes, Actors") literally, not as a looser floating-window approximation of it — a View is a first-class Knowledge Element in its own right (ADR-0005), not tied to any one Node's sheet the way ADR-0009/ADR-0012's controls are, so a first-level tab is the structurally correct placement, not just the requested one.

Mechanism: Foundry v13+ moved the sidebar to `ApplicationV2` (`foundry.applications.sidebar.Sidebar`/`AbstractSidebarTab`); a module registers a new tab by adding an entry to `CONFIG.ui.sidebar.TABS` (icon, tooltip, and an `AbstractSidebarTab` subclass) at `init`, the same "native, documented, forward-compatible" category of mechanism ADR-0009 already established the precedent for — this is Foundry's own core API, not a library wrapping it. (There was a real Foundry-core bug in this exact registry, `foundryvtt/foundryvtt#12541` — `TABS` wasn't declared `static`, so `CONFIG.ui.sidebar.TABS` returned empty until it was fixed in v13.341 "Stable 1" — but `module.json`'s compatibility target is already v14 \[ADR-0006\], well past that fix, so it doesn't change what Archivexus should build against.) A third-party helper (e.g. "Lib: UI Extender," found during the pre-ADR research as a community wrapper around this exact registration) is explicitly **not** taken as a dependency, for the same reason ADR-0009 rejected `libWrapper`: it would be an extra dependency compatibility surface for a registration Foundry's own current stable API already exposes directly.

**Flagged, matching this lineage's own established discipline**: the exact `CONFIG.ui.sidebar.TABS` entry shape (which fields it reads, how `AbstractSidebarTab`'s `_renderHTML`/`_replaceHTML` need to be implemented, how the tab's icon actually renders in the real tab strip) is researched against Foundry's official API docs, not yet live-verified against a running v14 client — the same "verify against a real render before Alberto trusts it" step every `getHeaderControls*` addition in this lineage has needed (ADR-0009's Addendum/Correction/Amendment are the model to repeat here).

**3. Rendering library: Cytoscape.js — accepted as a genuinely new runtime dependency, unlike point 2's rejection of a UI-extension helper.**

The two situations are different in kind, not degree: ADR-0009 rejected `libWrapper` because native hooks already fully covered "add UI to an existing sheet" — the dependency would have bought nothing. No native Foundry API renders a force-directed graph at all, so there is no "already covered" case to defer to here. `@sqlite.org/sqlite-wasm` (STORE-003) already established that a real npm runtime dependency, bundled by `build:foundry-module` into what actually ships, is an accepted category for this project when the capability genuinely isn't native — Cytoscape.js is the same category of decision, not a new kind of risk.

Chosen over the alternatives considered (D3-force, Sigma.js+graphology, vis-network, react-force-graph — see Alternatives Considered) primarily because `foundryvtt-mindmap` is a direct, working precedent for Cytoscape.js specifically *inside a real Foundry client* (not just in a browser generally), and because its declarative per-selector styling (color/width by a data field) maps directly onto vocabulary Archivexus already has: color by Node `type`, edge width/style by `RelationshipDefinition.traversalCategory`. Unlike `foundryvtt-mindmap`, Archivexus does **not** take `libWrapper` as an accompanying dependency — nothing about rendering a graph needs to patch a core Foundry method, only point 2's native sidebar registration and CORE-005's existing query results.

**4. What renders with no Node selected: the whole current graph (every Node, every Relationship in storage), not one of ADR-0007's three presets.**

This is a real gap ADR-0007 never had to name, because every one of its presets assumes a queried root Node already exists — true for a per-sheet button (ADR-0009/ADR-0012), never true for a first-level tab opened with nothing pre-selected. Decision: the tab's default state is an unfiltered overview of the whole graph (`storage.listNodes()` plus every Relationship reachable from them) — closer in spirit to Alberto's own literal words from the ADAPT-006-era framing ("when we select something... we can bring the graph to life") than to a blank/empty state, since a mostly-empty canvas asking the GM to go pick a Node first would defeat the actual point of a persistent, always-open map. Clicking any Node inside that overview re-centers/filters using the three existing presets (matching ADR-0007's own "Direct only" default-on-a-new-View precedent — point 6's "so a GM with zero context isn't handed a decision screen").

Scale note, same posture as ADR-0012/ADR-0013: acceptable at Alberto's real current scale (~102 Nodes, verified 2026-08-30) rendered unfiltered in Cytoscape.js; revisit (e.g. a node-count cap with a "zoom in to load more" affordance) only if it demonstrably becomes a real problem at a larger campaign's scale, not preemptively.

**5. Relationship to ADR-0012's Connections panel: the two coexist. VIEW-001 does not retire it.**

Different real use cases, not a smaller/larger version of the same one: the Connections panel answers "what's connected to the Node whose sheet I already have open," with zero context switch away from editing it; the graph tab answers "show me the shape of the world," a spatial, whole-campaign question that has no "current sheet" to anchor to. Keeping both is consistent with this project's own precedent for the same question — ADR-0011 similarly kept `same-entity-as`-as-a-concept dead but didn't force every Foundry-relationship-shaped need through one single mechanism.

**6. `View`'s first real Core shape (unblocks a new ticket, CORE-006, decoupled from VIEW-001's own Adapter/UI work — same split CORE-004/CORE-005 already used against ADAPT-006/ADAPT-007).**

Composed on `KnowledgeElement` exactly like `Node`/`Relationship` (not subclassed — Rule 5, composition over inheritance, already established for both):

```ts
interface View extends KnowledgeElement {
  format: 'graph'; // plain string/closed-union, not a registry — same NodeType precedent (point 6b)
  spec: GraphViewSpec;
}

type GraphViewSpec =
  | { preset: 'direct-only' | 'everything-connected'; rootNodeId: string }
  | {
      preset: 'curated-by-me';
      rootNodeId: string;
      relationshipIds: string[]; // the GM's curated set, per ADR-0007 point 6
      layout?: Record<string /* Node id */, { x: number; y: number }>; // saved positions, optional
    };
```

Only `curated-by-me` carries anything that must actually be *saved* (the curated Relationship-id list, and optionally hand-placed positions) — `direct-only`/`everything-connected` Views persist only *which* preset and root Node a GM named and saved, re-resolving live against CORE-005 on every load, exactly satisfying the "always derivable" Domain Invariant with zero extra effort (the same reasoning `03_DOMAIN_MODEL.md`'s View Decisions section already gives for why the declarative-spec approach holds up). A saved `layout` is presentation metadata over content already derivable through `relationshipIds`, per ADR-0007 point 7 — not new knowledge, so it doesn't strain the invariant either. This intentionally borrows the Obsidian Canvas spec's *shape* for node positions (an id-keyed `{x, y}` map) without adopting the rest of that spec (edges, colors, groups) — Archivexus's own Relationship/`traversalCategory` vocabulary already carries what Canvas's edge color/label fields would otherwise be standing in for.

**6b. `format` stays a plain closed-union of one value (`'graph'`), not a registry/Definition-driven `ViewDefinition` entity.** `03_DOMAIN_MODEL.md`'s View intro paragraph and `01_ARCHITECTURE.md`'s Definitions section anticipate a reusable "View Definition" the way `RelationshipDefinition` is real Core state — but building that generic entity now, for a set of exactly one format, would be the same premature-generalization mistake point 1 already rejects for formats themselves. Revisit if and when a second format (Timeline is the most likely next candidate, per `02_LANGUAGE.md`'s own ordering) gets a real, named use case — the same signal-based deferral `NodeType`'s "plain string, not closed enum" decision already uses.

**7. `StorageProvider` gains View CRUD, mirroring Node/Relationship's shape — no new persistence mechanism.** `saveView`/`getView`/`listViews`/`deleteView`, same SQLite table pattern STORE-003 already established (its own `views` table, JSON-encoding `spec` the same way `blocks`/`tags`/`history` are already JSON-encoded columns nothing queries structurally yet). No FK to `nodes`/`relationships` — same "no cascade, no delete-blocking" reasoning ADR-0007 point 8 already applies to Relationship endpoints applies here too: a View referencing a since-deleted Node/Relationship just resolves fewer results on next open, never a storage-level integrity error.

**8. Node deletion policy stays explicitly out of scope — not resolved by this ADR either.** `ADR-0007` already named this as open; the graph View renders whatever `resolveTraversal`/`listNodes` return today (dangling relationships excluded naturally, same as ADR-0012's panel). This ADR doesn't change or need to change that.

**9. Proposed tickets** (Alberto opens the actual GitHub issues, per this project's own standing convention — every decide-only ADR in this lineage ends with a proposed ticket name and "Alberto to open the actual issue," not an issue the deciding session opens itself):

- **CORE-006** — implement `View` (point 6) and its `StorageProvider` CRUD (point 7). Pure Core + Storage, no Foundry code — same layering CORE-004/CORE-005 already kept.
- **VIEW-001a** — the sidebar tab shell (point 2) + the whole-graph overview (point 4) + Cytoscape rendering of a clicked Node's "Direct only" preset. No View persistence needed yet — mirrors how CORE-005/ADAPT-007 first shipped just enough to be real and useful before any later ticket added persistence. Depends on: CORE-005 (done), nothing from CORE-006.
- **VIEW-001b** — "Everything connected" with ADR-0007 point 6's mandated collapsed cluster grouping, "Curated by me"'s pruning UI, and saving/loading a `View` (rootNodeId, preset, curated relationship ids, optional layout) via CORE-006. Deliberately last — needs both VIEW-001a's rendering shell and CORE-006 to exist.

---

## Consequences

### Advantages

- Answers Alberto's actual, literal ask (a first-level sidebar tab, not an approximation of one) instead of quietly downgrading it to a floating window because that shape happened to already exist in this codebase (ADR-0010/ADR-0012's precedent) — the ADR names why a first-level tab is also the structurally correct placement, not only the requested one.
- Reuses everything already built: CORE-005's traversal presets, ADR-0007's `traversalCategory` vocabulary for styling, `StorageProvider`'s existing per-KnowledgeElement-type CRUD pattern for View's own persistence. No re-derivation of the traversal mechanism itself.
- Keeps ADR-0009's "native API before a new dependency" discipline intact for the UI-registration question, while giving an honest, reasoned exception for the one new dependency (Cytoscape.js) that has no native alternative at all — the ADR states the test for telling those two cases apart instead of leaving it implicit.
- Splitting CORE-006/VIEW-001a/VIEW-001b the same way CORE-004/CORE-005/ADAPT-006/ADAPT-007 were already split means each ticket has a real, independently useful stopping point (VIEW-001a alone already delivers "see the graph" even before any persistence exists) rather than one large, hard-to-review ticket.
- Names a real gap ADR-0007 never had to face (point 4, no-Node-selected default) instead of leaving VIEW-001's implementer to invent an answer unrecorded.

### Disadvantages

- A first-level sidebar tab is a materially bigger, less-precedented Foundry-integration surface than every prior `getHeaderControls*` addition in this lineage — `CONFIG.ui.sidebar.TABS`'s exact registration shape is researched, not yet live-verified against a real v14 client, and (per the Context) has a documented history of a real core bug in this exact area. This is a genuinely higher-risk unknown than ADR-0009's `render*`/`getHeaderControls*` mechanisms were when first adopted.
- Cytoscape.js is a new, real bundle-size and maintenance-surface addition (~250KB min) — small relative to `@sqlite.org/sqlite-wasm`'s own footprint, but still a dependency this module now has to track for updates/breakage, unlike a feature built from Foundry's own API alone.
- Point 4's whole-graph-unfiltered default is a real, named scale risk (same category ADR-0007's Disadvantages already flags for composed N-hop traversal) — deliberately accepted now, deferred to revisit later, not proven safe at a campaign 5-10x Alberto's current size.
- CORE-006 is real, not-yet-scoped new Core work this ADR adds to the backlog (View has been *decided* since ADR-0005 but never implemented) — VIEW-001b can't start until it exists, extending VIEW-001's overall timeline versus if View already had a shape to build against.
- Keeping the Connections panel and the graph tab as two coexisting surfaces (point 5) means a GM has two different places update-worthy Relationship changes might need visual awareness of — a real, minor UX-consistency cost against a single unified surface, accepted because the two answer genuinely different questions.

---

## Alternatives Considered

- **A floating `Application` window, launched from a scene-control button or a `getHeaderControls*` entry, instead of a first-level sidebar tab.** Rejected — this is exactly what ADR-0009 itself anticipated as the two, deliberately distinguished cases ("A future dedicated Archivexus window \[...\] is a different, legitimate use case, but it's a new `Application`, not a replacement of Foundry's own sheets") and would materially under-deliver Alberto's literal, stated framing ("the same level as Journal, Scenes, Actors") for the sake of avoiding a somewhat riskier, less-precedented registration mechanism. The scale of the risk (point 2's Disadvantage) didn't justify quietly downgrading the actual ask.
- **"Lib: UI Extender" (or an equivalent third-party sidebar-tab helper) as a dependency**, to sidestep researching `CONFIG.ui.sidebar.TABS` directly. Rejected for the same reason ADR-0009 rejected `libWrapper`: Foundry's own current stable (v14) API already exposes this registration natively; a wrapper library would be an extra compatibility surface for capability already covered.
- **D3-force** (motor-only, self-built rendering/interaction). Maximum flexibility and the smallest possible dependency footprint, but a materially larger implementation lift (canvas rendering, drag, zoom, hit-testing all hand-built) for a personal project with no interaction-design requirement that Cytoscape.js doesn't already meet out of the box. Rejected as more engineering than this ticket's actual needs justify (Rule 9-style proportionality, the same reasoning ADR-0007/ADR-0012 repeatedly apply against building more than the current, real need calls for).
- **Sigma.js + graphology** (WebGL). The clear right choice if the graph ever needs to render tens of thousands of nodes, which Alberto's real campaign (~102 Nodes) doesn't and isn't likely to soon. Rejected for now as solving a scale problem that doesn't exist yet; named in this ADR as the concrete escalation path if it ever does.
- **vis-network**. Heavier than Cytoscape.js, with slower, less active maintenance, and no direct Foundry-integration precedent to lean on. Rejected outright.
- **react-force-graph**. Would drag React and Three.js in as dependencies purely to render a graph, in a codebase that uses neither — a materially larger and stranger dependency footprint than a single graph library, for no capability gain over Cytoscape.js. Rejected.
- **Adopting the Obsidian Canvas JSON format wholesale as `View`'s persisted shape** (full node/edge/group/color schema), instead of Archivexus's own minimal `GraphViewSpec` (point 6). Rejected — Archivexus's Nodes already carry `type` and Relationships already carry `traversalCategory`; re-deriving Canvas's own color/label vocabulary on top would duplicate a source of truth (Rule 4) instead of reusing the one that already exists. Canvas's *positions-as-an-id-keyed-map* shape was still worth borrowing directly, since nothing in this codebase already solves that narrower problem.
- **Building a generic `ViewDefinition` entity now** (point 6b), matching `RelationshipDefinition`'s own real-Core-state treatment. Rejected as premature for a single format — same reasoning as rejecting a closed `NodeType` enum: revisit once a second format is a real, named need, not before.

---

## Amendment (2026-09-08): VIEW-001b redesign — graph popout + sidebar navigator

VIEW-001a shipped and was live-tested on a real v14.367 client (see `SESSION_LOG.md`). Two things the original Decision got wrong or left open surfaced immediately: the ~300px sidebar is genuinely too cramped for a graph canvas (node labels overlap, no room to pan), and the "no Node selected" default and gesture semantics needed a real design pass. Alberto steered the direction; a ux-ui-designer pass worked it through; the points below amend the Decision accordingly. **Decide-only — no code changed by this pass.** VIEW-001a stays as merged-pending (its gestures trimmed to a clean subset of point A3 below, done in the same commit as this amendment).

### A1. The Cytoscape canvas moves out of the sidebar into a dedicated popout window.

A standalone, resizable, **singleton `ApplicationV2`** — not a `DocumentSheetV2` (no backing document), not Foundry's native sidebar pop-out. Reuses the deferred-factory-class + raw `_renderHTML`/`_replaceHTML` pattern `relationship-authoring-window.ts` / `relationship-list-window.ts` already established. Re-clicking a launch point updates the one open window (`render(true)` focuses the existing instance), never spawns a duplicate.

The first-level sidebar tab from point 2 of the original Decision **stays** — it still answers Alberto's "same level as Journal, Actors" framing — but its *content* becomes a navigator (A2), not a graph. Consequences: Cytoscape's guarded dynamic `import()` (the `Array.prototype.equals` workaround, VIEW-001a) now only runs when the popout first opens, not on every sidebar render; the label-overlap cosmetic issue disappears with the narrow canvas.

Launch points, priority order: (1) click a row in the sidebar navigator → open/re-root the popout keeping its current preset; (2) an "Open whole graph" button at the top of the sidebar tab; (3) an unbound-by-default `game.keybindings` toggle; (4) — deferred to VIEW-001f — a "See in graph" link in ADR-0012's Connections panel. **Not** a scene-control button (scene controls are canvas-drawing tools; a knowledge graph isn't scene-scoped).

### A2. The sidebar tab becomes a node navigator (no graph).

Top to bottom: a filter-as-you-type search box; an "Open whole graph" button; a pinned **★ Favourites** group (shown only when non-empty — A2b); then every Node in **collapsible groups by `node.type`**, alphabetical within each group, place-like types (`City`, `Kingdom`, `Region`, …) ordered first, then `Character`, `Organization`, then the rest, then `(untyped)`. `node.type` is already on every Node — zero new state.

Chosen over flat-alphabetical (102 rows is a scroll) and over degree-ordered (meaningless at 0 relationships, and a weak proxy for "what I want to start from" even later — it may become a *secondary* within-group sort, not now). Alberto's "pick a Country / Region / City and re-root" is just the place-typed groups sitting at the top of this same list — no separate mechanism. A places-only filter was rejected: it makes every Character/Org/Event/Lore Node unreachable from the sidebar.

**Root vs. preset are cleanly separated**: the sidebar picks the *root* (the "what"); the traversal preset (the "how much") is a control in the **popout toolbar** (`(•Direct) (Everything) (Curated)` segmented control), not the sidebar. First root of a session defaults to "Direct only" (ADR-0007 point 6's "a GM with zero context isn't handed a decision screen").

States: storage-not-ready → "Loading campaign…" (fixes VIEW-001a's permanently-stuck "Storage not ready yet…"); 0 Nodes → "No knowledge yet. Tag an Actor or Journal entry as a Node to see it here."; non-GM viewer → the same list, pre-filtered by `filterNodesForViewer` (VIEW-001a).

### A2b. Favourites: a pinned navigator group, per-user, stored as Foundry user-flags — explicitly NOT Core state.

A `☆`/`★` toggle on each navigator row (hover-reveal on normal rows, always-shown on favourited ones), optionally also a right-click context-menu item. Favourited Nodes appear in the pinned group at the top.

**Where the state lives (architect follow-up, light):** favourites are per-user (Alberto's ≠ a player's) and are *not* campaign knowledge (`CONTRIBUTING_GUIDE.md` Rule 6 — they don't preserve the memory of the world, they're a personal navigation convenience). Therefore: **not** `StorageProvider` state, **not** a `View`, **not** in `GraphViewSpec`, **not** in the portable snapshot (ADR-0008 — an external AI planner shouldn't see Alberto's bookmarks). Home: `game.user.setFlag('archivexus', 'favouriteNodeIds', string[])` — per-user, per-world, Foundry-synced, survives reload, zero schema change, zero migration. Same category as "which sidebar tab is open." This is a deliberate contrast with a saved **"Curated by me" View**, which *is* Core state, *is* shared per its Visibility, *is* campaign-meaningful — the two must not be conflated.

Optional cheap complement (Alberto's call, not decided here): a "Recent" auto-group (last ~5 rooted-on Nodes), also in `game.user` flags, zero manual upkeep.

### A3. Gesture map (Alberto confirmed both open questions 2026-09-08).

| Gesture | Action |
|---|---|
| **single-tap a Node** | Select it: highlight it + its 1-hop neighbours on the canvas, **and** populate an **Inspector panel** (A3a) with its attached content and its grouped connections |
| **double-tap a Node** | Open the Node's primary Foundry sheet (`fromUuid` → `sheet.render(true)`) — the universal double-click-to-open convention |
| **right-click a Node** | Context menu: *Open sheet* · *Re-root graph here* · *Everything connected from here* · *Add to favourites* |
| **right-click canvas background** | *Whole graph* · *Change layout* · *Preview as player* |

Alberto's confirmed answers to the two ambiguities the design pass raised: (1) his "double-tap → related nodes / journals / actors / *related information*" meant **surfacing the Node's attached content** (its Blocks), not a 2-hop graph expansion — delivered as the Inspector panel on single-tap select; (2) **double-tap = open sheet** (the designer's recommendation), reverting VIEW-001a's interim "double-tap = everything connected" / "right-click = open sheet" — "Everything connected" is now a deliberate menu/toolbar action, not a gesture you stumble into (ADR-0007 point 6's flood-avoidance spirit).

### A3a. The Inspector panel — a new surface (VIEW-001b).

A collapsible panel docked on the right of the popout, showing for the selected Node: title + type; **Attached (N)** — each Block's `title`, clickable → `fromUuid(block.uuid)` → `sheet.render(true)` (`Block.uuid`/`title` are already on every `Node` `resolveTraversal`/`listNodes` returns — no new Core/Storage work); **Connections (grouped)** — reusing ADR-0012's Connections-panel logic verbatim (group by `traversalCategory`, degree-descending / alpha tiebreak, "+N more"). This is the one place ADR-0012's content-prominence ordering answer transfers directly. The graph does not render Blocks today — this panel is where "related information" lives.

### A4. Visibility in the graph.

- **No "something hidden here" placeholder for players.** A marker leaks that a secret exists, its position in the graph, and that it bridges two known Nodes. A player's graph is a clean, self-consistent subgraph of what they may know — hidden Nodes and every edge touching them simply don't exist for that player (matching how Foundry itself omits an unowned Journal Entry from the directory, no ghost row). `buildGraphViewElements` already drops any edge with a missing endpoint, so this is **already the behaviour** for edges — stated here as intentional: if Kingdom A (visible) is `at-war-with` a hidden faction, the player does not learn Kingdom A is at war with anyone.
- **A `visible` Node whose only links are to hidden Nodes shows as an isolated dot** — acceptable (not a leak; the player was allowed to see that Node). An optional "Hide unconnected nodes" toggle in whole-graph mode (default off) is a reasonable fast-follow if it bothers Alberto; not decided here.
- **A GM-only "Preview as player (approximate)" toggle** in the popout toolbar re-runs `filterNodesForViewer` with `isGM: false` and shows a persistent banner ("Previewing as player — N nodes hidden"). Labelled "approximate" because the current filter reads `Node.visibility` (derived from *default* document ownership) and won't reflect a secret shared with one specific player via a per-document OBSERVER grant — it still catches gross mistakes (exactly the leak VIEW-001a's review found).
- **Two independent layers that compose** (stated so VIEW-001f doesn't re-derive it): (1) *can this viewer open this View at all?* → `View.visibility` (relevant only once saved Views exist); (2) *within a View they can open, node-level filtering still applies* → a player opening a `visible` shared View still doesn't see `hidden` Nodes in it. The whole-graph overview has no `View` record — it's implicitly "openable by everyone, node-filtered."

### A5. Content-prominence / cluster ordering.

**Spatial layout is enough for the canvas.** On a 2D canvas there is no "first N before +36 more" — the layout separates clusters spatially and the GM pans/zooms. ADR-0007's deferred ordering question resolves as: (1) the **Inspector panel's connections list** (A3a) is a list → reuse ADR-0012's ordering; (2) **"Everything connected" collapsed clusters** (VIEW-001e): when a cluster node ("Residents (40)") is expanded, show *all* of it — a canvas has effectively infinite 2D space, so no paging and therefore no ordering needed; (3) if rendering performance ever forces a node cap on expansion, fall back to degree-desc / alpha to match ADR-0012 — named as the escalation path, not built (102 Nodes; Cytoscape handles this fine).

### A6. CORE-006 / `GraphViewSpec` needs no change.

Walked through the redesign: the popout preset toggle → `spec.preset`; re-rooting → `spec.rootNodeId`; favourites → `game.user` flags (not the spec, by design); sidebar group state / search text → ephemeral, not persisted; "Preview as player" → runtime toggle, not persisted; the Inspector panel → reads existing `Node.blocks` + `resolveTraversal`. **CORE-006 stands as implemented; VIEW-001b–f need nothing new from it.**

One gap, named not actioned: the **whole-graph overview** has no `rootNodeId` and no preset, so it is not representable as a `GraphViewSpec` today. This only matters if Alberto ever wants to *save* "my whole-world graph with this hand-placed layout" as a named View. If that materialises: `GraphViewSpec` needs an optional `rootNodeId` or a 4th `{ scope: 'whole-graph'; layout? }` variant, plus SQLite migration 3 — an architect + DBA follow-up, conditional on the want appearing.

### A7. Revised ticket breakdown.

The original VIEW-001b (issue #57) scope — "Everything connected clustering + Curated-by-me + saved layout" — plus this direction is too much for one ticket. Split:

- **VIEW-001b (revised, #57): the graph popout.** Standalone singleton `ApplicationV2`. Toolbar: root selector, preset segmented control, layout picker, "Whole graph", GM-only "Preview as player". Cytoscape rendering moves here from the sidebar. Inspector panel (A3a): attached Blocks (clickable) + connections list (reuse ADR-0012). Gestures per A3. Depends on VIEW-001a (merge it) + CORE-005 (done); **no CORE-006 dependency**.
- **VIEW-001c: the sidebar navigator.** Strip Cytoscape from `codex-sidebar-tab.ts`; rebuild as search + type-grouped collapsible node list + "Open whole graph"; row click opens/re-roots the popout; fix the stuck "Storage not ready" state. Depends on VIEW-001b.
- **VIEW-001d: favourites.** Star toggle → `game.user` flag; pinned group. Adapter-only, no Core. Optionally the "Recent" auto-group. Depends on VIEW-001c + the A2b architect confirm. Small enough to fold into VIEW-001c if budget allows, but it carries the one architect-confirm item so it's cleanly separable.
- **VIEW-001e: "Everything connected" collapsed clusters.** ADR-0007 point 6's category-labelled cluster grouping + expand-in-place. Depends on VIEW-001b + `RelationshipDefinition` persistence (still unbuilt) + real relationship data to be meaningful.
- **VIEW-001f: "Curated by me" + saved layout.** Prune/add UI in the popout; save/load a real `View` via CORE-006's `saveView`/`getView`/`listViews`; saved-views list in the sidebar (respecting `View.visibility`); hand-placed `layout`; the "See in graph" link from ADR-0012's Connections panel. Depends on CORE-006 (done) + VIEW-001b + VIEW-001e.

Sequencing: this amendment → VIEW-001b → VIEW-001c → VIEW-001d, then VIEW-001e / VIEW-001f once real Relationships exist and `RelationshipDefinition` persistence lands.

### A8. Open items routed elsewhere.

- **Architect (light confirm):** favourites stay Adapter-side as Foundry user-flags, explicitly not a Knowledge Element (A2b).
- **Architect:** whether real per-user visibility resolution (`document.testUserPermission(user, "OBSERVER")` per Node per viewer, or persisted per-user visibility) is in scope for VIEW-001f's real `View` scope, or its own ticket (A4).
- **Architect + DBA (conditional):** the whole-graph-as-a-saved-View gap (A6) — only if the want materialises.
- **Architect / Product Owner (sequencing):** "Everything connected" cluster **category labels** need `RelationshipDefinition` persistence (still unbuilt) — a pre-req for VIEW-001e.

---

## Amendment 2 (2026-09-08): UI-surface inventory (ARCH-002, issue #65 — resolved inline)

A product-owner + ux-ui-designer consult on three of Alberto's asks (a UI-polish ticket, first-run onboarding, a relationship-management console) surfaced that ~6–9 Adapter surfaces now render the same three nouns {Node, Relationship, Definition}, with no canonical entry-point map. Rather than a separate architect pass, the four small decisions and the map are recorded here (the domain and storage layers are clean — this is purely an Adapter-surface inventory). **Provisional — expected to shift once real usability testing happens against authored campaign data.**

### Decisions

1. **The ADAPT-011 standalone Connections panel (ADR-0012, decided but never built) is retired unbuilt.** Its job — "one Node's connections, grouped by `traversalCategory`" — becomes the **Relationship Console's "filter: involves node X"** mode. `node-connections.ts` (shipped with VIEW-001b) already implements the grouping/ordering logic reusably, so nothing is lost.
2. **The per-sheet "Relationships…" list (ADAPT-012, shipped) stays** — it is the zero-context, in-flow view ("I'm on this sheet, what's it connected to"), a different job from the sit-down-and-wire-the-campaign Console. Its header-control button is **renamed "Connections"** so it reads as distinct from the world-level "Relationship Console".
3. **The canonical "create a Relationship" surface is the ADAPT-007 authoring window.** Every surface that offers "new relationship" (the per-sheet button, the Console's `[+ New]`, a future navigator context menu) launches that same window, optionally prefilled. No surface implements inline relationship creation.
4. **Shared CSS lives in one injected `<style>` module** (`ensureArchivexusStyles`, extracted in VIEW-001c), **not** a `module.json` `"styles"` asset. ADR-0006 is about the build/install boundary, not a literal CSS ban — but a second emitted asset is real friction for a hand-run build. Revisit only if the stylesheet ever exceeds a few hundred lines.

### Where each thing lives

| Surface | Scope | Does | Entry point | Status |
|---|---|---|---|---|
| "Archivexus Node Type" dialog | one document's Node type | write | sheet header ⋯ menu | shipped (ADAPT-003) |
| "New Relationship…" window | create one Relationship | write | sheet header ⋯ menu · the Console's `[+ New]` | shipped (ADAPT-007) — **canonical create** |
| "Connections" list | one Node's Relationships | read + delete | sheet header ⋯ menu | shipped (ADAPT-012 — button renamed from "Relationships…") |
| Graph popout + Inspector | whole graph / a rooted subgraph; a selected Node's connections + attached Blocks | read + click-through | Codex "Open graph ⧉" button · a navigator row | shipped (VIEW-001a/b) |
| Codex sidebar navigator | every Node grouped by `type`; search; favourites | launches popout / Console | first-level sidebar tab | VIEW-001c (#63) |
| Relationship Console | every Relationship campaign-wide; search / filter / create / delete | read + create + delete | "Relationships" button in the Codex sidebar toolbar | shipped (VIEW-001i #67) — subsumes ADAPT-011 as its "involves node X" filter; no instance-editing v1 |
| Definition editor | the default Relationship Definitions | list / add / edit / delete | Codex toolbar · the Console's "+ New type" | ADAPT-014 (#66) |
| saved-Views list | named `View` instances | read (open in the popout) | Codex sidebar | VIEW-001f (#71) |
| ~~ADAPT-011 standalone panel~~ | — | — | — | **retired unbuilt** |

Rule for a future surface #10: if it renders one of {Node, Relationship, Definition} and it isn't in this table, it needs a row here (and a reason it isn't one of the above) before it ships.
