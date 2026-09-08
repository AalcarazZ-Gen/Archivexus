import { DEFAULT_RELATIONSHIP_DEFINITIONS } from '../../core/domain/relationship-definitions-default.js';
import type { StorageProvider } from '../../core/storage/storage-provider.js';
import type { Logger } from './logger.js';

/**
 * Seeds a fresh Archivexus store with the default Relationship Definition
 * vocabulary (`DEFAULT_RELATIONSHIP_DEFINITIONS`), run once from
 * `module-entry.ts` on Foundry's `ready` hook after storage opens.
 *
 * **Idempotent by "is the store empty":** if the store already has any
 * Definition, this does nothing — a GM who has customized their set (or a
 * world seeded by an earlier module version) is never re-clobbered. The
 * flip side, a documented open question (`03_DOMAIN_MODEL.md`'s Definitions
 * Open Questions): a later module release that adds new defaults won't
 * reach an existing world through this path. That's Definition *version
 * migration*, deliberately not solved here.
 *
 * Returns the number of Definitions inserted (0 when the store was already
 * populated), for the caller's log line.
 */
export async function bootstrapRelationshipDefinitions(
  storage: StorageProvider,
  log: Logger,
): Promise<number> {
  const existing = await storage.listRelationshipDefinitions();
  if (existing.length > 0) {
    return 0;
  }
  for (const definition of DEFAULT_RELATIONSHIP_DEFINITIONS) {
    await storage.saveRelationshipDefinition(definition);
  }
  log.info(`Seeded ${DEFAULT_RELATIONSHIP_DEFINITIONS.length} default Relationship Definitions.`);
  return DEFAULT_RELATIONSHIP_DEFINITIONS.length;
}
