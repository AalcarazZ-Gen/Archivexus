# ADR-0005

## Title

Treat View as a first-class Knowledge Element, alongside Node and Relationship.

---

## Status

Accepted

---

## Context

`03_DOMAIN_MODEL.md` left View's nature as an open question: was it a Knowledge Element (with identity, history, Visibility), a purely Definition-driven object, or a stateless projection recomputed on demand with no persistent identity of its own?

GMs and players need saved, curated views of the knowledge graph, not just ad-hoc queries — for example, a view of "the major political factions of the kingdom", or "historical events of two kingdoms, arranged chronologically". These are things a person names, revisits and expects to still be there later, sometimes hand-arranged (e.g. a manually laid out Graph view). A purely stateless projection, recomputed fresh every time from a query, cannot represent that: there is nothing to save the GM's arrangement into, and nothing for players to be pointed back at by name.

Separately, `02_LANGUAGE.md` and `01_ARCHITECTURE.md` gave two different example lists for View that mixed format (Timeline, Graph, Tree, Table) and audience (GM View, Player View, Public View) without distinguishing them, which made "is View a Knowledge Element" harder to answer cleanly — audience looked like it might need its own vocabulary, when Knowledge Element already has one (Visibility).

---

## Decision

View is a Knowledge Element — a third kind, alongside Node and Relationship (see `03_DOMAIN_MODEL.md`'s Domain Hierarchy). It fits neither of the existing two: it doesn't represent a standalone campaign concept the way a Node does, and it doesn't connect exactly two Nodes the way a Relationship does.

As with Relationships and Relationship Definitions, a **View Definition** describes a reusable format (e.g. "Timeline"), while a **View** is the saved instance a GM or player creates and names. A View:

- Has a format (Timeline, Graph, Tree, Table, Map).
- Has Visibility, like every Knowledge Element — this alone determines its audience (`hidden`, `visible`, `owned`). No separate "GM View / Player View / Public View" vocabulary is introduced.
- Is generated from one or more Knowledge Elements and stores no knowledge of its own — only its format, Visibility, and however it selects/arranges what it projects.
- Uses an Archivexus-internal identifier (per ADR-0001), since a View has no corresponding Foundry document.

---

## Consequences

### Advantages

- GMs can save and revisit curated, hand-arranged views instead of recomputing them from scratch every time.
- Reuses Knowledge Element's existing Visibility instead of inventing a parallel audience concept — one less vocabulary to keep in sync.
- Keeps the View Definition / View split consistent with the existing Relationship Definition / Relationship pattern, rather than introducing a new kind of object relationship.

### Disadvantages

- Adds a third branch to the Domain Hierarchy, which every future implementation of "a Knowledge Element" (storage, query engine, graph engine) now has to account for, not just two.
- Views that are large or frequently regenerated could, in principle, go stale relative to the live knowledge graph between saves — the Domain Invariant that a View's content must always be derivable from current Knowledge Elements plus its Visibility scope is what constrains this, but enforcing that invariant efficiently is an implementation concern for later.

---

## Alternatives Considered

- **Stateless projection with no persistent identity** — rejected: cannot represent a GM's saved/curated arrangement, which is a real, stated need.
- **Definition-driven object with no Knowledge Element identity** (i.e. only View Definitions exist, instances are always ephemeral) — rejected for the same reason: a Definition describes reusable behavior, not a specific saved instance a person names and returns to.
- **A dedicated audience vocabulary (GM View / Player View / Public View) instead of reusing Visibility** — rejected: it would duplicate a concept Knowledge Element already provides, and was the source of the `02_LANGUAGE.md` / `01_ARCHITECTURE.md` inconsistency this ADR also resolves.
