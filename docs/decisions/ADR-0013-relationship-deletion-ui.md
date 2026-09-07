# ADR-0013

## Title

Deleting a Relationship instance: a new per-Node "Relationships…" list window (list-and-delete only), gated by a native confirm dialog — no StorageProvider change needed.

---

## Status

Accepted

---

## Context

ADAPT-007 (ADR-0010) shipped Relationship *creation*, deliberately create-only — its own follow-up note named the gap directly: live-verification of the authoring window "stopped short of clicking Save itself (no delete-Relationship UI exists yet to clean up test data afterward)." There is currently **no way at all** for a GM to see, let alone remove, a real `Relationship` instance they authored by mistake, for a test, or that's simply no longer true (two characters who stopped being allies). This is also the concrete instance of a gap already named during the ADR-0011 brainstorm: CORE-005's Query API (and even STORE-003's simpler 1-hop `getRelationshipsForNode`) has zero UI consumer today — nothing in `src/adapters/foundry/` has ever rendered a list of a Node's Relationships, only ever checked their *count* for a cardinality warning (ADR-0010 point 6) or an orphaning warning (ADR-0011 point 5).

This ADR settles how a GM triggers a delete, whether it needs confirmation, what it does (or doesn't do) to the two Nodes involved, and whether `StorageProvider` needs a new method.

Out of scope, deliberately: editing an existing Relationship's Definition or endpoints (a materially different feature — re-pick two entities and a Definition, not a delete), and the full graph View/canvas (VIEW-001's territory) — even though this ADR's answer to "where does delete live" ends up naming a real, minimal list-view dependency, that dependency stops at a flat list, not a rendered graph.

---

## Decision

**1. Entry point: a third `getHeaderControls*` button, "Relationships…", opening a new dedicated, lightweight `ApplicationV2` list window — not a reuse of ADAPT-007's authoring window, and not a `DialogV2.prompt`.**

Reusing the authoring window (dropping the same two entities back into Origin/Target) was considered and rejected: that window is fundamentally create-oriented (`Save` always calls `createRelationship`; there is no "detect an existing Relationship between these two and offer to remove it" mode), it has no way to disambiguate *which* Relationship a GM means when more than one exists between the same pair (different Definitions, or the same Definition used twice under a warned-but-allowed cardinality conflict — ADR-0010 point 6's own named tradeoff), and it requires the GM to already remember which Definition was used, which is exactly the kind of recall a GM authoring/cleaning up by feel shouldn't need. Retrofitting a "detect existing / switch to delete mode" branch onto an already-substantial window is materially more implementation risk than a new, much simpler window.

A `DialogV2.prompt` doesn't fit either — it's built for one confirm/decision, not an open-ended list of rows each with their own independent action.

Concretely: a new file (`relationship-list-window.ts`, parallel naming/shape to `relationship-authoring-window.ts`) registers its own `getHeaderControlsActorSheetV2` / `getHeaderControlsJournalEntryPageSheet` listeners (`registerRelationshipListEntryPoints`), pushing a third "Relationships…" control (icon suggestion: `fa-solid fa-list`) alongside the existing "Archivexus Node Type" and "New Relationship…" buttons. This is the same hook-name-coexistence pattern already proven at n=2 (ADAPT-010's `header-controls-coexistence.test.ts`) extended to n=3 — a new/extended coexistence test should assert this explicitly rather than assuming it holds by extrapolation (see Consequences). Clicking it opens the new window pre-scoped to the clicked document's own Node (`app.document.uuid` — no drop/resolution step needed, unlike the authoring window's cross-entity picking, since there's only one entity here: the sheet already open).

**2. List content: one row per `getRelationshipsForNode(nodeId)` result, rendered using the Relationship's own already-stored `title` — no new endpoint-resolution logic.**

`StorageProvider.getRelationshipsForNode` (STORE-003, already exists) is the exact right primitive: it returns every Relationship where the clicked Node is origin *or* target, in one call, no CORE-005/N-hop dependency (matching ADR-0010's own precedent of not needing the Query API for 1-hop concerns). Each row displays `relationship.title` verbatim — the human-readable sentence already computed and persisted at creation time (`buildRelationshipTitle`, `relationship-symmetry.ts`), e.g. "Kharra resides-in Puerto Umbral." This is a direct application of Rule 4 (avoid duplicate sources of truth): the window does **not** re-resolve either endpoint's current title, re-check symmetry, or re-derive direction — that work was already done once, at Save time, by the authoring window, and reusing it here means a dangling endpoint (ADR-0007 point 8) still renders a perfectly readable row with zero special-casing, rather than needing a second title-resolution code path that would have to handle "what if this Node no longer exists" all over again.

Each row also carries a "Delete" button. Empty state ("No relationships yet.") when the list is empty — the button itself always shows regardless of count, matching "New Relationship…"'s and "Archivexus Node Type"'s own always-visible precedent (this is an opt-in click-to-open action, not persistent DOM injection, so ADR-0009's Amendment's "zero-payoff permanent bar" lesson doesn't apply here).

**3. Confirmation: yes — a single native `DialogV2.confirm` modal per delete, showing that row's own `title` text, before calling `storage.deleteRelationship(id)`.**

This is a deliberate, explicit exception to ADR-0010 point 6's and ADR-0011 point 5's "warn, never block" posture — reasoned here, not defaulted to. Both of those precedents govern situations where the underlying data survives regardless of what the GM does: a cardinality "violation" just means a second valid Relationship gets saved (recoverable — delete it later, now that this ADR exists); a retag-orphaned Relationship is excluded from traversal but still exists, queryable by id, re-authorable. Deleting a Relationship instance has no such recovery path — the fact is gone. Given that real difference in reversibility, one extra click via a native, already-documented Foundry primitive (`DialogV2.confirm`, the same family as `DialogV2.prompt` ADR-0009 already uses) is proportionate — and it isn't even new ceremony from the GM's perspective, since it's the same confirm pattern Foundry's own UI already uses when deleting its own Documents (an Actor, a JournalEntryPage). Low-friction (Rule 9) does not mean zero-friction for an actually-irreversible action; it means not adding friction beyond what the action's real stakes justify.

After a confirmed delete, the window stays open and just removes that one row (re-render the list, or splice the row) — it does **not** close, unlike the authoring window's Save. This directly matches the real motivating use case named in `PROJECT.md`'s own Stage notes: cleaning up several mistaken/test Relationships in one sitting, not a single one-shot action.

**4. Effect on the two connected Nodes: none — restated, not re-derived, from ADR-0007 point 8, and structurally impossible to be otherwise.**

`deleteRelationship` is a plain row delete against the `relationships` table; `01_ARCHITECTURE.md`/ADR-0007/ADR-0008 already establish there is no FK from `relationships.origin`/`target` to `nodes.id`, so nothing could cascade even if it tried to. No warning or notice is shown about the two Nodes at delete time, and this is the deliberately lower-stakes mirror of ADR-0011 point 5's Node-deletion warning: a Node never stores a reference *back* to a Relationship (a Node's `blocks` array references Foundry documents, not Relationships — `03_DOMAIN_MODEL.md`'s own "Relationships cannot be an endpoint of a Relationship" rule keeps this one-directional), so there is nothing on the Node side that can go stale, dangling, or surprising as a result of this action. Confirming this explicitly here closes the one open question a delete-Relationship UI could otherwise raise doubt about.

**5. `StorageProvider`: no change. `deleteRelationship` already exists, end to end.**

Confirmed via inspection, not assumed: the port (`src/core/storage/storage-provider.ts:55`), the concrete SQLite implementation (`src/storage/sqlite/sqlite-storage-provider.ts:121`), the Worker RPC transport (`src/storage/sqlite/worker/protocol.ts:18`, `src/storage/sqlite/worker-storage-provider.ts:118-119`), and existing unit tests (`sqlite-storage-provider.test.ts`, `worker-storage-provider.test.ts`, `rpc-dispatcher.test.ts`) all already implement/exercise it. This ticket's implement pass touches only `src/adapters/foundry/` — no Core, no DBA, no migration.

---

## Consequences

### Advantages

- Fills a real, previously-named gap on its own merits, beyond just enabling delete: this is the first-ever UI surface in this codebase that lets a GM actually *see* a Node's Relationships at all — exactly the missing CORE-005/`getRelationshipsForNode` UI consumer named during the ADR-0011 brainstorm.
- Reuses proven mechanisms end-to-end and adds nothing new at the Core/Storage layer: `getHeaderControls*` (ADR-0009/0010), `getRelationshipsForNode`'s 1-hop primitive (STORE-003, confirmed already sufficient, no CORE-005 dependency), the `DialogV2` family (ADR-0009), and — the biggest simplification — the Relationship's own already-persisted `title` field, avoiding a second endpoint-title-resolution code path (Rule 4).
- Zero Core/Storage/schema changes — `deleteRelationship` is fully plumbed already; this is a pure Foundry-Adapter UI ticket.
- The confirm step is proportionate, not new ceremony: one native modal click, matching Foundry's own established delete-confirmation convention for its own Documents.
- Keeping the window open after each delete (removing just that row) matches the real, named use case: batch-cleaning several relationships in one sitting.

### Disadvantages

- A third independent `getHeaderControls*` listener on the same two hook names — coexistence has only been *proven* at n=2 (ADAPT-010's test); it should get its own (or an extended) coexistence assertion rather than assuming it holds by extrapolation to n=3.
- Rendering `relationship.title` verbatim means a dangling-endpoint Relationship (ADR-0007 point 8) shows as an ordinary-looking sentence with no visual cue that one side no longer exists. Accepted: deleting a dangling Relationship is itself a legitimate cleanup case this ADR wants to support, not a scenario to specially flag — but named here so it isn't mistaken for an oversight.
- No sorting, grouping, or pagination — a Node with many Relationships gets one flat list. Acceptable at Alberto's real current scale (~100 Nodes, still-small Relationship counts per Node); same "revisit if it becomes a real problem" posture this project already takes elsewhere (e.g. ADR-0011's `listNodes()` full-scan call).
- `DialogV2.confirm`'s exact call signature/options are documented but not yet exercised anywhere in this codebase (only `DialogV2.prompt` has been used so far, ADR-0009) — needs the same "verify against a real render" discipline every other Foundry-glue piece in this lineage has needed before Alberto trusts it.
- The `ApplicationV2` `actions` map's `(event, target)` per-element-argument signature (needed here because several rows share one `data-action="delete"` value, disambiguated by a `data-relationship-id` attribute on `target`) hasn't been exercised in this codebase either — `relationship-authoring-window.ts`'s own single Save button never needed to distinguish between multiple buttons sharing an action name. Flagged as a real, unverified piece for whoever implements this, same category of gap this file's own doc comment already tracks for its sibling window.

---

## Alternatives Considered

- **Reuse ADAPT-007's authoring window, adding a "detected existing Relationship → offer delete" branch.** Rejected — see Decision point 1: create-oriented by design, no way to disambiguate multiple Relationships between the same pair or recall which Definition was used, and retrofitting a delete-mode branch is more implementation risk than a small new window.
- **No confirmation, matching the project's "warn, never block" posture verbatim.** Rejected — reasoned explicitly in Decision point 3: every existing instance of that posture (ADR-0010 point 6, ADR-0011 point 5) leaves the underlying data recoverable; an actual delete does not, which is a real difference in stakes, not a rote exception.
- **A two-step inline "click again to confirm" per-row affordance, instead of a modal.** Considered — avoids a second Foundry API surface (`DialogV2.confirm`), but needs real per-row "armed" state tracking/reset (what happens if the GM clicks "arm" on row A then clicks delete on row B?) for a marginal UX gain over a modal the GM already recognizes from Foundry's own delete flows. Rejected for the modal being both simpler to implement correctly and more consistent with platform convention.
- **A global, cross-Node "All Relationships" table/admin view**, rather than per-Node. Rejected as premature and out of scope: this is real Table-View-format territory (a separate, future View concern), doesn't match the entry-point precedent every other piece of this UI family uses (act on a document whose sheet is already open), and the actual named use case (cleaning up relationships for a Node the GM is already looking at) doesn't need it.
- **Adding a batch/bulk-delete `StorageProvider` method.** Rejected — not needed; `deleteRelationship` called once per confirmed row is fine at this project's scale (Rule 9), and the window staying open after each delete already supports the real "clean up several in one sitting" use case without a new port method.
