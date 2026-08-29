/**
 * Block — see docs/01_ARCHITECTURE.md's "Blocks" section and the "Can
 * contain Blocks" Common Characteristic in docs/03_DOMAIN_MODEL.md.
 *
 * Blocks are modular units of content a Knowledge Element may own zero or
 * more of. The domain model deliberately leaves Block's own shape (its
 * Block Definition, content schema, etc.) undesigned so far — that's its
 * own future ticket, not part of the Knowledge Element base abstraction.
 * This is a provisional placeholder just complete enough for
 * KnowledgeElement.blocks to be typed and validated: identity, a type
 * discriminator (pointing at a future Block Definition), and opaque data.
 */
export interface Block {
  readonly id: string;
  readonly type: string;
  readonly data: unknown;
}
