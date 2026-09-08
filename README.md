<p align="center">
    <img src="./branding/logo.svg" width="160">
</p>

<p align="center">
    <strong>Every world has a memory. Archivexus preserves it.</strong>
</p>

Archivexus is a knowledge layer for tabletop roleplaying campaigns.

Built with **Foundry VTT** as its first platform, Archivexus transforms isolated documents into a connected knowledge graph capable of representing characters, locations, organizations, events, relationships and the evolving history of an entire campaign.

Rather than replacing Foundry's native systems, Archivexus enhances them by adding structure, relationships, history and multiple knowledge views.

---

## Vision

The Game Master should focus on telling stories.

Archivexus should focus on remembering everything else.

---

## Current Status

> 🔨 **Implementation Started**

Archivexus's core architecture and domain model are settled — see [`docs/03_DOMAIN_MODEL.md`](docs/03_DOMAIN_MODEL.md) and the accepted records under [`docs/decisions/`](docs/decisions/).

The Core is now being implemented incrementally, starting with the `KnowledgeElement` base abstraction. See [`docs/PROJECT.md`](docs/PROJECT.md) for the current stage and priorities.

---

## Getting started (in Foundry)

Once the module is installed and enabled, Archivexus imports your world's Actors and Journal pages automatically. The GM sees a one-time welcome dialog on first load; here are the same three steps to set up your world:

1. **Type your key Nodes.** Open an Actor or Journal page, click the **⋯** menu in its window header, and choose *"Archivexus Node Type"* (Character, City, Faction, …). Only typed documents show up as Nodes.
2. **Connect two Nodes.** From that same **⋯** menu choose *"New Relationship…"* to link them (resides-in, ally-of, member-of, …), or open the **Relationships** console from the Codex toolbar to list / search / create / delete every relationship in one place. *"Connections"* on a sheet lists what that Node already has.
3. **See the graph.** Open the **Codex** sidebar tab (the share-nodes icon) and click *"Open graph ⧉"*, or click any Node in the list to open the graph rooted on it.

The Codex tab's **"Getting started"** button reopens this guidance any time. The relationship *types* available in step 2 can be extended from the browser console via `game.modules.get('archivexus').api.saveRelationshipDefinition(...)` (a dedicated editor UI is planned — ADAPT-014).

---

## Goals

- Transform isolated Foundry documents into interconnected knowledge.
- Provide a flexible knowledge graph for campaigns.
- Eliminate duplicated information.
- Preserve historical changes over time.
- Support configurable visibility for GMs and players.
- Remain extensible through plugins and adapters.
- Stay independent from any specific storage engine.

---

## Planned Architecture

```text
                     +--------------------+
                     |     Foundry VTT    |
                     +---------+----------+
                               |
                           Adapter Layer
                               |
                     +---------v----------+
                     |   Archivexus Core  |
                     |--------------------|
                     |  Domain Model      |
                     |  Graph Engine      |
                     |  Business Rules    |
                     |  Query API         |
                     +---------+----------+
                               |
                          Storage Provider
                       (embedded SQLite, WASM)
```

Storage is decided, not an open list of candidates — embedded SQLite (WASM), per `decisions/ADR-0008-storage-provider.md`. See `docs/01_ARCHITECTURE.md`'s Storage section for the canonical description (why SQLite, what else was considered, and the export mechanism for external consumers) instead of repeating it here.

(Matches the Core decomposition in `docs/01_ARCHITECTURE.md`, the canonical architecture document.)

---

## Repository Structure

```text
.
├── docs/
├── src/        (tests colocated as *.test.ts next to what they test)
├── README.md
└── LICENSE
```

---

## Documentation

Architecture documentation lives inside the `docs` directory.

| Document             | Description                      |
| -------------------- | -------------------------------- |
| `00_VISION.md`       | Project vision and philosophy    |
| `01_ARCHITECTURE.md` | High-level system architecture   |
| `02_LANGUAGE.md`     | Official terminology             |
| `03_DOMAIN_MODEL.md` | Core domain model                |
| `PROJECT.md`         | Current stage, stack, priorities |
| `SESSION_LOG.md`     | Running log of work sessions     |
| `decisions/`         | Architecture Decision Records    |

More documents (storage, block system, relationship engine, worked examples) will be added here as those areas get designed — this table should only ever list files that actually exist.

---

## Technology Stack (Planned)

| Technology      | Purpose                      |
| --------------- | ---------------------------- |
| TypeScript      | Core language                |
| Foundry VTT API | Primary platform integration |
| Vite            | Development tooling          |
| Vitest          | Unit testing                 |
| ESLint          | Static analysis              |
| Prettier        | Formatting                   |

Future technologies may evolve as the project grows.

---

## Guiding Principles

See the Core Principles in [`docs/00_VISION.md`](docs/00_VISION.md) — kept there as the single source of truth instead of duplicated here.

---

## Contributing

The domain model and architecture are settled (see `docs/03_DOMAIN_MODEL.md` and `docs/decisions/`); implementation is now underway (see `docs/PROJECT.md` for the current stage).

Contributions should begin by reviewing the documentation inside `/docs`.

Architectural consistency takes priority over feature count.

---

## License

See [LICENSE](LICENSE).
