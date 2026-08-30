# ADR-0007

## Title

Relationship traversal for View content selection: category-tagged Relationship Definitions, resolved by a Core Query API.

---

## Status

Accepted

---

## Context

With Relationship and View still unimplemented, an open question remained from the 2026-08-27 PO brainstorm (`03_DOMAIN_MODEL.md`): when a Graph View shows a Node and the GM interacts with it (clicking to expand), what determines which connected Relationships/Nodes get included? The motivating example: clicking a City — do its residents get pulled in? Political factions? Criminal or religious organizations? All of it?

This isn't a UI question — it's a question of what mechanism governs a View's content selection, and it touches three existing invariants/decisions:

- Relationship Definition today governs inverse/cardinality/symmetry/validation, but nothing about categorization for query/traversal.
- A View "is generated from one or more Knowledge Elements; stores no knowledge of its own," and "however it selects or arranges the Knowledge Elements it projects" is part of the View's own content — but that mechanism was never defined.
- The existing Domain Invariant: "a View's content is always derivable from current Knowledge Elements plus its own Visibility scope."

Architect, Product Owner, DBA and UX/UI independently converged on the same general shape (category on Relationship Definition + a declarative spec on the View), which is the signal that this is the right shape and not a coincidence of framing. This ADR formalizes that convergence and resolves the specific open questions that remained, so Relationship (next on the board) and View can be implemented on a shared foundation.

Out of scope for this ADR: Visibility filtering (already resolved — an independent step applied after structural selection, not blended into it), the View's configuration UI design (UX/UI's call), and concrete schema/indexes (DBA's call).

---

## Decision

**1. Relationship Definition carries a `traversalCategory`, from a small, closed set.**

Category is a property of the Relationship Definition (not of each Relationship instance), indexed/keyed by the Definition's id — so a taxonomy change touches a bounded number of Definitions, never a real campaign's individual Relationships.

Starter taxonomy (start here, not exhaustive, closed except for a deliberate migration):

| Category | Example use |
|---|---|
| `location` | resides-in / based-in (Character/Organization ↔ Place) |
| `affiliation` | member-of / works-for / follows (Character ↔ Organization, Organization ↔ Organization) |
| `kinship` | family/personal bonds (Character ↔ Character) |
| `conflict` | rivals-with / at-war-with / hostile-to (any ↔ any) |
| `governance` | rules / leads / controls (Character/Organization ↔ Place/Organization) |
| `participation` | participated-in / witnessed (any ↔ Event) |
| `ownership` | owns / created (Character/Organization ↔ Item/Place/Lore) |
| `narrative` | catch-all for bonds that don't fit the above yet |

An important thing this resolves from the original example: "political vs. criminal vs. religious" is **not** a separate traversal category — it's a property of the Organization *Node* (its type/tag), not of the affiliation relationship itself. Every affiliation is structurally the same (`affiliation`); the campaign can invent as many organization types as it wants without ever touching the category taxonomy. Visually grouping "Political factions (3)" vs. "Criminal organizations" is the View/UI's responsibility (grouping `affiliation` results by the connected Node's type), not the selection mechanism's.

`narrative` exists as an escape valve so creating a Relationship Definition is never blocked by the taxonomy "not covering" its case yet — consistent with the Optional Structure principle.

**2. The traversal mechanism lives in Core's Query API, engine-agnostic — one execution path for every View format.**

Given a starting Node and a spec (categories to follow + depth), Core resolves which Relationships/Nodes to include. No View format (Graph, Tree, Table, Timeline, Map) reimplements its own traversal logic — all of them call the same Core primitive. This is what keeps the promise of a storage-independent Core: today the implementation can be an in-memory walk over whatever the Adapter exposes; once STORE-001 decides the storage engine, only that primitive's implementation changes, never the spec already persisted in existing Views.

**3. The View stores the *what* (a declarative spec, in category vocabulary); Core resolves the *how*.**

A View's spec (which categories to follow, depth) is part of the View's own content, exactly as the domain model already says — it's a selection rule re-evaluated against current Knowledge Elements, not a cached result, so the "always derivable" invariant holds with no extra effort.

**4. 1-hop traversal in storage; N-hop is composed in Core, not built into storage.**

Matches what DBA confirmed: storage only needs to answer "neighbors of Node X filtered by category" (1-hop). Any greater depth (Product Owner's "Everything connected" preset) is composed in Core by repeated 1-hop calls — the Node's neighbors, then those neighbors' neighbors, etc. — without asking storage for any BFS/multi-hop capability nobody has needed yet.

**5. Depth and cycle policy for "Everything connected."**

Depth bounded by a Core-level constant, confirmed at depth = 2 (see below), not unbounded traversal: in a real campaign graph, an unbounded traversal from a single click could end up pulling in most of the graph, with no natural cutoff. Cycle handling: Core keeps a set of visited Nodes during orchestration and doesn't re-expand an already-visited Node — this is the Core orchestration layer's responsibility, not storage's (storage only resolves neighbor lookups, it doesn't need cycle logic). The exact depth value is a tunable parameter, not a structural decision — it lives as Core config, one place to adjust it.

**What depth actually means, confirmed against a worked example (Alberto):** depth extends *in-depth* along each directly-connected Node's own chains, not *laterally* by adding new categories to the initial clicked Node — the initial Node's own direct neighbors (depth 1) are already everything, every category, per point 1 and the "Direct only" preset. Depth 2 means: for each of those direct neighbors, also follow one more hop from *them* (e.g. a resident's own family tie, an organization's own leader, an event's other participant) — people and places with no direct connection to the original Node at all, only a connection to something that does. Worked example, clicking a City "Puerto Umbral": depth 1 returns the city's 6 direct neighbors (2 residents, 3 organizations, 1 event) — depth 2 additionally pulls in, say, one resident's estranged parent, an organization's leader, a criminal org's hideout, and an event participant who doesn't live in the city — none connected to the City directly, all connected through something that is. Confirmed as the intended behavior for "Everything connected," at depth = 2.

**6. MVP scope: 3 fixed presets, not open per-category config (Product Owner's input).**

- **"Direct only"** — 1-hop, every category. Ships as the pre-selected default on a brand-new View, so a GM with zero context isn't handed a decision screen — they see something on the canvas immediately, and reach for the other two presets deliberately once they know what they're looking at.
- **"Everything connected"** — composed traversal per point 5. Depth=2 composed from a City compounds combinatorially, not just additively (residents → their own orgs, family, conflicts) — grouping results into collapsed, category-labeled clusters (a View/UI display concern, not this ADR's mechanism) has to apply to this preset by default, not be a manual habit the GM has to discover, or the canvas floods on first use.
- **"Curated by me"** — starts from the "Direct only" expansion, not a blank canvas; the GM prunes and adds from there. Recognition-over-recall: a non-technical GM edits what's already on screen far more easily than they recall and add from nothing. The edited result is saved as the View's own content, no rules engine.

The mechanism (category + spec + Query API) supports open per-category selection with no redesign — scoping to 3 presets is a product decision about what surface to expose now, not a limitation of the mechanism. Signal for building open category selection later: Alberto asking for the same non-default category combination across 3+ Views during real play.

Depth=2 is a deliberate, confirmed bound, not a claim that "Everything connected" means the literal entire graph — Alberto confirmed depth 2, understood as in-depth extension of each direct neighbor's own chains (see point 5's worked example), is what that preset's name should promise, not an unbounded transitive closure of the whole graph.

Content-prominence ordering inside a large cluster (which of, say, 40 residents shows first, before a "+36 more") is explicitly not resolved by this ADR — flagged as a named follow-up for whoever implements the View/UI layer, once there's a real attribute (recency, hand-picked prominence, or otherwise) worth ordering by.

**7. Saved expand/collapse arrangement is compatible with the "always derivable" invariant (confirming UX/UI's reading).**

The invariant governs the View's *knowledge content* — which Knowledge Elements it's entitled to project — not its *presentation*. Saving which clusters are expanded/collapsed (same as saving a manual layout position, already allowed) asserts no new fact and doesn't retain a Knowledge Element independently of its derivability — it's metadata about how something the View already reaches through a valid derivation path is displayed. General rule for future questions of this shape: "the View's own content" = selection/presentation preferences over derivable knowledge, never additional knowledge in itself. If the Node or Relationship an arrangement entry references stops existing or falls out of Visibility scope, that entry becomes orphaned/prunable — the same treatment a layout entry would already get.

**8. Dangling references — resolved, so it doesn't block the traversal mechanism.**

A Relationship may survive deletion of its origin or target Node: deletion is not cascaded, and Node deletion is not blocked by it. Reasoning: since "History is Part of the World" is a core principle, cascading the delete would silently destroy a historical fact just because one endpoint was removed — that contradicts the principle. Blocking the delete (hard referential integrity) adds resolution friction that doesn't fit a project favoring simplicity.

Instead: a Relationship whose origin or target no longer resolves to an existing Node simply isn't "current" in the sense of the View invariant — traversal excludes it naturally (it looks up the neighboring Node by id; if not found, it isn't included), with no special-case logic needed in the selection mechanism. This closes what the traversal mechanism needs; it doesn't close the broader question of Node deletion policy (hard delete vs. archival), which is left open for whoever designs delete workflows.

**Implementation caution for whoever picks up STORE-001 (DBA flag):** if the eventual engine is relational (SQLite/Postgres), a foreign key on `Relationship.origin`/`target` → `Node.id` declared with `RESTRICT` or `CASCADE` "for correctness" would silently reintroduce exactly what this point rejects — `RESTRICT` becomes delete-blocking, `CASCADE` becomes the cascade delete ruled out above. "No cascade, no delete-blocking" needs to be enforced by *not* declaring that FK (or declaring it unenforced), with the natural-exclusion behavior coming from the resolution query itself (a plain lookup or an inner join, which drops unresolvable rows for free), not from referential-integrity constraints. Flags/JSON-style storage isn't at risk of this — there's no engine-level FK to accidentally opt into.

---

## Consequences

### Advantages

- One traversal mechanism in Core serves every current and future View format — no duplicated traversal logic or diverging semantics between Graph/Tree/Table/Timeline/Map.
- The category taxonomy is small, closed, and grows additively: new relationship types get tagged into an existing category and Views already following that category pick them up automatically, with no View needing an edit as the domain vocabulary grows.
- Category on the Definition (not on each instance) keeps a taxonomy change bounded to a small number of Definitions, never a real campaign's Relationships.
- The View's spec (declarative, in category vocabulary) keeps the "always derivable" invariant with no extra effort — no cached results that can go stale.
- 1-hop in storage + composition in Core keeps Core independent of whatever storage engine STORE-001 picks, and doesn't ask storage for a capability nobody needs yet.
- The GM never needs to learn a query language — they pick from 3 named presets; the underlying mechanism supports more expressiveness later with no redesign.

### Disadvantages

- The category taxonomy, once used in real Relationships and Views, is expensive to rename/split/merge — any change is a content migration, not a config tweak. Mitigated by keeping the starter set deliberately small and treating taxonomy changes as an explicit decision, not something edited freely.
- Composing N-hop from 1-hop in Core (instead of resolving it in storage) can be slower in practice for deep traversals over large graphs — acceptable for the current campaign size (41 Actors / 61 Pages), to revisit if composed traversal becomes a real bottleneck.
- Restricting the MVP to 3 fixed presets means a GM with a genuine need for fine-grained category filtering doesn't have it available yet — mitigated by the mechanism already supporting that expression later with no redesign, and by the explicit signal for when to build it (point 6).
- Allowing dangling references leaves a broader domain question (Node deletion policy) explicitly unresolved — traversal handles it fine, but other surfaces (e.g. a Table View of "all raw Relationships") will eventually need to decide whether they show or hide dangling relationships.

---

## Alternatives Considered

- **Relationship Definitions with a traversal category + a declarative spec on the View (chosen).** See Decision.
- **The View's spec references concrete relationship types, not categories.** More precise per View, but couples each View to whatever set of relationship types exists at the time it's created — every new type (a new organization flavor, a new bond type) requires editing every View that should include it. Rejected for not being additive: exactly the problem categorization solves.
- **A generic query language/expression stored on the View.** Maximum flexibility — arbitrary predicates crossing category, Node attributes, depth, direction. Rejected for three reasons: (1) it conflates two vocabularies of very different volatility — relationship category is a small, closed, slow-changing vocabulary, while filtering on arbitrary attributes is open-ended and doesn't exist as a domain concept yet; building one generic engine for both before there are three real use cases to generalize from is over-engineering. (2) It's the most expensive of the three to reverse: once GMs have persisted hand-authored queries, changing the DSL's semantics is a breaking migration across every View, not a config tweak. (3) It reintroduces exactly the problem it was meant to avoid — a query language is *harder* to expose safely to a non-technical GM than a fixed set of named categories, not easier.
- **N-hop resolved directly in storage (native BFS/multi-hop).** Rejected for now, per DBA: nobody has asked for that capability yet, and building it in anticipation before it's needed is exactly the kind of premature complexity the project is trying to avoid. If composed traversal in Core becomes a real bottleneck, it can be pushed down into storage later without changing the spec Views already persist.
- **Open per-category config as the MVP surface (instead of 3 presets).** This is what the mechanism natively supports, but as a surface exposed to the GM from day one it reintroduces the original problem — a non-technical GM configuring something that looks like a query. Rejected as MVP scope (a product decision, not a mechanism limitation) in favor of 3 named presets, with an explicit signal for when open category config earns its place.
