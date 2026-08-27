# ADR-0003

## Title

Model Visibility as a platform-agnostic concept, translated by Adapters.

---

## Status

Accepted

---

## Context

Knowledge Elements need to support different audiences seeing different things — a GM typically sees everything, while players see a filtered subset. Foundry VTT already has a native per-document, per-user permission model to express this (commonly summarized as ownership levels: `NONE`, `LIMITED`, `OBSERVER`, `OWNER`), and it would be tempting to reuse Foundry's model directly inside the Core.

However, `01_ARCHITECTURE.md`'s Domain Ownership principle states the Core must never adapt its domain model to fit a specific platform ("External platforms should adapt to Archivexus. Archivexus should never adapt its domain model to fit a specific platform.").

---

## Decision

Introduce Visibility as an Archivexus-native concept with its own vocabulary, independent of any single platform (see `02_LANGUAGE.md`):

- `hidden` — visible only to the GM.
- `visible` — visible to players, but not editable by them.
- `owned` — visible and editable by whoever holds ownership (GM or a delegated player).

Each Adapter is responsible for translating its platform's native permission system into these levels when importing, and back when writing changes out. The Foundry Adapter maps: `NONE` → `hidden`, `LIMITED` → `hidden`, `OBSERVER` → `visible`, `OWNER` → `owned`.

`LIMITED` maps to `hidden` rather than getting its own level because it is a Foundry-specific quirk of Journal Entries: it only reveals a document's title and its position on a map, never its actual content. From Archivexus's content-level point of view, nothing meaningful is exposed, so it is effectively hidden. If a GM wants players to actually read the content, the fix is to raise the Foundry ownership level (to `OBSERVER` or above), which maps to `visible` — not to add a fourth Visibility level to the Core.

---

## Consequences

### Advantages

- The Core stays platform-independent; a future Obsidian or web-native adapter isn't forced into Foundry's specific permission shape.
- One consistent Visibility model applies across every View, regardless of source platform.
- Only three levels are needed — no extra tier to represent Foundry's `LIMITED`, since it doesn't expose meaningful content anyway.

### Disadvantages

- Adapters carry more translation responsibility than a pass-through would.
- If a future platform's "limited" tier does expose meaningful partial content (unlike Foundry's), this mapping won't automatically generalize — that Adapter would need its own reasoned mapping, not just default to `hidden`.

---

## Alternatives Considered

- Reuse Foundry's permission model directly in the Core — rejected: violates the Domain Ownership principle and breaks down for a future non-Foundry adapter.
- A fully generic, per-user ACL/permission-list model — not chosen for now as likely over-engineered at this stage; worth revisiting once a second platform Adapter surfaces a concrete need for finer-grained control.
- Give `LIMITED` its own 4th Visibility level — rejected: `LIMITED` doesn't expose any actual content in Foundry, so a dedicated level would carry the platform's naming without carrying any distinct meaning at the Core level.
