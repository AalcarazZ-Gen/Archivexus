import {
  toPortableSnapshot,
  type PortableSnapshot,
} from '../../core/storage/to-portable-snapshot.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';

/**
 * The Foundry Adapter's half of ADR-0008's export (point 4/5): gathers
 * Nodes/Relationships through the `StorageProvider`'s own Query-API-ish
 * surface (`listNodes`/`listRelationships` — the real Query API with
 * category/depth traversal, `src/core/query/traversal.ts`, is a separate
 * Core module this one doesn't call) and
 * calls Core's `toPortableSnapshot`. No shaping logic lives here — this
 * function is exactly "gather, then call the Core transform," per
 * ADR-0008 point 5's split of responsibility.
 */
export async function gatherPortableSnapshot(storage: StorageProvider): Promise<PortableSnapshot> {
  const [nodes, relationships] = await Promise.all([
    storage.listNodes(),
    storage.listRelationships(),
  ]);
  return toPortableSnapshot(nodes, relationships);
}

/**
 * Triggers the deliberate, user-triggered download ADR-0008 requires
 * (never background/continuous/server-mediated). Uses Foundry's own
 * `saveDataToFile` client helper rather than hand-rolled
 * Blob/anchor-click DOM code — it's the platform's own idiomatic
 * mechanism for exactly this ("handling the platform-specific download...
 * an implementation detail", ADR-0008 point 5), and keeps this file free
 * of any DOM ambient-type surface beyond what `foundry-globals.d.ts`
 * already declares.
 *
 * Not wired to any button/UI yet (View/graph UI is explicitly out of
 * scope for STORE-003) — exposed on the module's own `api` namespace in
 * `module-entry.ts` so a GM can trigger it from Foundry's console today;
 * a real UI trigger is separate, not-yet-scoped follow-up work.
 */
export async function downloadPortableSnapshot(
  storage: StorageProvider,
  filename = 'archivexus-snapshot.json',
): Promise<void> {
  const snapshot = await gatherPortableSnapshot(storage);
  saveDataToFile(JSON.stringify(snapshot, null, 2), 'application/json', filename);
}
