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

> 🚧 **Early Architecture Phase**

Archivexus is currently under active design.

The project is focused on defining its core architecture and domain model before implementation begins.

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
                     +---------+----------+
                               |
          +--------------------+--------------------+
          |                    |                    |
      Knowledge            Relationships       Definitions
          |                    |                    |
          +--------------------+--------------------+
                               |
                           Storage Provider
                               |
         +-----------+-----------+-----------+
         |           |           |           |
      Flags       SQLite    PostgreSQL     Future
```

---

## Repository Structure

```text
.
├── docs/
├── src/
├── tests/
├── README.md
└── LICENSE.md
```

---

## Documentation

Architecture documentation lives inside the `docs` directory.

| Document | Description |
|----------|-------------|
| `00_VISION.md` | Project vision and philosophy |
| `01_ARCHITECTURE.md` | High-level system architecture |
| `02_LANGUAGE.md` | Official terminology |
| `03_DATA_MODEL.md` | Core data model |
| `04_STORAGE.md` | Persistence layer |
| `05_BLOCK_SYSTEM.md` | Block architecture |
| `06_RELATIONSHIP_SYSTEM.md` | Relationship engine |
| `07_EXAMPLES.md` | Domain examples |
| `decisions/` | Architecture Decision Records |

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

- Memory over Documentation
- Relationships are First-Class Citizens
- Single Source of Truth
- Extensible by Design
- Automation over Maintenance

---

## Contributing

The architecture is intentionally being designed before implementation.

Contributions should begin by reviewing the documentation inside `/docs`.

Architectural consistency takes priority over feature count.

---

## License

See [LICENSE.md](LICENSE.md).