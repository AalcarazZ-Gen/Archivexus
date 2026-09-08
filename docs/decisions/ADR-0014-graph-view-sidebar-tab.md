# ADR-0014

## Title

VIEW-001: the Graph View is a first-level Foundry sidebar tab (not a per-sheet panel or a floating window), rendering Cytoscape.js over CORE-005's traversal presets, registered via Foundry's native `CONFIG.ui.sidebar.TABS` — no new UI-extension dependency, one new rendering dependency. `View` also gets its first real Core shape (new ticket, CORE-006), which VIEW-001's persistence half depends on.

---

## Status

Accepted

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
