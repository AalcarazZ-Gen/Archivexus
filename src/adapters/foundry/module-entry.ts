/**
 * Foundry module entry point (ADR-0006) — the only file this package ships
 * into a live Foundry world, per module.json/vite.foundry.config.ts.
 */

import { registerActorNodeTypeTag } from './actor-node-type-tag.js';
import { createLogger } from './logger.js';

const MODULE_ID = 'archivexus';
const log = createLogger(MODULE_ID);

Hooks.once('init', () => {
  log.info('Initializing');
  registerActorNodeTypeTag();
});
