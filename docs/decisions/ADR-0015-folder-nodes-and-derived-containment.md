# ADR-0015

## Title

Foundry Folders become a third Node source, and containment (member-of / located-in) is auto-derived from the folder tree and kept in sync — as a reconciled, provenance-marked layer that never touches hand-authored Relationships.

---

## Status

Proposed

---

## Context

Alberto's campaign world is already organised in Foundry's **folder tree**, and that tree already encodes the containment structure Archivexus wants to represent: an "Organizations" folder holds a folder per organization, each holding its member Actors; an "Areas" folder holds regions, holding sub-areas, holding locations; location folders hold the Scenes that are those locations' battle maps. Today none of that structure reaches Archivexus. The only things that become Nodes are Actors (ADAPT-004) and JournalEntryPages (ADAPT-001), each mapped in isolation with no notion of where it sits in the tree. The graph is 102 disconnected Nodes and 0 authored Relationships, and the only way to add an edge is to hand-author it one pair at a time (ADR-0010 / ADAPT-007), which for a world already structured as a tree is redundant data entry.

The proposal (designed in conversation with Alberto) is:

1. A GM can right-click a Folder and assign it an Archivexus Node type, making that Folder its own Node (`Folder.<id>`).
2. No inference — an untagged folder and its untagged contents produce no containment.
3. Every **explicitly-tagged** entity anywhere inside a tagged folder's subtree gets a Relationship to its **nearest tagged folder ancestor** (untagged folders are transparent for ancestry). The Relationship type defaults from the ancestor's Node type (Organization → `member-of`, place-like → `located-in`), GM-overridable.
4. Tagging prompts: "relate to '<X>'? [type] or new root".
5. Scenes inside a tagged location folder auto-attach as `scene`-type Blocks on that location Node (proposed as the answer to ADAPT-005 / #23).
6. Every derived Relationship/Block carries a provenance marker. Moving a document out of the subtree, untagging a folder, or a group member being removed makes Archivexus delete **only what it derived** — never a hand-authored Relationship. Tagging re-derives across the existing tree immediately.
7. The same mechanism for a dnd5e group/encounter Actor's member list → derived `member-of`.
8. Adjacency / non-containment relationships stay hand-authored.

This is a system-shape decision: it introduces a third identity source, a background reconciliation engine, and a "some data is machine-owned, some is human-owned, in the same table" split that every future feature touching Relationships will have to respect. It touches ADR-0001 (identity), ADR-0011 (Block model, page precedence), ADR-0007 (dangling references, traversal), ADR-0003 (visibility), and the still-open ADAPT-005 (#23). Hence an ADR before implementation.

---

## Decision

### A. Folders as a Node source

**1. A tagged Folder is a Node with `id = Folder.<id>`. This fits ADR-0001 as written — no amendment to ADR-0001 is needed.**

ADR-0001's rule is "use the Foundry UUID for any element that already exists inside Foundry." A `Folder` is a first-class world Document with a stable UUID (`Folder.<id>`), resolvable by `foundry.utils.fromUuid` / `fromUuidSync` exactly like an Actor or a JournalEntryPage. Nothing about the identity rule changes. What *is* new is that a Folder is now an Archivexus domain concept, so **`03_DOMAIN_MODEL.md`'s Node Decisions gains a new entry** ("Is a Foundry Folder a Node?") in the same inline-amendment style ADR-0011 used, recording: a Folder becomes a Node only on explicit GM tagging (no inference); its type is the GM-set `flags.archivexus.nodeType`; it never derives its identity from another Node (it derives from a Folder, which is not a Node — the "A Node never derives its identity from another Node" invariant holds); and the containment it introduces is expressed purely as Relationships, satisfying — not violating — the "Can Nodes be nested? No / hierarchy is always Relationships" Decision.

**2. `mapFolderToNode` is a new pure mapping, a sibling of `mapActorToNode` / `mapJournalEntryPageToNode`.**

`id = folder.uuid`, `title = folder.name`, `type = folder.flags.archivexus.nodeType` (a folder with no such flag is simply not a Node and this function is never called for it). Pure, synchronous, no Foundry API calls, same contract and structural-interface (`FoundryFolderLike`) tradeoff as the two existing mappings. Lives in a new `src/adapters/foundry/folder-to-node.ts`.

**3. Folder-Node visibility defaults to `hidden`.**

A Folder has **no `ownership` field** — there is nothing to translate through ADR-0003's mapping. `createNode` with no `visibility` already defaults to `DEFAULT_VISIBILITY = 'hidden'` (fail-closed, `knowledge-element.ts`). This is deliberately kept: a GM's world-structure folders ("The Hidden Cabal", "Act 3 Villains") routinely encode spoilers, and the Codex already filters `hidden` Nodes for non-GM viewers (VIEW-001a's leak fix). A GM who wants a folder-Node visible to players sets an explicit `flags.archivexus.visibility` override flag, read by `mapFolderToNode`. Foundry's own "player sees the folder if they can see something in it" behaviour is dynamic and per-user and is **not** reproduced — same "no per-user resolution yet" scope as the rest of the Adapter (ADR-0014 Amendment A4/A8).

**4. `resolveDroppedDocumentNode` (ADAPT-007 / ADR-0010) gains a `Folder` branch.**

A GM must be able to hand-author a Relationship touching a folder-Node (e.g. adjacency between two regions — point 8). Foundry's sidebar emits a `{ type: "Folder", uuid }` drag payload; `SUPPORTED_DOCUMENT_KINDS` grows to `['Actor', 'JournalEntryPage', 'Folder']` and the resolver maps a `Folder` via `mapFolderToNode`. **A Folder is only resolvable this way if it is already tagged** (has a Node type) — an untagged folder dropped into the authoring window produces the same clear inline error Scenes/Items get today.

**5. "Open its sheet" affordances branch on a `Folder.` id.**

A Folder has a `FolderConfig` dialog (rename / colour / parent), not a content sheet. The navigator / Inspector / graph "double-tap → open sheet" behaviour, for a `Folder.<id>` Node, instead best-effort reveals the folder in its sidebar directory (falling back to `folder.sheet?.render(true)` — the config dialog — if that is not feasible). Adapter-only; no Core change.

**6. Item folders are out of scope.** Points 1 and 5 name "Journal / Actor / Scene / Item folders." Actor, JournalEntry and Scene all have an existing Node or Block mapping; **Items do not** (`mapItemToNode` does not exist, Items are not synced at all). Folder-as-Node ships for Actor / JournalEntry / Scene folders only. Item folders (and Items as Nodes) are a separate future ticket, explicitly deferred.

### B. The derivation engine

**7. The engine is Foundry-Adapter code, not Core.** "Containment is expressed as Relationships" is a domain rule (already in the domain model). "Derive it from Foundry's folder tree" is a platform mapping — Obsidian's folders would map differently, a CLI adapter has none. So the engine lives entirely in `src/adapters/foundry/`, split the same way every other Adapter surface in this codebase is:

- **Pure resolver** — `src/adapters/foundry/folder-containment.ts`: given a plain snapshot (the list of participating entities each with its folder-ancestry path, the set of tagged folder ids and their Node types, and a "default definition for this Node type" function), returns the **desired derived set**: a list of `{ origin, target, definitionId }` edges plus, per location folder-Node, the set of `scene`-type Blocks it should hold. No I/O, fully unit-testable with fixtures — same role `relationship-node-resolution.ts` plays for ADAPT-007.
- **Orchestration** — `src/adapters/foundry/folder-containment-sync.ts`: gathers the Foundry folder tree and document set into that plain snapshot, calls the resolver, loads the current stored derived set, diffs, and applies (`saveNode` for folder-Nodes, `saveRelationship` / `deleteRelationship` for edges, `upsertBlockByUuid` / `removeBlockByUuid` for Scene Blocks). Parallel to `storage-sync.ts`, which is **not modified**.

`storage-sync.ts` stays exactly as thin as it is today ("map, then save").

**8. Reconciliation is a full re-derive of the whole world on any trigger, diffed against the stored derived set — not incremental delta-tracking.**

On each trigger the engine recomputes the complete desired derived set from scratch and diffs it against what is stored:

- Desired edge not stored → `saveRelationship` (with the provenance marker, point 12).
- Stored **derived** edge (marker present, `source` matches) not in the desired set → `deleteRelationship`.
- Stored **unmarked** edge → never touched, in either direction (this is the deletion-safety guarantee, point 14).
- Edge in both → left as-is (but see point 15 on definition drift).

Rationale, consistent with ADR-0011's Amendment: at ~100 Nodes a full recompute is sub-100ms, in-memory, and `module-entry.ts`'s Hook wiring is already fire-and-forget (`withStorage`'s `void action(storage).catch(...)`), so it never blocks Foundry's UI. Incremental tracking would need to identify the affected cone on every folder re-parent / tag / untag — exactly the class of bug (missed event → permanent silent drift) a full recompute cannot have. Subtree-scoped re-derivation is named as a future optimisation lever, to be taken only if Node count grows ~10x *and* folder edits become frequent — not pre-emptively.

**9. Triggers (Foundry Hooks), debounced.**

`createFolder` / `updateFolder` / `deleteFolder`; `createActor` / `updateActor` / `deleteActor`; `createJournalEntry` / `updateJournalEntry` / `deleteJournalEntry` (a page's containing folder is its parent *entry's* folder); `createJournalEntryPage` / `updateJournalEntryPage`; `createScene` / `updateScene` / `deleteScene`. `updateFolder` covers both tagging (the `flags.archivexus` write) and re-parenting (the `folder` field). All of these coalesce through a **trailing debounce** (~500 ms) into a single re-derive — a folder drag in Foundry fires a burst of `updateX` events and the engine must not run once per event. The debounce is a real implementation requirement, not optional polish.

**10. Delete Hooks are wired for this engine only, as a scoped exception to `module-entry.ts`'s "no delete Hooks" rule.** That rule exists because general Node-deletion policy is open (ADR-0007 point 8). This ADR does not resolve that policy; it resolves it *for folder-Nodes specifically*: deleting a tagged Folder deletes its folder-Node and every Relationship/Block the engine derived to or from it; any **hand-authored** Relationship touching that folder-Node survives as a dangling reference (ADR-0007 point 8, reused not reinvented). Actor / page Nodes still get no delete mirroring.

**11. Ordering within a re-derive:** upsert all tagged folder-Nodes first, then reconcile edges and Scene Blocks. (`createRelationship` / `saveRelationship` do not validate that endpoints exist — no FK, ADR-0007/ADR-0008 — but the graph can only render an edge whose folder-Node Node row is present.)

### C. Provenance, and what is machine-owned

**12. The provenance marker lives in `Relationship.metadata`, under an `archivexus` key — not a new first-class `Relationship` field.**

```
metadata.archivexus = {
  derived: true,
  source: 'folder-containment' | 'group-membership',
  container: '<ancestor folder-Node id | group Actor Node id>',
  derivedAt: '<ISO-8601>',
}
```

`metadata` is already `Record<string, unknown>` on `CreateRelationshipInput`, already a JSON `TEXT` column (`row-mapping.ts`'s `serializeCommon`), already carried verbatim and unredacted in the portable snapshot (`to-portable-snapshot.ts`). So this needs **zero schema change, zero domain-shape change, one representation** (the same JSON in the column and in the export — no SQLite-vs-JSON divergence to keep consistent). `03_DOMAIN_MODEL.md`'s Knowledge Element Decisions gains a short entry recording `metadata.archivexus` as a **named, reserved Adapter-provenance namespace** so it is a documented contract, not a convention invented in code. `container` makes each edge self-describing for the external AI consumer ("this edge is inferred from folder structure; that one a human asserted") and lets a future engine reason about a single edge without a whole-tree recompute. It is deliberately *not* first-class because provenance is not a domain concept anything else needs, and the project favours the smallest change that carries the guarantee.

**13. Derived Scene Blocks need no marker: a folder-Node's entire `blocks` array is engine-owned.**

Scene→Block derivation (point 5) only ever lands Blocks on a **folder-Node** (the tagged location folder). A folder-Node has no other Block producer — there is no folder sheet from which a GM attaches a page, and **attaching a JournalEntryPage to a folder-Node (ADR-0011) is not supported** (the `<document-tags>` attach field rejects a Folder target). Therefore the engine owns that array wholesale: on re-derive it sets the folder-Node's `blocks` to exactly `{ type: 'scene', uuid, title }` for each Scene currently in the folder, via `upsertBlockByUuid` / `removeBlockByUuid`. `Block`'s `{ type, uuid, title? }` shape (ADR-0011 / ADAPT-009) is unchanged — this is just a second concrete producer, as ADR-0011 was the first.

**14. Deletion safety — the guarantee.** The engine's delete path (`deleteRelationship`, `removeBlockByUuid`) is only ever reached for a Relationship carrying `metadata.archivexus.derived === true` with a `source` this engine produces, or a `scene` Block on a folder-Node. A hand-authored Relationship has no such marker and is **structurally unreachable** from any delete this engine performs. This is the whole safety model: simple, one predicate, trivially testable.

**15. The overlap cases (a containment that is also hand-authorable).**

- **Different endpoints, no collision (the common case).** A hand-authored "Krunk member-of *the House Stark journal-page Node*" and a derived "Krunk member-of *the House Stark folder-Node* (`Folder.<id>`)" are two different Relationships with different `target` ids. They coexist. This is expected and not an error; a GM who wants only one deletes the other via the existing Relationship list UI (ADR-0013).
- **Same `(origin, target, definitionId)` as an existing *unmarked* edge.** The engine treats the containment as already satisfied by a human fact and **does not create a duplicate marked edge**. If that containment later structurally disappears, the engine still does not delete the human edge (rule in point 8). A human asserted it; only a human retracts it.
- **Same `(origin, target, definitionId)` as an existing *marked* edge, then hand-authored again.** Transient visual duplication, not corruption. Accepted; the GM can delete the redundant one. A future "pin / promote" action (strip the marker so the engine stops managing an edge) is named as deferred, not built.

**16. Overriding the derived relationship type (point 3's "GM-overridable").**

The supported override is a **folder-level flag**, `flags.archivexus.containmentRelationship`, on the ancestor folder — "everything contained by this folder relates via `serves`, not the type default." The engine reads it when resolving the default definition for that folder's children. **Per-individual-edge override is not supported in v1**: the engine keeps a marked edge's `(origin, target)` but will rewrite its `definitionId` to match the currently-resolved default on re-derive, so hand-editing the definition of a single derived edge does not survive. This is a real limitation, called out loudly (see Open Questions). The prompt in point 4 ("relate to '<X>'? [type] or new root") sets, at tag time, either the child's participation (tagged → participates) or, if "new root" is chosen, a `flags.archivexus.containmentRoot = true` flag on the child that tells the engine to **not** derive an ancestor edge for it even though a tagged ancestor exists.

### D. Interaction with existing decisions

**17. ADR-0011 precedence is unchanged and composes cleanly.** A page with `attachedToNodeId` becomes a Block on its target and is **not a Node** → it gets no containment edge. A page with only `nodeType` set is a standalone Node → it gets a containment edge derived from its parent *entry's* folder ancestry. A page with neither flag stays a generic `Lore` Node (ADR-0011 point 6, unchanged) but — because it is not *explicitly* tagged — **does not participate in containment derivation** (point 18). The target Actor-Node that a page attaches to derives its own containment from the *Actor's* folder, never from the attached page's folder.

**18. "Explicitly tagged" means the Foundry document carries `flags.archivexus.nodeType` (for the folder, this is what makes it a Node at all; for a member document, it is what opts it into containment).** The current 102 Nodes are almost all *fallback*-typed (`mapActorToNode` → `Character`, `mapJournalEntryPageToNode` → `Lore`) with no flag. The engine checks the **flag**, not the mapped `Node.type`, so shipping this ADR changes nothing until the GM starts tagging — matching ADR-0011's opt-in, nothing-forced posture. Point 2 of the proposal ("untagged contents generate nothing") is therefore precise: untagged entities remain Nodes (existing behaviour), they just get no derived edge.

**19. ADAPT-005 / #23.** This ADR's folder-derived Scene→Block path **supersedes** ADAPT-005's originally-decided per-Scene-flag mechanism *for the common case* (Scenes are the maps of the locations a GM keeps as location folders) and closes #23 — pending Alberto's confirmation in review. The residual case ADAPT-005's text also covered — explicitly linking one arbitrary Scene to one arbitrary non-location Node (a throne-room Scene as a Block on a King Actor-Node) — is **deferred, revive-on-demand**, the same disposition ADR-0011 gave `same-entity-as`. If Alberto wants #23 kept open for that residual case instead, that is a one-line change to this point.

**20. Derived Relationships bypass `RelationshipDefinition.validation` allow-lists — by design.** `saveRelationship` never enforces `validation` (only ADR-0010's authoring UI does, and only as a non-blocking warning). A derived `member-of` pointing at a folder-Node the GM typed "Guild" rather than exactly "Organization" persists and renders fine. Consistent with the existing authoring-time-vs-storage-time split; noted so it is not mistaken for a bug.

---

## Consequences

### Advantages

- A world already structured as a folder tree gets a connected graph with near-zero manual edge authoring — directly answers "the tree already encodes this, stop making me re-enter it."
- Reuses existing machinery end to end: `createNode` / Foundry-UUID identity (ADR-0001), the `{type,uuid,title?}` Block model and `upsert/removeBlockByUuid` helpers (ADR-0011), `metadata` as a JSON column carried into the export (STORE-003 / ADR-0008), the fire-and-forget Hook wiring (`module-entry.ts`), ADR-0007 point 8's dangling-reference philosophy for deletes. The genuinely new code is one pure resolver + one orchestration file + `mapFolderToNode` + a `Folder` branch in an existing resolver.
- The provenance marker is one JSON key, one representation, consistent across store and export by construction — and it makes the export self-describing about which edges are inferred.
- Deletion safety is a single predicate ("has our marker"); a hand-authored `member-of` is structurally unreachable from any engine delete.
- Full re-derive cannot silently drift — the failure mode of incremental sync — and is cheap at this scale.
- `storage-sync.ts` is untouched; `Block` and `Relationship` shapes are untouched; ADR-0001 is untouched.
- Folder-Nodes default to `hidden`, so world-structure spoilers do not leak to players through the Codex.

### Disadvantages

- **A new "machine-owned rows next to human-owned rows in the same table" split.** Every future feature that reads, edits, bulk-operates on, or deletes Relationships now has to know about `metadata.archivexus.derived`. The Relationship list UI (ADR-0013), the Console (VIEW-001i), and any future bulk tool need to at least visually distinguish derived edges, and probably prevent a GM "deleting" one (it just reappears on next re-derive — confusing unless the UI explains it).
- **Per-edge relationship-type override is not preserved** (point 16). Hand-editing one derived edge's definition is silently reverted on the next re-derive. The folder-level flag is the only durable override. If GMs hit this often, it needs a real fix (store the override in the marker, key the diff on `(origin,target)` and respect a recorded override).
- **The re-derive runs on a broad set of Hooks.** Even debounced and non-blocking, a GM doing heavy world reorganisation triggers many full recomputes. Cheap now (~100 Nodes); a lurking cost if the world grows an order of magnitude, at which point the subtree-scoping and batch-write levers (below) must be taken.
- **Write amplification on first tag of a large tree.** Tagging a top-level folder over 60 already-typed documents is ~60 sequential `saveRelationship` RPC round-trips (~200–400 ms, non-blocking). Acceptable for v1; `StorageProvider.saveRelationships` / `deleteRelationships` batch methods (one transaction, one round-trip, atomic) are the named fast-follow if it feels sluggish.
- **A narrow, explicit dnd5e coupling** (point 7 / group Actors): reading `system.members` re-introduces exactly the kind of `game.system`-specific knowledge ADAPT-004 deliberately avoided. Gated behind a system check, opt-in per group, but it is a new dependency direction.
- **Folder-Nodes get a delete path that other Nodes still don't** (point 10), partially pre-empting the open Node-deletion-policy question for one Node kind. Defensible (a deleted folder genuinely has no meaning) but it is an inconsistency to hold in mind when that policy is finally designed.
- **"Open its sheet" is degraded for folder-Nodes** — a `FolderConfig` dialog or a sidebar reveal, not a content view. Inherent to what a Folder is.
- Two Scene→Block mechanisms would exist if #23's residual explicit-link case is later revived — precedence (explicit flag wins) would need specifying then.

---

## Open questions / under-specified — resolve before or during implementation

1. **Per-edge type override (point 16).** Ship v1 with folder-level override only and accept the revert-on-re-derive limitation, or build the marker-stored per-edge override now? Recommendation: ship folder-level only, revisit on real friction.
2. **Default definition for a container that is neither org-like nor place-like** (e.g. a "Pantheon" folder of deities, a "Ships" folder). `member-of` needs the target typed exactly `Organization`; `located-in` is spatially named. Recommendation: engine default falls back to `located-in` (its inverse `contains` is generic enough), and the default Relationship-Definition set gains a dedicated generic `part-of` / `contained-in` (category `narrative` or `governance`) — a small `DEFAULT_RELATIONSHIP_DEFINITIONS` addition, and a Definition-version-migration concern for existing worlds (an already-seeded store is never re-seeded — `03_DOMAIN_MODEL.md`'s standing open question).
3. **Exact Foundry v14 Hook names / signatures** — `getFolderContextOptions` (confirmed to exist v13+; receives the directory Application and the mutable menu-item array), and whether folder tagging should reuse ADR-0009's `DialogV2` control or a lighter context-menu action. To be verified live, same discipline as every prior `getHeaderControls*` addition in this repo.
4. **`FoundryJournalEntryPageLike` needs `parent.folder`** (currently only `parent.name`), and new `FoundryFolderLike` / `FoundrySceneLike` structural interfaces. Minor but real.
5. **`resolveDroppedDocumentNode`'s `Folder` branch is shared** with ADR-0011's page-attach `<document-tags>` field, which must *reject* a Folder target. Needs a caller-side opt-out or an attach-orchestration guard.
6. **Deleting a derived edge from the Relationship UI** (ADR-0013 / VIEW-001i): it reappears on next re-derive. The UI should either disable delete for marked edges or explain why it came back. Not this ADR's to design, but it must be flagged to whoever owns those surfaces.
7. **Group Actor member-list shape** across dnd5e versions (`system.members` entries have changed representation between dnd5e releases) — the reader needs to be defensive.
8. **Batch `StorageProvider` writes** — decide whether to add `saveRelationships` / `deleteRelationships` up front or wait for measured slowness.
9. **Confirm #23 disposition** (point 19): close it, or keep it open scoped to the residual explicit-Scene-link case.

---

## Alternatives Considered

- **Infer containment from folder membership with no per-document tagging.** Rejected — violates the no-inference principle established for Actor / JournalEntryPage / Scene mapping, and would turn every folder a GM created for filing convenience into graph structure they did not ask for. Tagging is the opt-in signal.
- **Represent containment without folder-Nodes** — e.g. derive `member-of` edges directly between member Actors and some existing organization Actor/page Node, using the folder only as a grouping hint. Rejected — many organizations/areas in Alberto's world have no Actor or page of their own, only a folder; the folder *is* the most complete representation of that concept. Folder-as-Node is the honest mapping.
- **Make the derivation engine part of Core.** Rejected — "derive from a folder tree" is a platform mapping (Obsidian folders differ, a CLI has none). Core keeps only "containment is Relationships," which it already has. The engine and its pure resolver are Adapter code, following `relationship-node-resolution.ts`'s precedent.
- **A first-class `Relationship.provenance` / `Relationship.derived` field instead of `metadata`.** Rejected as disproportionate — it is a schema change, a domain-shape change, and a migration, to carry a concept nothing outside this feature needs. `metadata` exists for exactly this, is already exported, and a documented reserved `metadata.archivexus` namespace makes it a contract rather than a convention. Revisit only if provenance becomes cross-cutting (a second, unrelated deriver appears).
- **Add `derived` / `source` to the `Block` shape** so derived Scene Blocks are individually marked. Rejected — `Block` was just deliberately minimised (ADR-0011 / ADAPT-009), and it is unnecessary here: derived Scene Blocks only ever land on folder-Nodes, whose `blocks` array is wholly engine-owned, so the engine reconciles the whole array and needs no per-Block flag.
- **Incremental reconciliation** (track what changed, patch only the affected edges). Rejected — the correctness cost (a missed Hook → permanent silent drift with no self-heal) is not worth the performance saving at ~100 Nodes. Full re-derive is cheap and self-correcting. Named as a future lever if scale changes by ~10x.
- **Resolve `nearest tagged ancestor` lazily at View/query time instead of materialising derived Relationships.** Rejected — it would make containment invisible to the portable export (the external AI would not see the structure), invisible to the hand-authoring UI, and would put folder-tree-walking logic into the Core Query API (a platform leak). Materialising the edges keeps containment a first-class, exportable, uniformly-queryable fact.
- **One ADR per piece** (folder-Node identity; the engine; the marker; the Scene→Block path). Rejected — the pieces only make sense together (the marker exists *because* of the engine; the engine exists *because* folders are Nodes). Splitting would scatter one coherent decision. The domain-model amendments (Folder-as-Node Decision, `metadata.archivexus` namespace) are doc edits that follow from this ADR, exactly as ADR-0011's Node-Decision amendment followed from it.
