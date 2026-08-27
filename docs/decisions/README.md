# Decisions (ADRs)

This folder holds Architecture Decision Records: short documents that capture a significant decision, the context that led to it, and its consequences.

This follows the workflow already defined in `CONTRIBUTING.md`:

```
Idea → Discussion → RFC (if needed) → ADR (if accepted) → Implementation
```

An ADR is written once an idea is accepted, as the durable record of *why* — so the reasoning survives even after everyone remembers only *what* was decided.

## When to write one

Per `CONTRIBUTING.md`: "Architecture Decision Records (ADRs) should be added whenever a significant design decision is made." In practice, that means: a core domain rule, a choice between real architectural alternatives, adopting or dropping a dependency others will build on, or anything a future contributor (human or agent) might otherwise "fix" back to an option already rejected.

A decision phrased as a short Q&A inside `03_DOMAIN_MODEL.md`'s per-concept "Decisions" sections is lighter-weight than a full ADR — reserve a full ADR for decisions that need their own context and consequences to be understood, the way ADR-0001 and ADR-0002 do.

## How to write one

1. Copy `ADR-0000-template.md` to `ADR-NNNN-short-title.md`, using the next sequential number (check the existing files in this folder) and a short kebab-case title, matching the convention already used by `ADR-0001-use-foundry-UUID.md` and `ADR-0002-knowledge-elements.md`.
2. Fill in Context, Decision, Consequences (Advantages and Disadvantages, honestly — every real decision has both), and Alternatives Considered.
3. Set Status to `Proposed` while still under discussion, or `Accepted` once settled. If a later decision supersedes this one, don't delete the old record — set its status to `Superseded by ADR-NNNN` and add a new one. The history of *why things changed* is as valuable as the current state.

## How the agents use this

Every agent in `.claude/agents/` treats the accepted records here as binding constraints, not suggestions. If an agent thinks a past decision should change, it says so explicitly and proposes a new ADR rather than quietly working around the old one.
