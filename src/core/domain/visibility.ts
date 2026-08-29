/**
 * Visibility — see docs/02_LANGUAGE.md and decisions/ADR-0003-visibility-model.md.
 *
 * A platform-agnostic concept: which audience can perceive a Knowledge
 * Element (or a View of it). Adapters translate their platform's native
 * permission system into these three levels; the Core never speaks a
 * platform's own vocabulary (e.g. Foundry's NONE/LIMITED/OBSERVER/OWNER).
 */
export type Visibility = 'hidden' | 'visible' | 'owned';

export const VISIBILITY_LEVELS: readonly Visibility[] = ['hidden', 'visible', 'owned'];

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === 'string' && (VISIBILITY_LEVELS as readonly string[]).includes(value);
}
