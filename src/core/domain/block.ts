/**
 * A typed reference to a Foundry element — Modular unit of content a
 * Knowledge Element may own zero or more of
 * (docs/03_DOMAIN_MODEL.md's "Can contain Blocks" / "What does a Block
 * actually contain?" Decision). Replaces CORE-001's `{ id, type, data }`
 * placeholder shape with the real one ADAPT-005 decided and ADR-0011 (its
 * first real concrete producer) already assumes — confirmed via a
 * repo-wide grep (ADR-0011's Amendment, DBA pass) that nothing outside
 * this file read the old `Block.id`/`Block.data` fields, so this is an
 * isolated shape change, not a cross-cutting migration.
 *
 * Deliberately uniform, never a discriminated union: every Block a GM
 * would want (a Scene, an attached JournalEntryPage, anything else) is, by
 * design, always a reference to some real Foundry element, never
 * Archivexus-native freeform content. `type` names the Foundry document
 * type it points to (e.g. `'JournalEntryPage'`, `'scene'`) using Foundry's
 * own `documentName` convention (see `resolveDroppedDocumentNode`), `uuid`
 * is that document's real Foundry UUID (ADR-0001), and an optional `title`
 * lets a consumer display it without re-fetching.
 */
export interface Block {
  readonly type: string;
  readonly uuid: string;
  readonly title?: string;
}

export interface CreateBlockInput {
  readonly type: string;
  readonly uuid: string;
  readonly title?: string;
}

export class InvalidBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBlockError';
  }
}

/**
 * Validating factory, same style as `createNode`/`createRelationship`:
 * `type`/`uuid` are required, non-empty (a Block that points nowhere, or
 * doesn't say what it points at, isn't a valid reference); `title` is
 * optional and only kept when non-empty after trimming.
 */
export function createBlock(input: CreateBlockInput): Block {
  const type = input.type.trim();
  if (type.length === 0) {
    throw new InvalidBlockError('Block.type must be a non-empty string.');
  }

  const uuid = input.uuid.trim();
  if (uuid.length === 0) {
    throw new InvalidBlockError('Block.uuid must be a non-empty string.');
  }

  const title = input.title?.trim();

  return Object.freeze({
    type,
    uuid,
    ...(title !== undefined && title.length > 0 ? { title } : {}),
  });
}

export function isBlock(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Block>;
  return (
    typeof candidate.type === 'string' &&
    candidate.type.length > 0 &&
    typeof candidate.uuid === 'string' &&
    candidate.uuid.length > 0 &&
    (candidate.title === undefined || typeof candidate.title === 'string')
  );
}
