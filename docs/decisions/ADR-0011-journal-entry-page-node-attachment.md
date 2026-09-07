# ADR-0011

## Title

A JournalEntryPage becomes a Node by default, but a GM can explicitly attach it to another Node instead — amending the Node Decision that every page maps to its own Node.

---

## Status

Accepted

---

## Context

Alberto's real campaign has "Lord Fausto Farcon" spread across 4 disconnected Foundry documents: 3 `JournalEntryPage`s (Biografía, Retrato, Notas personales — each its own Foundry UUID) plus a separate `Actor`. Under `03_DOMAIN_MODEL.md`'s existing Node Decision ("Is a Foundry Journal a Node? ... The Foundry Adapter maps each page with distinct semantic content to its own Node"), every one of those 4 documents becomes its own standalone, disconnected Node. Alberto's stated goal — "click a member of an organization, then click that person, see all his journal entries as data blocks, know if we have a defined Actor already, his location" — needs *one* clickable thing representing Fausto, not 4 peers. This also isn't an Actor-only problem: Alberto separately named a City built from several JournalEntryPages (looks, history, etc.) with no Actor involved at all — the same "several fragments describing one concept" shape.

Two parallel consults gave genuinely different answers:

- **product-owner** proposed extending the existing Scene→Block precedent (ADAPT-005: an explicitly-linked Scene becomes a `scene`-type Block on the target Node instead of its own Node) to JournalEntryPage — flagged that this supersedes an Accepted Decision and needs architect+DBA to settle the actual mechanism and migration, since 61 real pages are already synced as standalone Nodes (STORE-003's backfill).
- **ux-ui-designer** proposed leaving the Node Decision untouched and instead authoring a new symmetric `same-entity-as` `RelationshipDefinition` via the already-shipped ADAPT-007 window (drag two existing Nodes together) — arguing the Block-conversion path has a real, named migration risk: no reliable signal for which Node a page belongs to, and any Relationships already authored against a page's UUID (Alberto has real ones, via ADAPT-007) would start dangling if that page stops being a Node.

Alberto's own steer settles the direction (quoted in full in the task that produced this ADR): the GM decides **at page-authoring/tagging time** whether a given page is (a) its own new standalone Node — today's default, a discoverable note or standalone lore snippet — or (b) content contributing to an existing Node, whether that Node is Actor-backed (Fausto's case) or JournalEntryPage-backed (a City's "history" page attaching to its "looks" page). Explicitly a single per-page authoring choice, not a separate Relationship to author afterward for every fragment — Alberto named the configuration burden of the Relationship-based approach as the reason he leans away from it, even while recognizing it as the architecturally safer path.

This ADR settles the concrete mechanism, storage shape, migration direction, and state-transition behavior product-owner flagged as needing architect+DBA resolution, and gives a clear verdict on whether ux-ui-designer's `same-entity-as` proposal is still needed alongside it.

---

## Decision

**1. Mechanism: extend the existing per-document tagging control (ADR-0009's `getHeaderControls*` + `DialogV2` pattern) to `JournalEntryPage` sheets, adding an "attach to an existing Node" option — not a new dedicated `ApplicationV2` window, and not a `same-entity-as` Relationship.**

A `getHeaderControlsJournalEntryPageSheet` button ("Archivexus Node Type", same icon/label convention as the existing Actor control) opens a `DialogV2.prompt` whose content is `buildNodeTypeDialogContent`'s existing type-text-input-plus-datalist **plus** a second field: a `<document-tags single>` element (`type` omitted, same widget ADR-0010 already validated for picking a Node backed by either an Actor or a JournalEntryPage), labeled "Or attach to an existing Node." The two fields are mutually exclusive at read time: if the document-tags field resolves to a UUID, that wins (attach mode); otherwise the type-text-input's value is used (standalone mode, unchanged from today).

This is deliberately the same single-dialog, single-click shape the GM already knows from the Actor control — not a second `ApplicationV2` window, and not a per-fragment Relationship to author. Directly answers Alberto's own tradeoff: "requires a lot of configuration from the user... could be overwhelming" is avoided by making this one authoring-time choice per page, reusing 90% of already-shipped code (the dialog mechanism, the `<document-tags>` widget), rather than a new interaction pattern.

Actor sheets are **not** extended with an attach option — an Actor is always a hub, never itself demoted to a fragment of another Node. No use case surfaced for the reverse (an Actor contributing to some other Node as a Block), and extending only JournalEntryPage matches this project's own established incremental-per-document-type precedent (ADAPT-001 → ADAPT-004 → ADAPT-005 → ADAPT-003).

**2. Storage shape: a new `flags.archivexus.attachedToNodeId` flag on the `JournalEntryPage`, holding the target's Foundry UUID.**

Presence of `attachedToNodeId` means "this page's content contributes to the Node with this id" — since Node id is always a Foundry UUID (ADR-0001), the same flag value works whether the target is Actor-backed or JournalEntryPage-backed, with zero special-casing. `flags.archivexus.nodeType` (ADAPT-004/ADAPT-005's existing flag) is left untouched when attaching — it simply stops being read for this page — but going back to standalone mode explicitly `unsetFlag`s `attachedToNodeId`, so the precedence rule (below) can't leave a page stuck in a stale attached state.

**3. Mapping stays pure; resolution/orchestration moves to `storage-sync.ts`. Precedence: `attachedToNodeId` wins over `nodeType`, but only if it resolves to a real, currently-existing Node — an unresolved attach reference falls back to standalone, never to nothing.**

`mapJournalEntryPageToNode` (ADAPT-001, pure, no I/O) is unchanged — it still always computes what the page's *own* Node would look like. A new pure function reads only the flag (e.g. `resolvePageAttachment(page): { attached: true; targetNodeId: string } | { attached: false }`) — still synchronous, still no Foundry API calls. The actual decision of what to persist moves into `storage-sync.ts`'s `syncJournalEntryPage(page, storage)`, which already does async I/O:

- Not attached → unchanged: `storage.saveNode(mapJournalEntryPageToNode(page))`.
- Attached, and `storage.getNode(targetNodeId)` resolves → the page becomes a Block on that target Node (point 4), and its own standalone Node (if one exists at `page.uuid`) is deleted (point 5).
- Attached, but `storage.getNode(targetNodeId)` does **not** resolve (dangling attach reference — target Node was itself deleted, or the flag points at something that was never a Node) → falls back to the standalone path, exactly as if `attachedToNodeId` weren't set. A broken attach reference must never make a page's content silently vanish from the graph — this mirrors ADR-0007 point 8's existing philosophy for a dangling Relationship endpoint (excluded from traversal, never treated as an error), applied here to a dangling attachment reference instead.

**4. An attached page becomes a Block on the target Node: `{ type: 'JournalEntryPage', uuid: page.uuid, title }` — confirming, not changing, Block's existing `{type, uuid, title?}` shape (`03_DOMAIN_MODEL.md`'s Knowledge Element Decisions).**

`type` uses the real Foundry document-type name (`'JournalEntryPage'`), the same convention `resolveDroppedDocumentNode`'s `documentName` already uses elsewhere in this codebase (ADAPT-007) — not a lowercase/ad-hoc string. `title` is the page's own already-disambiguated title (`resolveTitle`'s existing "{parent} — {name}" qualification, ADAPT-001/#25), so a Block referencing it displays sensibly with no re-fetch. This is the first real concrete producer of a Block since the shape was decided (ADAPT-005's Scene→Block mapping is decided but not yet implemented) — no shape change needed, just a second document type filling in the same `{type, uuid, title?}` contract.

A page attaches to **at most one** target Node (`attachedToNodeId` is a single string, not a list) — a Block, in this design, lives in exactly one Node's `blocks` array; nothing named a use case for the same page fragment being simultaneously shared across multiple Nodes' Blocks, so this isn't modeled. Adding/updating this Block on the target must be idempotent by `uuid` (replace, don't duplicate, on every re-sync — `updateJournalEntryPage` fires on every edit) — a concrete requirement for whoever implements this, not resolved by this ADR's own text.

**5. State transition (the exact gap product-owner flagged as needing architect+DBA): retagging an already-synced standalone page as attached deletes its standalone Node. Existing Relationships against it survive as dangling references, per ADR-0007 point 8 — this ADR does not invent a new answer, it reuses the one that already exists. The GM is warned, non-blockingly, after the fact.**

If a page that already has its own Node (id = `page.uuid`) — one of the 61 real backfilled pages, or any page Alberto has already used in ADAPT-007's Relationship-authoring window — gets tagged `attachedToNodeId`, `storage-sync.ts`'s orchestration:

1. Checks `storage.getRelationshipsForNode(page.uuid)` (STORE-003's existing 1-hop primitive — the exact same call ADR-0010's cardinality check already uses, no new storage capability needed) **before** deleting anything, purely to know whether to warn.
2. Calls `storage.deleteNode(page.uuid)` — which, per `storage-provider.ts`'s own documented contract, does **not** cascade to Relationships referencing it. Any Relationship whose origin or target was `page.uuid` keeps existing as a stored fact (History is Part of the World), but is now excluded wherever current Nodes are expected (traversal, future Views) — exactly the existing, already-designed-for "dangling endpoint" behavior, not a new one this ADR had to invent.
3. Adds the Block to the target Node (point 4).
4. If step 1 found any Relationships, surfaces a non-blocking Foundry notification (`ui.notifications.warn`, zero new dependency) naming the count — e.g. "Biografía had 2 Relationship(s); they're preserved but excluded from the graph until re-authored against Fausto Farcon directly." Warn, never block — consistent with ADR-0010 point 6's authoring-time precedent, and appropriate here since the flag write (and thus the "decision") has already happened by the time this runs; there's no graceful way to intercept it earlier without making the tagging dialog itself reactive/storage-aware, which would be a disproportionate complication of an intentionally simple, proven, single-shot `DialogV2.prompt` mechanism for what should stay a lightweight control.

This is a real, named cost — flagged plainly, not undersold: retagging an already-related page **does** orphan its existing Relationships from live traversal. It does not delete or corrupt them (they remain queryable by id, and `03_DOMAIN_MODEL.md`'s Relationship Decision already treats this as a legitimate, non-error state), and re-authoring the same fact against the new target (e.g., re-dragging "Fausto Farcon resides-in Puerto Umbral" against his Actor instead of against the old Biografía-Node) is a normal ADAPT-007 action, not a special recovery flow.

**6. Default (no `attachedToNodeId`, no `nodeType`): unchanged from today.** A page with neither flag still becomes its own standalone `Lore`-typed Node — this ADR adds a capability, it does not change what happens when a GM does nothing, matching the no-inference principle already established for Scene/Actor/JournalEntryPage mapping.

**7. Migration for the 61 already-synced pages: opportunistic only, no forced/batch migration.** Nothing changes for any existing page unless and until a GM explicitly sets `attachedToNodeId` on it. This has the same "nothing breaks in the meantime" property ux-ui-designer's `same-entity-as` proposal assumed for itself — the cost named in point 5 only materializes at the moment a GM chooses to retag a specific page, never as a side effect of this ADR shipping. Alberto (or whoever implements this) re-tags Fausto's 3 pages, or a City's fragment pages, as he touches them — there is no scripted backfill and none is needed.

**8. `same-entity-as` (ux-ui-designer's proposal) is superseded for the problem it was aimed at solving — not kept as a coexisting alternative mechanism.** See Alternatives Considered.

---

## Consequences

### Advantages

- Reuses two already-proven mechanisms end to end (ADR-0009's `DialogV2` tagging pattern, ADR-0010's `<document-tags single>` widget) instead of inventing a third UI pattern — directly addresses Alberto's own "here is where we need to improve the current tools given by Foundry" framing with the smallest real extension, not a rebuild.
- Solves Alberto's literal Fausto scenario (pages attach to his Actor, becoming Blocks on one clickable Node) *and* his own named City-from-several-pages case, with the exact same mechanism and zero special-casing for which document type the target happens to be.
- No forced migration: the 61 real backfilled pages are entirely unaffected until a GM opportunistically retags one.
- Reuses `03_DOMAIN_MODEL.md`'s existing "a dangling Relationship endpoint is excluded, not an error" answer (ADR-0007 point 8) for the one real migration risk ux-ui-designer named, instead of needing a new philosophy for it.
- Block's `{type, uuid, title?}` shape needs no change — this just gives it its first real concrete producer.

### Disadvantages

- **Retagging an already-related page really does orphan its existing Relationships from live traversal** (point 5) — a real, named cost, not eliminated, only made visible (a warning notification) and bounded (nothing is deleted or corrupted, only excluded until re-authored). A GM who doesn't notice/act on the warning may be confused later about why a Relationship they remember authoring isn't showing up in a graph View.
- **No automatic "detach" cleanup.** If a GM later clears or changes `attachedToNodeId` (reverting a page to standalone, or re-pointing it at a different target), the standalone-Node path correctly recreates the page's own Node again — but nothing in this ADR's mechanism removes the now-stale Block reference from whatever Node it used to be attached to. Until a future ticket adds that reverse lookup (finding which Node currently holds a Block with a given `uuid` — no index exists for this today, since `blocks` is an unindexed JSON column per STORE-003's `row-mapping.ts`), a detached-then-reattached-elsewhere page can be briefly double-represented: once as its own restored standalone Node, and once as a stale Block reference on the old target. This doesn't destroy or duplicate the underlying Foundry document (ADR-0001's UUID-as-identity keeps that safe), only Archivexus's own display of it — named explicitly here rather than left to be rediscovered as a surprise bug.
- The non-blocking warning (point 5) happens **after** the flag write, not before — a GM who clicks "Save" doesn't get a chance to reconsider before the Relationship-orphaning takes effect, only a notice afterward. Accepted as proportionate for a personal-scale project rather than complicating the tagging dialog into a reactive, storage-aware window.
- Idempotent Block-upsert-by-uuid on repeated `updateJournalEntryPage` fires is a real implementation requirement this ADR names but doesn't itself specify at the SQL level — DBA's follow-up (see report).

---

## Alternatives Considered

- **ux-ui-designer's `same-entity-as` symmetric `RelationshipDefinition`, authored via ADAPT-007's existing window.** Rejected as the primary mechanism, though it was the architecturally safer, more reversible option (zero domain-model change, zero migration risk, zero new storage shape) — for exactly the reason Alberto himself gave: it requires a separate authoring action per fragment (drag Biografía → Fausto's Actor, drag Retrato → Fausto's Actor, drag Notas personales → Fausto's Actor — three explicit relationship-authoring actions for one person, more for a City with several pages), which is the "a lot of configuration... overwhelming" cost he flagged. It also doesn't solve the actual display goal on its own: clicking Fausto's Actor Node in a future graph View would show 4 separate connected peer-Nodes linked by `same-entity-as`, not "one thing to click with 4 data blocks on it" — achieving Alberto's literal ask would need the View layer to additionally special-case merging `same-entity-as`-linked Nodes into a single visual card, which is *more* total work across two layers (Relationship-authoring + View rendering), not less. Once the attachment mechanism exists, no distinct real-world case was found that still needs `same-entity-as` specifically — an ordinary Relationship (any Definition) between two Nodes that genuinely are separate concepts (not fragments of one) already covers any residual "these are connected/similar" need. `RelationshipDefinition` persistence doesn't exist yet either (still CORE-004's deferred fast-follow), so there's no shipped code to unwind — this is a clean, cheap "don't build it" rather than a reversal.
- **Extending ADAPT-005's Scene→Block precedent verbatim, with no state-transition answer** (product-owner's proposal as originally framed) — accepted in spirit (it's the right precedent to extend), but explicitly not sufficient on its own: it correctly identified *that* a page should become a Block on explicit link, but left open exactly what architect+DBA needed to resolve — what happens to an already-synced standalone Node and its real authored Relationships. Point 5 above is that resolution.
- **A dedicated `ApplicationV2` window for page-attachment (mirroring ADAPT-007's Relationship-authoring window) instead of extending the existing `DialogV2`.** Rejected — ADR-0010 reserved `ApplicationV2` specifically for the harder two-arbitrary-entity-picking case; attaching a page is fundamentally a single-document action (pick one target for the page whose sheet is already open), the same shape ADR-0009's `DialogV2` already fits. A second window would be new surface area for no material capability gain.
- **A forced/scripted batch migration re-triaging all 61 existing pages** (asking the GM to explicitly confirm standalone-vs-attached for every one before shipping). Rejected — directly contradicts the "opportunistic, nothing forced" property both product-owner's and ux-ui-designer's proposals implicitly assumed, and there is no deadline or correctness reason requiring it; the pages work exactly as they do today until touched.
- **Deleting/orphaning silently, with no warning at all, on retag.** Rejected — cheap to check (the same existing 1-hop lookup ADR-0010's cardinality warning already uses), and a GM who doesn't realize a page's Relationships just went dangling deserves to know, even non-blockingly, same reasoning ADR-0010 itself used for its own warn-never-block cardinality check.
- **Blocking the retag entirely if Relationships exist** (require the GM to first delete/re-author them before attaching). Rejected — adds real friction for a case (a City's page turning out to relate to another City page, or Fausto's pages turning out to belong together) that's a completely legitimate, even expected, authoring correction, not a mistake to gate.
