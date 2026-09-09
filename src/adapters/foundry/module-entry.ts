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
import type { FoundryFolderLike } from './folder-to-node.js';
import { registerFolderNodeTypeTag } from './folder-node-type-tag.js';
import { deleteFolderNode, syncAllFolders, syncFolder } from './folder-sync.js';
import { syncActor, syncAllActorsAndPages, syncJournalEntryPage } from './storage-sync.js';

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

Hooks.once('init', () => {
  log.info('Initializing');
  registerActorNodeTypeTag();
  registerJournalEntryPageNodeTag();
  registerRelationshipAuthoringEntryPoints(() => storage, log);
  registerRelationshipListEntryPoints(() => storage, log);
  registerCodexSidebarTab(CONFIG.ui, () => storage, log);
  registerOnboardingSetting(game.settings);
  registerFolderNodeTypeTag((id) => game.folders?.get(id), log);

  // Registered at init, but each callback lazily resolves `storage` at
  // call time (see withStorage) - it isn't created until `ready`.
  Hooks.on('createActor', (actor: FoundryActorLike) => {
    withStorage((s) => syncActor(actor, s));
  });
  Hooks.on('updateActor', (actor: FoundryActorLike) => {
    withStorage((s) => syncActor(actor, s));
  });
  Hooks.on('createJournalEntryPage', (page: FoundryJournalEntryPageLike) => {
    withStorage((s) => syncJournalEntryPage(page, s));
  });
  Hooks.on('updateJournalEntryPage', (page: FoundryJournalEntryPageLike) => {
    withStorage((s) => syncJournalEntryPage(page, s));
  });

  // Folder-Nodes (ADAPT-016). syncFolder upserts a tagged folder's Node and
  // removes a stale one when the GM clears the tag; deleteFolderNode mirrors
  // a Foundry folder delete (ADR-0015 point 10's scoped delete exception).
  // The derived containment edges are ADAPT-017's engine, wired separately.
  Hooks.on('createFolder', (folder: FoundryFolderLike) => {
    withStorage((s) => syncFolder(folder, s));
  });
  Hooks.on('updateFolder', (folder: FoundryFolderLike) => {
    withStorage((s) => syncFolder(folder, s));
  });
  Hooks.on('deleteFolder', (folder: FoundryFolderLike) => {
    withStorage((s) => deleteFolderNode(folder.uuid, s));
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

    log.info('Backfilling existing Actors/Journal pages/Folders into storage');
    const actors = (game.actors?.contents ?? []) as FoundryActorLike[];
    const journalPages = (game.journal?.contents ?? []).flatMap(
      (entry) => entry.pages.contents as FoundryJournalEntryPageLike[],
    );
    const folders = (game.folders?.contents ?? []) as FoundryFolderLike[];
    await syncAllActorsAndPages({ actors, journalPages }, storage);
    await syncAllFolders(folders, storage);
    log.info(
      `Backfill complete: ${actors.length} actors, ${journalPages.length} pages, ${folders.length} folders scanned.`,
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
