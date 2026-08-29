/**
 * A Tag is a free-form label a Knowledge Element can carry (see the "Can be
 * tagged" Common Characteristic in docs/03_DOMAIN_MODEL.md). Deliberately a
 * plain string for now — no Tag Definition/taxonomy exists in the domain
 * model yet, and introducing one isn't this ticket's concern.
 */
export type Tag = string;
