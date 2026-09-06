# ADR-0010

## Title

Relationship-authoring UI for Foundry: a dedicated Application with native document drag-and-drop, not a document-browser picker or a reused header-button-plus-dialog.

---

## Status

Accepted

---

## Context

CORE-003 (`Relationship`) and CORE-004 (`RelationshipDefinition`) are real Core state; STORE-003 gives a real `StorageProvider` (`saveRelationship`, `getRelationshipsForNode` — a real 1-hop index, ADR-0007). Nothing yet lets a GM actually *create* a `Relationship` instance inside Foundry. Issue #43 (ADAPT-006) asked this ADR to settle that, explicitly warning not to assume ADAPT-003/ADR-0009's mechanism (a `getHeaderControls*` button on one Actor's own sheet, opening a `DialogV2.prompt` that sets one flag on that same document) transfers — that flow edits one field on one already-open document; this flow has to:

- pick **two** entities, which may be different Foundry document types (an Actor and a `JournalEntryPage`, per ADAPT-001/ADAPT-004 — a Scene is never itself a Node per ADAPT-005, so it's never a direct endpoint; a Scene-linked Node is just an Actor- or JournalEntryPage-backed Node that happens to also carry a `scene`-type Block),
- pick a compatible `RelationshipDefinition`, filtered by `validation.allowedOriginTypes`/`allowedTargetTypes` (CORE-004) once both endpoints' Node types are known,
- react to `cardinality` (CORE-004) if a second Relationship under a one-to-one/one-to-many/many-to-one Definition would conflict with one that already exists,
- and, for a symmetric Definition (`symmetry: true`, `inverse === name`, CORE-004), not force an arbitrary origin/target ordering onto a fact that has none.

**API research done before deciding (Foundry v14, `https://foundryvtt.com/api/`), because ADR-0009's own precedent is "research-first, don't reuse the prior mechanism by default":**

- **No generic cross-document-type picker/browser exists in the public API.** `foundry.applications.apps.FilePicker` ([docs](https://foundryvtt.com/api/classes/foundry.applications.apps.FilePicker.html)) browses the server's *file* directory, not Documents. `foundry.applications.sidebar.DocumentDirectory` ([docs](https://foundryvtt.com/api/classes/foundry.applications.sidebar.DocumentDirectory.html)) is the sidebar tab implementation itself (Actors directory, Journal directory, etc.), not a reusable "pick one Document of any type" dialog a module can pop open. There is no `foundry.applications.apps.DocumentPicker` or equivalent.
- **Native drag-and-drop is real and is the intended mechanism for this.** `foundry.applications.ux.DragDrop` ([docs](https://foundryvtt.com/api/classes/foundry.applications.ux.DragDrop.html)) is a controller any `ApplicationV2` can wire up via a `dragDrop: DragDropConfiguration[]` entry in `DEFAULT_OPTIONS` (`dragSelector`/`dropSelector` + `callbacks`/`permissions` for `dragstart`/`dragover`/`drop`), independent of the canvas — `ApplicationV2` doesn't ship a default drop handler, but the class exists precisely so a module writes its own (confirmed against the Community Wiki's ApplicationV2 guide). `TextEditor.getDragEventData(event)` extracts the dropped payload; `fromUuid()`/`fromDropData` resolve it to the real Document. This is exactly what lets a GM drag an Actor from the sidebar, or drag an already-open sheet's own title bar (Foundry's native "drag a sheet to create a document link" behavior), onto a drop target.
- **`foundry.applications.elements.HTMLDocumentTagsElement` (the `<document-tags>` custom element) is the concrete, documented widget built on top of that mechanism.** It "renders a set of associated Documents referenced by UUID," is `formAssociated`, supports a `single` attribute (restrict to exactly one Document instead of an array), a `type` attribute ("restrict this element to documents of a particular type" — singular; there's no multi-type restriction), and a `max` count. Confirmed: it accepts drag-and-drop to set its UUID, **and also accepts a pasted UUID as a keyboard/no-mouse fallback** — it does **not** offer a type-a-name/autocomplete search (that's a separate, unrelated element, `<autocomplete-tags>` / `HTMLAutocompleteTagsElement`, a plain string-tag input with no Document/UUID awareness at all). This confirms the ticket's own steer: drag-and-drop (with paste-UUID as the only non-mouse fallback Foundry itself offers) is the realistic mechanism, not a search-driven picker — there isn't one to reuse.
- **`getHeaderControls*` hooks (ADR-0009) remain the right *entry-point* mechanism**, for the same reason they were adopted there: documented, already proven live in this codebase, zero new dependency, and this really is a single-document action (opening a window from a sheet the GM is already looking at) — the two-entity complexity lives inside the window this button opens, not in the button itself.

---

## Decision

**1. Entry point: a `getHeaderControls*` button on a Node-backed document's own sheet, opening a dedicated `ApplicationV2` window (not a `DialogV2.prompt`).**

A "New Relationship…" header-control button, registered on both `getHeaderControlsActorSheetV2` (Actor sheets) and the equivalent JournalEntryPage-sheet hook (exact hook name TBD at implementation time against a real render — the same "verify against a real render before shipping" step ADR-0009's Addendum took for `ActorSheetV2`; the general `getHeaderControls{ApplicationClassName}` pattern already confirmed to fire up the inheritance chain means hooking the least-specific shared ancestor is the right target, same reasoning as hooking `renderActorSheetV2`/`getHeaderControlsActorSheetV2` instead of a dnd5e-specific class name). Clicking it opens a new, dedicated `ApplicationV2` — **not** a `DialogV2.prompt` — pre-filling the clicked document as the **Origin**. `DialogV2.prompt` (ADAPT-003's mechanism) fits a single labeled input; this flow needs two drop targets, a Definition `<select>` that reactively filters, and inline validation/warning text, which is a real window's content, not a prompt's. This is the one piece of ADAPT-003's mechanism that *does* transfer, and only because the interaction need (open something from a document the GM is already looking at) is genuinely the same shape here — everything past the click is new.

The pre-filled Origin remains editable/clearable inside the window (drag a different document onto it) — the GM isn't locked into having opened the "correct" sheet first.

No additional entry point (sidebar tool, scene control, context-menu item) ships in v1. A GM always relates something to something, and per this project's own live-session precedent, both sheets are typically already open — a "blank start" launcher has no identified use case yet. Signal to add one later, matching ADR-0007/ADR-0009's own style of naming explicit triggers rather than guessing: if Alberto finds himself wanting to start authoring with neither entity's sheet open (e.g. from the future graph View directly — VIEW-001's territory, not this one).

**2. Cross-document-type entity picking: two `<document-tags single>` drop zones, `type` attribute omitted, validated against the two currently-supported Node-backing document types.**

Two labeled fields, "Origin" and "Target" (see point 5 for symmetric-Definition relabeling), each a native `<document-tags single>` element with the `type` attribute **omitted** — `type` only restricts to *one* Foundry document type, but a Node today can be backed by either an Actor or a `JournalEntryPage` (ADAPT-001/ADAPT-004), so restricting the widget itself to one type would make it unable to accept the other. Accepting any dropped/pasted document, the window then validates the resolved document is one of the two supported types and gives a clear inline error otherwise (e.g. "Scenes and Items aren't Nodes yet — drop an Actor or a Journal Page.") — reusing the *existing* type-detection Adapter code (see point 3) rather than inventing new classification logic, per Rule 4 (no duplicate sources of truth).

Both drop zones natively accept: (a) dragging an entry from the Actors/Journal sidebar directory, (b) dragging an already-open sheet's own title bar (Foundry's built-in "create a document link by dragging the window" behavior), or (c) pasting a Document UUID — exactly the three ways `<document-tags>` supports setting its value, with no keyboard-only search fallback existing in Foundry's own API to offer beyond that.

**3. Node-type resolution reuses the existing pure Adapter mappings — no storage round-trip needed for validation/filtering.**

Once a document is dropped/pasted into a zone, the window resolves that document's would-be Node **synchronously and purely**, exactly the way `mapActorToNode`/`mapJournalEntryPageToNode` already compute it (explicit `flags.archivexus.nodeType`, falling back to `ACTOR_FALLBACK_NODE_TYPE`/`FALLBACK_NODE_TYPE`) — not a new classification rule, and not a storage read, since the corresponding Node very likely already exists in SQLite (STORE-003's `createActor`/`updateActor`/`createJournalEntryPage`/`updateJournalEntryPage` Hooks plus the `ready`-time backfill already keep it in sync) but the UI shouldn't *depend* on that timing to show live feedback. The Node's real `id` is always just that document's own `uuid` (ADR-0001) — no lookup needed to know it, either.

**4. RelationshipDefinition selection: a native `<select>`, filtered (not hidden) by `validation`, with a visible reason when a Definition is ineligible.**

Once both endpoints resolve to a Node type, a plain `<select>` (no custom widget needed — the Definition list is small and closed by design, ADR-0007) lists every known `RelationshipDefinition`. A Definition with a `validation.allowedOriginTypes`/`allowedTargetTypes` that doesn't include the two resolved types is shown **disabled, not removed**, with its `<option>` label carrying the reason ("resides-in — requires target type: City/Kingdom/…") — visible feedback (a core usability heuristic) beats a GM wondering why an expected Definition silently isn't there. A Definition with no `validation` (absent = unrestricted, per CORE-004) is always eligible. Before either endpoint resolves, the `<select>` is empty/disabled with placeholder text ("drop both entities first") rather than showing every Definition as if already usable.

**5. Symmetric Definitions are presented as unordered pairs; asymmetric ones show both directional labels.**

`Relationship`'s own shape always has `origin`/`target` (CORE-003 — direction is structural, not optional), so the two drop zones always exist and a symmetric Relationship still gets stored with *some* origin/target assignment. What changes is only the **display**, driven by the selected Definition's `symmetry` flag:

- **Symmetric** (`symmetry: true`, e.g. `ally-of`): the two drop-zone labels read as neutral, order-independent slots ("First entity" / "Second entity"), and the confirmation text reads the same regardless of which was dropped where ("Kharra is ally-of the Miller family"). No forward/inverse distinction is shown, because none exists.
- **Asymmetric** (e.g. `resides-in`/`resident-of`): the drop-zone labels stay "Origin"/"Target", and the confirmation text shows *both* directional labels together ("Kharra resides-in Puerto Umbral — Puerto Umbral is resident-of Kharra"), so the GM can see which phrasing applies to which side without having to mentally re-derive it or worry they dropped the two entities backwards.

This directly answers the ticket's question: yes, "resident-of" should read differently depending on which Node is being viewed from — that's the entire reason `inverse` exists — but that distinction should never appear for a Definition where it isn't meaningful.

**6. Cardinality-violation behavior: warn, never block.**

Before saving, the window runs a **real** check — not a decorative one — using `StorageProvider.getRelationshipsForNode` (STORE-003's existing 1-hop primitive; no dependency on CORE-005's Query API, which composes N-hop traversal for View content selection, a different concern entirely) against whichever endpoint(s) the selected Definition's `cardinality` constrains (e.g. a `one-to-one` Definition checks both sides; `one-to-many` checks only the "one" side). If a conflicting Relationship under the *same Definition* already exists on a constrained side, the window shows a clear, specific, non-blocking inline warning ("Kharra already has a resides-in relationship to Villa Alta. Saving this will add a second one.") and the Save action stays enabled (relabeled "Save anyway" once a warning is showing, so the GM has to notice it, not just click through an unchanged button).

This deliberately reaches a **different** answer than ADR-0007 point 8's "no cascade, no delete-blocking" for a **different question**: that point governs storage-time referential integrity on *deletion* (where blocking would silently prevent an otherwise-legitimate action with no good resolution path); this is authoring-time, where the GM is actively in the middle of a decision and immediate, specific feedback is cheap to give and easy to act on (edit the drop, or confirm intentionally — e.g. recording a character having *moved* cities, which "History is Part of the World" explicitly wants preserved as two facts, not one overwritten). Hard-blocking here would fight exactly the kind of legitimate use this project's own principles ask to support; saying nothing at all would silently let an inconsistency form that the GM may not have intended. Warn is the point in between that respects both.

---

## Consequences

### Advantages

- Zero new dependencies: `DragDrop`, `<document-tags>`, `getHeaderControls*`, `DialogV2`'s sibling `ApplicationV2` base class are all documented core Foundry API, same tradeoff ADR-0009 already made.
- Reuses real, tested Adapter code (`mapActorToNode`/`mapJournalEntryPageToNode`'s type-detection) for Node-type resolution instead of inventing a second classification path — Rule 4.
- The cardinality check reuses STORE-003's existing `getRelationshipsForNode` 1-hop primitive as-is — this ticket has **no dependency on CORE-005** (the Query API), matching PROJECT.md's own sequencing note that ADAPT-006 only needs Storage CRUD.
- Filtering-with-visible-reason (point 4) and warn-not-block (point 6) both keep the GM informed without adding resolution friction — consistent with Rule 9 (favor simplicity) and this project's established no-hard-blocking posture, while still giving real feedback where ADR-0007's traversal-time reasoning doesn't actually apply.

### Disadvantages

- `<document-tags>` offers no name/text-search — a GM has to actually drag something or paste a UUID; there is no keyboard-friendly "type to find" fallback in Foundry's own API for Documents (only for plain string tags, a different element). Accepted as a real, confirmed platform limitation, not a gap in this design — mitigated by the fact that the GM's real workflow (per this project's own live sessions) already has both relevant sheets open, so a drag is usually one motion away.
- The exact `getHeaderControls*` hook name for `JournalEntryPage` sheets is not yet verified against a real render (same category of gap ADR-0009 originally carried for `getHeaderControlsActorSheetV2`, closed by its own Addendum) — left for whoever implements this, with the same "verify live before shipping" discipline.
- **Real, load-bearing gap this ADR surfaces but doesn't resolve:** `RelationshipDefinition` has no storage persistence yet (explicitly deferred at the end of CORE-004, still open in PROJECT.md's backlog) — so the Definition `<select>` in point 4 has no live registry to read from today. The implement ticket cannot silently assume one exists; see the tracking issue for how it's scoped.
- A GM can still create two Relationships under a `one-to-one` Definition (point 6 warns, doesn't block) — an intentional tradeoff, but it does mean "one-to-one" is descriptive/advisory at the UI layer, not enforced, matching how it was never enforced at the storage layer either (STORE-003 has no such constraint in SQL).

---

## Alternatives Considered

- **Reuse ADAPT-003's exact mechanism (header button + `DialogV2.prompt`) for the whole flow.** Rejected per the ticket's own instruction and the Context above: a prompt fits one field, not two entity pickers plus a reactive Definition filter plus inline validation — the content this flow needs is a window's, not a prompt's.
- **A dedicated sidebar tool/tab ("Relationships" panel) as the entry point**, independent of any one document's sheet. Rejected for v1: no identified use case for starting with neither entity's sheet open yet, and it would be new persistent UI with the same "does this actually get used" risk ADR-0009's Amendment found the hard way for the permanent bar. Left as a named future signal instead of built pre-emptively.
- **A generic document-browser dialog** (search-and-pick from a list, independent of drag-and-drop). Rejected because it doesn't exist in Foundry's public API to reuse, and building a custom one (querying `game.actors`/`game.journal` collections, rendering a filterable list) would duplicate what `<document-tags>` already gives for free, for a use case (name search) that isn't actually blocked — drag-and-drop already reaches the two relevant sheets in the GM's real workflow.
- **Restricting each `<document-tags>` field with `type="Actor"` / `type="JournalEntryPage"` as two separate pairs of fields** (one Actor-only pair, one Page-only pair, GM uses whichever applies). Rejected — doubles the visible fields for a distinction (which document type) the GM shouldn't have to pre-declare before dragging; omitting `type` and validating after the drop is simpler and matches how the GM actually thinks ("I want to connect Kharra to this place," not "I want to connect an Actor to a JournalEntryPage").
- **Hard-blocking a cardinality violation** (point 6). Rejected — see Decision point 6's reasoning: this project's own principles (History is Part of the World) name a legitimate case for a second Relationship under a one-to-one Definition; a hard block would need a resolution UI (edit or delete the existing one first) this project has no other use for yet, adding friction ADR-0007/Rule 9 both push against.
- **Silently allowing a cardinality violation with no feedback at all.** Rejected — cheap to check (a single existing 1-hop lookup), and a GM who didn't intend the duplicate deserves to know before it's saved, not after, when finding it again means re-deriving the same 1-hop lookup manually via a future View/Table.
