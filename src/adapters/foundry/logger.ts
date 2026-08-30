/**
 * Tiny module-id-prefixed logger for the Foundry Adapter (identifiable in
 * Foundry's shared console) — also centralizes the package's only use of
 * the `console` global so it stays mockable (see logger.test.ts).
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
