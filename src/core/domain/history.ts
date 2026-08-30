/**
 * Immutable record of something that happened to a Knowledge Element over
 * time (docs/03_DOMAIN_MODEL.md's "Has history"). Deliberately minimal —
 * the domain model doesn't define event types yet.
 */
export interface HistoryEntry {
  readonly timestamp: Date;
  readonly description: string;
}
