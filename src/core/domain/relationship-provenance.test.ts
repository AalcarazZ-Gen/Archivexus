import { describe, expect, it } from 'vitest';
import {
  derivedRelationshipMetadata,
  isDerivedFrom,
  isDerivedRelationship,
  PROVENANCE_METADATA_KEY,
  readRelationshipProvenance,
} from './relationship-provenance.js';

describe('derivedRelationshipMetadata', () => {
  it('builds the reserved metadata.archivexus marker', () => {
    const metadata = derivedRelationshipMetadata('folder-containment', 'Folder.abc', '2026-09-08T00:00:00.000Z');
    expect(metadata).toEqual({
      [PROVENANCE_METADATA_KEY]: {
        derived: true,
        source: 'folder-containment',
        container: 'Folder.abc',
        derivedAt: '2026-09-08T00:00:00.000Z',
      },
    });
  });

  it('defaults derivedAt to now', () => {
    const before = Date.now();
    const marker = readRelationshipProvenance(
      derivedRelationshipMetadata('group-membership', 'Actor.party'),
    );
    expect(marker?.source).toBe('group-membership');
    expect(new Date(marker!.derivedAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('readRelationshipProvenance', () => {
  it('reads a valid marker', () => {
    const marker = readRelationshipProvenance(
      derivedRelationshipMetadata('folder-containment', 'Folder.x'),
    );
    expect(marker).toMatchObject({ derived: true, source: 'folder-containment', container: 'Folder.x' });
  });

  it('returns undefined for hand-authored metadata (no marker, or a malformed one)', () => {
    expect(readRelationshipProvenance({})).toBeUndefined();
    expect(readRelationshipProvenance({ note: 'authored by hand' })).toBeUndefined();
    expect(readRelationshipProvenance({ archivexus: null })).toBeUndefined();
    expect(readRelationshipProvenance({ archivexus: 'derived' })).toBeUndefined();
    expect(readRelationshipProvenance({ archivexus: { derived: true } })).toBeUndefined();
    expect(
      readRelationshipProvenance({ archivexus: { derived: true, source: 'made-up', container: 'x', derivedAt: 'y' } }),
    ).toBeUndefined();
    expect(
      readRelationshipProvenance({ archivexus: { derived: true, source: 'folder-containment', container: '', derivedAt: 'y' } }),
    ).toBeUndefined();
  });
});

describe('isDerivedRelationship / isDerivedFrom', () => {
  const folderDerived = derivedRelationshipMetadata('folder-containment', 'Folder.x');

  it('distinguishes derived from hand-authored', () => {
    expect(isDerivedRelationship(folderDerived)).toBe(true);
    expect(isDerivedRelationship({})).toBe(false);
  });

  it('checks the specific engine', () => {
    expect(isDerivedFrom(folderDerived, 'folder-containment')).toBe(true);
    expect(isDerivedFrom(folderDerived, 'group-membership')).toBe(false);
    expect(isDerivedFrom({}, 'folder-containment')).toBe(false);
  });
});
