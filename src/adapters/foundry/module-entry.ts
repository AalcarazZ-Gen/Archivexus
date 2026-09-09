/**
 * Foundry module entry point (ADR-0006) — the only file this package ships
 * into a live Foundry world, per module.json/vite.foundry.config.ts.
 */

import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { registerActorNodeTypeTag } from './actor-node-type-tag.js';
import { registerCodexSidebarTab } from './codex-sidebar-tab.js';
import { registerJournalEntryPageNodeTag } from './journal-entry-page-node-tag.js';
import { bootstrapRelationshipDefinitions } from './relationship-definitions-bootstrap.js';
import {
  maybeShowWelcomeDialog,
  registerOnboardingSetting,
  type WelcomeDialogV2Like,
} from './first-run-guidance.js';
import { registerRelationshipAuthoringEntryPoints } from './relationship-authoring-window.js';
import { registerRelationshipListEntryPoints } from './relationship-list-window.js';
import { createSqliteStorageProvider } from '../../storage/sqlite/create-sqlite-storage-provider.js';
import { downloadPortableSnapshot } from './export-snapshot.js';
import { createLogger } from './logger.js';
import type { FoundryActorLike } from './actor-to-node.js';
import type { FoundryJournalEntryPageLike } from './journal-entry-page-to-node.js';
import { isTaggedFolder, type FoundryFolderLike } from './folder-to-node.js';
import { registerFolderNodeTypeTag } from './folder-node-type-tag.js';
import { deleteFolderNode, syncAllFolders, syncFolder } from './folder-sync.js';
import {
  reconcileFolderContainment,
  type ContainmentSnapshot,
  type ContainmentSnapshotEntity,
  type ContainmentSnapshotFolder,
  type ContainmentSnapshotScene,
} from './folder-containment-sync.js';
import { mapSceneToBlock, type FoundrySceneLike } from './scene-to-block.js';
import { resolvePageAttachment } from './journal-entry-page-to-node.js';
import { syncActor, syncAllActorsAndPages } from './storage-sync.js';
import { isTaggedJournalEntry, type FoundryJournalEntryLike } from './journal-entry-to-node.js';
import { registerJournalEntryNodeTypeTag } from './journal-entry-node-type-tag.js';
import {
  deleteJournalEntryNode,
  syncAllJournalEntries,
  syncJournalEntry,
  syncJournalEntryPageOrParent,
} from './journal-entry-sync.js';

const MODULE_ID = 'archivexus';
const log = createLogger(MODULE_ID);

/**
 * Set once `ready` finishes creating the real SQLite-backed
 * `StorageProvider` (STORE-003) — module-scoped rather than passed around,
 * since Foundry's own Hooks API has no way to thread state through hook
 * callbacks registered earlier at `init`.
 */
let storage: StorageProvider | undefined;

function withStorage(action: (storage: StorageProvider) => Promise<void>): void {
  if (!storage) {
    log.warn(
      'Storage provider not ready yet - skipping this sync (should only happen during startup).',
    );
    return;
  }
  void action(storage).catch((error: unknown) => {
    log.error(`Storage sync failed: ${error instanceof Error ? error.message : String(error)}`);
  });
}

/**
 * Switches the sidebar to the Codex tab (and expands the sidebar if it's
 * collapsed — otherwise switching the active tab has no visible effect,
 * confirmed live on v14.367). The v13 ApplicationV2 `Sidebar` renamed
 * `activateTab` → `changeTab(tab, group)`; try the new name first, fall
 * back to the old. Best-effort — a miss just leaves the GM to click the
 * tab themselves.
 */
function activateCodexSidebarTab(): void {
  try {
    const sidebar = ui.sidebar;
    if (sidebar?.changeTab) {
      sidebar.changeTab('codex', 'primary');
    } else if (sidebar?.activateTab) {
      sidebar.activateTab('codex');
    }
    sidebar?.expand?.();
  } catch (error) {
    log.warn(
      `Could not switch to the Codex tab: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Folder-containment engine (ADAPT-017)
// ---------------------------------------------------------------------------

interface RawFolder {
  readonly uuid: string;
  readonly name: string;
  readonly flags?: { readonly archivexus?: Record<string, unknown> };
  readonly ancestors?: readonly { readonly uuid: string }[];
}
interface RawFoldered {
  readonly uuid: string;
  readonly name: string;
  readonly flags?: {
    readonly archivexus?: {
      readonly nodeType?: string;
      readonly containmentRoot?: boolean;
      readonly attachedToNodeId?: string;
    };
  };
  readonly folder?: RawFolder | null;
}

function folderChain(folder: RawFolder | null | undefined): readonly string[] {
  return folder ? [folder.uuid, ...(folder.ancestors ?? []).map((a) => a.uuid)] : [];
}

/** Flattens `game.folders`/`game.actors`/`game.journal` into the plain snapshot the reconcile engine consumes. */
function gatherContainmentSnapshot(): ContainmentSnapshot {
  const folders: ContainmentSnapshotFolder[] = [];
  for (const raw of (game.folders?.contents ?? []) as RawFolder[]) {
    if (!isTaggedFolder(raw as FoundryFolderLike)) continue;
    const ax = (raw.flags?.archivexus ?? {}) as {
      nodeType?: string;
      containmentRelationship?: string;
      containmentRoot?: boolean;
    };
    folders.push({
      nodeId: raw.uuid,
      nodeType: (ax.nodeType ?? '').trim(),
      title: raw.name,
      ...(typeof ax.containmentRelationship === 'string' && ax.containmentRelationship.length > 0
        ? { containmentRelationshipOverride: ax.containmentRelationship }
        : {}),
      ...(ax.containmentRoot === true ? { isContainmentRoot: true } : {}),
      ancestorFolderNodeIds: (raw.ancestors ?? []).map((a) => a.uuid),
    });
  }

  const entities: ContainmentSnapshotEntity[] = [];
  const addTagged = (doc: RawFoldered, ancestors: readonly string[]): void => {
    const type = doc.flags?.archivexus?.nodeType;
    if (typeof type !== 'string' || type.trim().length === 0) return;
    entities.push({
      nodeId: doc.uuid,
      title: doc.name,
      ...(doc.flags?.archivexus?.containmentRoot === true ? { isContainmentRoot: true } : {}),
      ancestorFolderNodeIds: ancestors,
    });
  };

  for (const actor of (game.actors?.contents ?? []) as RawFoldered[]) {
    addTagged(actor, folderChain(actor.folder));
  }
  for (const entry of (game.journal?.contents ?? []) as {
    uuid: string;
    name: string;
    folder?: RawFolder | null;
    flags?: { archivexus?: { nodeType?: string; containmentRoot?: boolean } };
    pages: { contents: readonly RawFoldered[] };
  }[]) {
    const entryChain = folderChain(entry.folder);
    const entryType = entry.flags?.archivexus?.nodeType;
    if (typeof entryType === 'string' && entryType.trim().length > 0) {
      // Tagged JournalEntry → one Node (ADR-0011 Amendment 2); its pages
      // are Blocks, not Nodes, so there are no page edges — the entry-Node
      // itself is the containment entity.
      entities.push({
        nodeId: entry.uuid,
        title: entry.name,
        ...(entry.flags?.archivexus?.containmentRoot === true ? { isContainmentRoot: true } : {}),
        ancestorFolderNodeIds: entryChain,
      });
      continue;
    }
    for (const page of entry.pages.contents) {
      // A page attached to another Node is a Block, not a Node — no edge (ADR-0015 point 17).
      if (resolvePageAttachment(page as never).attached) continue;
      addTagged(page, entryChain);
    }
  }

  // ADAPT-018 — Scenes. Each Scene attaches to its nearest **tagged** folder
  // ancestor (untagged folders between are transparent, same rule as an
  // entity's containing folder); the resolver then keeps it only if that
  // folder is place-like. A Scene with no tagged ancestor is dropped here.
  const taggedFolderNodeIds = new Set(folders.map((folder) => folder.nodeId));
  const scenes: ContainmentSnapshotScene[] = [];
  for (const scene of (game.scenes?.contents ?? []) as (FoundrySceneLike & { name: string })[]) {
    const chain = scene.folder
      ? [scene.folder.uuid, ...(scene.folder.ancestors ?? []).map((a) => a.uuid)]
      : [];
    const nearestTagged = chain.find(
      (id): id is string => id !== undefined && taggedFolderNodeIds.has(id),
    );
    if (nearestTagged === undefined) continue;
    scenes.push({ block: mapSceneToBlock(scene), folderNodeId: nearestTagged });
  }

  return { folders, entities, scenes };
}

const scheduleContainmentReconcile = foundry.utils.debounce(() => {
  withStorage(async (s) => {
    const result = await reconcileFolderContainment(gatherContainmentSnapshot(), {
      storage: s,
      newId: () => foundry.utils.randomID(),
    });
    if (result.added > 0 || result.removed > 0 || result.blocksChanged > 0) {
      log.info(
        `Folder containment: +${result.added} / -${result.removed} derived link(s), ` +
          `${result.blocksChanged} folder-Node scene set(s) updated.`,
      );
      Hooks.callAll('archivexus.relationshipsChanged');
    }
  });
}, 500);

Hooks.once('init', () => {
  log.info('Initializing');
  registerActorNodeTypeTag();
  registerJournalEntryPageNodeTag();
  registerRelationshipAuthoringEntryPoints(() => storage, log);
  registerRelationshipListEntryPoints(() => storage, log);
  registerCodexSidebarTab(CONFIG.ui, () => storage, log);
  registerOnboardingSetting(game.settings);
  registerFolderNodeTypeTag((id) => game.folders?.get(id), log);
  registerJournalEntryNodeTypeTag((id) => game.journal?.get(id), log);

  // Registered at init, but each callback lazily resolves `storage` at
  // call time (see withStorage) - it isn't created until `ready`.
  // Every document/folder change also schedules a debounced
  // folder-containment re-derive (ADAPT-017): tagging a doc, moving it
  // between folders, or (re-)tagging a folder can all add or remove
  // derived edges.
  Hooks.on('createActor', (actor: FoundryActorLike) => {
    withStorage((s) => syncActor(actor, s));
    scheduleContainmentReconcile();
  });
  Hooks.on('updateActor', (actor: FoundryActorLike) => {
    withStorage((s) => syncActor(actor, s));
    scheduleContainmentReconcile();
  });
  Hooks.on('deleteActor', () => scheduleContainmentReconcile());

  // Scenes (ADAPT-018). A Scene never becomes a Node — it's a `scene` Block
  // on its nearest tagged place folder-Node, reconciled wholesale by the
  // containment engine. Create / move-between-folders / rename / delete all
  // change which folder-Node holds which Block, so all feed the re-derive.
  Hooks.on('createScene', () => scheduleContainmentReconcile());
  Hooks.on('updateScene', () => scheduleContainmentReconcile());
  Hooks.on('deleteScene', () => scheduleContainmentReconcile());

  // A page inside a tagged JournalEntry is a Block on the entry-Node, not a
  // Node itself (ADR-0011 Amendment 2) — syncJournalEntryPageOrParent routes
  // to the whole-entry re-sync in that case, the page-only sync otherwise.
  Hooks.on('createJournalEntryPage', (page: FoundryJournalEntryPageLike) => {
    withStorage(async (s) => {
      if (await syncJournalEntryPageOrParent(page, s)) {
        Hooks.callAll('archivexus.relationshipsChanged');
      }
    });
    scheduleContainmentReconcile();
  });
  Hooks.on('updateJournalEntryPage', (page: FoundryJournalEntryPageLike) => {
    withStorage(async (s) => {
      if (await syncJournalEntryPageOrParent(page, s)) {
        Hooks.callAll('archivexus.relationshipsChanged');
      }
    });
    scheduleContainmentReconcile();
  });
  Hooks.on('deleteJournalEntryPage', (page: FoundryJournalEntryPageLike) => {
    // No standalone-Node delete policy (storage-sync.ts) — but if the page
    // lived in a tagged entry, the entry-Node's Block array must lose it.
    const parent = page.parent as unknown as FoundryJournalEntryLike | undefined;
    if (parent && isTaggedJournalEntry(parent)) {
      withStorage(async (s) => {
        await syncJournalEntry(parent, s);
        Hooks.callAll('archivexus.relationshipsChanged');
      });
    }
    scheduleContainmentReconcile();
  });

  // JournalEntry-Nodes (ADAPT-021 / ADR-0011 Amendment 2). syncJournalEntry
  // upserts a tagged entry's Node (pages as Blocks) and removes a stale one
  // when the GM clears the tag; deleteJournalEntryNode mirrors a Foundry
  // entry delete. updateJournalEntry also covers an entry moving folders.
  Hooks.on('createJournalEntry', (entry: FoundryJournalEntryLike) => {
    withStorage(async (s) => {
      await syncJournalEntry(entry, s);
      Hooks.callAll('archivexus.relationshipsChanged');
    });
    scheduleContainmentReconcile();
  });
  Hooks.on('updateJournalEntry', (entry: FoundryJournalEntryLike) => {
    withStorage(async (s) => {
      await syncJournalEntry(entry, s);
      Hooks.callAll('archivexus.relationshipsChanged');
    });
    scheduleContainmentReconcile();
  });
  Hooks.on('deleteJournalEntry', (entry: FoundryJournalEntryLike) => {
    withStorage(async (s) => {
      await deleteJournalEntryNode(entry.uuid, s);
      Hooks.callAll('archivexus.relationshipsChanged');
    });
    scheduleContainmentReconcile();
  });

  // Folder-Nodes (ADAPT-016). syncFolder upserts a tagged folder's Node and
  // removes a stale one when the GM clears the tag; deleteFolderNode mirrors
  // a Foundry folder delete (ADR-0015 point 10's scoped delete exception).
  // Each also schedules the containment re-derive (ADAPT-017), which
  // creates/removes the derived edges and fires archivexus.relationshipsChanged.
  Hooks.on('createFolder', (folder: FoundryFolderLike) => {
    withStorage(async (s) => {
      await syncFolder(folder, s);
      Hooks.callAll('archivexus.relationshipsChanged'); // the navigator re-pulls its Node list
    });
    scheduleContainmentReconcile();
  });
  Hooks.on('updateFolder', (folder: FoundryFolderLike) => {
    withStorage(async (s) => {
      await syncFolder(folder, s);
      Hooks.callAll('archivexus.relationshipsChanged');
    });
    scheduleContainmentReconcile();
  });
  Hooks.on('deleteFolder', (folder: FoundryFolderLike) => {
    withStorage(async (s) => {
      await deleteFolderNode(folder.uuid, s);
      Hooks.callAll('archivexus.relationshipsChanged');
    });
    scheduleContainmentReconcile();
  });
});

Hooks.once('ready', () => {
  void (async () => {
    log.info('Opening storage (SQLite / opfs-sahpool)');
    storage = await createSqliteStorageProvider();

    // Seed the default Relationship Definition vocabulary on a fresh store
    // (only when empty — a customized set is never re-clobbered). CORE-004's
    // deferred persistence fast-follow: Definitions are real editable state
    // now, not a hardcoded list.
    await bootstrapRelationshipDefinitions(storage, log);

    log.info('Backfilling existing Actors/Journal entries/pages/Folders into storage');
    const actors = (game.actors?.contents ?? []) as FoundryActorLike[];
    const journalEntries = (game.journal?.contents ?? []) as unknown as FoundryJournalEntryLike[];
    const journalPages = (game.journal?.contents ?? []).flatMap(
      (entry) => entry.pages.contents as FoundryJournalEntryPageLike[],
    );
    const folders = (game.folders?.contents ?? []) as FoundryFolderLike[];
    // Order matters: pages first (a page inside a tagged entry is skipped by
    // its own `isInsideTaggedJournalEntry` guard), then folders, then the
    // tagged entry-Nodes, which also clear any pre-existing standalone
    // page-Nodes their pages had.
    await syncAllActorsAndPages({ actors, journalPages }, storage);
    await syncAllFolders(folders, storage);
    await syncAllJournalEntries(journalEntries, storage);
    // ADAPT-017 / ADAPT-018: derive the containment edges + folder-Node
    // scene Blocks from the folder tree once the Nodes are all in (a full
    // reconcile, so a re-parented folder/scene or a tag cleared while
    // Foundry was closed is picked up on load).
    const sceneCount = (game.scenes?.contents ?? []).length;
    const containment = await reconcileFolderContainment(gatherContainmentSnapshot(), {
      storage,
      newId: () => foundry.utils.randomID(),
    });
    log.info(
      `Backfill complete: ${actors.length} actors, ${journalEntries.length} journal entries, ` +
        `${journalPages.length} pages, ${folders.length} folders, ${sceneCount} scenes scanned; ` +
        `folder containment +${containment.added} / -${containment.removed}, ` +
        `${containment.blocksChanged} folder-Node scene set(s) updated.`,
    );

    // Signals the Codex sidebar tab (VIEW-001a) — which may have rendered
    // before `ready` — that storage is now up and can be queried.
    Hooks.callAll('archivexus.ready', storage);

    // First-run guidance (VIEW-001g): a one-time, GM-only welcome dialog
    // pointing at the (buried) per-sheet setup entry points. Any close
    // marks it dismissed for the world — it never nags.
    await maybeShowWelcomeDialog({
      settings: game.settings,
      isGM: game.user?.isGM === true,
      dialogV2: foundry.applications.api.DialogV2 as unknown as WelcomeDialogV2Like,
      counts: {
        actorCount: actors.length,
        pageCount: journalPages.length,
        definitionCount: (await storage.listRelationshipDefinitions()).length,
      },
      showCodex: activateCodexSidebarTab,
      log,
    });

    // No export/Definition-editing UI yet — a GM can drive both from the
    // console: game.modules.get('archivexus').api.exportSnapshot(),
    // .listRelationshipDefinitions(), .saveRelationshipDefinition(def).
    const moduleRecord = game.modules.get(MODULE_ID);
    if (moduleRecord) {
      moduleRecord.api = {
        exportSnapshot: () => downloadPortableSnapshot(storage as StorageProvider),
        listRelationshipDefinitions: () =>
          (storage as StorageProvider).listRelationshipDefinitions(),
        saveRelationshipDefinition: (definition: unknown) =>
          (storage as StorageProvider).saveRelationshipDefinition(
            definition as Parameters<StorageProvider['saveRelationshipDefinition']>[0],
          ),
      };
    }
  })().catch((error: unknown) => {
    log.error(`Failed to open storage: ${error instanceof Error ? error.message : String(error)}`);
  });
});
