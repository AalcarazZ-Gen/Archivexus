/**
 * History — see the "Has history" Common Characteristic in
 * docs/03_DOMAIN_MODEL.md. A HistoryEntry is an immutable record of
 * something that happened to a Knowledge Element over time (e.g. "renamed
 * from X", "relationship broken after the betrayal of Y" — see the
 * Relationship Decisions section for that example).
 *
 * Kept intentionally minimal: the domain model doesn't yet define a closed
 * set of history event types or who/what triggers an entry. That's future
 * work, not part of the base Knowledge Element abstraction (CORE-001).
 */
export interface HistoryEntry {
  readonly timestamp: Date;
  readonly description: string;
}
