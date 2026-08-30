/**
 * A tiny structured logger for the Foundry Adapter, prefixed with the
 * module id — the convention most Foundry modules follow, so log lines are
 * identifiable in Foundry's own (shared, noisy) browser console.
 *
 * This also centralizes the package's only use of the `console` global to
 * one file: module-entry.ts (and any future adapter code) calls `log.info`/
 * `log.warn`/`log.error` instead of `console.*` directly, which is
 * mockable/testable in a way a scattered raw `console.log` call isn't —
 * see logger.test.ts.
 */

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(moduleId: string): Logger {
  const prefix = `${moduleId} |`;

  return {
    info(message: string): void {
      console.log(prefix, message);
    },
    warn(message: string): void {
      console.warn(prefix, message);
    },
    error(message: string): void {
      console.error(prefix, message);
    },
  };
}
