/**
 * KnowledgeElementReference — the "Can reference other Knowledge Elements"
 * / "Can be referenced" Common Characteristics in docs/03_DOMAIN_MODEL.md.
 *
 * A lightweight mention or citation (e.g. linking to another Knowledge
 * Element from within a Block, or a Query API lookup) — distinct from a
 * Relationship's origin/target endpoints, which are a stricter, structural
 * connection reserved for Nodes. See the Knowledge Element section's note
 * on "reference" in the domain model, and Relationship's Decisions on why
 * a Relationship can't be a Relationship endpoint.
 */
export interface KnowledgeElementReference {
  readonly targetId: string;
}
