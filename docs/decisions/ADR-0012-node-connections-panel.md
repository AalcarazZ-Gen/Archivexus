# ADR-0012

## Title

Node Connections panel: a narrow, Direct-only interim read surface for CORE-005, entered via `getHeaderControls*`, ahead of VIEW-001's full graph canvas.

---

## Status

Accepted

---

## Context

Alberto's actual stated goal, restated plainly: "click a Node, see its connections." CORE-005 (`src/core/query/traversal.ts`, issue #42) already implements the mechanism ADR-0007 requires to answer that — `resolveTraversal` against `StorageProvider` — merged and unit-tested. Confirmed again in this pass via a repo-wide grep of `src/adapters/foundry/`: nothing there imports `src/core/query` for real use — the one hit (`export-snapshot.ts`) is a doc-comment naming the module, not a call. **CORE-005 has zero UI consumers today.** VIEW-001 (issue #44) — the real graph/canvas rendering of a View, in whatever visual format — is still an open decide-only ticket of its own, and is deliberately not decided or touched by this ADR.

This ADR formalizes an earlier, informal brainstorm answer from a separate session (never written up as a decision) that identified the same gap and proposed a narrow interim surface — not the graph canvas — as the smallest real step to close it: a Foundry sheet header control that resolves "Direct only" and shows the results as a grouped list, following the same `getHeaderControls*` entry-point precedent ADAPT-003/ADAPT-006/ADAPT-009 already established (`actor-node-type-tag.ts`, `relationship-authoring-window.ts`, `journal-entry-page-node-tag.ts`). That earlier answer additionally assumed it would need to collapse `same-entity-as`-linked Node clusters into one row with facet tabs, to handle Alberto's "Lord Fausto Farcon is 4 disconnected Nodes" problem.

**That assumption's premise no longer holds.** ADR-0011 (Accepted, plus its DBA Amendment, both 2026-09-06) resolved the Fausto Farcon identity-fragmentation problem by a different mechanism than `same-entity-as`: a GM can now explicitly attach a JournalEntryPage to an existing Node (Actor- or JournalEntryPage-backed) at tagging time (`flags.archivexus.attachedToNodeId`), which makes the page a `{ type: 'JournalEntryPage', uuid, title }` Block on that Node instead of its own standalone Node. `same-entity-as` itself is judged superseded by ADR-0011 for this problem, not kept as a parallel mechanism (ADR-0011's Alternatives Considered) — there is no shipped code or persisted `RelationshipDefinition` for it to unwind.

This ADR is the decide-only formalization this earlier answer never got, updated for that changed input, and finalized as an actual implementable decision rather than a brainstorm sketch. It also gives the first real, concrete answer to ADR-0007 point 6's explicitly named open question — content-prominence ordering within a same-category cluster — for the one case this ticket's scope actually covers (a single Node's direct connections), leaving the fuller answer (arbitrary View arrangements, persisted, drag-to-reorder) for VIEW-001, which is the ticket that actually owns View-as-a-persisted-Knowledge-Element (ADR-0007 point 7).

---

## Decision

**1. `same-entity-as` clustering logic is dropped entirely from this design — not simplified, removed.** ADR-0011's attachment mechanism already produces exactly the deduplication the earlier design was trying to build a second way:

- A page the GM has explicitly attached is a Block on its target Node, not a Node at all — `resolveTraversal`'s `nodes`/`relationships` arrays never contain it as a separate entry to begin with. There is nothing to cluster or merge; CORE-005's query results are already naturally deduplicated for any page a GM has attached, by construction, with zero extra logic in this panel.
- A page the GM hasn't attached yet, and has no Relationship authored against its own page-Node, simply never appears in a Direct-only traversal from some other Node — it isn't connected to anything, so it isn't reached. This is invisible to this panel, not a display bug: an un-migrated fragment with no Relationship is exactly as absent as a Node nobody has drawn any edge to.
- The one residual case — a page the GM hasn't attached yet, but that already has a real Relationship authored against its own page-Node (via ADAPT-007, before the GM got around to attaching it) — still shows up as its own separate row, alongside its "real" target Node, in whatever category group its Relationship falls into. This is the "graceful, not elaborate" handling the task named: **no merge logic, no facet tabs, no special-case code.** The row displays like any other row (title, category, click-to-open-sheet). A GM who's mid-migration on a given concept sees two rows for it until they finish attaching the fragment — a known, named, and clearly self-resolving state (attaching the page removes its row on the very next open of this panel, since the panel recomputes from current storage every time it opens), not a permanent seam this panel needs to paper over.

Nothing in this panel's design references `traversalCategory`-based Node-type clustering, entity merging, or facet tabs. The earlier design's entire "collapse same-entity-as clusters" section is retracted.

**2. Entry point: `getHeaderControls*` on both Actor and JournalEntryPage sheets, opening a new `ApplicationV2` window — not a `DialogV2`.**

Confirms the pattern (same mechanism as ADAPT-003/006/009), but names the correct one of the two existing shapes concretely: `actor-node-type-tag.ts`'s `DialogV2.prompt` fits a single small form with one Save action; `relationship-authoring-window.ts`'s dedicated `ApplicationV2` window fits dynamic, potentially-long, click-driven list content. This panel is squarely the second shape — a variable-length grouped list of rows, each independently clickable — so it follows `RelationshipAuthoringApplication`'s established shape (raw-HTML `_renderHTML`/`_replaceHTML`, no Handlebars, DOM event wiring in `_onRender`, the deferred-factory-function trick for the `ApplicationV2` subclass so importing this module never throws outside a real Foundry client), not `DialogV2`.

Register `getHeaderControlsActorSheetV2` and `getHeaderControlsJournalEntryPageSheet`, pushing a button (suggested: icon `fa-solid fa-circle-nodes`, label "Show Connections" — distinct from `relationship-authoring-window.ts`'s existing `fa-solid fa-diagram-project` "New Relationship…" button on the same hooks, so a GM can tell the two apart in the header-controls dropdown). `onClick` resolves the open document's own would-be Node id via the same `resolveDroppedDocumentNode(app.document.documentName, app.document)` call `relationship-authoring-window.ts` already uses for its Origin prefill — no new resolution logic — then opens the window with that id as the query root.

**3. Preset scope for v1: "Direct only" only. "Everything connected" and "Curated by me" are deferred to VIEW-001, not built here.**

- "Everything connected" (depth 2) is explicitly required by ADR-0007 point 6 to ship with collapsed, category-labeled cluster grouping by default ("has to apply to this preset by default, not be a manual habit the GM has to discover, or the canvas floods on first use") — that's real, non-trivial display work (truncation, a "+N more" affordance, expand-in-place) this interim ticket doesn't need to build to satisfy "click a Node, see its connections."
- "Curated by me" needs a save step, and there is deliberately no View-as-Knowledge-Element persistence in this ticket (point 7 below) — nothing to save the curated selection into that wouldn't mean inventing throwaway persistence this ticket is explicitly trying to avoid.
- "Direct only" alone is the smallest complete slice that satisfies Alberto's literal ask with zero further Core work, and is exactly what CORE-005 already computes with no composition needed.

**4. What it shows: "Direct only" results, grouped by the connected Relationship's `traversalCategory`, one row per (Relationship, connected Node) pair.**

Call `resolveTraversal(storage, { preset: 'direct-only', nodeId })`. For each Relationship in the result, resolve its `RelationshipDefinition` via `resolveRelationshipDefinition(definitions, relationship.definitionId)` — using the same temporary `SEEDED_RELATIONSHIP_DEFINITIONS` fallback `relationship-authoring-window.ts` already carries (`RelationshipDefinition` persistence is still CORE-004's deferred fast-follow; this panel inherits that already-known, already-flagged gap, not a new one). Group rows by `definition.traversalCategory` under a plain, fixed label per category (Location / Affiliation / Kinship / Conflict / Governance / Participation / Ownership / Narrative — a direct title-case of the 8-value closed taxonomy, no new vocabulary).

A connected Node can legitimately appear under more than one category group if it's reached via two Relationships of different categories (e.g. a City that both governs and is resided-in by the queried Node) — this is correct, not a bug to dedupe away; each group reflects one category of fact, not a partition of Nodes.

Each row's label uses the Relationship's direction-correct phrase relative to the queried root — `definition.name` if the root is the Relationship's `origin`, `definition.inverse` if the root is its `target` — the same direction-resolution `traverse()` already performs internally to find "the other side," reused for display, not reinvented.

**5. Content-prominence ordering within a category group — this ADR's concrete, decided answer to ADR-0007 point 6's open question, scoped to this panel: degree-descending, alphabetical tiebreak. No persisted manual reorder in this ticket.**

Within each category group, sort rows by the connected Node's own total relationship degree — `(await storage.getRelationshipsForNode(connectedNode.id)).length`, one extra call per distinct connected Node (already exists on `StorageProvider`, no new method) — descending, then alphabetically by the connected Node's title as a tiebreak. This is a real, deliberate answer, not a placeholder: a Node with more total connections elsewhere in the graph is a reasonable, zero-new-attribute proxy for "narratively prominent" (a campaign's major NPCs and factions accumulate more relationships than incidental ones), and it's cheap at Alberto's real scale (~102 Nodes, single-digit-to-low-dozens rows per panel open).

This finalizes ADR-0007 point 6's question for the one case this ticket covers — a single Node's direct connections, recomputed fresh on every open. It does **not** claim to be the full answer for an arbitrary saved View's arrangement: manual drag-to-reorder, and persisting that arrangement, stays out of scope here and is explicitly deferred to VIEW-001 (point 8 below), which is the ticket that actually owns View-as-a-persisted-Knowledge-Element and can satisfy ADR-0007 point 7's "saved arrangement is presentation metadata over derivable content" cleanly, because a View instance exists to hold it. Building a bespoke persistence side-channel just for this panel to support reordering would be exactly the kind of throwaway Core-adjacent state this ticket is designed to avoid.

**6. The "no Actor linked yet" affordance: a row-level badge/icon, derived from the connected Node's own id — no new lookup, no new Core/Storage surface.**

Every Node-backing document is either an `Actor` or a `JournalEntryPage` (`SUPPORTED_DOCUMENT_KINDS`, `relationship-node-resolution.ts`), and a Node's id is always that document's real Foundry UUID (ADR-0001) — an Actor's UUID always starts with `Actor.`, everything else reaching this panel is JournalEntryPage-backed. So: if a connected Node's `id` does **not** start with `Actor.`, render a small icon/badge next to its row (suggested: a muted "no sheet" glyph with a tooltip reading "Journal only — no Actor yet") — purely presentational, computed from a string already in hand, no extra `fromUuid`/storage round-trip. This directly answers the "know if we have a defined Actor already" half of Alberto's original ask. No inline "create an Actor from this page" action — that's new Adapter capability nobody asked for yet; the badge is read-only signal, not a workflow.

**7. Row click behavior: opens the connected Node's real Foundry sheet — confirmed, unchanged from the earlier answer — plus a new requirement the ADR-0011 input actually surfaces: attached Blocks render inline under the row, each independently clickable.**

Primary click on a row's title still does exactly what the earlier answer said: resolve the connected Node's document via `foundry.utils.fromUuid(node.id)` and render its own sheet (`doc.sheet.render(true)`), the same standalone-sheet-opening idiom already implicit in this codebase's Foundry glue. That's still correct and doesn't change.

What changes given ADR-0011: `TraversalResult.nodes` already carries full `Node` objects, including `.blocks` — no additional query needed. If a connected Node has `blocks.length > 0` (which, post-ADR-0011, is exactly the case for a Node like Fausto's Actor that's had pages attached to it), render each Block as a small secondary line nested under that row — its `title` (already the disambiguated "{parent} — {name}" string ADAPT-001 computed at attach time, per ADR-0011 point 4, so no re-fetch is needed to display it) as its own independently clickable link, opening that Block's own document via `foundry.utils.fromUuid(block.uuid)`. This is the concrete mechanism that actually delivers "see all his journal entries as data blocks" from within this panel, rather than requiring the GM to already know a Block exists and go find it through the Actor sheet (which has no knowledge of Archivexus's Block concept and wouldn't show it). No new window, no new Core/Storage capability — `Block.uuid`/`Block.title` already exist on every Node this panel already fetches.

**8. Scope boundary vs. VIEW-001 (issue #44) — explicit, so nobody re-derives it later.**

This ticket delivers:
- The `getHeaderControls*` entry points and the `ApplicationV2` window itself, on both Actor and JournalEntryPage sheets.
- "Direct only" traversal, grouped by `traversalCategory`, sorted degree-descending/alpha-tiebreak.
- The no-Actor-yet badge.
- Inline, clickable Block display per row.
- Click-through to real Foundry sheets for both a row's own Node and any of its Blocks.
- Zero View-as-Knowledge-Element persistence — every open recomputes from current storage; nothing is saved.

Deferred to VIEW-001, not touched by this ADR:
- Actual graph/canvas rendering (nodes-and-edges visual, or any other real View *format* — Timeline/Tree/Table/Map/Graph).
- "Everything connected" (depth 2) and its mandated collapsed-cluster grouping/"+N more" truncation.
- "Curated by me" (manual per-Node pruning UI, plus saving the result).
- Persisted View-as-Knowledge-Element: saved layout, saved expand/collapse state, saved manual reorder (ADR-0007 point 7's "always derivable" invariant over presentation metadata) — this panel has no saved state of any kind.
- Any new authoring actions surfaced from within a connections list (e.g. "create a Relationship from this row," "attach this page from here") beyond the existing, separate header controls a GM already has on each sheet.

**Proposed ticket: `ADAPT-011` — "Node Connections panel: interim Direct-only read surface for CORE-005."** Matches this codebase's existing naming convention (`ADAPT-*` for Foundry-Adapter-side `getHeaderControls*` UI tickets — ADAPT-003/006-007/009-010's own lineage), the next free number in that series, and keeps this explicitly separate from and smaller than VIEW-001 as the task required.

---

## Consequences

### Advantages

- Delivers Alberto's literal, stated goal ("click a Node, see its connections") using only already-merged code (CORE-005, `StorageProvider`) plus one new, small, well-precedented Adapter-side UI module — zero further Core work, zero new `StorageProvider` methods, zero schema change.
- ADR-0011 genuinely simplifies this ticket versus the earlier brainstorm sketch: an entire category of clustering/merging logic (same-entity-as collapse, facet tabs) is deleted from scope, not deferred — it was never load-bearing once ADR-0011 shipped.
- Gives a real, concrete, justified answer to a named open question (ADR-0007 point 6) instead of leaving it open indefinitely, while being honest that it's scoped to this panel's one case, not the general saved-View-arrangement problem.
- The Blocks-inline-under-a-row requirement this ADR adds is a direct, mechanical consequence of ADR-0011's own decided Block shape (`{type, uuid, title?}`) — no speculative design, just consuming a shape that already exists.
- Keeps the surface genuinely narrow: no persistence, no new preset UI, no drag-and-drop reordering — every piece of scope creep visible in the earlier sketch (clustering, facets) or tempting to add here (save state, all 3 presets) is named and explicitly pushed to VIEW-001 instead of quietly absorbed.

### Disadvantages

- The residual "unattached page with an already-authored Relationship shows as a separate row" case (point 1) is a real, visible seam for as long as a GM leaves a fragment mid-migration — not eliminated, only kept small and self-resolving. A GM who doesn't understand why "Fausto Farcon" and "Biografía" both show up under Kinship might be confused without reading this ADR's reasoning.
- Degree-descending sort (point 5) is a reasonable heuristic, not a validated one — a Node with many trivial/incidental relationships elsewhere in the graph could outrank a narratively important one with few. Accepted as a deliberate, cheap default for a personal-scale campaign; revisit if it demonstrably orders things wrong once used against real play data.
- No manual reorder and no saved state at all means every open of this panel looks the same regardless of what a GM did last time — a real, named limitation relative to what a GM might expect from something that looks like a "view." This is intentional (point 8), not an oversight, but it is a real UX cost until VIEW-001 exists.
- Relies on the same temporary `SEEDED_RELATIONSHIP_DEFINITIONS` placeholder ADAPT-007 already carries for category grouping — if that seed list drifts from whatever Definitions a GM actually authors before real `RelationshipDefinition` persistence lands, grouping/labels could be wrong or incomplete. Not a new risk this ticket introduces, but one it inherits and doesn't fix.
- The no-Actor-yet badge (point 6) is read-only signal with no inline remedy — a GM who wants to formalize a lore-only Node into a real Actor still has to do that entirely outside this panel, by hand, in Foundry.

---

## Alternatives Considered

- **Keep the earlier `same-entity-as`-cluster design, treating ADR-0011 as orthogonal.** Rejected — ADR-0011 already judges `same-entity-as` superseded for the exact fragmentation problem the clustering logic existed to solve; building clustering anyway would duplicate a solved problem and reintroduce the multi-authoring-action burden Alberto specifically rejected when ADR-0011 was decided.
- **A `DialogV2.prompt`, matching ADAPT-003/ADAPT-009's exact mechanism instead of `relationship-authoring-window.ts`'s `ApplicationV2`.** Rejected — `DialogV2` fits a small, fixed-shape form with one Save action; a variable-length, click-driven, grouped list is a materially different interaction shape, already correctly identified as needing the `ApplicationV2` precedent instead.
- **Ship "Everything connected" too, in this same ticket, without the mandated cluster grouping ADR-0007 requires for it.** Rejected outright — ADR-0007 point 6 is explicit that depth-2 without collapsed grouping "floods on first use." Shipping it without that grouping would violate an existing Accepted decision, not just be incomplete.
- **Persist a minimal ad hoc "last manual order" per Node, outside any real View entity, just for this panel.** Considered as a way to give point 5 a fuller answer sooner. Rejected — inventing a bespoke, non-Knowledge-Element persistence side-channel is exactly the kind of throwaway Core-adjacent state this ticket is trying to avoid, and duplicates work VIEW-001 will do properly once a real View instance exists to hold saved arrangement.
- **Show a Node's Blocks only by opening its real sheet and relying on some future Actor-sheet enhancement to surface them.** Rejected — Foundry's own Actor sheet has no concept of an Archivexus Block; deferring this would mean the panel doesn't actually deliver "see all his journal entries as data blocks" at all, only "see connections," which is a narrower promise than Alberto's stated goal.
- **Resolve "Actor-backed vs. JournalEntryPage-backed" per row via a `fromUuid` lookup instead of the id-prefix check.** Rejected — needlessly async and slower for a purely cosmetic badge; the Foundry UUID's own shape (ADR-0001) already encodes this for free, and `relationship-node-resolution.ts`'s `SUPPORTED_DOCUMENT_KINDS` already confirms there are only two possible backing kinds to distinguish.
