/**
 * Lightweight mention/citation between Knowledge Elements
 * (docs/03_DOMAIN_MODEL.md), distinct from a Relationship's stricter,
 * structural origin/target endpoints.
 */
export interface KnowledgeElementReference {
  readonly targetId: string;
}
