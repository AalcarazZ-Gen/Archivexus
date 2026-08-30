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
                               |
         +-----------+-----------+-----------+
         |           |           |           |
      Flags       SQLite    PostgreSQL     Future
```

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

| Document | Description |
|----------|-------------|
| `00_VISION.md` | Project vision and philosophy |
| `01_ARCHITECTURE.md` | High-level system architecture |
| `02_LANGUAGE.md` | Official terminology |
| `03_DOMAIN_MODEL.md` | Core domain model |
| `PROJECT.md` | Current stage, stack, priorities |
| `SESSION_LOG.md` | Running log of work sessions |
| `decisions/` | Architecture Decision Records |

More documents (storage, block system, relationship engine, worked examples) will be added here as those areas get designed — this table should only ever list files that actually exist.

---

## Technology Stack (Planned)

| Technology | Purpose |
|------------|---------|
| TypeScript | Core language |
| Foundry VTT API | Primary platform integration |
| Vite | Development tooling |
| Vitest | Unit testing |
| ESLint | Static analysis |
| Prettier | Formatting |

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
