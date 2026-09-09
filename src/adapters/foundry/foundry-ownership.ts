import type { Visibility } from '../../core/domain/visibility.js';

/**
 * Foundry's `CONST.DOCUMENT_OWNERSHIP_LEVELS`, duplicated as plain numbers
 * rather than importing Foundry's own types — this package has no dependency
 * on Foundry (01_ARCHITECTURE.md's Platform Independent principle).
 *
 * Extracted here (rule of three) once `actor-to-node.ts`,
 * `journal-entry-page-to-node.ts` and `journal-entry-to-node.ts` all needed
 * the same `ownership.default` → Visibility translation (ADR-0003). Only the
 * document's **default** level is mapped; per-user levels and Foundry's `-1`
 * "inherit" sentinel are a caller/live-instance concern and fall through to
 * `undefined` (let `createNode` apply its own default rather than guess).
 */

const FOUNDRY_OWNERSHIP_NONE = 0;
const FOUNDRY_OWNERSHIP_LIMITED = 1;
const FOUNDRY_OWNERSHIP_OBSERVER = 2;
const FOUNDRY_OWNERSHIP_OWNER = 3;

export function mapFoundryOwnershipToVisibility(
  defaultOwnership: number | undefined,
): Visibility | undefined {
  switch (defaultOwnership) {
    case FOUNDRY_OWNERSHIP_NONE:
    case FOUNDRY_OWNERSHIP_LIMITED:
      return 'hidden';
    case FOUNDRY_OWNERSHIP_OBSERVER:
      return 'visible';
    case FOUNDRY_OWNERSHIP_OWNER:
      return 'owned';
    default:
      return undefined;
  }
}
