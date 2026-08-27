# ADR-0004

## Title

Orphaned Knowledge Elements get a suggested relink, not automatic reconciliation, when their Foundry document is deleted and recreated.

---

## Status

Accepted

---

## Context

Foundry UUIDs are only stable while the underlying document exists. In practice, this is a common scenario: a GM rebuilds a character sheet after a wrong module or a data mistake, which means deleting the old Actor and creating a new one to represent the same character.

Foundry provides no native way to link a deleted document to whatever replaces it:

- Its closest mechanism, the `sourceId` / `compendiumSource` core flag, only tracks where a document was originally imported from (e.g. a compendium). Per Foundry's own maintainers, it becomes stale and unreliable once the source document is deleted, and was never meant to solve "is this new document the same as that deleted one" ([foundryvtt/foundryvtt#9097](https://github.com/foundryvtt/foundryvtt/issues/9097)).
- Foundry does expose document lifecycle hooks (`createActor` / `deleteActor`, or the generic `preCreateDocument` / `createDocument` / `preDeleteDocument` / `deleteDocument`) that a module can listen to client-side, which gives a timing signal — "something was just deleted, something was just created" — but no identity guarantee ([Foundry hookEvents API](https://foundryvtt.com/api/modules/hookEvents.html)).

Since there is no reliable native signal, any matching Archivexus does will necessarily be heuristic (name similarity, document type, timing proximity, same owning player) — and heuristics can produce false positives, which would be worse than today's problem: silently merging two genuinely different characters' history and relationships together.

---

## Decision

- When the Foundry Adapter detects (via deletion hooks) that a Knowledge Element's linked document was deleted, the Knowledge Element is **not** deleted. It becomes **orphaned**: it keeps its History, Relationships and Blocks, but is flagged as unlinked from Foundry.
- When a new candidate document is created afterward that plausibly matches an orphaned Knowledge Element (heuristics: same document type, similar name, created within a short time window, same owning player where available), Archivexus surfaces it to the GM as a **suggested relink** — it never applies a relink automatically.
- The GM reviews the suggestion and confirms or dismisses it.
  - On confirmation: the Knowledge Element's Foundry UUID reference is updated to the new document, preserving its existing identity, History, Relationships and Blocks.
  - On dismissal: the new document becomes its own fresh Knowledge Element, and the old one stays visibly orphaned (not silently lost) until the GM handles it manually.

---

## Consequences

### Advantages

- Never silently merges two different things — the GM's confirmation is the actual source of truth, since Foundry itself gives no reliable guarantee.
- Preserves accumulated Relationships/History/Blocks through a sheet rebuild instead of losing them, instead of that history quietly disappearing.
- Orphaned Knowledge Elements stay visible rather than vanishing, so nothing is lost even if the GM never gets around to relinking.

### Disadvantages

- Requires building and tuning a matching heuristic — nontrivial, and will need real usage to calibrate (name-similarity threshold, time window).
- Adds a UI moment (reviewing/confirming a suggested relink) instead of being fully invisible.
- A long gap between deleting and recreating weakens the timing signal — acceptable for now, revisit if this proves too narrow in practice.

---

## Alternatives Considered

- **Fully automatic reconciliation with no confirmation** — rejected: no reliable native signal exists (Foundry's own `sourceId` mechanism is explicitly unreliable for this, per foundryvtt/foundryvtt#9097), so an automatic merge risks wrongly combining two unrelated characters' data.
- **No reconciliation at all**, treat every new document as a brand-new Knowledge Element — rejected: this is the current status quo and a real problem GMs already run into; it silently orphans accumulated Relationships/History for no good reason.

---

## Open questions before this can move to Accepted

- What's the actual matching heuristic (name-similarity threshold, time window, which document types it applies to)? Needs a technical spike and some real playtesting, not just domain design.
- Should orphaned Knowledge Elements appear in every View by default, or live behind a dedicated "needs attention" view so they don't clutter normal browsing?
