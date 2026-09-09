import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { isTaggedFolder, mapFolderToNode, type FoundryFolderLike } from './folder-to-node.js';

/**
 * ADAPT-016 / ADR-0015 — persists a Folder-Node in and out of storage.
 * Deliberately thin, the same "map, then save" shape as `storage-sync.ts`'s
 * `syncActor`: `module-entry.ts` wires this to `createFolder` /
 * `updateFolder` / `deleteFolder` without this file knowing about Hooks.
 *
 * This file handles **only the Folder-Node itself**. The containment edges
 * to/from a Folder-Node's tagged contents, and the Scene Blocks a location
 * Folder-Node holds, are the ADAPT-017 / ADAPT-018 engine's job.
 *
 * The delete path here **is** wired (unlike `storage-sync.ts`'s deliberate
 * no-delete stance for Actor/Page Nodes) — ADR-0015 point 10's scoped
 * exception: a Folder that stops being tagged, or is deleted in Foundry,
 * genuinely has no meaning as a Node. Any hand-authored Relationship that
 * touched it survives as a dangling reference (ADR-0007 point 8), not this
 * function's concern.
 */

/**
 * On `createFolder` / `updateFolder`: if the Folder is tagged, upsert its
 * Node; if it isn't (never tagged, or the GM just cleared the flag), make
 * sure no stale Folder-Node lingers.
 */
export async function syncFolder(
  folder: FoundryFolderLike,
  storage: StorageProvider,
): Promise<void> {
  if (isTaggedFolder(folder)) {
    await storage.saveNode(mapFolderToNode(folder));
    return;
  }
  const existing = await storage.getNode(folder.uuid);
  if (existing) {
    await storage.deleteNode(folder.uuid);
  }
}

/** On `deleteFolder`: remove the Folder-Node if one exists. */
export async function deleteFolderNode(
  folderUuid: string,
  storage: StorageProvider,
): Promise<void> {
  const existing = await storage.getNode(folderUuid);
  if (existing) {
    await storage.deleteNode(folderUuid);
  }
}

/**
 * Bulk backfill for Folders already tagged in a live world before this
 * ticket's Hooks existed. `folders` is a plain array, flattened from
 * `game.folders` by `module-entry.ts`, so this stays fixture-testable.
 */
export async function syncAllFolders(
  folders: readonly FoundryFolderLike[],
  storage: StorageProvider,
): Promise<void> {
  for (const folder of folders) {
    if (isTaggedFolder(folder)) {
      await storage.saveNode(mapFolderToNode(folder));
    }
  }
}
