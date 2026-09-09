/**
 * ADR-0015: Foundry-Adapter provenance bookkeeping, stored on a
 * `Relationship` under the **reserved `metadata.archivexus` namespace**
 * (`03_DOMAIN_MODEL.md`'s Knowledge Element Decisions). It is deliberately
 * NOT a first-class `Relationship` field — provenance is a mechanism, not a
 * domain concept anything else needs, and `metadata` is already a
 * `Record<string, unknown>` carried verbatim into the portable snapshot
 * (`to-portable-snapshot.ts`), so this needs zero schema or domain-shape
 * change.
 *
 * The one guarantee it exists to support: the folder-containment engine
 * (ADAPT-017) may only ever delete a Relationship that carries this marker
 * with a `source` it produces. A hand-authored Relationship has no marker
 * and is structurally unreachable from any engine delete.
 */

export const PROVENANCE_METADATA_KEY = 'archivexus';

export type DerivedRelationshipSource = 'folder-containment' | 'group-membership';

export interface DerivedRelationshipProvenance {
  readonly derived: true;
  readonly source: DerivedRelationshipSource;
  /**
   * The Node id of the container the edge was derived from — the ancestor
   * folder-Node (`Folder.<id>`) for `folder-containment`, or the group
   * Actor-Node for `group-membership`. Makes each edge self-describing for
   * the external-AI export consumer, and lets a future engine reason about
   * one edge without a whole-tree recompute.
   */
  readonly container: string;
  /** ISO-8601. */
  readonly derivedAt: string;
}

/**
 * The `metadata` object to store on a derived Relationship. Spread it into
 * `createRelationship({ ..., metadata: derivedRelationshipMetadata(...) })`.
 */
export function derivedRelationshipMetadata(
  source: DerivedRelationshipSource,
  container: string,
  derivedAt: string = new Date().toISOString(),
): Record<string, unknown> {
  const provenance: DerivedRelationshipProvenance = { derived: true, source, container, derivedAt };
  return { [PROVENANCE_METADATA_KEY]: provenance };
}

/** Reads the provenance marker off a Relationship's `metadata`, or `undefined` if it's hand-authored. */
export function readRelationshipProvenance(
  metadata: Readonly<Record<string, unknown>>,
): DerivedRelationshipProvenance | undefined {
  const raw = metadata[PROVENANCE_METADATA_KEY];
  if (raw === null || typeof raw !== 'object') {
    return undefined;
  }
  const candidate = raw as Partial<DerivedRelationshipProvenance>;
  if (
    candidate.derived === true &&
    (candidate.source === 'folder-containment' || candidate.source === 'group-membership') &&
    typeof candidate.container === 'string' &&
    candidate.container.length > 0 &&
    typeof candidate.derivedAt === 'string'
  ) {
    return candidate as DerivedRelationshipProvenance;
  }
  return undefined;
}

/** `true` iff this Relationship was machine-derived (has a valid provenance marker). */
export function isDerivedRelationship(metadata: Readonly<Record<string, unknown>>): boolean {
  return readRelationshipProvenance(metadata) !== undefined;
}

/** `true` iff this Relationship was derived by the given engine specifically. */
export function isDerivedFrom(
  metadata: Readonly<Record<string, unknown>>,
  source: DerivedRelationshipSource,
): boolean {
  return readRelationshipProvenance(metadata)?.source === source;
}
