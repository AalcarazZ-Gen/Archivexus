/**
 * Modular unit of content a Knowledge Element may own zero or more of
 * (docs/03_DOMAIN_MODEL.md's "Can contain Blocks"). Provisional
 * placeholder — Block's real shape/schema is future work, not part of CORE-001.
 */
export interface Block {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
}
