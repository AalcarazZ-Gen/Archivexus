/**
 * Platform-agnostic audience level for a Knowledge Element or View
 * (docs/02_LANGUAGE.md, ADR-0003). Adapters translate their platform's own
 * permission system into these three; Core never speaks the platform's vocabulary.
 */
export type Visibility = 'hidden' | 'visible' | 'owned';

export const VISIBILITY_LEVELS: readonly Visibility[] = ['hidden', 'visible', 'owned'];

export function isVisibility(value: unknown): value is Visibility {
  return typeof value === 'string' && (VISIBILITY_LEVELS as readonly string[]).includes(value);
}
