/**
 * Foundry module entry point — the only file this package ships into a
 * live Foundry world (see ADR-0006). Wired into module.json's `esmodules`
 * and built in isolation by vite.foundry.config.ts: this file, and whatever
 * it imports from src/adapters/foundry and src/core, is the entire content
 * of the Foundry-distributed bundle — nothing from any other future
 * adapter is ever pulled in.
 *
 * Deliberately minimal for now. It only confirms the module loads cleanly
 * inside Foundry; it doesn't read or write any Foundry documents yet.
 * Reading real Foundry data (JournalEntryPages, actors, ownership) needs an
 * actual installed module to test against first — this file is that first
 * step, not the integration itself.
 */

const MODULE_ID = 'archivexus';

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing`);
});
