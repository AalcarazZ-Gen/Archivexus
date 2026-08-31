# ADR-0008

## Title

Storage Provider: embedded SQLite as the primary store, with an explicit JSON export snapshot for standalone/AI-agent read access.

---

## Status

Accepted

---

## Context

`01_ARCHITECTURE.md`'s Storage section has always listed five candidate engines (Foundry Flags, JSON, IndexedDB, SQLite, PostgreSQL) without ever choosing one. STORE-001 (issue #32) scoped closing that gap: decide the Storage Provider and update the architecture doc to match. Implementation is explicitly out of scope for this ticket.

Two facts made this harder than "pick a database":

1. **The Foundry Adapter is client-side-only.** It runs as browser module code inside the Foundry client; it has no server-side component and no direct OS filesystem write access.
2. **Browser-native storage is origin-scoped.** IndexedDB and OPFS are tied to the origin that created them — Foundry's own page and any future standalone Web UI (a different origin) cannot read each other's storage automatically. Whatever engine got picked, "how does anything outside the Foundry tab ever see this data" was an open question, not a detail.

`01_ARCHITECTURE.md` already reserves a future "Web UI" Application alongside Foundry, so a standalone frontend that reads Archivexus's stored data with zero other services running was already a stated project intention — just with no timeline or shape attached.

ADR-0007 (2026-08-30) added two hard constraints on whatever engine gets chosen: an efficient 1-hop neighbor-by-id lookup (native index or a reconstructible in-memory cache — Core composes multi-hop traversal itself, storage never needs to), and, if the engine is relational, no `RESTRICT`/`CASCADE` foreign key from `Relationship.origin`/`target` to `Node.id` — Relationships must be able to survive deletion of the Node(s) they reference ("History is Part of the World").

This decision was reached the same way ADR-0007 was: the architect and DBA personas worked the problem independently, converged, then resolved their own remaining disagreements directly with each other across two further rounds, closing on a single technical shape before this document was written. Their reasoning is summarized below because it's the actual justification for the decision, not just its history.

### How the shape was found

The first round treated STORE-001 as two separable decisions — persisting Relationship/View data is non-negotiable now (they have no home outside Archivexus's own storage), while mirroring Node data itself out of Foundry is timing-dependent on the standalone frontend actually existing. Both roles independently ruled out Foundry Flags, IndexedDB, and PostgreSQL: Flags aren't queryable and don't solve reachability; IndexedDB is origin-scoped exactly like OPFS and solves nothing a standalone consumer needs; PostgreSQL assumes a server this project doesn't have and isn't going to run for one user. That left SQLite (lead recommendation) versus JSON (legitimate simpler fallback), with the same open blocker both roles named: SQLite only helps if something can actually get a real file onto disk, and the Adapter can't do that on its own.

Alberto resolved the blocker by reframing the requirement: the standalone frontend is a near-term priority — not a someday goal — motivated specifically by wanting to hand Archivexus's knowledge graph to an **external AI agent** to help plan the campaign's next stages. Critically, he was explicit that real filesystem access only needs to happen at a **deliberate, user-triggered export**, not continuously or live. That single clarification dissolved the reachability blocker: a client-side-only Adapter has always been able to hand the user a downloaded file (or use the File System Access API) on a button click — no server, no shared origin, and no background sync were ever required for that. He also confirmed the standalone consumer is **read-only** for now (a future bidirectional "world builder" mode is an explicitly separate, later concern with its own sync problem), and flagged one thing he wanted the agents to resolve rather than decide himself: since Relationship and View data live only in Archivexus's own store — never as Foundry documents — how does that data actually reach a standalone consumer with no live server and no shared origin?

With that reframing, the two roles converged fully:

- **Primary store stays SQLite** on its own merits — ADR-0007's 1-hop lookup requirement is satisfied by real indexes rather than a hand-rolled in-memory index that has to be rebuilt every session, and this holds regardless of how (or whether) a standalone consumer ever reads the data. The export question turned out to be orthogonal to this choice, not a reason for it.
- **The export artifact is a generated JSON snapshot, not a copy of the SQLite file.** The stated primary consumer is an AI agent reading a file directly, plus a possible server-less Web UI — neither should need to carry a SQL engine to read what is, at this project's scale, a few hundred to a few thousand rows once. JSON is also the format either kind of consumer can already parse with nothing extra.
- **The standalone side needs no database engine at all.** Read-only, single-user, small-scale: load the JSON into memory, build an adjacency index on load. This is only worth revisiting if the standalone ever needs to write back into the campaign, which is out of scope today.
- **The export transform belongs in Core, not the Adapter.** Gathering the raw material (reading live Foundry documents, querying Storage through Core's Query API) is legitimate Adapter/platform work. But deciding what "a portable copy of this knowledge graph" looks like — denormalizing Relationships with inlined origin/target titles so a 1-hop read needs no join, stamping a schema version and an export timestamp — is a domain-shape decision, the same category of decision as defining what a Node or a View is. It belongs next to them in Core, exposed as something like `toPortableSnapshot(nodes, relationships, views)`, callable by any adapter that ever needs the same shape.
- **Freshness is handled by an `exportedAt` timestamp, not a reminder system.** For a single user who controls both when they prep and when they consult an AI agent, "click export before you go" is an acceptable workflow with no infrastructure required — the DBA was explicit about not over-building here. The one real risk worth naming and mitigating cheaply is an AI agent silently treating a stale export as current state; stamping the export with `exportedAt` and having any consuming surface state "as of [date]" closes most of that risk for free.
- **Visibility filtering is out of scope for this export.** The product owner ruled the export should be a full, unredacted snapshot: the only consumer today is Alberto himself (or a tool acting as an extension of his own judgment), and Visibility (ADR-0003) exists to gate what a *player* sees, not what the GM can access. Filtering now would mean guessing at redaction semantics for a threat model — an untrusted recipient — that doesn't exist yet, and would silently drop the "hidden" data that's often the most useful half of a GM's own notes. A "redacted/player-safe export" is named explicitly as a future, separately-triggered feature (see Consequences), not built blindly now.

One implementation-risk item surfaced during this process that this ADR deliberately does **not** resolve: whether the concrete WASM-SQLite mechanics (dedicated Web Worker creation, the `opfs-sahpool` persistence backend) actually behave cleanly inside a real running Foundry client — CSP, module bundling, and any of Foundry's own worker usage are unverified from outside a live Foundry session. This is named as a required first spike before CORE/STORE implementation work builds on top of it, not as something blocking acceptance of this ADR's shape.

---

## Decision

1. **Primary persistent store: embedded SQLite**, compiled to WASM and running inside the Foundry browser client. Use the official `@sqlite.org/sqlite-wasm` build with the `opfs-sahpool` (SyncAccessHandle Pool) VFS as the persistence backend — it requires no special HTTP response headers (unlike OPFS's concurrent VFS, which needs `COOP`/`COEP` headers this project doesn't control on Foundry's server) and fits a single-user, single-tab access pattern exactly. Where `opfs-sahpool` isn't usable (e.g. Safari private browsing, older browsers), fall back to an IndexedDB-backed VFS (e.g. `wa-sqlite`'s `IDBBatchAtomicVFS`) or, if the OPFS Worker requirement itself turns out to be awkward inside Foundry's sandbox, to `sql.js` with a manual "serialize to bytes, blob into IndexedDB" pattern — both fallbacks keep the identical SQLite file format, so this is a persistence-mechanism choice, never a schema fork.
2. **Schema/query obligations from ADR-0007 apply as written**: efficient 1-hop neighbor-by-id lookup via real indexes; no `RESTRICT`/`CASCADE` foreign key from `Relationship.origin`/`target` to `Node.id`.
3. **Schema migrations use SQLite's own `PRAGMA user_version`**, applied as ordered, numbered SQL scripts in a single transaction on Adapter startup, comparing stored vs. expected version. No down-migrations are built unless a specific need arises — single local file, single user, no concurrent-writer coordination problem to solve for.
4. **A standalone/external-consumer export is an explicit, user-triggered action** in the Foundry Adapter — never a background, continuous, or server-mediated sync. It produces a single **generated JSON snapshot**, not a copy of the SQLite file, containing Node, Relationship, and View data. Relationships are denormalized with their origin/target Node titles inlined, so a 1-hop read needs no join. The snapshot carries a `schemaVersion` (independent of, and not to be confused with, the SQLite store's own `user_version`) and an `exportedAt` timestamp.
5. **The snapshot-shaping logic lives in Core** (e.g. `toPortableSnapshot(nodes, relationships, views)`), taking already-materialized domain objects and returning a plain DTO — no I/O, no Foundry-specific or SQLite-specific code inside it. The Foundry Adapter's export action is limited to gathering Nodes from live Foundry documents, gathering Relationship/View through Core's Query API, calling this transform, and handling the platform-specific download (browser download or File System Access API — an implementation detail, not fixed here).
6. **The export is a full, unredacted snapshot** — it does not filter by each element's Visibility. Visibility (ADR-0003) governs what a player sees through a View inside Foundry; it does not gate the GM's own access to their own data. A visibility-filtered "player-safe export" is explicitly named as a future, separately-triggered feature (see Consequences), not built as part of this decision.
7. **The standalone/export-consuming side needs no database engine of its own.** It loads the JSON snapshot into memory and builds whatever in-process index it needs (e.g. an adjacency map by Node id) on load. This is read-only; if a future "world builder" mode needs the standalone to write back into the campaign, that requires its own sync/conflict-resolution design and is explicitly out of scope here.
8. **A worker/OPFS feasibility spike inside a real running Foundry client is required before any implementation work builds on point 1** — confirming dedicated-Worker creation and `opfs-sahpool` behave as expected under Foundry's actual CSP and module loading. This is scoped as the first task of the eventual STORE implementation ticket(s), not of this ADR.

---

## Consequences

### Advantages

- Resolves the reachability problem that blocked a storage decision — read-only standalone/external-consumer access needed only a deliberate export action, not a server or a shared origin, once the requirement was reframed around Alberto's actual near-term need.
- SQLite gives ADR-0007's 1-hop lookup requirement for free via real indexes, instead of a hand-rolled in-memory index that has to be rebuilt every session as data grows over a long-running campaign.
- The export format (JSON, denormalized, versioned, timestamped) is exactly what its two real consumers — an external AI agent and a possible server-less Web UI — can use with no extra machinery, and needs no query engine shipped to either.
- Keeping the export-shaping logic in Core means any future adapter that needs "a portable copy of the knowledge graph" reuses `toPortableSnapshot` rather than reimplementing it, and the Foundry Adapter stays free of business logic per the layering this project already committed to.
- `exportedAt` cheaply closes the sharpest realistic failure mode (an AI agent treating stale data as current) without building any reminder infrastructure a single-user project doesn't need.
- The same SQLite file format underlies both the primary persistence path and its fallbacks, so a persistence-mechanism change (if OPFS proves awkward inside Foundry) is not a schema migration.

### Disadvantages

- This decision solves reachability for **read-only, point-in-time** access only. It is explicitly not a sync solution — a future bidirectional "world builder" mode will need real conflict/consistency design from scratch, and this ADR should not be read as having pre-solved that.
- The export is a manual, user-triggered snapshot with no freshness guarantee beyond its own timestamp; if Alberto (or a future export recipient) forgets to re-export, stale data can be consulted without any system-level warning beyond the `exportedAt` field being present in the data.
- WASM SQLite adds real dependency and bundle-size weight to the Foundry Adapter that a plain JSON store would not have, and its OPFS-based persistence has genuine browser-compatibility edges (Safari private browsing, older browsers) that require a real fallback path to be built and tested, not just documented.
- The Worker/OPFS mechanics inside Foundry's actual client sandbox are unverified as of this ADR — there is a real chance the spike in point 8 surfaces friction that shifts the primary persistence mechanism to one of the named fallbacks.
- Export is unredacted by design; if the exported file or a future standalone app is ever opened by someone other than Alberto before a "player-safe export" mode exists, GM-only secrets would leak. This is accepted as out of scope today because no such recipient exists yet, but it is a real, named risk for whoever revisits this.

---

## Alternatives Considered

- **JSON as the primary store (files written via the browser's storage or download APIs).** Simpler, but pushed the ADR-0007 1-hop-lookup requirement onto hand-rolled in-memory indexing that has to be rebuilt every session — real cost as Relationship/View counts grow over a long campaign. Kept as the documented fallback if the WASM/OPFS mechanics in point 8 turn out not to work cleanly inside Foundry's sandbox; not eliminated, just not the lead choice.
- **Exporting a raw copy of the SQLite file instead of generating JSON.** Rejected because the two real consumers (an external AI agent, a server-less Web UI) would each need to carry or invoke a SQL engine just to read a few hundred/thousand rows once — real complexity for a one-shot read that a plain JSON document already handles with nothing extra.
- **A live/continuous sync channel between Foundry and a standalone frontend (instead of an explicit export action).** Would have required solving the client-side-only Adapter's lack of a server or filesystem hook, real cross-origin reachability, and a consistency model for two writers — a categorically bigger problem than the read-only need Alberto actually described. Explicit export solves the stated need with none of that machinery; live sync is deferred to if/when a bidirectional "world builder" mode is ever built.
- **IndexedDB as the primary store.** Rejected: origin-scoped exactly like OPFS, so it does nothing to help a standalone consumer that OPFS-backed SQLite doesn't already do better, while giving up SQLite's indexed 1-hop queries in exchange for nothing.
- **PostgreSQL.** Rejected: assumes a server process this single-user, local-first project doesn't run and has no reason to run.
- **Foundry Flags as the primary store.** Rejected as a primary store (not queryable, not suited to Relationship/View volume), though it remains architecturally available as a possible small in-Foundry cache role if a future need for one appears — not decided here.
- **Visibility-filtered ("player-safe") export, built now.** Rejected for this ADR: the only consumer today is the GM himself, so filtering would silently remove data from the GM's own export for a threat model (a non-GM recipient) that doesn't yet exist, based on guessed-at redaction semantics with no real use case to validate against. Named as a future backlog item, triggered by an actual need (e.g. sharing an export with a player) rather than built speculatively.

---

## Addendum (2026-08-31): STORE-002 spike result

Point 8 named a required, unresolved spike: whether a dedicated Worker plus the `opfs-sahpool` VFS actually behave cleanly inside Foundry's real client sandbox. A throwaway spike (STORE-002) confirmed **yes** — the official `@sqlite.org/sqlite-wasm` package opened a persistent, OPFS-backed SQLite database via `opfs-sahpool` from inside a real running "Academia El Último Norte" Foundry v14 session, and round-tripped a write/read cleanly, reproducibly across multiple reloads.

The one real failure the spike hit wasn't about `opfs-sahpool` at all: Vite's default `base: '/'` baked an absolute, root-relative URL into the dedicated-Worker chunk it emitted (`/assets/<name>-<hash>.js`), which 404'd because Foundry serves this module from a nested static path (`/modules/archivexus/dist/foundry/...`), not domain root — confirmed by fetching both the wrong and the correct path directly in the live session (404 vs. 200). Fixed by setting `base: './'` in `vite.foundry.config.ts`, which makes Vite emit paths relative to `archivexus.js`'s own location instead. This fix is permanent and applies to any future Worker or asset the Foundry bundle emits, not just this spike — it's kept in the codebase; the throwaway spike code itself (`opfs-worker-spike.ts`/`.worker.ts`, the temporary `module-entry.ts` hook, and the ambient Worker/URL/MessageEvent/self type shims) was removed once this result was recorded, per its own header comments.

This closes the one implementation-risk item this ADR named as unresolved. Nothing in the Decision, Consequences, or Alternatives above changes as a result — the spike confirmed the chosen approach works rather than surfacing a reason to pick a fallback.
