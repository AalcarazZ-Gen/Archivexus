/**
 * Foundry module entry point (ADR-0006) — the only file this package ships
 * into a live Foundry world, per module.json/vite.foundry.config.ts.
 */

import type { StorageProvider } from '../../core/storage/storage-provider.js';
import { registerActorNodeTypeTag } from './actor-node-type-tag.js';
import { registerCodexSidebarTab } from './codex-sidebar-tab.js';
import { registerJournalEntryPageNodeTag } from './journal-entry-page-node-tag.js';
import { bootstrapRelationshipDefinitions } from './relationship-definitions-bootstrap.js';
import { registerRelationshipAuthoringEntryPoints } from './relationship-authoring-window.js';
import { registerRelationshipListEntryPoints } from './relationship-list-window.js';
import { createSqliteStorageProvider } from '../../storage/sqlite/create-sqlite-storage-provider.js';
import { downloadPortableSnapshot } from './export-snapshot.js';
import { createLogger } from './logger.js';
import type { FoundryActorLike } from './actor-to-node.js';
import type { FoundryJournalEntryPageLike } from './journal-entry-page-to-node.js';
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

Hooks.once('init', () => {
  log.info('Initializing');
  registerActorNodeTypeTag();
  registerJournalEntryPageNodeTag();
  registerRelationshipAuthoringEntryPoints(() => storage, log);
  registerRelationshipListEntryPoints(() => storage, log);
  registerCodexSidebarTab(CONFIG.ui, () => storage, log);

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

    log.info('Backfilling existing Actors/Journal pages into storage');
    const actors = (game.actors?.contents ?? []) as FoundryActorLike[];
    const journalPages = (game.journal?.contents ?? []).flatMap(
      (entry) => entry.pages.contents as FoundryJournalEntryPageLike[],
    );
    await syncAllActorsAndPages({ actors, journalPages }, storage);
    log.info(`Backfill complete: ${actors.length} actors, ${journalPages.length} pages.`);

    // Signals the Codex sidebar tab (VIEW-001a) — which may have rendered
    // before `ready` — that storage is now up and can be queried.
    Hooks.callAll('archivexus.ready', storage);

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
